import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import type { NearbyBathroom } from "@poopin/domain";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { getRestroom } from "../../src/lib/api";

const getLocationLine = (restroom: NearbyBathroom) => [restroom.address, restroom.city, restroom.state].filter(Boolean).join(", ");

const getSourceLabel = (source: NearbyBathroom["source"]) => {
  switch (source) {
    case "openstreetmap":
      return "Community mapped";
    case "city_open_data":
      return "City open data";
    case "google_places":
      return "Google Places";
    case "la_controller":
      return "LA Controller";
    case "partner":
      return "Partner listing";
    case "user":
      return "User submitted";
    default:
      return "Other source";
  }
};

const getAccessLabel = (accessType: NearbyBathroom["access_type"]) => {
  switch (accessType) {
    case "customer_only":
      return "Customer only";
    case "code_required":
      return "Code required";
    case "staff_assisted":
      return "Staff assisted";
    default:
      return "Public";
  }
};

const formatRatingSummary = (restroom: NearbyBathroom) => {
  if (restroom.ratings.reviewCount <= 0 || restroom.ratings.overall <= 0) {
    return "No rating summary yet";
  }

  return `${restroom.ratings.overall.toFixed(1)} overall from ${restroom.ratings.reviewCount} review${restroom.ratings.reviewCount === 1 ? "" : "s"}`;
};

const buildFeatureTags = (restroom: NearbyBathroom) => {
  const tags = [getAccessLabel(restroom.access_type)];

  if (restroom.is_accessible) {
    tags.push("Accessible");
  }

  if (restroom.is_gender_neutral) {
    tags.push("Gender neutral");
  }

  if (restroom.has_baby_station) {
    tags.push("Baby station");
  }

  if (restroom.requires_purchase) {
    tags.push("Requires purchase");
  }

  return tags;
};

export default function RestroomDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const restroomId = useMemo(() => {
    const resolved = Array.isArray(params.id) ? params.id[0] : params.id;
    return typeof resolved === "string" ? resolved : "";
  }, [params.id]);
  const [restroom, setRestroom] = useState<NearbyBathroom | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadRestroom = async () => {
      if (!restroomId) {
        setErrorMessage("Missing restroom id.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await getRestroom(restroomId);
        if (cancelled) {
          return;
        }

        setRestroom(response.restroom);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Could not load this restroom right now.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadRestroom();

    return () => {
      cancelled = true;
    };
  }, [restroomId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Link href="/" style={styles.backLink}>
          ← Back to nearby restrooms
        </Link>

        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#38bdf8" />
            <Text style={styles.stateText}>Loading restroom details…</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.stateCard}>
            <Text style={styles.errorTitle}>Unable to load restroom</Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
          </View>
        ) : restroom ? (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>Restroom detail</Text>
            <Text style={styles.title}>{restroom.name}</Text>
            <Text style={styles.location}>{getLocationLine(restroom)}</Text>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Rating summary</Text>
              <Text style={styles.summaryValue}>{formatRatingSummary(restroom)}</Text>
              <Text style={styles.summaryNote}>Source: {getSourceLabel(restroom.source)}</Text>
            </View>

            <View style={styles.featureGroup}>
              <Text style={styles.sectionTitle}>Access and amenities</Text>
              <View style={styles.tagWrap}>
                {buildFeatureTags(restroom).map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.infoGroup}>
              <Text style={styles.sectionTitle}>Coordinates</Text>
              <Text style={styles.infoText}>
                {restroom.lat.toFixed(5)}, {restroom.lng.toFixed(5)}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617"
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 16
  },
  backLink: {
    color: "#7dd3fc",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 18
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 24
  },
  errorTitle: {
    color: "#fecaca",
    fontSize: 18,
    fontWeight: "700"
  },
  stateText: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center"
  },
  card: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderRadius: 22,
    borderWidth: 1,
    padding: 20
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
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 10
  },
  location: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22
  },
  summaryCard: {
    backgroundColor: "#082f49",
    borderColor: "#0c4a6e",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 20,
    padding: 16
  },
  summaryLabel: {
    color: "#bae6fd",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginBottom: 8,
    textTransform: "uppercase"
  },
  summaryValue: {
    color: "#f0f9ff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6
  },
  summaryNote: {
    color: "#bfdbfe",
    fontSize: 13
  },
  featureGroup: {
    marginTop: 22
  },
  sectionTitle: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  tag: {
    backgroundColor: "#111827",
    borderColor: "#374151",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  tagText: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "600"
  },
  infoGroup: {
    marginTop: 22
  },
  infoText: {
    color: "#94a3b8",
    fontSize: 14
  }
});
