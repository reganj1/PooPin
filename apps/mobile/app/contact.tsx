import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  type ContactFieldErrors,
  type ContactFormValues,
  type ContactTopic,
  ContactApiError,
  CONTACT_TOPICS,
  submitContactForm
} from "../src/lib/api";
import { mobileTheme } from "../src/ui/theme";

const DEFAULT_TOPIC: ContactTopic = "general_feedback";

const validateFields = (values: ContactFormValues): ContactFieldErrors => {
  const errors: ContactFieldErrors = {};
  const name = values.name.trim();
  const email = values.email.trim();
  const message = values.message.trim();

  if (name.length < 2) errors.name = "Name must be at least 2 characters.";
  else if (name.length > 80) errors.name = "Name must be at most 80 characters.";

  if (!email) {
    errors.email = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  } else if (email.length > 254) {
    errors.email = "Email must be at most 254 characters.";
  }

  if (message.length < 10) errors.message = "Message must be at least 10 characters.";
  else if (message.length > 2000) errors.message = "Message must be at most 2000 characters.";

  if (values.restroomReference.trim().length > 200) {
    errors.restroomReference = "Must be at most 200 characters.";
  }
  if (values.cityLocation.trim().length > 120) {
    errors.cityLocation = "Must be at most 120 characters.";
  }

  return errors;
};

const topicLabel = (value: ContactTopic): string =>
  CONTACT_TOPICS.find((t) => t.value === value)?.label ?? value;

// ─── Field components ─────────────────────────────────────────────────────────

