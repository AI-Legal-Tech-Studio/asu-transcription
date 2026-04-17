import { NextResponse } from "next/server";

import { deleteStoredAudio } from "@/lib/blob-storage";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabaseConfig } from "@/lib/config";
import {
  deleteStoredJobForUser,
  loadStoredJobForUser,
} from "@/lib/job-store";
import { serializeJobDetail } from "@/lib/jobs";

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
  const job = await loadStoredJobForUser(id, userEmail);

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({
    job: serializeJobDetail(job),
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
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
