import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../../src/providers/session-provider";
import { mobileTheme } from "../../src/ui/theme";

export default function AddScreen() {
  const router = useRouter();
  const { user, isLoading } = useSession();

  if (!isLoading && !user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Contribute</Text>
            <Text style={styles.title}>Add a restroom</Text>
          </View>

          <View style={styles.authCard}>
            <Ionicons name="lock-closed-outline" size={36} color={mobileTheme.colors.brandStrong} />
            <Text style={styles.authTitle}>Sign in to contribute</Text>
            <Text style={styles.authCopy}>
              Create an account or sign in to add restrooms and help others find clean, accessible facilities.
            </Text>
            <Pressable
              onPress={() => router.push("/sign-in?returnTo=%2F(tabs)%2Fadd" as Href)}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.primaryButtonText}>Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Contribute</Text>
          <Text style={styles.title}>Add a restroom</Text>
          <Text style={styles.copy}>Help the community by adding a public restroom you know about.</Text>
        </View>

        <View style={styles.placeholderCard}>
          <Ionicons name="add-circle-outline" size={40} color={mobileTheme.colors.brandStrong} />
          <Text style={styles.placeholderTitle}>Coming soon</Text>
          <Text style={styles.placeholderCopy}>
            The restroom submission form is on the way. In the meantime you can add restrooms on the Poopin website.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileTheme.colors.pageBackground
  },
  container: {
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingTop: mobileTheme.spacing.screenTop,
    paddingBottom: 40
  },
  header: {
    marginBottom: mobileTheme.spacing.sectionGap
  },
  eyebrow: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 8,
    textTransform: "uppercase"
  },
  title: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 8
  },
  copy: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22
  },
  authCard: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    gap: 14,
    padding: 28,
    ...mobileTheme.shadows.card
  },
  authTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700"
  },
  authCopy: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  primaryButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.xs,
    marginTop: 4,
    paddingVertical: 14
  },
  primaryButtonText: {
    color: mobileTheme.colors.surface,
    fontSize: 15,
    fontWeight: "700"
  },
  buttonPressed: {
    opacity: 0.85
  },
  placeholderCard: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    gap: 12,
    padding: 32,
    ...mobileTheme.shadows.card
  },
  placeholderTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700"
  },
  placeholderCopy: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  }
});
