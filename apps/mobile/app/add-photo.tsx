import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { searchBathrooms, uploadRestroomPhoto, type BathroomSearchResult } from "../src/lib/api";
import { useSession } from "../src/providers/session-provider";
import { mobileTheme } from "../src/ui/theme";

export default function AddPhotoScreen() {
  const router = useRouter();
  const { user } = useSession();

  useEffect(() => {
    if (!user) router.replace("/sign-in");
  }, [user, router]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BathroomSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<BathroomSearchResult | null>(null);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    setSelected(null);
    setPickedUri(null);
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
  }, []);

  const handlePickPhoto = useCallback(async () => {
    if (!selected) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Poopin needs access to your photo library to upload photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.uri) return;

    setPickedUri(asset.uri);
    setPickedMime(asset.mimeType ?? undefined);
  }, [selected]);

  const handleUpload = useCallback(async () => {
    if (!selected || !pickedUri || !user) return;

    setUploading(true);
    try {
      await uploadRestroomPhoto({
        bathroomId: selected.id,
        imageUri: pickedUri,
        mimeType: pickedMime,
        profileId: user.id
      });
      setSubmitted(true);
    } catch (error) {
      Alert.alert(
        "Upload failed",
        error instanceof Error ? error.message : "Could not upload photo. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }, [selected, pickedUri, pickedMime, user]);

  // ── Success ───────────────────────────────────────────────────────────────

  if (submitted && selected) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.successWrap}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark-circle" size={56} color="#0284c7" />
          </View>
          <Text style={styles.successTitle}>Photo submitted!</Text>
          <Text style={styles.successBody}>
            Your photo for{"\n"}
            <Text style={{ fontWeight: "700" }}>{selected.name}</Text>{"\n"}
            will appear once it's approved.
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
              setPickedUri(null);
              setQuery("");
            }}
          >
            <Text style={styles.btnSecondaryLabel}>Upload another photo</Text>
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
        <Text style={styles.navTitle}>Upload a photo</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.instrTitle}>Which restroom did you visit?</Text>
        <Text style={styles.instrBody}>
          Search for the restroom, then choose a photo from your library.
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
              autoFocus={!selected}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searching ? (
              <ActivityIndicator size="small" color={mobileTheme.colors.textFaint} />
            ) : query.length > 0 ? (
              <Pressable
                onPress={() => { setQuery(""); setResults([]); setSelected(null); setPickedUri(null); }}
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

        {/* Selected restroom + photo picker */}
        {selected ? (
          <View style={styles.step2}>
            {/* Selected restroom chip */}
            <View style={styles.selectedChip}>
              <Ionicons name="location" size={14} color={mobileTheme.colors.brandStrong} />
              <Text style={styles.selectedChipName} numberOfLines={1}>{selected.name}</Text>
            </View>

            {/* Photo picker / preview */}
            <Pressable
              onPress={() => void handlePickPhoto()}
              disabled={uploading}
              style={({ pressed }) => [styles.photoPickerBox, pressed && { opacity: 0.8 }]}
            >
              {pickedUri ? (
                <Image source={{ uri: pickedUri }} style={styles.photoPreview} resizeMode="cover" />
              ) : (
                <View style={styles.photoPickerInner}>
                  <View style={styles.photoPickerIcon}>
                    <Ionicons name="camera" size={28} color={mobileTheme.colors.brandStrong} />
                  </View>
                  <Text style={styles.photoPickerLabel}>Tap to choose a photo</Text>
                  <Text style={styles.photoPickerHint}>Photos are reviewed before appearing publicly</Text>
                </View>
              )}
            </Pressable>

            {/* Change photo link */}
            {pickedUri ? (
              <Pressable
                onPress={() => void handlePickPhoto()}
                style={({ pressed }) => [styles.changePhotoBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="refresh" size={14} color={mobileTheme.colors.brandStrong} />
                <Text style={styles.changePhotoLabel}>Choose a different photo</Text>
              </Pressable>
            ) : null}

            {/* Upload button */}
            {pickedUri ? (
              <Pressable
                onPress={() => void handleUpload()}
                disabled={uploading}
                style={({ pressed }) => [styles.btn, uploading && styles.btnDisabled, pressed && styles.btnPressed]}
              >
                {uploading ? (
                  <View style={styles.uploadingRow}>
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text style={styles.btnLabel}>Uploading…</Text>
                  </View>
                ) : (
                  <Text style={styles.btnLabel}>Submit photo</Text>
                )}
              </Pressable>
            ) : null}
          </View>
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

  step2: {
    gap: 14,
    marginTop: 20
  },
  selectedChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: mobileTheme.colors.infoTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5
  },
  selectedChipName: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "600",
    maxWidth: 260
  },

  photoPickerBox: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.lg,
    borderStyle: "dashed",
    borderWidth: 2,
    height: 200,
    overflow: "hidden"
  },
  photoPickerInner: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  photoPickerIcon: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.infoTint,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    marginBottom: 12,
    width: 44
  },
  photoPickerLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4
  },
  photoPickerHint: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    textAlign: "center"
  },
  photoPreview: {
    height: "100%",
    width: "100%"
  },
  changePhotoBtn: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 6
  },
  changePhotoLabel: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "600"
  },

  btn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandStrong,
    borderRadius: mobileTheme.radii.md,
    paddingVertical: 15
  },
  btnDisabled: { opacity: 0.65 },
  btnPressed: { opacity: 0.88 },
  btnLabel: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  uploadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
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
