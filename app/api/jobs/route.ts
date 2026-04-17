import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasDatabaseConfig } from "@/lib/config";
import { listStoredJobsForUser } from "@/lib/job-store";
import { serializeJobListItem } from "@/lib/jobs";

export async function GET() {
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

  const jobs = await listStoredJobsForUser(userEmail);

  return NextResponse.json({
    jobs: jobs.map(serializeJobListItem),
  });
}
