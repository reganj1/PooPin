import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { getLeaderboard, type LeaderboardEntry } from "../../src/lib/api";
import { useSession } from "../../src/providers/session-provider";
import { mobileTheme } from "../../src/ui/theme";

// ─── Constants (mirrors web values) ──────────────────────────────────────────
const LEADERBOARD_LIMIT = 50;
const POINT_VALUES = { review: 5, photo: 7, restroom: 10 } as const;

const TOP_RANK_LABELS: Record<number, string> = {
  1: "Bathroom Royalty",
  2: "Stall Scholar",
  3: "Porcelain Pioneer"
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatNumber = (n: number) => new Intl.NumberFormat("en-US").format(n);

const getInitials = (name: string) => {
  const cleaned = name.trim();
  if (!cleaned) return "PP";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map((p) => p[0]).join("").toUpperCase();
};

// Avatar background colors for top 3 and everyone else
const getAvatarStyle = (rank: number) => {
  if (rank === 1) return { bg: "#fbbf24", text: "#1e293b" };  // amber
  if (rank === 2) return { bg: "#94a3b8", text: "#0f172a" };  // slate/silver
  if (rank === 3) return { bg: "#fb923c", text: "#1e293b" };  // orange/bronze
  return { bg: mobileTheme.colors.brandDeep, text: "#ffffff" };
};

// Card background tints for top 3
const getTopCardBg = (rank: number) => {
  if (rank === 1) return "#fffbeb"; // amber-50
  if (rank === 2) return "#f8fafc"; // slate-50
  if (rank === 3) return "#fff7ed"; // orange-50
  return mobileTheme.colors.surface;
};

const getTopCardBorder = (rank: number) => {
  if (rank === 1) return "#fde68a"; // amber-200
  if (rank === 2) return mobileTheme.colors.border;
  if (rank === 3) return "#fed7aa"; // orange-200
  return mobileTheme.colors.borderSubtle;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ displayName, rank, size = 44 }: { displayName: string; rank: number; size?: number }) {
  const { bg, text } = getAvatarStyle(rank);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { color: text, fontSize: size * 0.36 }]}>{getInitials(displayName)}</Text>
    </View>
  );
}

function StatChip({ label, count, accent }: { label: string; count: number; accent?: boolean }) {
  return (
    <View style={[styles.statChip, accent && styles.statChipAccent]}>
      <Text style={[styles.statChipText, accent && styles.statChipTextAccent]}>
        {label} {formatNumber(count)}
      </Text>
    </View>
  );
}

function TopCard({ entry, isViewer }: { entry: LeaderboardEntry; isViewer: boolean }) {
  const rankLabel = TOP_RANK_LABELS[entry.rank] ?? "Top contributor";
  return (
    <View
      style={[
        styles.topCard,
        { backgroundColor: getTopCardBg(entry.rank), borderColor: getTopCardBorder(entry.rank) },
        isViewer && styles.viewerHighlight
      ]}
    >
      <View style={styles.topCardRow}>
        <Avatar displayName={entry.displayName} rank={entry.rank} size={46} />
        <View style={styles.topCardInfo}>
          <Text style={styles.topCardEyebrow}>
            #{entry.rank} {rankLabel}
          </Text>
          <Text style={styles.topCardName} numberOfLines={1}>
            {entry.displayName}
            {isViewer ? "  (You)" : ""}
          </Text>
        </View>
        <View style={styles.pointsBadge}>
          <Text style={styles.pointsBadgeLabel}>pts</Text>
          <Text style={styles.pointsBadgeValue}>{formatNumber(entry.totalPoints)}</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <StatChip label="Reviews" count={entry.reviewCount} accent={entry.rank === 1} />
        <StatChip label="Photos" count={entry.photoCount} />
        <StatChip label="Adds" count={entry.restroomAddCount} />
      </View>

      <Text style={styles.contributionLine}>
        {formatNumber(entry.contributionCount)} counted contributions
      </Text>
    </View>
  );
}

