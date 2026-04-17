import type { Job, User } from "@prisma/client";

import {
  speakerSegmentsSchema,
  type ProviderOption,
  type SpeakerSegment,
} from "@/lib/providers/types";
import { clinicSummarySchema, type ClinicSummary } from "@/lib/summary-schema";

type JobWithOptionalUser = Job & {
  user?: Pick<User, "email">;
};

export type JobListItem = {
  id: string;
  fileName: string;
  matterType: string;
  focus: string | null;
  provider: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobDetail = JobListItem & {
  transcript: string | null;
  summary: ClinicSummary | null;
  speakerSegments: SpeakerSegment[];
};

export type ProviderListResponse = {
  defaultProviderId: string | null;
  providers: ProviderOption[];
};

function parseSpeakerSegments(value: unknown): SpeakerSegment[] {
  const parsed = speakerSegmentsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseSummary(value: unknown): ClinicSummary | null {
  const parsed = clinicSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function serializeJobListItem(job: JobWithOptionalUser): JobListItem {
  return {
    id: job.id,
    fileName: job.fileName,
    matterType: job.matterType,
    focus: job.focus ?? null,
    provider: job.provider,
    status: job.status,
    errorMessage: job.errorMessage ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function serializeJobDetail(job: JobWithOptionalUser): JobDetail {
  return {
    ...serializeJobListItem(job),
    transcript: job.transcript ?? null,
    summary: parseSummary(job.summary),
    speakerSegments: parseSpeakerSegments(job.speakerSegments),
  };
}
