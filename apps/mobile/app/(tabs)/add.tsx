import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../../src/providers/session-provider";
import { mobileTheme } from "../../src/ui/theme";

// ── Action definitions ────────────────────────────────────────────────────────

const ACTIONS = [
  {
    key: "restroom",
    href: "/add-restroom" as Href,
    icon: "location" as const,
    iconBg: "#f0fdf4",
    iconColor: "#16a34a",
    pts: "+10 pts",
    ptsColor: "#166534",
    ptsBg: "#dcfce7",
    title: "Add a restroom",
    description: "Map a public restroom so others can find it.",
    hint: "Earns the most points and grows the map."
  },
  {
    key: "review",
    href: "/add-review" as Href,
    icon: "star" as const,
    iconBg: "#fffbeb",
    iconColor: "#d97706",
    pts: "+5 pts",
    ptsColor: "#92400e",
    ptsBg: "#fef3c7",
    title: "Write a review",
    description: "Rate a restroom's cleanliness and experience.",
    hint: "Help the community know what to expect."
  },
  {
    key: "photo",
    href: "/add-photo" as Href,
    icon: "camera" as const,
    iconBg: "#f0f9ff",
    iconColor: "#0284c7",
    pts: "+7 pts",
    ptsColor: "#075985",
    ptsBg: "#e0f2fe",
    title: "Upload a photo",
    description: "Show what a restroom actually looks like inside.",
    hint: "A picture helps everyone make a better choice."
  }
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddScreen() {
  const router = useRouter();
  const { user, isLoading } = useSession();

  const handleAction = (href: Href) => {
    if (!user) {
      router.push(`/sign-in?returnTo=${encodeURIComponent(href as string)}` as Href);
      return;
    }
    router.push(href);
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page header ── */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Contribute</Text>
          <Text style={styles.title}>Add to the map</Text>
          <Text style={styles.subtitle}>
            Every contribution earns leaderboard points and helps the community find clean restrooms.
          </Text>
        </View>

        {/* ── Action cards ── */}
        <View style={styles.cards}>
          {ACTIONS.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => handleAction(action.href)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              {/* Left: tinted icon circle */}
              <View style={[styles.cardIcon, { backgroundColor: action.iconBg }]}>
                <Ionicons name={action.icon} size={22} color={action.iconColor} />
              </View>

              {/* Center: title + description */}
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{action.title}</Text>
                  <View style={[styles.ptsBadge, { backgroundColor: action.ptsBg }]}>
                    <Text style={[styles.ptsLabel, { color: action.ptsColor }]}>
                      {action.pts}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardDesc}>{action.description}</Text>
              </View>

              {/* Right: chevron */}
              <Ionicons
                name="chevron-forward"
                size={16}
                color={mobileTheme.colors.textFaint}
                style={styles.chevron}
              />
            </Pressable>
          ))}
        </View>

        {/* ── Sign-in nudge ── */}
        {!isLoading && !user ? (
          <View style={styles.authNote}>
            <Ionicons
              name="lock-closed-outline"
              size={13}
              color={mobileTheme.colors.textFaint}
            />
            <Text style={styles.authNoteText}>
              Sign in required to contribute
            </Text>
          </View>
        ) : null}

        {/* ── Footer ── */}
        <Text style={styles.footer}>
          All submissions are moderated before appearing publicly.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    backgroundColor: mobileTheme.colors.pageBackground,
    flex: 1
  },
  content: {
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingTop: mobileTheme.spacing.screenTop,
    paddingBottom: 40
  },

  // Header
  header: {
    marginBottom: 28
  },
  eyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 6,
    textTransform: "uppercase"
  },
  title: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 10
  },
  subtitle: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },

  // Cards
  cards: {
    gap: 12
  },
  card: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 16,
    ...mobileTheme.shadows.card
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }]
  },
  cardIcon: {
    alignItems: "center",
    borderRadius: 14,
    flexShrink: 0,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  cardBody: {
    flex: 1,
    gap: 4
  },
  cardTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  cardTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700"
  },
  ptsBadge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  ptsLabel: {
    fontSize: 11,
    fontWeight: "700"
  },
  cardDesc: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18
  },
  chevron: {
    flexShrink: 0,
    marginLeft: 2
  },

  // Auth note
  authNote: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 20,
    paddingHorizontal: 8
  },
  authNoteText: {
    color: mobileTheme.colors.textFaint,
    fontSize: 13
  },

  // Footer
  footer: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    marginTop: 24,
    textAlign: "center"
  }
});