function LeaderboardRow({ entry, isViewer }: { entry: LeaderboardEntry; isViewer: boolean }) {
  return (
    <View style={[styles.row, isViewer && styles.viewerHighlight]}>
      <Text style={styles.rowRank}>#{entry.rank}</Text>
      <Avatar displayName={entry.displayName} rank={entry.rank} size={36} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>
          {entry.displayName}
          {isViewer ? "  (You)" : ""}
        </Text>
        <View style={styles.rowStatRow}>
          <Text style={styles.rowStatText}>
            {formatNumber(entry.reviewCount)}R · {formatNumber(entry.photoCount)}P · {formatNumber(entry.restroomAddCount)}A
          </Text>
          <Text style={styles.rowStatDot}>·</Text>
          <Text style={styles.rowStatText}>{formatNumber(entry.contributionCount)} contributions</Text>
        </View>
      </View>
      <View style={styles.rowPoints}>
        <Text style={styles.rowPointsValue}>{formatNumber(entry.totalPoints)}</Text>
        <Text style={styles.rowPointsLabel}>pts</Text>
      </View>
    </View>
  );
}

function ViewerStandingCard({ entry }: { entry: LeaderboardEntry }) {
  return (
    <View style={[styles.viewerCard]}>
      <Text style={styles.viewerCardEyebrow}>Your standing</Text>
      <Text style={styles.viewerCardTitle}>You're currently #{entry.rank}</Text>
      <Text style={styles.viewerCardBody}>
        {formatNumber(entry.totalPoints)} pts from {entry.reviewCount} reviews, {entry.photoCount} photos, and {entry.restroomAddCount} restroom adds.
      </Text>
      <View style={styles.statRow}>
        <StatChip label="Reviews" count={entry.reviewCount} accent />
        <StatChip label="Photos" count={entry.photoCount} />
        <StatChip label="Adds" count={entry.restroomAddCount} />
      </View>
    </View>
  );
}

// ─── Header rendered as FlatList ListHeaderComponent ─────────────────────────

