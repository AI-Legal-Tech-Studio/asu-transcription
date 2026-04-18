import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Job } from "@prisma/client";

import type {
  CreatePendingStoredJobInput,
  UpdateStoredJobInput,
} from "@/lib/job-store-types";

type LocalJobRecord = Omit<Job, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
  userEmail: string;
};

type LocalJobStore = {
  jobs: LocalJobRecord[];
};

const STORE_PATH = join(process.cwd(), ".local-data", "job-store.json");

let localStoreQueue = Promise.resolve();

async function ensureStoreDirectory() {
  await mkdir(dirname(STORE_PATH), { recursive: true });
}

async function readStore(): Promise<LocalJobStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalJobStore>;
    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { jobs: [] };
    }

    throw error;
  }
}

async function writeStore(store: LocalJobStore) {
  await ensureStoreDirectory();
  const tempPath = `${STORE_PATH}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await rename(tempPath, STORE_PATH);
}

function serializeJob(job: Job, userEmail: string): LocalJobRecord {
  return {
    ...job,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    userEmail,
  };
}

function deserializeJob(record: LocalJobRecord): Job {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

async function withStoreRead<T>(read: (store: LocalJobStore) => T | Promise<T>) {
  await localStoreQueue;
  const store = await readStore();
  return read(store);
}

async function withStoreMutation<T>(
  mutate: (store: LocalJobStore) => T | Promise<T>,
): Promise<T> {
  const nextOperation = localStoreQueue.then(async () => {
    const store = await readStore();
    const result = await mutate(store);
    await writeStore(store);
    return result;
  });

  localStoreQueue = nextOperation.then(
    () => undefined,
    () => undefined,
  );

  return nextOperation;
}

export async function createPendingLocalJob({
  fileName,
  focus,
  matterType,
  providerId,
  sourceAudio,
  userEmail,
}: CreatePendingStoredJobInput): Promise<Job> {
  return withStoreMutation((store) => {
    const existingUserJob = store.jobs.find((job) => job.userEmail === userEmail);
    const now = new Date();
    const job: Job = {
      id: randomUUID(),
      userId: existingUserJob?.userId ?? randomUUID(),
      fileName,
      sourceAudioUrl: sourceAudio?.url ?? null,
      sourceAudioPath: sourceAudio?.path ?? null,
      sourceAudioType: sourceAudio?.type ?? null,
      sourceAudioSize: sourceAudio?.size ?? null,
      matterType,
      focus: focus || null,
      provider: providerId,
      status: "pending",
      errorMessage: null,
      transcript: null,
      summary: null,
      speakerSegments: null,
      createdAt: now,
      updatedAt: now,
    };

    store.jobs.unshift(serializeJob(job, userEmail));
    return job;
  });
}

export async function loadLocalJob(jobId: string): Promise<Job | null> {
  return withStoreRead((store) => {
    const job = store.jobs.find((candidate) => candidate.id === jobId);
    return job ? deserializeJob(job) : null;
  });
}

export async function listLocalJobsForUser(userEmail: string): Promise<Job[]> {
  return withStoreRead((store) =>
    store.jobs
      .filter((job) => job.userEmail === userEmail)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(deserializeJob),
  );
}

export async function loadLocalJobForUser(
  jobId: string,
  userEmail: string,
): Promise<Job | null> {
  return withStoreRead((store) => {
    const job = store.jobs.find(
      (candidate) => candidate.id === jobId && candidate.userEmail === userEmail,
    );

    return job ? deserializeJob(job) : null;
  });
}

export async function deleteLocalJobForUser(
  jobId: string,
  userEmail: string,
): Promise<Job | null> {
  return withStoreMutation((store) => {
    const index = store.jobs.findIndex(
      (candidate) => candidate.id === jobId && candidate.userEmail === userEmail,
    );

    if (index === -1) {
      return null;
    }

    const [job] = store.jobs.splice(index, 1);
    return job ? deserializeJob(job) : null;
  });
}

export async function updateLocalJob(
  jobId: string,
  data: UpdateStoredJobInput,
): Promise<Job> {
  return withStoreMutation((store) => {
    const index = store.jobs.findIndex((candidate) => candidate.id === jobId);

    if (index === -1) {
      throw new Error("Job not found.");
    }

    const current = store.jobs[index];

    if (!current) {
      throw new Error("Job not found.");
    }

    const updated: LocalJobRecord = {
      ...current,
      updatedAt: new Date().toISOString(),
    };

    if ("status" in data) {
      updated.status = data.status ?? current.status;
    }

    if ("errorMessage" in data) {
      updated.errorMessage = data.errorMessage ?? null;
    }

    if ("transcript" in data) {
      updated.transcript = data.transcript ?? null;
    }

    if ("summary" in data) {
      updated.summary = data.summary ?? null;
    }

    if ("speakerSegments" in data) {
      updated.speakerSegments = data.speakerSegments ?? null;
    }

    store.jobs[index] = updated;

    return deserializeJob(updated);
  });
}
