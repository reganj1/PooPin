import { Link, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { sendEmailOtp } from "../src/lib/api";
import { supabase } from "../src/lib/supabase";
import { useSession } from "../src/providers/session-provider";
import { mobileTheme } from "../src/ui/theme";

type SignInStep = "email" | "code";

const sanitizeReturnTo = (value: string | string[] | undefined) => {
  const resolved = Array.isArray(value) ? value[0] : value;
  if (!resolved || !resolved.startsWith("/") || resolved.startsWith("//")) {
    return "/";
  }

  return resolved;
};

const toSafeHref = (value: string) => value as Href;

export default function SignInScreen() {
  const router = useRouter();
  const { user, isLoading } = useSession();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const safeReturnTo = useMemo(() => sanitizeReturnTo(params.returnTo), [params.returnTo]);
  const [step, setStep] = useState<SignInStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(toSafeHref(safeReturnTo));
    }
  }, [isLoading, router, safeReturnTo, user]);

  const normalizedEmail = email.trim().toLowerCase();

  const handleSendCode = async () => {
    if (!normalizedEmail) {
      setErrorMessage("Enter your email to continue.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await sendEmailOtp(normalizedEmail);
      setEmail(normalizedEmail);
      setStep("code");
      setCode("");
      setStatusMessage(`We sent a 6-digit code to ${normalizedEmail}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "We couldn’t send a code right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    const normalizedCode = code.replace(/\s+/g, "").trim();
    if (normalizedCode.length !== 6) {
      setErrorMessage("Enter the 6-digit code from your email.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      // [DEBUG] — remove once the failing request is identified
      console.log("[DEBUG sign-in] calling supabase.auth.verifyOtp for", normalizedEmail);
      const { error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedCode,
        type: "email"
      });

      if (error) {
        // [DEBUG]
        console.warn("[DEBUG sign-in] verifyOtp returned error:", error.message, "status:", error.status);
        setErrorMessage(error.message || "We couldn’t verify that code. Try again.");
        return;
      }

      // [DEBUG]
      console.log("[DEBUG sign-in] verifyOtp succeeded — redirecting to", safeReturnTo);
      setStatusMessage("Signed in. Redirecting…");
      router.replace(toSafeHref(safeReturnTo));
    } catch (error) {
      // [DEBUG]
      console.warn("[DEBUG sign-in] verifyOtp threw:", error instanceof Error ? error.message : String(error));
      setErrorMessage(error instanceof Error ? error.message : "We couldn’t verify that code. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const action = step === "email" ? handleSendCode : handleVerifyCode;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Link href="/" style={styles.backLink}>
          ← Back to nearby restrooms
        </Link>

        <View style={styles.card}>
          <View style={styles.accountBadge}>
            <View style={styles.accountBadgeIcon}>
              <Text style={styles.accountBadgeIconText}>WC</Text>
            </View>
            <Text style={styles.accountBadgeText}>Poopin account</Text>
          </View>

          <Text style={styles.title}>Sign in with your email</Text>
          <Text style={styles.copy}>
            {step === "email"
              ? "Enter your email and we’ll send a 6-digit code."
              : `Enter the code we sent to ${normalizedEmail}.`}
          </Text>

          <View style={styles.formSection}>
            <Text style={styles.label}>{step === "email" ? "Email" : "Verification code"}</Text>
            {step === "email" ? (
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={mobileTheme.colors.textMuted}
                style={styles.input}
                value={email}
              />
            ) : (
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor={mobileTheme.colors.textMuted}
                style={styles.input}
                value={code}
              />
            )}

            {statusMessage ? (
              <View style={styles.statusCard}>
                <Text style={styles.statusMessage}>{statusMessage}</Text>
              </View>
            ) : null}
            {errorMessage ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorMessage}>{errorMessage}</Text>
              </View>
            ) : null}

            <Pressable onPress={action} disabled={isSubmitting} style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null]}>
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? (step === "email" ? "Sending…" : "Verifying…") : step === "email" ? "Send code" : "Verify code"}
              </Text>
            </Pressable>

            {step === "code" ? (
              <View style={styles.secondaryActions}>
                <Pressable
                  onPress={handleSendCode}
                  disabled={isSubmitting}
                  style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
                >
                  <Text style={styles.secondaryButtonText}>Resend code</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setErrorMessage(null);
                    setStatusMessage(null);
                  }}
                  disabled={isSubmitting}
                  style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
                >
                  <Text style={styles.secondaryButtonText}>Use another email</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={mobileTheme.colors.brandStrong} />
            <Text style={styles.loadingText}>Checking your session…</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileTheme.colors.pageBackground
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 18
  },
  backLink: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 20
  },
  title: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 18
  },
  copy: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20
  },
  card: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    padding: 20,
    ...mobileTheme.shadows.hero
  },
  accountBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  accountBadgeIcon: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.pill,
    height: 24,
    justifyContent: "center",
    width: 24
  },
  accountBadgeIconText: {
    color: mobileTheme.colors.surface,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5
  },
  accountBadgeText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase"
  },
  formSection: {
    borderColor: mobileTheme.colors.borderSubtle,
    borderTopWidth: 1,
    paddingTop: 18
  },
  label: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8
  },
  input: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  statusCard: {
    backgroundColor: mobileTheme.colors.infoTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    marginTop: 12,
    padding: 12
  },
  statusMessage: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 13,
    lineHeight: 18
  },
  errorCard: {
    backgroundColor: mobileTheme.colors.errorTint,
    borderColor: mobileTheme.colors.errorBorder,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    marginTop: 12,
    padding: 12
  },
  errorMessage: {
    color: mobileTheme.colors.errorText,
    fontSize: 13,
    lineHeight: 18
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.xs,
    marginTop: 16,
    paddingVertical: 14
  },
  primaryButtonText: {
    color: mobileTheme.colors.surface,
    fontSize: 15,
    fontWeight: "700"
  },
  secondaryActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12
  },
  secondaryButton: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.xs,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  secondaryButtonText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600"
  },
  buttonPressed: {
    opacity: 0.85
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 18
  },
  loadingText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13
  }
});
