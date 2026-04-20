import { useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mobileTheme } from "../src/ui/theme";

export default function WelcomeScreen() {
  const router = useRouter();

  const goToSignIn = () => {
    router.push("/sign-in?returnTo=%2F(tabs)" as Href);
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.container}>

        {/* ── Brand mark ── */}
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>WC</Text>
          </View>
          <Text style={styles.appName}>Poopin</Text>
        </View>

        {/* ── Value prop ── */}
        <View style={styles.hero}>
          <Text style={styles.headline}>Find clean restrooms,{"\n"}wherever you are.</Text>
          <Text style={styles.subline}>
            Community-reviewed listings so you always know what to expect.
          </Text>
        </View>

        {/* ── CTAs ── */}
        <View style={styles.actions}>
          <Pressable
            onPress={goToSignIn}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.primaryButtonText}>Get started</Text>
          </Pressable>

          <Pressable
            onPress={goToSignIn}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.secondaryButtonText}>I already have an account</Text>
          </Pressable>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: mobileTheme.colors.pageBackground,
    flex: 1
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 16
  },

  // ── Brand ──
  brand: {
    alignItems: "center",
    gap: 14,
    paddingTop: 24
  },
  logoMark: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.md,
    height: 64,
    justifyContent: "center",
    width: 64
  },
  logoMarkText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 1
  },
  appName: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5
  },

  // ── Hero ──
  hero: {
    alignItems: "center",
    gap: 14
  },
  headline: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 43,
    textAlign: "center"
  },
  subline: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center"
  },

  // ── Actions ──
  actions: {
    gap: 12
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.sm,
    paddingVertical: 16
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    paddingVertical: 15
  },
  secondaryButtonText: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "600"
  },
  buttonPressed: {
    opacity: 0.85
  }
});
