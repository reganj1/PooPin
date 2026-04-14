import { NextRequest, NextResponse } from "next/server";
import { getLeaderboardSnapshot } from "@/lib/points/pointEvents";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;

  const profileId = searchParams.get("profileId") ?? null;

  try {
    const snapshot = await getLeaderboardSnapshot(profileId, limit);
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load leaderboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