function Label({ children, optional }: { children: string; optional?: boolean }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{children}</Text>
      {optional ? <Text style={styles.labelOptional}>optional</Text> : null}
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text style={styles.fieldError}>{message}</Text>;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ContactScreen() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<ContactTopic>(DEFAULT_TOPIC);
  const [message, setMessage] = useState("");
  const [restroomReference, setRestroomReference] = useState("");
  const [cityLocation, setCityLocation] = useState("");

  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ message: string; submissionId?: string | null } | null>(null);

  const emailRef = useRef<TextInput>(null);
  const messageRef = useRef<TextInput>(null);

  const getValues = useCallback(
    (): ContactFormValues => ({ name, email, topic, message, restroomReference, cityLocation }),
    [name, email, topic, message, restroomReference, cityLocation]
  );

  const handleTopicPress = () => {
    const options = CONTACT_TOPICS.map((t) => t.label);

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, "Cancel"], cancelButtonIndex: options.length, title: "Reason or topic" },
        (index) => {
          if (index < options.length) {
            setTopic(CONTACT_TOPICS[index]!.value);
            setFieldErrors((prev) => ({ ...prev, topic: undefined }));
          }
        }
      );
    } else {
      Alert.alert(
        "Reason or topic",
        undefined,
        CONTACT_TOPICS.map((t) => ({
          text: t.label,
          onPress: () => {
            setTopic(t.value);
            setFieldErrors((prev) => ({ ...prev, topic: undefined }));
          }
        }))
      );
    }
  };

  const handleSubmit = async () => {
    const values = getValues();
    const errors = validateFields(values);

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitError(null);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const result = await submitContactForm(values);
      setSubmitted(result);
    } catch (error) {
      if (error instanceof ContactApiError) {
        if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
          setFieldErrors(error.fieldErrors);
        }
        setSubmitError(error.message);
      } else {
        setSubmitError("Could not send your message right now. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldChange = (setter: (v: string) => void, field: keyof ContactFieldErrors) => (value: string) => {
    setter(value);
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // ── Success state ──
  if (submitted) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={mobileTheme.colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Contact us</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.successContainer}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark-circle" size={52} color="#16a34a" />
          </View>
          <Text style={styles.successTitle}>Message sent</Text>
          <Text style={styles.successBody}>{submitted.message}</Text>
          {submitted.submissionId ? (
            <Text style={styles.successRef}>Reference: {submitted.submissionId}</Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.doneBtn, pressed && styles.doneBtnPressed]}
            onPress={() => router.back()}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form state ──
  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={mobileTheme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Contact us</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Intro card */}
          <View style={styles.introCard}>
            <Text style={styles.introEyebrow}>Support and inquiries</Text>
            <Text style={styles.introTitle}>Get in touch</Text>
            <Text style={styles.introCopy}>
              Use this form to report listing issues, request content removal, share feedback, or contact the team.
            </Text>
            <Text style={styles.introCopy}>You can also reach us at{" "}
              <Text style={styles.introEmail}>hello@poopinapp.com</Text>
            </Text>
          </View>

          {/* Error banner */}
          {submitError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={mobileTheme.colors.errorText} />
              <Text style={styles.errorBannerText}>{submitError}</Text>
            </View>
          ) : null}

          {/* Form fields */}
          <View style={styles.form}>
            {/* Name */}
            <View style={styles.field}>
              <Label>Name</Label>
              <TextInput
                style={[styles.input, fieldErrors.name ? styles.inputError : null]}
                placeholder="Your name"
                placeholderTextColor={mobileTheme.colors.textFaint}
                value={name}
                onChangeText={handleFieldChange(setName, "name")}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
              <FieldError message={fieldErrors.name} />
            </View>

            {/* Email */}
            <View style={styles.field}>
              <Label>Email</Label>
              <TextInput
                ref={emailRef}
                style={[styles.input, fieldErrors.email ? styles.inputError : null]}
                placeholder="you@example.com"
                placeholderTextColor={mobileTheme.colors.textFaint}
                value={email}
                onChangeText={handleFieldChange(setEmail, "email")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => messageRef.current?.focus()}
              />
              <FieldError message={fieldErrors.email} />
            </View>

            {/* Topic */}
            <View style={styles.field}>
              <Label>Reason or topic</Label>
              <Pressable
                style={({ pressed }) => [styles.topicRow, fieldErrors.topic ? styles.inputError : null, pressed && styles.topicRowPressed]}
                onPress={handleTopicPress}
              >
                <Text style={styles.topicText}>{topicLabel(topic)}</Text>
                <Ionicons name="chevron-down" size={16} color={mobileTheme.colors.textMuted} />
              </Pressable>
              <FieldError message={fieldErrors.topic} />
            </View>

            {/* Message */}
            <View style={styles.field}>
              <Label>Message</Label>
              <TextInput
                ref={messageRef}
                style={[styles.input, styles.inputMultiline, fieldErrors.message ? styles.inputError : null]}
                placeholder="Share what happened or what you need help with."
                placeholderTextColor={mobileTheme.colors.textFaint}
                value={message}
                onChangeText={handleFieldChange(setMessage, "message")}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                returnKeyType="default"
              />
              <FieldError message={fieldErrors.message} />
            </View>

            {/* Optional fields */}
            <View style={styles.optionalSection}>
              <Text style={styles.optionalSectionLabel}>Optional details</Text>

              <View style={styles.field}>
                <Label optional>Restroom URL or listing ID</Label>
                <TextInput
                  style={[styles.input, fieldErrors.restroomReference ? styles.inputError : null]}
                  placeholder="/restroom/abc123"
                  placeholderTextColor={mobileTheme.colors.textFaint}
                  value={restroomReference}
                  onChangeText={handleFieldChange(setRestroomReference, "restroomReference")}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
                <FieldError message={fieldErrors.restroomReference} />
              </View>

              <View style={styles.field}>
                <Label optional>City or location</Label>
                <TextInput
                  style={[styles.input, fieldErrors.cityLocation ? styles.inputError : null]}
                  placeholder="San Francisco"
                  placeholderTextColor={mobileTheme.colors.textFaint}
                  value={cityLocation}
                  onChangeText={handleFieldChange(setCityLocation, "cityLocation")}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
                <FieldError message={fieldErrors.cityLocation} />
              </View>
            </View>

            {/* Submit */}
            <Pressable
              style={({ pressed }) => [styles.submitBtn, (isSubmitting || pressed) && styles.submitBtnPressed]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitBtnText}>Send message</Text>
              )}
            </Pressable>

            <Text style={styles.submitNote}>
              For feedback, issue reports, and partnership inquiries. No account required.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: mobileTheme.colors.pageBackground,
    flex: 1
  },
  flex: {
    flex: 1
  },

  // ── Header ──
  header: {
    alignItems: "center",
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingVertical: 14
  },
  backBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 32
  },
  headerTitle: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center"
  },
  headerSpacer: {
    width: 32
  },

  // ── Scroll ──
  scrollContent: {
    gap: 16,
    paddingBottom: 48,
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingTop: 16
  },

  // ── Intro card ──
  introCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    gap: 6,
    padding: mobileTheme.spacing.cardPadding,
    ...mobileTheme.shadows.card
  },
  introEyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  introTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "700"
  },
  introCopy: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },
  introEmail: {
    color: mobileTheme.colors.brandStrong,
    fontWeight: "600"
  },

  // ── Error banner ──
  errorBanner: {
    alignItems: "flex-start",
    backgroundColor: mobileTheme.colors.errorTint,
    borderColor: mobileTheme.colors.errorBorder,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 14
  },
  errorBannerText: {
    color: mobileTheme.colors.errorText,
    flex: 1,
    fontSize: 14,
    lineHeight: 20
  },

  // ── Form ──
  form: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    gap: 16,
    padding: mobileTheme.spacing.cardPadding,
    ...mobileTheme.shadows.card
  },
  field: {
    gap: 6
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  label: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600"
  },
  labelOptional: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12
  },
  input: {
    backgroundColor: mobileTheme.colors.pageBackground,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.xs,
    borderWidth: 1,
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  inputMultiline: {
    height: 120,
    paddingTop: 12
  },
  inputError: {
    borderColor: mobileTheme.colors.errorBorder
  },
  fieldError: {
    color: mobileTheme.colors.errorText,
    fontSize: 12,
    fontWeight: "500"
  },

  // ── Topic picker ──
  topicRow: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.pageBackground,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.xs,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  topicRowPressed: {
    opacity: 0.75
  },
  topicText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 15
  },

  // ── Optional section ──
  optionalSection: {
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.xs,
    borderWidth: 1,
    gap: 14,
    padding: 14
  },
  optionalSectionLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },

  // ── Submit ──
  submitBtn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brand,
    borderRadius: mobileTheme.radii.xs,
    justifyContent: "center",
    paddingVertical: 14
  },
  submitBtnPressed: {
    opacity: 0.8
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  submitNote: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center"
  },

  // ── Success ──
  successContainer: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: mobileTheme.spacing.screenX
  },
  successIconWrap: {
    marginBottom: 4
  },
  successTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "700"
  },
  successBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  successRef: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    marginTop: 4
  },
  doneBtn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brand,
    borderRadius: mobileTheme.radii.xs,
    marginTop: 12,
    paddingHorizontal: 40,
    paddingVertical: 14
  },
  doneBtnPressed: {
    opacity: 0.8
  },
  doneBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  }
});
