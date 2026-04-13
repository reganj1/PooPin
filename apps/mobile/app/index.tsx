import { useEffect, useRef, useState } from "react";
import { useRouter, type Href } from "expo-router";
import type { NearbyBathroom } from "@poopin/domain";
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { getNearbyRestrooms } from "../src/lib/api";
import { RestroomMapSurface } from "../src/features/browse-map/RestroomMapSurface";
import { SelectedRestroomPreviewCard } from "../src/features/browse-map/SelectedRestroomPreviewCard";
import { useCurrentLocation } from "../src/hooks/use-current-location";
import { useSession } from "../src/providers/session-provider";
import { mobileTheme } from "../src/ui/theme";

const FALLBACK_QUERY = {
  lat: 37.7749,
  lng: -122.4194,
  limit: 24
} as const;

type BrowseMode = "list" | "map";

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
  const [browseMode, setBrowseMode] = useState<BrowseMode>("list");
  const [selectedRestroomId, setSelectedRestroomId] = useState<string | null>(null);
  const [locationCenterRequestKey, setLocationCenterRequestKey] = useState(0);
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

  useEffect(() => {
    if (!selectedRestroomId) {
      return;
    }

    const hasSelectedRestroom = restrooms.some((restroom) => restroom.id === selectedRestroomId);
    if (!hasSelectedRestroom) {
      setSelectedRestroomId(null);
    }
  }, [restrooms, selectedRestroomId]);

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
  const selectedRestroom = selectedRestroomId ? restrooms.find((restroom) => restroom.id === selectedRestroomId) ?? null : null;
  const mapOrigin = coordinates ?? FALLBACK_QUERY;
  const canRecenter = permissionStatus === "granted" && coordinates !== null;
  const headerContent = (
    <View style={styles.header}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Nearby restrooms</Text>
        <Text style={styles.title}>Find a restroom</Text>
        <Text style={styles.copy}>
          Browse trusted restroom listings nearby with the same clean Poopin experience you already have on the web.
        </Text>

        <View style={styles.browseModeSwitch}>
          <Pressable
            onPress={() => setBrowseMode("list")}
            style={({ pressed }) => [
              styles.browseModeButton,
              browseMode === "list" ? styles.browseModeButtonActive : null,
              pressed ? styles.buttonPressed : null
            ]}
          >
            <Text style={[styles.browseModeButtonText, browseMode === "list" ? styles.browseModeButtonTextActive : null]}>List</Text>
          </Pressable>
          <Pressable
            onPress={() => setBrowseMode("map")}
            style={({ pressed }) => [
              styles.browseModeButton,
              browseMode === "map" ? styles.browseModeButtonActive : null,
              pressed ? styles.buttonPressed : null
            ]}
          >
            <Text style={[styles.browseModeButtonText, browseMode === "map" ? styles.browseModeButtonTextActive : null]}>Map</Text>
          </Pressable>
        </View>

        {user ? <Text style={styles.sessionLabel}>{user.email ?? "Signed in"}</Text> : null}

        <View style={styles.headerActions}>
          {user ? (
            <Pressable
              onPress={handleSignOut}
              disabled={isSigningOut}
              style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
            >
              <Text style={styles.secondaryButtonText}>{isSigningOut ? "Signing out…" : "Sign out"}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push("/sign-in?returnTo=%2F" as Href)}
              style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null]}
            >
              <Text style={styles.primaryButtonText}>Sign in</Text>
            </Pressable>
          )}
        </View>
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
          <Text style={styles.errorTitle}>Unable to load nearby restrooms</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
  const stateCard = isLoading ? (
    <View style={styles.stateCard}>
      <ActivityIndicator color={mobileTheme.colors.brandStrong} />
      <Text style={styles.stateText}>Loading nearby restrooms…</Text>
    </View>
  ) : (
    <View style={styles.stateCard}>
      <Text style={styles.stateText}>No nearby restrooms are available right now.</Text>
    </View>
  );

  if (browseMode === "map") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.mapScreen}>
          <View style={styles.mapHeaderContent}>{headerContent}</View>

          <View style={styles.mapBody}>
            {restrooms.length > 0 ? (
              <View style={styles.mapCard}>
                <RestroomMapSurface
                  coordinates={coordinates}
                  initialCenter={mapOrigin}
                  locationCenterRequestKey={locationCenterRequestKey}
                  onSelectRestroom={setSelectedRestroomId}
                  permissionStatus={permissionStatus}
                  restrooms={restrooms}
                  selectedRestroomId={selectedRestroomId}
                />
                <View style={styles.mapControlOverlay}>
                  <Pressable
                    disabled={!canRecenter}
                    onPress={() => setLocationCenterRequestKey((current) => current + 1)}
                    style={({ pressed }) => [
                      styles.mapControlButton,
                      !canRecenter ? styles.mapControlButtonDisabled : null,
                      pressed ? styles.buttonPressed : null
                    ]}
                  >
                    <Text style={[styles.mapControlButtonText, !canRecenter ? styles.mapControlButtonTextDisabled : null]}>
                      Recenter
                    </Text>
                  </Pressable>
                </View>
                {selectedRestroom ? (
                  <View style={styles.mapPreviewOverlay}>
                    <SelectedRestroomPreviewCard
                      restroom={selectedRestroom}
                      onPress={() => router.push(`/restrooms/${selectedRestroom.id}` as Href)}
                    />
                  </View>
                ) : null}
              </View>
            ) : (
              stateCard
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={restrooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={headerContent}
        ListEmptyComponent={stateCard}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/restrooms/${item.id}` as Href)}
            style={({ pressed }) => [styles.rowCard, pressed ? styles.cardPressed : null]}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <View style={styles.distanceBadge}>
                <Text style={styles.rowDistance}>
                  {typeof item.distanceMiles === "number" ? `${item.distanceMiles.toFixed(1)} mi` : "Nearby"}
                </Text>
              </View>
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
    backgroundColor: mobileTheme.colors.pageBackground
  },
  listContent: {
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingBottom: 32,
    paddingTop: mobileTheme.spacing.screenTop
  },
  header: {
    marginBottom: mobileTheme.spacing.sectionGap
  },
  mapScreen: {
    flex: 1
  },
  mapHeaderContent: {
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingTop: mobileTheme.spacing.screenTop
  },
  mapBody: {
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: mobileTheme.spacing.screenX
  },
  mapCard: {
    borderRadius: mobileTheme.radii.xl,
    flex: 1,
    minHeight: 360,
    overflow: "hidden",
    position: "relative",
    ...mobileTheme.shadows.hero
  },
  mapPreviewOverlay: {
    bottom: 12,
    left: 12,
    position: "absolute",
    right: 12
  },
  mapControlOverlay: {
    position: "absolute",
    right: 12,
    top: 12
  },
  mapControlButton: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...mobileTheme.shadows.card
  },
  mapControlButtonDisabled: {
    backgroundColor: mobileTheme.colors.surfaceMuted
  },
  mapControlButtonText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700"
  },
  mapControlButtonTextDisabled: {
    color: mobileTheme.colors.textFaint
  },
  heroCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    marginBottom: 16,
    padding: mobileTheme.spacing.heroPadding,
    ...mobileTheme.shadows.hero
  },
  eyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 10,
    textTransform: "uppercase"
  },
  title: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 10
  },
  copy: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22
  },
  browseModeSwitch: {
    alignSelf: "flex-start",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 16,
    padding: 4
  },
  browseModeButton: {
    alignItems: "center",
    borderRadius: mobileTheme.radii.pill,
    justifyContent: "center",
    minWidth: 72,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  browseModeButtonActive: {
    backgroundColor: mobileTheme.colors.brandDeep
  },
  browseModeButtonText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "700"
  },
  browseModeButtonTextActive: {
    color: mobileTheme.colors.surface
  },
  headerActions: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    marginTop: 16
  },
  sessionLabel: {
    alignSelf: "flex-start",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    marginTop: 16,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.xs,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  primaryButtonText: {
    color: mobileTheme.colors.surface,
    fontSize: 14,
    fontWeight: "700"
  },
  secondaryButton: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.xs,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  secondaryButtonText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700"
  },
  buttonPressed: {
    opacity: 0.85
  },
  noticeCard: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    marginTop: 16,
    padding: 14
  },
  noticeTitle: {
    color: mobileTheme.colors.brandDeep,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6
  },
  noticeCopy: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19
  },
  liveNotice: {
    backgroundColor: mobileTheme.colors.infoTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  liveNoticeText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "600"
  },
  errorCard: {
    backgroundColor: mobileTheme.colors.errorTint,
    borderColor: mobileTheme.colors.errorBorder,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    marginTop: 16,
    padding: 14
  },
  errorTitle: {
    color: mobileTheme.colors.errorText,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4
  },
  errorText: {
    color: mobileTheme.colors.errorText,
    fontSize: 13,
    lineHeight: 19
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    gap: 12,
    padding: 24,
    ...mobileTheme.shadows.card
  },
  stateText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center"
  },
  rowCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
    ...mobileTheme.shadows.card
  },
  cardPressed: {
    opacity: 0.92
  },
  rowHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  rowTitle: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    paddingRight: 12
  },
  distanceBadge: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceBrandTintStrong,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  rowDistance: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "700"
  },
  rowLocation: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6
  },
  rowRating: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19
  }
});
