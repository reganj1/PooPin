import { NextRequest, NextResponse } from "next/server";
import { getCollectibleIdentitiesByProfileIds } from "@/lib/collectibles/identity";
import { getLeaderboardSnapshot, type LeaderboardEntry } from "@/lib/points/pointEvents";

type EntryWithTitle = LeaderboardEntry & {
  collectibleTitle: string | null;
  collectibleRarity: string | null;
};

const attachTitles = (entries: LeaderboardEntry[], identities: Map<string, { activeCardTitle: string; activeCardRarity: string }>): EntryWithTitle[] =>
  entries.map((entry) => {
    const identity = identities.get(entry.profileId);
    return {
      ...entry,
      collectibleTitle: identity?.activeCardTitle ?? null,
      collectibleRarity: identity?.activeCardRarity ?? null
    };
  });

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;
  const profileId = searchParams.get("profileId") ?? null;

  try {
    const snapshot = await getLeaderboardSnapshot(profileId, limit);

    const allProfileIds = [
      ...snapshot.entries.map((e) => e.profileId),
      ...(snapshot.currentViewerEntry ? [snapshot.currentViewerEntry.profileId] : [])
    ];

    const identities = allProfileIds.length > 0
      ? await getCollectibleIdentitiesByProfileIds(allProfileIds)
      : new Map<string, { activeCardTitle: string; activeCardRarity: string }>();

    return NextResponse.json({
      entries: attachTitles(snapshot.entries, identities),
      totalContributors: snapshot.totalContributors,
      currentViewerEntry: snapshot.currentViewerEntry
        ? attachTitles([snapshot.currentViewerEntry], identities)[0]
        : null
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load leaderboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
