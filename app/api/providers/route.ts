import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getDefaultProviderId, getAvailableProviders } from "@/lib/providers";

export async function GET() {
  const userEmail = await getCurrentUser();

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({
    defaultProviderId: getDefaultProviderId(),
    providers: getAvailableProviders(),
  });
}
