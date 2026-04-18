import { randomUUID } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";

import type { Job, User } from "@prisma/client";
import { Pool } from "pg";

import type {
  CreatePendingStoredJobInput,
  UpdateStoredJobInput,
} from "@/lib/job-store-types";
import {
  createPendingLocalJob,
  deleteLocalJobForUser,
  listLocalJobsForUser,
  loadLocalJob,
  loadLocalJobForUser,
  updateLocalJob,
} from "@/lib/local-job-store";

const globalForJobStore = globalThis as typeof globalThis & {
  jobStoreMode?: "database" | "local";
  jobStorePool?: Pool;
};

try {
  setDefaultResultOrder("ipv4first");
} catch {
  // Ignore platforms that do not support overriding result order.
}

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
      connectionTimeoutMillis: 10_000,
      max: 5,
    });
  }

  return globalForJobStore.jobStorePool;
}

function collectErrorMessages(error: unknown, messages: string[] = []): string[] {
  if (error instanceof Error) {
    messages.push(error.message.toLowerCase());

    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause) {
      collectErrorMessages(cause, messages);
    }
  }

  return messages;
}

function shouldUseLocalStore(error: unknown) {
  const connectionErrorMarkers = [
    "connection timeout",
    "connection terminated",
    "connect etimedout",
    "econnrefused",
    "econnreset",
    "enotfound",
    "ehostunreach",
    "network is unreachable",
    "terminat",
  ];

  return collectErrorMessages(error).some((message) =>
    connectionErrorMarkers.some((marker) => message.includes(marker)),
  );
}

function resetJobStorePool() {
  const pool = globalForJobStore.jobStorePool;
  delete globalForJobStore.jobStorePool;

  if (pool) {
    void pool.end().catch(() => null);
  }
}

async function withJobStoreFallback<T>(
  operationName: string,
  databaseOperation: () => Promise<T>,
  localOperation: () => Promise<T>,
): Promise<T> {
  if (globalForJobStore.jobStoreMode === "local") {
    return localOperation();
  }

  try {
    const result = await databaseOperation();
    globalForJobStore.jobStoreMode = "database";
    return result;
  } catch (error) {
    if (!shouldUseLocalStore(error)) {
      throw error;
    }

    console.warn(
      `Database unavailable during ${operationName}; switching to the local job store.`,
    );

    globalForJobStore.jobStoreMode = "local";
    resetJobStorePool();

    return localOperation();
  }
}

async function createPendingStoredJobInDatabase({
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

async function loadStoredJobFromDatabase(jobId: string): Promise<Job | null> {
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

async function listStoredJobsForUserFromDatabase(
  userEmail: string,
): Promise<Job[]> {
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

async function loadStoredJobForUserFromDatabase(
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

async function deleteStoredJobForUserFromDatabase(
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

async function updateStoredJobInDatabase(
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

export async function createPendingStoredJob(
  input: CreatePendingStoredJobInput,
): Promise<Job> {
  return withJobStoreFallback(
    "createPendingStoredJob",
    () => createPendingStoredJobInDatabase(input),
    () => createPendingLocalJob(input),
  );
}

export async function loadStoredJob(jobId: string): Promise<Job | null> {
  return withJobStoreFallback(
    "loadStoredJob",
    () => loadStoredJobFromDatabase(jobId),
    () => loadLocalJob(jobId),
  );
}

export async function listStoredJobsForUser(userEmail: string): Promise<Job[]> {
  return withJobStoreFallback(
    "listStoredJobsForUser",
    () => listStoredJobsForUserFromDatabase(userEmail),
    () => listLocalJobsForUser(userEmail),
  );
}

export async function loadStoredJobForUser(
  jobId: string,
  userEmail: string,
): Promise<Job | null> {
  return withJobStoreFallback(
    "loadStoredJobForUser",
    () => loadStoredJobForUserFromDatabase(jobId, userEmail),
    () => loadLocalJobForUser(jobId, userEmail),
  );
}

export async function deleteStoredJobForUser(
  jobId: string,
  userEmail: string,
): Promise<Job | null> {
  return withJobStoreFallback(
    "deleteStoredJobForUser",
    () => deleteStoredJobForUserFromDatabase(jobId, userEmail),
    () => deleteLocalJobForUser(jobId, userEmail),
  );
}

export async function updateStoredJob(
  jobId: string,
  data: UpdateStoredJobInput,
): Promise<Job> {
  return withJobStoreFallback(
    "updateStoredJob",
    () => updateStoredJobInDatabase(jobId, data),
    () => updateLocalJob(jobId, data),
  );
}
