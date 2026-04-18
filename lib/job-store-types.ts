import type { Job } from "@prisma/client";

export type PendingJobSourceAudio = {
  path: string;
  size: number;
  type: string;
  url: string;
} | null;

export type CreatePendingStoredJobInput = {
  fileName: string;
  focus: string;
  matterType: string;
  providerId: string;
  sourceAudio: PendingJobSourceAudio;
  userEmail: string;
};

export type UpdateStoredJobInput = {
  errorMessage?: string | null;
  speakerSegments?: Job["speakerSegments"];
  status?: string;
  summary?: Job["summary"];
  transcript?: string | null;
};
