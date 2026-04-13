import { Link, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { sendEmailOtp } from "../src/lib/api";
import { supabase } from "../src/lib/supabase";
import { useSession } from "../src/providers/session-provider";

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
      const { error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedCode,
        type: "email"
      });

      if (error) {
        setErrorMessage(error.message || "We couldn’t verify that code. Try again.");
        return;
      }

      setStatusMessage("Signed in. Redirecting…");
      router.replace(toSafeHref(safeReturnTo));
    } catch (error) {
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

        <Text style={styles.eyebrow}>Mobile sign-in</Text>
        <Text style={styles.title}>Sign in with your email</Text>
        <Text style={styles.copy}>
          {step === "email"
            ? "Enter your email and we’ll send a 6-digit code."
            : `Enter the code we sent to ${normalizedEmail}.`}
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>{step === "email" ? "Email" : "Verification code"}</Text>
          {step === "email" ? (
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#64748b"
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
              placeholderTextColor="#64748b"
              style={styles.input}
              value={code}
            />
          )}

          {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}
          {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}

          <Pressable onPress={action} disabled={isSubmitting} style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null]}>
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? (step === "email" ? "Sending…" : "Verifying…") : step === "email" ? "Send code" : "Verify code"}
            </Text>
          </Pressable>

          {step === "code" ? (
            <View style={styles.secondaryActions}>
              <Pressable onPress={handleSendCode} disabled={isSubmitting} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}>
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

        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#38bdf8" />
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
    backgroundColor: "#020617"
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 18
  },
  backLink: {
    color: "#7dd3fc",
    fontSize: 14,
    fontWeight: "600",
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
    lineHeight: 22,
    marginBottom: 20
  },
  card: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderRadius: 20,
    borderWidth: 1,
    padding: 18
  },
  label: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8
  },
  input: {
    backgroundColor: "#020617",
    borderColor: "#334155",
    borderRadius: 12,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  statusMessage: {
    color: "#bfdbfe",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12
  },
  errorMessage: {
    color: "#fecaca",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0ea5e9",
    borderRadius: 12,
    marginTop: 16,
    paddingVertical: 14
  },
  primaryButtonText: {
    color: "#e0f2fe",
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
    borderColor: "#334155",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  secondaryButtonText: {
    color: "#cbd5e1",
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
    color: "#94a3b8",
    fontSize: 13
  }
});
