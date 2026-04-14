import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getMyProfile,
  searchPlaces,
  submitRestroom,
  type PlaceSearchResult
} from "../src/lib/api";
import { useSession } from "../src/providers/session-provider";
import { mobileTheme } from "../src/ui/theme";

// ── Option lists ──────────────────────────────────────────────────────────────

const PLACE_TYPES: { value: string; label: string }[] = [
  { value: "park", label: "Park" },
  { value: "restaurant", label: "Restaurant" },
  { value: "cafe", label: "Café" },
  { value: "mall", label: "Shopping mall" },
  { value: "transit_station", label: "Transit station" },
  { value: "library", label: "Library" },
  { value: "gym", label: "Gym / Fitness" },
  { value: "office", label: "Office / Workplace" },
  { value: "other", label: "Other" }
];

const ACCESS_TYPES: { value: string; label: string }[] = [
  { value: "public", label: "Public (anyone can enter)" },
  { value: "customer_only", label: "Customers only" },
  { value: "code_required", label: "Requires a code" },
  { value: "staff_assisted", label: "Staff assisted" }
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLocationParts(result: PlaceSearchResult): {
  address: string;
  city: string;
  state: string;
} {
  const parts = result.secondaryName.split(",").map((s) => s.trim());
  const city = parts[0] ?? "";
  // e.g. "CA, United States" or "CA" — grab just the abbreviation/name
  const rawState = parts[1] ?? "";
  const state = rawState.split(" ")[0] ?? "";
  // Use name as address if it looks like a street (contains a digit)
  const address = /\d/.test(result.name) ? result.name : "";
  return { address, city, state };
}

function showPicker(
  title: string,
  options: { value: string; label: string }[],
  onSelect: (value: string) => void
) {
  const labels = options.map((o) => o.label);

  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...labels, "Cancel"], cancelButtonIndex: labels.length },
      (idx) => {
        if (idx < labels.length) onSelect(options[idx]!.value);
      }
    );
  } else {
    Alert.alert(
      title,
      undefined,
      [
        ...options.map((o) => ({
          text: o.label,
          onPress: () => onSelect(o.value)
        })),
        { text: "Cancel", style: "cancel" as const }
      ]
    );
  }
}

// ── Field components ──────────────────────────────────────────────────────────

function FormLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldLabel}>{text}</Text>
      {required ? <Text style={styles.fieldRequired}>required</Text> : null}
    </View>
  );
}

