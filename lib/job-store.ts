import { randomUUID } from "node:crypto";

import type { Job, User } from "@prisma/client";
import { Pool } from "pg";

import type { SpeakerSegment } from "@/lib/providers/types";
import type { ClinicSummary } from "@/lib/summary-schema";

const globalForJobStore = globalThis as typeof globalThis & {
  jobStorePool?: Pool;
};

type PendingJobSourceAudio = {
  path: string;
  size: number;
  type: string;
  url: string;
} | null;

type CreatePendingStoredJobInput = {
  fileName: string;
  focus: string;
  matterType: string;
  providerId: string;
  sourceAudio: PendingJobSourceAudio;
  userEmail: string;
};

type UpdateStoredJobInput = {
  errorMessage?: string | null;
  speakerSegments?: SpeakerSegment[] | null;
  status?: string;
  summary?: ClinicSummary | null;
  transcript?: string | null;
};

function getConnectionString() {
  const connectionString =
    process.env.DATABASE_URL?.trim() ||
    process.env.DATABASE_URL_UNPOOLED?.trim();

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing.");
  }

  return connectionString;
}

function getJobStorePool() {
  if (!globalForJobStore.jobStorePool) {
    globalForJobStore.jobStorePool = new Pool({
      connectionString: getConnectionString(),
      max: 5,
    });
  }

  return globalForJobStore.jobStorePool;
}

export async function createPendingStoredJob({
  fileName,
  focus,
  matterType,
  providerId,
  sourceAudio,
  userEmail,
}: CreatePendingStoredJobInput): Promise<Job> {
  const pool = getJobStorePool();
  const client = await pool.connect();
  const now = new Date();

  try {
    await client.query("BEGIN");

    const userResult = await client.query<User>(
      `
        insert into "VoiceTranscriptionUser" ("id", "email", "createdAt", "updatedAt")
        values ($1, $2, $3, $4)
        on conflict ("email")
        do update set "updatedAt" = excluded."updatedAt"
        returning *
      `,
      [randomUUID(), userEmail, now, now],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new Error("The app could not create or load the current user.");
    }

    const jobResult = await client.query<Job>(
      `
        insert into "VoiceTranscriptionJob" (
          "id",
          "userId",
          "fileName",
          "sourceAudioUrl",
          "sourceAudioPath",
          "sourceAudioType",
          "sourceAudioSize",
          "matterType",
          "focus",
          "provider",
          "status",
          "createdAt",
          "updatedAt"
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        returning *
      `,
      [
        randomUUID(),
        user.id,
        fileName,
        sourceAudio?.url ?? null,
        sourceAudio?.path ?? null,
        sourceAudio?.type ?? null,
        sourceAudio?.size ?? null,
        matterType,
        focus || null,
        providerId,
        "pending",
        now,
        now,
      ],
    );

    await client.query("COMMIT");

    const job = jobResult.rows[0];

    if (!job) {
      throw new Error("The app could not create the requested transcription job.");
    }

    return job;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

export async function loadStoredJob(jobId: string): Promise<Job | null> {
  const pool = getJobStorePool();
  const result = await pool.query<Job>(
    `
      select *
      from "VoiceTranscriptionJob"
      where "id" = $1
      limit 1
    `,
    [jobId],
  );

  return result.rows[0] ?? null;
}

export async function listStoredJobsForUser(userEmail: string): Promise<Job[]> {
  const pool = getJobStorePool();
  const result = await pool.query<Job>(
    `
      select j.*
      from "VoiceTranscriptionJob" j
      join "VoiceTranscriptionUser" u on u."id" = j."userId"
      where u."email" = $1
      order by j."createdAt" desc
    `,
    [userEmail],
  );

  return result.rows;
}

export async function loadStoredJobForUser(
  jobId: string,
  userEmail: string,
): Promise<Job | null> {
  const pool = getJobStorePool();
  const result = await pool.query<Job>(
    `
      select j.*
      from "VoiceTranscriptionJob" j
      join "VoiceTranscriptionUser" u on u."id" = j."userId"
      where j."id" = $1
        and u."email" = $2
      limit 1
    `,
    [jobId, userEmail],
  );

  return result.rows[0] ?? null;
}

export async function deleteStoredJobForUser(
  jobId: string,
  userEmail: string,
): Promise<Job | null> {
  const pool = getJobStorePool();
  const result = await pool.query<Job>(
    `
      delete from "VoiceTranscriptionJob" j
      using "VoiceTranscriptionUser" u
      where j."id" = $1
        and u."email" = $2
        and u."id" = j."userId"
      returning j.*
    `,
    [jobId, userEmail],
  );

  return result.rows[0] ?? null;
}

export async function updateStoredJob(
  jobId: string,
  data: UpdateStoredJobInput,
): Promise<Job> {
  const assignments: string[] = [];
  const values: unknown[] = [];
  const addAssignment = (column: string, value: unknown, cast = "") => {
    values.push(value);
    assignments.push(`"${column}" = $${values.length}${cast}`);
  };

  if ("status" in data) {
    addAssignment("status", data.status ?? null);
  }

  if ("errorMessage" in data) {
    addAssignment("errorMessage", data.errorMessage ?? null);
  }

  if ("transcript" in data) {
    addAssignment("transcript", data.transcript ?? null);
  }

  if ("summary" in data) {
    addAssignment(
      "summary",
      data.summary === undefined ? null : JSON.stringify(data.summary),
      "::jsonb",
    );
  }

  if ("speakerSegments" in data) {
    addAssignment(
      "speakerSegments",
      data.speakerSegments === undefined
        ? null
        : JSON.stringify(data.speakerSegments),
      "::jsonb",
    );
  }

  addAssignment("updatedAt", new Date());
  values.push(jobId);

  const pool = getJobStorePool();
  const result = await pool.query<Job>(
    `
      update "VoiceTranscriptionJob"
      set ${assignments.join(", ")}
      where "id" = $${values.length}
      returning *
    `,
    values,
  );
  const job = result.rows[0];

  if (!job) {
    throw new Error("Job not found.");
  }

  return job;
}
