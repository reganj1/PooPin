import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  getMyContributions,
  getMyProfile,
  type PointEventType,
  type YourListItem
} from "../../src/lib/api";
import { useSession } from "../../src/providers/session-provider";
import { mobileTheme } from "../../src/ui/theme";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterKey = "all" | PointEventType;
type SortKey = "newest" | "points";

// ── Constants ─────────────────────────────────────────────────────────────────

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "review_created", label: "Reviews" },
  { key: "photo_uploaded", label: "Photos" },
  { key: "restroom_added", label: "Added" }
];

const EVENT_META: Record<
  PointEventType,
  { iconName: keyof typeof Ionicons.glyphMap; iconBg: string; iconColor: string; label: string; pts: number }
> = {
  review_created: {
    iconName: "star",
    iconBg: "#fffbeb",
    iconColor: "#d97706",
    label: "Review posted",
    pts: 5
  },
  photo_uploaded: {
    iconName: "image",
    iconBg: "#f0f9ff",
    iconColor: "#0284c7",
    label: "Photo uploaded",
    pts: 7
  },
  restroom_added: {
    iconName: "location",
    iconBg: "#f0fdf4",
    iconColor: "#16a34a",
    label: "Restroom added",
    pts: 10
  }
};

const QUICK_TAG_LABELS: Record<string, string> = {
  clean: "Clean",
  smelly: "Smelly",
  no_line: "No line",
  crowded: "Crowded",
  no_toilet_paper: "No T.P.",
  locked: "Locked"
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeDate(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return mins <= 1 ? "Just now" : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={n <= Math.round(rating) ? "star" : "star-outline"}
          size={10}
          color="#d97706"
        />
      ))}
    </View>
  );
}

// ── Contribution row ──────────────────────────────────────────────────────────

function ContributionRow({ item }: { item: YourListItem }) {
  const meta = EVENT_META[item.eventType];
  const hasBathroom = Boolean(item.restroomName);
  const visibleTags = (item.quickTags ?? []).slice(0, 3);

  return (
    <View style={styles.row}>
      {/* Type icon */}
      <View style={[styles.rowIcon, { backgroundColor: meta.iconBg }]}>
        <Ionicons name={meta.iconName} size={16} color={meta.iconColor} />
      </View>

      {/* Content */}
      <View style={styles.rowContent}>
        <Text style={styles.rowRestroom} numberOfLines={1}>
          {hasBathroom ? item.restroomName! : meta.label}
        </Text>
        {hasBathroom && item.restroomAddressLine ? (
          <Text style={styles.rowAddress} numberOfLines={1}>
            {item.restroomAddressLine}
          </Text>
        ) : null}

        <View style={styles.rowMeta}>
          {item.eventType === "review_created" && item.overallRating != null ? (
            <StarRating rating={item.overallRating} />
          ) : null}
          {visibleTags.length > 0 ? (
            <Text style={styles.rowTags} numberOfLines={1}>
              {visibleTags.map((t) => QUICK_TAG_LABELS[t] ?? t).join(" · ")}
            </Text>
          ) : null}
          {item.eventType !== "review_created" || (item.overallRating == null && visibleTags.length === 0) ? (
            <Text style={styles.rowTypeLabel}>{meta.label}</Text>
          ) : null}
          <Text style={styles.rowDate}>{formatRelativeDate(item.createdAt)}</Text>
        </View>
      </View>

      {/* Points badge */}
      <View style={styles.rowPoints}>
        <Text style={styles.rowPtsNum}>+{item.pointsDelta}</Text>
        <Text style={styles.rowPtsLabel}>pts</Text>
      </View>
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ filter, loading }: { filter: FilterKey; loading: boolean }) {
  if (loading) return null;

  const messages: Record<FilterKey, { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = {
    all: {
      icon: "list-outline",
      title: "No contributions yet",
      body: "Add a restroom, leave a review, or upload a photo to start building your list."
    },
    review_created: {
      icon: "star-outline",
      title: "No reviews yet",
      body: "Your reviews will appear here after you rate a restroom."
    },
    photo_uploaded: {
      icon: "image-outline",
      title: "No photos yet",
      body: "Photos you upload to restrooms will show here."
    },
    restroom_added: {
      icon: "location-outline",
      title: "No restrooms added",
      body: "Restrooms you've added to the map will appear here."
    }
  };

  const m = messages[filter];

  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={m.icon} size={32} color={mobileTheme.colors.textFaint} />
      </View>
      <Text style={styles.emptyTitle}>{m.title}</Text>
      <Text style={styles.emptyBody}>{m.body}</Text>
    </View>
  );
}

