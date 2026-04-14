import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { searchBathrooms, type BathroomSearchResult } from "../src/lib/api";
import { ReviewFormModal } from "../src/features/restroom-detail/ReviewFormModal";
import { useSession } from "../src/providers/session-provider";
import { mobileTheme } from "../src/ui/theme";

export default function AddReviewScreen() {
  const router = useRouter();
  const { user } = useSession();

  useEffect(() => {
    if (!user) router.replace("/sign-in");
  }, [user, router]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BathroomSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<BathroomSearchResult | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchBathrooms(text.trim());
        setResults(r);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, []);

  const handleSelect = useCallback((restroom: BathroomSearchResult) => {
    setSelected(restroom);
    setResults([]);
    setQuery(restroom.name);
    setReviewVisible(true);
  }, []);

  const handleReviewSubmitted = useCallback(() => {
    setReviewVisible(false);
    setSubmitted(true);
  }, []);

  // ── Success ───────────────────────────────────────────────────────────────

  if (submitted && selected) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.successWrap}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark-circle" size={56} color="#d97706" />
          </View>
          <Text style={styles.successTitle}>Review submitted!</Text>
          <Text style={styles.successBody}>
            Thanks for reviewing{"\n"}
            <Text style={{ fontWeight: "700" }}>{selected.name}</Text>.{"\n"}
            Your review helps the community.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={() => router.back()}
          >
            <Text style={styles.btnLabel}>Done</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed]}
            onPress={() => {
              setSubmitted(false);
              setSelected(null);
              setQuery("");
            }}
          >
            <Text style={styles.btnSecondaryLabel}>Review another restroom</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.navHeader}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={mobileTheme.colors.brandStrong} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.navTitle}>Write a review</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.instrTitle}>Which restroom did you visit?</Text>
        <Text style={styles.instrBody}>
          Search by restroom name or address to find it on the map.
        </Text>

        {/* Search input */}
        <View style={styles.searchCard}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={mobileTheme.colors.textFaint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search restroom name or address…"
              placeholderTextColor={mobileTheme.colors.textFaint}
              value={query}
              onChangeText={handleQueryChange}
              autoFocus
              returnKeyType="search"
              autoCorrect={false}
            />
            {searching ? (
              <ActivityIndicator size="small" color={mobileTheme.colors.textFaint} />
            ) : query.length > 0 ? (
              <Pressable
                onPress={() => { setQuery(""); setResults([]); setSelected(null); }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={16} color={mobileTheme.colors.textFaint} />
              </Pressable>
            ) : null}
          </View>

          {/* Results */}
          {results.length > 0 ? (
            <View style={styles.resultList}>
              {results.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => handleSelect(r)}
                  style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.7 }]}
                >
                  <View style={styles.resultIcon}>
                    <Ionicons name="location-outline" size={14} color={mobileTheme.colors.brandStrong} />
                  </View>
                  <View style={styles.resultText}>
                    <Text style={styles.resultName} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.resultAddr} numberOfLines={1}>
                      {[r.address, r.city, r.state].filter(Boolean).join(", ")}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={mobileTheme.colors.textFaint} />
                </Pressable>
              ))}
            </View>
          ) : query.length >= 2 && !searching ? (
            <View style={styles.noResults}>
              <Text style={styles.noResultsText}>
                No restrooms found. Try a different name or address.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Selected restroom */}
        {selected && !reviewVisible ? (
          <View style={styles.selectedCard}>
            <Ionicons name="location" size={18} color={mobileTheme.colors.brandStrong} />
            <View style={styles.selectedText}>
              <Text style={styles.selectedName}>{selected.name}</Text>
              <Text style={styles.selectedAddr}>
                {[selected.address, selected.city, selected.state].filter(Boolean).join(", ")}
              </Text>
            </View>
            <Pressable
              onPress={() => setReviewVisible(true)}
              style={({ pressed }) => [styles.writeBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.writeBtnLabel}>Write review</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Review form modal */}
        {selected ? (
          <ReviewFormModal
            visible={reviewVisible}
            bathroomId={selected.id}
            restroomName={selected.name}
            profileId={user?.id ?? ""}
            onClose={() => setReviewVisible(false)}
            onSuccess={handleReviewSubmitted}
          />
        ) : null}
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
  navHeader: {
    alignItems: "center",
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  backBtn: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    minWidth: 70
  },
  backLabel: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 16
  },
  navTitle: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center"
  },
  navSpacer: { minWidth: 70 },

  content: {
    padding: 20,
    paddingBottom: 48
  },
  instrTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6
  },
  instrBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20
  },

  searchCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    overflow: "hidden",
    ...mobileTheme.shadows.card
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    padding: 14
  },
  searchInput: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 15
  },
  resultList: {
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  resultRow: {
    alignItems: "center",
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  resultIcon: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.infoTint,
    borderRadius: 8,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  resultText: { flex: 1 },
  resultName: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600"
  },
  resultAddr: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12
  },
  noResults: {
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16
  },
  noResultsText: {
    color: mobileTheme.colors.textFaint,
    fontSize: 13,
    textAlign: "center"
  },

  selectedCard: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    padding: 14,
    ...mobileTheme.shadows.card
  },
  selectedText: { flex: 1 },
  selectedName: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700"
  },
  selectedAddr: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12
  },
  writeBtn: {
    backgroundColor: mobileTheme.colors.brandStrong,
    borderRadius: mobileTheme.radii.xs,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  writeBtnLabel: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700"
  },

  btn: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: mobileTheme.colors.brandStrong,
    borderRadius: mobileTheme.radii.md,
    marginTop: 4,
    paddingVertical: 15
  },
  btnLabel: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  btnPressed: { opacity: 0.88 },
  btnSecondary: {
    alignItems: "center",
    alignSelf: "stretch",
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    marginTop: 10,
    paddingVertical: 13
  },
  btnSecondaryLabel: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    fontWeight: "600"
  },

  successWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32
  },
  successIconWrap: { marginBottom: 16 },
  successTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center"
  },
  successBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 32,
    textAlign: "center"
  }
});
