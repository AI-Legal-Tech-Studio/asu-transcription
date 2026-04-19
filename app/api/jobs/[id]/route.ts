import { NextResponse } from "next/server";

import { deleteStoredAudio } from "@/lib/blob-storage";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabaseConfig } from "@/lib/config";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import {
  deleteStoredJobForUser,
  loadStoredJobForUser,
} from "@/lib/job-store";
import { serializeJobDetail } from "@/lib/jobs";

// Guard against prototype-pollution-style IDs and casual scanner noise.
// Prisma cuids are 24-25 chars of [a-z0-9]; legacy UUIDs are 36 chars.
function isPlausibleJobId(value: string) {
  return /^[a-z0-9-]{16,64}$/i.test(value);
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const userEmail = await getCurrentUser();

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasDatabaseConfig()) {
    return NextResponse.json(
      { error: "Database persistence is not configured on this deployment." },
      { status: 503 },
    );
  }

  const { id } = await params;
  if (!isPlausibleJobId(id)) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  const job = await loadStoredJobForUser(id, userEmail);

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({
    job: serializeJobDetail(job),
  });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof CsrfError) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    throw error;
  }

  const userEmail = await getCurrentUser();

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasDatabaseConfig()) {
    return NextResponse.json(
      { error: "Database persistence is not configured on this deployment." },
      { status: 503 },
    );
  }

  const { id } = await params;
  if (!isPlausibleJobId(id)) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  const job = await loadStoredJobForUser(id, userEmail);

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  await deleteStoredAudio(job.sourceAudioUrl ?? job.sourceAudioPath);

  const deletedJob = await deleteStoredJobForUser(id, userEmail);

  if (!deletedJob) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
