import { useEffect, useRef, useState } from "react";
import { useRouter, type Href } from "expo-router";
import type { NearbyBathroom } from "@poopin/domain";
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { getNearbyRestrooms } from "../src/lib/api";
import { useCurrentLocation } from "../src/hooks/use-current-location";
import { useSession } from "../src/providers/session-provider";

const FALLBACK_QUERY = {
  lat: 37.7749,
  lng: -122.4194,
  limit: 24
} as const;

const toLocationLine = (restroom: NearbyBathroom) => [restroom.address, restroom.city, restroom.state].filter(Boolean).join(", ");

const formatRatingLabel = (restroom: NearbyBathroom) => {
  if (restroom.ratings.reviewCount <= 0 || restroom.ratings.overall <= 0) {
    return "No reviews yet";
  }

  return `${restroom.ratings.overall.toFixed(1)} overall • ${restroom.ratings.reviewCount} review${restroom.ratings.reviewCount === 1 ? "" : "s"}`;
};

export default function HomeScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const { coordinates, errorMessage: locationErrorMessage, permissionStatus } = useCurrentLocation();
  const [restrooms, setRestrooms] = useState<NearbyBathroom[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingNearby, setIsRefreshingNearby] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [resultSource, setResultSource] = useState<"fallback" | "live">("fallback");
  const appliedLiveLocationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadFallback = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await getNearbyRestrooms(FALLBACK_QUERY);
        if (cancelled) {
          return;
        }

        setRestrooms(response.restrooms);
        setResultSource("fallback");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Could not load nearby restrooms right now.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadFallback();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!coordinates) {
      return;
    }

    const locationKey = `${coordinates.lat.toFixed(4)}:${coordinates.lng.toFixed(4)}`;
    if (appliedLiveLocationKeyRef.current === locationKey) {
      return;
    }

    let cancelled = false;

    const loadLiveNearby = async () => {
      setIsRefreshingNearby(true);
      setErrorMessage(null);

      try {
        const response = await getNearbyRestrooms({
          lat: coordinates.lat,
          lng: coordinates.lng,
          limit: FALLBACK_QUERY.limit
        });

        if (cancelled) {
          return;
        }

        appliedLiveLocationKeyRef.current = locationKey;
        setRestrooms(response.restrooms);
        setResultSource("live");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Could not refresh nearby restrooms with your location.");
      } finally {
        if (!cancelled) {
          setIsRefreshingNearby(false);
        }
      }
    };

    void loadLiveNearby();

    return () => {
      cancelled = true;
    };
  }, [coordinates]);

  const handleSignOut = async () => {
    setIsSigningOut(true);

    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const showFallbackBanner = permissionStatus === "denied" || permissionStatus === "unavailable";
  const showLiveRefreshNotice = permissionStatus === "granted" && (isRefreshingNearby || resultSource === "live");

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={restrooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Phase 3</Text>
            <Text style={styles.title}>Nearby restrooms</Text>
            <Text style={styles.copy}>
              Browse current Poopin restroom data on iPhone. Sign in when you’re ready, but nearby browse stays public.
            </Text>

            <View style={styles.headerActions}>
              {user ? (
                <>
                  <Text style={styles.sessionLabel}>{user.email ?? "Signed in"}</Text>
                  <Pressable
                    onPress={handleSignOut}
                    disabled={isSigningOut}
                    style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
                  >
                    <Text style={styles.secondaryButtonText}>{isSigningOut ? "Signing out…" : "Sign out"}</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => router.push("/sign-in?returnTo=%2F" as Href)}
                  style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null]}
                >
                  <Text style={styles.primaryButtonText}>Sign in</Text>
                </Pressable>
              )}
            </View>

            {showFallbackBanner ? (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeTitle}>Using a default nearby area</Text>
                <Text style={styles.noticeCopy}>
                  {locationErrorMessage ?? "Enable location to swap these fallback results for restrooms near you."}
                </Text>
              </View>
            ) : null}

            {showLiveRefreshNotice ? (
              <View style={styles.liveNotice}>
                <Text style={styles.liveNoticeText}>
                  {isRefreshingNearby ? "Refreshing with your current location…" : "Showing restrooms near your current location."}
                </Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color="#38bdf8" />
              <Text style={styles.stateText}>Loading nearby restrooms…</Text>
            </View>
          ) : (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>No nearby restrooms are available right now.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/restrooms/${item.id}` as Href)}
            style={({ pressed }) => [styles.rowCard, pressed ? styles.cardPressed : null]}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowDistance}>
                {typeof item.distanceMiles === "number" ? `${item.distanceMiles.toFixed(1)} mi` : "Nearby"}
              </Text>
            </View>
            <Text style={styles.rowLocation}>{toLocationLine(item)}</Text>
            <Text style={styles.rowRating}>{formatRatingLabel(item)}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617"
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 16
  },
  header: {
    marginBottom: 20
  },
  eyebrow: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 10,
    textTransform: "uppercase"
  },
  title: {
    color: "#f8fafc",
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 10
  },
  copy: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22
  },
  headerActions: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    marginTop: 18
  },
  sessionLabel: {
    color: "#cbd5e1",
    flex: 1,
    fontSize: 13,
    paddingTop: 10
  },
  primaryButton: {
    backgroundColor: "#0ea5e9",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  primaryButtonText: {
    color: "#e0f2fe",
    fontSize: 14,
    fontWeight: "700"
  },
  secondaryButton: {
    backgroundColor: "#1e293b",
    borderColor: "#334155",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "700"
  },
  buttonPressed: {
    opacity: 0.85
  },
  noticeCard: {
    backgroundColor: "#172554",
    borderColor: "#1d4ed8",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    padding: 14
  },
  noticeTitle: {
    color: "#bfdbfe",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6
  },
  noticeCopy: {
    color: "#dbeafe",
    fontSize: 13,
    lineHeight: 19
  },
  liveNotice: {
    backgroundColor: "#082f49",
    borderColor: "#0369a1",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  liveNoticeText: {
    color: "#bae6fd",
    fontSize: 13,
    fontWeight: "600"
  },
  errorCard: {
    backgroundColor: "#450a0a",
    borderColor: "#991b1b",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    padding: 14
  },
  errorText: {
    color: "#fecaca",
    fontSize: 13,
    lineHeight: 19
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 24
  },
  stateText: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center"
  },
  rowCard: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }]
  },
  rowHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  rowTitle: {
    color: "#f8fafc",
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    paddingRight: 12
  },
  rowDistance: {
    color: "#7dd3fc",
    fontSize: 13,
    fontWeight: "700"
  },
  rowLocation: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6
  },
  rowRating: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 19
  }
});
