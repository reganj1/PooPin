import { NextResponse } from "next/server";
import { getProfilePointsSummary } from "@/lib/points/pointEvents";
import { getAuthenticatedProfile } from "@/lib/auth/server";

export async function GET() {
  const authContext = await getAuthenticatedProfile();
  if (!authContext) {
    return NextResponse.json({ error: "Sign in to view your points." }, { status: 401 });
  }

  if (!authContext.profile) {
    return NextResponse.json({ error: "Could not load your account right now." }, { status: 503 });
  }

  const summary = await getProfilePointsSummary(authContext.profile.id, 8);

  return NextResponse.json(
    {
      totalPoints: summary.totalPoints,
      recentEvents: summary.recentEvents
    },
    { status: 200 }
  );
}