// ── Signed-out CTA ────────────────────────────────────────────────────────────

function SignedOutCTA() {
  const router = useRouter();

  return (
    <View style={styles.ctaCard}>
      <View style={styles.ctaIconWrap}>
        <Ionicons name="list" size={36} color={mobileTheme.colors.brandStrong} />
      </View>
      <Text style={styles.ctaTitle}>Track your contributions</Text>
      <Text style={styles.ctaBody}>
        Sign in to see every review, photo, and restroom you've added — sorted, filterable,
        and tagged with the points you've earned.
      </Text>
      <View style={styles.ctaBenefits}>
        {[
          { icon: "star" as const, text: "Your reviews, all in one place" },
          { icon: "image" as const, text: "Photos you've uploaded" },
          { icon: "location" as const, text: "Restrooms you've added" },
          { icon: "trophy" as const, text: "Points earned per contribution" }
        ].map(({ icon, text }) => (
          <View key={text} style={styles.ctaBenefitRow}>
            <Ionicons name={icon} size={14} color={mobileTheme.colors.brandStrong} />
            <Text style={styles.ctaBenefitText}>{text}</Text>
          </View>
        ))}
      </View>
      <Pressable
        style={({ pressed }) => [styles.ctaBtn, pressed && styles.ctaBtnPressed]}
        onPress={() => router.push("/sign-in")}
      >
        <Text style={styles.ctaBtnLabel}>Sign in / Create account</Text>
      </Pressable>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function YourListScreen() {
  const { user, isLoading: sessionLoading } = useSession();
  const [items, setItems] = useState<YourListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const profileIdRef = useRef<string | null>(null);

  const loadData = useCallback(async (quiet = false) => {
    if (!user) return;
    if (!quiet) setLoading(true);
    try {
      const profile = await getMyProfile();
      if (!profile) return;
      profileIdRef.current = profile.id;
      const contributions = await getMyContributions(profile.id);
      setItems(contributions);
    } catch {
      // silently show stale data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadData();
    else { setItems([]); profileIdRef.current = null; }
  }, [user, loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData(true);
  }, [loadData]);

  const displayed = useMemo(() => {
    const filtered =
      filter === "all" ? items : items.filter((i) => i.eventType === filter);
    if (sort === "points")
      return [...filtered].sort((a, b) => b.pointsDelta - a.pointsDelta);
    return filtered;
  }, [items, filter, sort]);

  // ── Summary counts ─────────────────────────────────────────────────────────
  const reviewCount = useMemo(
    () => items.filter((i) => i.eventType === "review_created").length,
    [items]
  );
  const photoCount = useMemo(
    () => items.filter((i) => i.eventType === "photo_uploaded").length,
    [items]
  );
  const addedCount = useMemo(
    () => items.filter((i) => i.eventType === "restroom_added").length,
    [items]
  );
  const totalPts = useMemo(
    () => items.reduce((s, i) => s + i.pointsDelta, 0),
    [items]
  );

  // ── Header component (inlined as ListHeaderComponent for scroll cohesion) ───
  const ListHeader = useMemo(
    () => (
      <View>
        {/* Stats row */}
        {!loading && items.length > 0 ? (
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Text style={styles.statChipNum}>{reviewCount}</Text>
              <Text style={styles.statChipLabel}>Reviews</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statChip}>
              <Text style={styles.statChipNum}>{photoCount}</Text>
              <Text style={styles.statChipLabel}>Photos</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statChip}>
              <Text style={styles.statChipNum}>{addedCount}</Text>
              <Text style={styles.statChipLabel}>Added</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statChip}>
              <Text style={[styles.statChipNum, styles.statChipNumPts]}>{totalPts}</Text>
              <Text style={styles.statChipLabel}>Total pts</Text>
            </View>
          </View>
        ) : null}

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipLabel, filter === f.key && styles.filterChipLabelActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Sort row */}
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort:</Text>
          {(["newest", "points"] as SortKey[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSort(s)}
              style={[styles.sortChip, sort === s && styles.sortChipActive]}
            >
              <Text style={[styles.sortChipLabel, sort === s && styles.sortChipLabelActive]}>
                {s === "newest" ? "Newest" : "Highest pts"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    ),
    [filter, sort, loading, items.length, reviewCount, photoCount, addedCount, totalPts]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Your List</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={mobileTheme.colors.brandStrong} />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Your List</Text>
        </View>
        <SignedOutCTA />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Your List</Text>
        {loading && items.length > 0 ? (
          <ActivityIndicator size="small" color={mobileTheme.colors.textFaint} style={styles.headerSpinner} />
        ) : null}
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={mobileTheme.colors.brandStrong} />
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ContributionRow item={item} />}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={<EmptyState filter={filter} loading={loading} />}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={mobileTheme.colors.brandStrong}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    backgroundColor: mobileTheme.colors.pageBackground,
    flex: 1
  },

  // ── Page header
  pageHeader: {
    alignItems: "center",
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 4
  },
  pageTitle: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3
  },
  headerSpinner: {
    marginLeft: 4
  },

  // ── Stats row
  statsRow: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 14
  },
  statChip: {
    alignItems: "center",
    flex: 1,
    gap: 2
  },
  statChipNum: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.5
  },
  statChipNumPts: {
    color: mobileTheme.colors.brandStrong
  },
  statChipLabel: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "500"
  },
  statDivider: {
    backgroundColor: mobileTheme.colors.border,
    height: 28,
    width: StyleSheet.hairlineWidth
  },

  // ── Filters
  filterRow: {
    backgroundColor: mobileTheme.colors.surface,
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  filterChip: {
    borderColor: mobileTheme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 5
  },
  filterChipActive: {
    backgroundColor: mobileTheme.colors.brandStrong,
    borderColor: mobileTheme.colors.brandStrong
  },
  filterChipLabel: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600"
  },
  filterChipLabelActive: {
    color: "#ffffff"
  },

  // ── Sort row
  sortRow: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.pageBackground,
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  sortLabel: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    fontWeight: "500",
    marginRight: 2
  },
  sortChip: {
    borderColor: mobileTheme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3
  },
  sortChipActive: {
    backgroundColor: mobileTheme.colors.infoTint,
    borderColor: mobileTheme.colors.infoBorder
  },
  sortChipLabel: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "500"
  },
  sortChipLabelActive: {
    color: mobileTheme.colors.brandStrong,
    fontWeight: "600"
  },

  // ── List
  listContent: {
    flexGrow: 1,
    paddingBottom: 24
  },
  separator: {
    backgroundColor: mobileTheme.colors.border,
    height: StyleSheet.hairlineWidth,
    marginLeft: 68
  },

  // ── Contribution row
  row: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  rowIcon: {
    alignItems: "center",
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  rowContent: {
    flex: 1,
    gap: 2
  },
  rowRestroom: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.1
  },
  rowAddress: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12
  },
  rowMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 6,
    marginTop: 1
  },
  starRow: {
    flexDirection: "row",
    gap: 1
  },
  rowTags: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 11
  },
  rowTypeLabel: {
    color: mobileTheme.colors.textFaint,
    fontSize: 11
  },
  rowDate: {
    color: mobileTheme.colors.textFaint,
    flex: 1,
    fontSize: 11,
    textAlign: "right"
  },
  rowPoints: {
    alignItems: "center",
    flexShrink: 0,
    minWidth: 36
  },
  rowPtsNum: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.3
  },
  rowPtsLabel: {
    color: mobileTheme.colors.textFaint,
    fontSize: 10,
    fontWeight: "500"
  },

  // ── Empty state
  emptyWrap: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 56
  },
  emptyIconWrap: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    marginBottom: 16,
    width: 64
  },
  emptyTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center"
  },
  emptyBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },

  // ── Signed-out CTA
  ctaCard: {
    alignItems: "center",
    margin: 20,
    marginTop: 24,
    padding: 28,
    backgroundColor: mobileTheme.colors.surface,
    borderRadius: mobileTheme.radii.xl,
    borderColor: mobileTheme.colors.border,
    borderWidth: 1,
    ...mobileTheme.shadows.card
  },
  ctaIconWrap: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.infoTint,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    marginBottom: 16,
    width: 56
  },
  ctaTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginBottom: 10,
    textAlign: "center"
  },
  ctaBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    textAlign: "center"
  },
  ctaBenefits: {
    alignSelf: "stretch",
    gap: 10,
    marginBottom: 24
  },
  ctaBenefitRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  ctaBenefitText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14
  },
  ctaBtn: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: mobileTheme.colors.brandStrong,
    borderRadius: mobileTheme.radii.md,
    paddingVertical: 14
  },
  ctaBtnPressed: {
    opacity: 0.88
  },
  ctaBtnLabel: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },

  // ── Misc
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center"
  }
});