function LeaderboardHeader({
  totalContributors,
  topThree,
  viewerEntry,
  viewerProfileId
}: {
  totalContributors: number;
  topThree: LeaderboardEntry[];
  viewerEntry: LeaderboardEntry | null;
  viewerProfileId: string | null;
}) {
  const showViewerCard = Boolean(viewerEntry && viewerEntry.rank > LEADERBOARD_LIMIT);

  return (
    <View style={styles.headerContainer}>
      {/* Hero */}
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Community leaderboard</Text>
        <Text style={styles.heroTitle}>Top Poopin contributors</Text>
        <Text style={styles.heroCopy}>
          Ranked from real reviews, photo uploads, and restroom adds. Top {LEADERBOARD_LIMIT}.
        </Text>
        <View style={styles.legendRow}>
          <View style={styles.legendPill}><Text style={styles.legendPillText}>+{POINT_VALUES.review} per review</Text></View>
          <View style={styles.legendPill}><Text style={styles.legendPillText}>+{POINT_VALUES.photo} per photo</Text></View>
          <View style={styles.legendPill}><Text style={styles.legendPillText}>+{POINT_VALUES.restroom} per restroom</Text></View>
          {totalContributors > 0 ? (
            <View style={styles.legendPill}>
              <Text style={styles.legendPillText}>{formatNumber(totalContributors)} ranked</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Top 3 cards */}
      {topThree.length > 0 ? (
        <View style={styles.topSection}>
          {topThree.map((entry) => (
            <TopCard
              key={entry.profileId}
              entry={entry}
              isViewer={entry.profileId === viewerProfileId}
            />
          ))}
        </View>
      ) : null}

      {/* Viewer standing (only if they're outside top-limit) */}
      {showViewerCard && viewerEntry ? (
        <ViewerStandingCard entry={viewerEntry} />
      ) : null}

      {/* Section divider for remaining rows */}
      {topThree.length > 0 ? (
        <Text style={styles.sectionDivider}>Ranks 4 – {LEADERBOARD_LIMIT}</Text>
      ) : null}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

type LoadState = "loading" | "success" | "error";

export default function LeaderboardScreen() {
  const { user } = useSession();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [totalContributors, setTotalContributors] = useState(0);
  const [serverViewerEntry, setServerViewerEntry] = useState<LeaderboardEntry | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);
    try {
      const result = await getLeaderboard(LEADERBOARD_LIMIT);
      setEntries(result.entries);
      setTotalContributors(result.totalContributors);
      setServerViewerEntry(result.currentViewerEntry);
      setLoadState("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load the leaderboard right now.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // user.id is the Supabase auth UID, not the profiles.id — viewer matching
  // is handled server-side; serverViewerEntry is authoritative when available.
  const viewerProfileId = user?.id ?? null;
  const topThree = entries.slice(0, Math.min(3, entries.length));
  const remaining = entries.slice(topThree.length);

  const viewerEntry = serverViewerEntry
    ?? (viewerProfileId ? entries.find((e) => e.profileId === viewerProfileId) ?? null : null);

  if (loadState === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={mobileTheme.colors.brandStrong} size="large" />
          <Text style={styles.loadingText}>Loading leaderboard…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === "error") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Unable to load leaderboard</Text>
          <Text style={styles.errorBody}>{errorMessage}</Text>
          <Pressable
            onPress={() => { void load(); }}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (entries.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No contributors yet</Text>
          <Text style={styles.emptyBody}>
            The first review, photo, or restroom add will put someone on the board.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={remaining}
        keyExtractor={(item) => item.profileId}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <LeaderboardHeader
            totalContributors={totalContributors}
            topThree={topThree}
            viewerEntry={viewerEntry}
            viewerProfileId={viewerProfileId}
          />
        }
        ListEmptyComponent={
          topThree.length > 0 ? (
            <Text style={styles.noMoreRows}>Only {topThree.length} contributor{topThree.length === 1 ? "" : "s"} so far.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <LeaderboardRow
            key={item.profileId}
            entry={item}
            isViewer={item.profileId === viewerProfileId}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileTheme.colors.pageBackground
  },
  centered: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 32
  },
  listContent: {
    paddingBottom: 32
  },

  // ── Header ──
  headerContainer: {
    gap: 12,
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingTop: mobileTheme.spacing.screenTop
  },
  heroCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    gap: 8,
    padding: mobileTheme.spacing.heroPadding,
    ...mobileTheme.shadows.hero
  },
  eyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  heroTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34
  },
  heroCopy: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4
  },
  legendPill: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  legendPillText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "600"
  },

  // ── Top 3 ──
  topSection: {
    gap: 10
  },
  topCard: {
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    ...mobileTheme.shadows.card
  },
  topCardRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  topCardInfo: {
    flex: 1,
    gap: 2
  },
  topCardEyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  topCardName: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22
  },

  // ── Points badge ──
  pointsBadge: {
    alignItems: "flex-end",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  pointsBadgeLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  pointsBadgeValue: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 24
  },

  // ── Stat chips ──
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  statChip: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statChipAccent: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder
  },
  statChipText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "600"
  },
  statChipTextAccent: {
    color: mobileTheme.colors.brandStrong
  },
  contributionLine: {
    color: mobileTheme.colors.textFaint,
    fontSize: 11,
    lineHeight: 15
  },

  // ── Section divider ──
  sectionDivider: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 4,
    paddingHorizontal: 4,
    textTransform: "uppercase"
  },

  // ── Viewer standing card ──
  viewerCard: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    gap: 10,
    padding: 16,
    ...mobileTheme.shadows.card
  },
  viewerCardEyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  viewerCardTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "700"
  },
  viewerCardBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },

  // ── Viewer highlight on any card/row ──
  viewerHighlight: {
    borderColor: mobileTheme.colors.infoBorder
  },

  // ── Remaining rows ──
  row: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginHorizontal: mobileTheme.spacing.screenX,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...mobileTheme.shadows.card
  },
  rowRank: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    fontWeight: "700",
    minWidth: 28,
    textAlign: "center"
  },
  rowInfo: {
    flex: 1,
    gap: 3
  },
  rowName: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700"
  },
  rowStatRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4
  },
  rowStatText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11
  },
  rowStatDot: {
    color: mobileTheme.colors.textFaint,
    fontSize: 11
  },
  rowPoints: {
    alignItems: "flex-end",
    gap: 1
  },
  rowPointsValue: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700"
  },
  rowPointsLabel: {
    color: mobileTheme.colors.textFaint,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase"
  },
  separator: {
    height: 8
  },

  // ── Avatar ──
  avatar: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center"
  },
  avatarText: {
    fontWeight: "700",
    letterSpacing: 0.3
  },

  // ── States ──
  loadingText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 14,
    marginTop: 4
  },
  errorTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center"
  },
  errorBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  retryButton: {
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.xs,
    marginTop: 4,
    paddingHorizontal: 24,
    paddingVertical: 13
  },
  retryButtonPressed: {
    opacity: 0.85
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  emptyTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center"
  },
  emptyBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  noMoreRows: {
    color: mobileTheme.colors.textFaint,
    fontSize: 13,
    marginTop: 8,
    paddingHorizontal: mobileTheme.spacing.screenX,
    textAlign: "center"
  }
});