function PickerRow({
  label,
  value,
  placeholder,
  onPress
}: {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pickerRow, pressed && styles.pressedRow]}
    >
      <Text style={styles.pickerRowLabel}>{label}</Text>
      <View style={styles.pickerRowRight}>
        <Text style={[styles.pickerRowValue, !value && styles.pickerRowPlaceholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={14} color={mobileTheme.colors.textFaint} />
      </View>
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: mobileTheme.colors.border, true: mobileTheme.colors.brand }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AddRestroomScreen() {
  const router = useRouter();
  const { user } = useSession();

  // ── Profile ───────────────────────────────────────────────────────────────
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.replace("/sign-in");
      return;
    }
    void getMyProfile().then((p) => setProfileId(p?.id ?? null));
  }, [user, router]);

  // ── Location search ───────────────────────────────────────────────────────
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<PlaceSearchResult[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [locationSelected, setLocationSelected] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLocationChange = useCallback((text: string) => {
    setLocationQuery(text);
    setLocationSelected(false);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 2) {
      setLocationResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchingLocation(true);
      try {
        const results = await searchPlaces(text.trim());
        setLocationResults(results.slice(0, 8));
      } catch {
        // silent
      } finally {
        setSearchingLocation(false);
      }
    }, 400);
  }, []);

  // ── Form state ────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [placeType, setPlaceType] = useState("");
  const [accessType, setAccessType] = useState("");
  const [hasBabyStation, setHasBabyStation] = useState(false);
  const [isGenderNeutral, setIsGenderNeutral] = useState(false);
  const [isAccessible, setIsAccessible] = useState(false);
  const [requiresPurchase, setRequiresPurchase] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSelectLocation = useCallback((result: PlaceSearchResult) => {
    const parts = parseLocationParts(result);
    setLocationQuery(result.fullName);
    setLocationResults([]);
    setLocationSelected(true);
    setLat(result.lat);
    setLng(result.lng);
    // Pre-fill fields if not already set
    if (!address) setAddress(parts.address);
    if (!city) setCity(parts.city);
    if (!state) setState(parts.state);
    if (!name) {
      // If the result is a named POI (not just an address), use as the name
      if (result.placeType === "poi") setName(result.name);
    }
  }, [address, city, state, name]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) e.name = "Restroom name is required (2+ characters).";
    if (!address.trim() || address.trim().length < 3) e.address = "Address is required.";
    if (!city.trim()) e.city = "City is required.";
    if (!state.trim()) e.state = "State is required.";
    if (lat === null || lng === null) e.location = "Please search for and select a location.";
    if (!placeType) e.placeType = "Please select a place type.";
    if (!accessType) e.accessType = "Please select an access type.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!profileId) {
      Alert.alert("Not ready", "Your profile is still loading. Please wait a moment.");
      return;
    }

    setSubmitting(true);
    try {
      await submitRestroom({
        name: name.trim(),
        placeType,
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        lat: lat!,
        lng: lng!,
        accessType,
        hasBabyStation,
        isGenderNeutral,
        isAccessible,
        requiresPurchase,
        profileId
      });
      setSubmitted(true);
    } catch (error) {
      Alert.alert(
        "Submission failed",
        error instanceof Error ? error.message : "Could not submit the restroom. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={56} color="#16a34a" />
          </View>
          <Text style={styles.successTitle}>Restroom submitted!</Text>
          <Text style={styles.successBody}>
            Thanks for adding to the map. Your submission will be reviewed and appear publicly once approved.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={() => router.back()}
          >
            <Text style={styles.btnLabel}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const placeTypeLabel = PLACE_TYPES.find((t) => t.value === placeType)?.label ?? "";
  const accessTypeLabel = ACCESS_TYPES.find((t) => t.value === accessType)?.label ?? "";

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        {/* Header */}
        <View style={styles.navHeader}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={mobileTheme.colors.brandStrong} />
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>
          <Text style={styles.navTitle}>Add a restroom</Text>
          <View style={styles.navSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Location ── */}
          <SectionHeader title="Location" />

          <View style={styles.card}>
            <View style={[styles.searchInputWrap, locationSelected && styles.searchInputSelected]}>
              <Ionicons
                name={locationSelected ? "location" : "search"}
                size={16}
                color={locationSelected ? "#16a34a" : mobileTheme.colors.textFaint}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for address or place name"
                placeholderTextColor={mobileTheme.colors.textFaint}
                value={locationQuery}
                onChangeText={handleLocationChange}
                autoCorrect={false}
                returnKeyType="search"
              />
              {searchingLocation ? (
                <ActivityIndicator size="small" color={mobileTheme.colors.textFaint} />
              ) : locationQuery.length > 0 ? (
                <Pressable
                  onPress={() => { setLocationQuery(""); setLocationResults([]); setLocationSelected(false); setLat(null); setLng(null); }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={16} color={mobileTheme.colors.textFaint} />
                </Pressable>
              ) : null}
            </View>

            {/* Autocomplete results */}
            {locationResults.length > 0 ? (
              <View style={styles.autocompleteList}>
                {locationResults.map((result) => (
                  <Pressable
                    key={result.id}
                    onPress={() => handleSelectLocation(result)}
                    style={({ pressed }) => [styles.autocompleteRow, pressed && styles.pressedRow]}
                  >
                    <Ionicons name="location-outline" size={14} color={mobileTheme.colors.textFaint} />
                    <View style={styles.autocompleteText}>
                      <Text style={styles.autocompleteName} numberOfLines={1}>{result.name}</Text>
                      <Text style={styles.autocompleteSecondary} numberOfLines={1}>{result.secondaryName}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {errors.location ? <Text style={styles.errorText}>{errors.location}</Text> : null}

          {/* ── Details ── */}
          <SectionHeader title="Restroom details" />

          <View style={styles.card}>
            <FormLabel text="Restroom name" required />
            <TextInput
              style={[styles.textInput, errors.name ? styles.inputError : null]}
              placeholder="e.g. Whole Foods Market Restroom"
              placeholderTextColor={mobileTheme.colors.textFaint}
              value={name}
              onChangeText={(t) => { setName(t); setErrors((e) => ({ ...e, name: "" })); }}
              returnKeyType="next"
              maxLength={120}
            />
            {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

            <View style={styles.fieldSep} />

            <FormLabel text="Street address" required />
            <TextInput
              style={[styles.textInput, errors.address ? styles.inputError : null]}
              placeholder="e.g. 123 Main Street"
              placeholderTextColor={mobileTheme.colors.textFaint}
              value={address}
              onChangeText={(t) => { setAddress(t); setErrors((e) => ({ ...e, address: "" })); }}
              returnKeyType="next"
              maxLength={200}
            />
            {errors.address ? <Text style={styles.errorText}>{errors.address}</Text> : null}

            <View style={styles.fieldSep} />

            <View style={styles.cityStateRow}>
              <View style={styles.cityWrap}>
                <FormLabel text="City" required />
                <TextInput
                  style={[styles.textInput, errors.city ? styles.inputError : null]}
                  placeholder="San Francisco"
                  placeholderTextColor={mobileTheme.colors.textFaint}
                  value={city}
                  onChangeText={(t) => { setCity(t); setErrors((e) => ({ ...e, city: "" })); }}
                  returnKeyType="next"
                  maxLength={120}
                />
                {errors.city ? <Text style={styles.errorText}>{errors.city}</Text> : null}
              </View>
              <View style={styles.stateWrap}>
                <FormLabel text="State" required />
                <TextInput
                  style={[styles.textInput, errors.state ? styles.inputError : null]}
                  placeholder="CA"
                  placeholderTextColor={mobileTheme.colors.textFaint}
                  value={state}
                  onChangeText={(t) => { setState(t); setErrors((e) => ({ ...e, state: "" })); }}
                  returnKeyType="done"
                  maxLength={30}
                  autoCapitalize="characters"
                />
                {errors.state ? <Text style={styles.errorText}>{errors.state}</Text> : null}
              </View>
            </View>
          </View>

          {/* ── Category ── */}
          <SectionHeader title="Category" />

          <View style={styles.card}>
            <PickerRow
              label="Place type"
              value={placeTypeLabel}
              placeholder="Select…"
              onPress={() =>
                showPicker("Place type", PLACE_TYPES, (v) => {
                  setPlaceType(v);
                  setErrors((e) => ({ ...e, placeType: "" }));
                })
              }
            />
            {errors.placeType ? <Text style={styles.errorText}>{errors.placeType}</Text> : null}

            <View style={styles.rowSep} />

            <PickerRow
              label="Access type"
              value={accessTypeLabel}
              placeholder="Select…"
              onPress={() =>
                showPicker("Access type", ACCESS_TYPES, (v) => {
                  setAccessType(v);
                  setErrors((e) => ({ ...e, accessType: "" }));
                })
              }
            />
            {errors.accessType ? <Text style={styles.errorText}>{errors.accessType}</Text> : null}
          </View>

          {/* ── Amenities ── */}
          <SectionHeader title="Amenities" />

          <View style={styles.card}>
            <ToggleRow label="Baby changing station" value={hasBabyStation} onChange={setHasBabyStation} />
            <View style={styles.rowSep} />
            <ToggleRow label="Gender neutral" value={isGenderNeutral} onChange={setIsGenderNeutral} />
            <View style={styles.rowSep} />
            <ToggleRow label="Wheelchair accessible" value={isAccessible} onChange={setIsAccessible} />
            <View style={styles.rowSep} />
            <ToggleRow label="Requires purchase" value={requiresPurchase} onChange={setRequiresPurchase} />
          </View>

          {/* ── Submit ── */}
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={submitting}
            style={({ pressed }) => [styles.submitBtn, submitting && styles.submitBtnDisabled, pressed && styles.btnPressed]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.submitBtnLabel}>Submit restroom</Text>
            )}
          </Pressable>

          <Text style={styles.submitHint}>
            Submissions are reviewed before appearing on the map.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    backgroundColor: mobileTheme.colors.pageBackground,
    flex: 1
  },
  flex: { flex: 1 },

  // Nav header
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

  // Form
  formContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 8
  },

  // Section headers
  sectionHeader: {
    marginBottom: 8,
    marginTop: 20
  },
  sectionHeaderText: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },

  // Cards
  card: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    overflow: "hidden",
    padding: 14,
    ...mobileTheme.shadows.card
  },

  // Location search
  searchInputWrap: {
    alignItems: "center",
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.xs,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  searchInputSelected: {
    borderColor: "#16a34a"
  },
  searchInput: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 14
  },

  // Autocomplete
  autocompleteList: {
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10
  },
  autocompleteRow: {
    alignItems: "center",
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10
  },
  autocompleteText: { flex: 1 },
  autocompleteName: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600"
  },
  autocompleteSecondary: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 12
  },

  // Field labels
  fieldLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginBottom: 6
  },
  fieldLabel: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600"
  },
  fieldRequired: {
    color: mobileTheme.colors.textFaint,
    fontSize: 11
  },
  fieldSep: {
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
    marginTop: 14
  },

  // Text inputs
  textInput: {
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.xs,
    borderWidth: 1,
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  inputError: {
    borderColor: mobileTheme.colors.errorText
  },

  // City / state row
  cityStateRow: {
    flexDirection: "row",
    gap: 10
  },
  cityWrap: { flex: 2 },
  stateWrap: { flex: 1 },

  // Picker rows
  pickerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8
  },
  pressedRow: { opacity: 0.7 },
  pickerRowLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "500"
  },
  pickerRowRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  pickerRowValue: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14
  },
  pickerRowPlaceholder: {
    color: mobileTheme.colors.textFaint
  },

  // Row separator (within card)
  rowSep: {
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: 2,
    marginTop: 2
  },

  // Toggles
  toggleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6
  },
  toggleLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "500"
  },

  // Errors
  errorText: {
    color: mobileTheme.colors.errorText,
    fontSize: 12,
    marginTop: 4
  },

  // Submit
  submitBtn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandStrong,
    borderRadius: mobileTheme.radii.md,
    marginTop: 28,
    paddingVertical: 16
  },
  submitBtnDisabled: { opacity: 0.65 },
  btnPressed: { opacity: 0.88 },
  btn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandStrong,
    borderRadius: mobileTheme.radii.md,
    paddingVertical: 16
  },
  submitBtnLabel: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  btnLabel: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  submitHint: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    marginTop: 10,
    textAlign: "center"
  },

  // Success
  successWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32
  },
  successIcon: { marginBottom: 16 },
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
