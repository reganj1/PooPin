import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSession } from "../../src/providers/session-provider";
import { mobileTheme } from "../../src/ui/theme";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

function SettingsRow({
  icon,
  label,
  onPress,
  destructive
}: {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed && styles.settingsRowPressed]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={destructive ? mobileTheme.colors.errorText : mobileTheme.colors.textSecondary}
        style={styles.settingsRowIcon}
      />
      <Text style={[styles.settingsRowLabel, destructive && styles.settingsRowLabelDestructive]}>{label}</Text>
      {!destructive && (
        <Ionicons name="chevron-forward" size={16} color={mobileTheme.colors.textFaint} />
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isLoading, signOut } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setIsSigningOut(true);
          try {
            await signOut();
          } finally {
            setIsSigningOut(false);
          }
        }
      }
    ]);
  };

  const handleContact = () => {
    void Linking.openURL("mailto:support@poopin.app").catch(() => {
      Alert.alert("Contact us", "Email us at support@poopin.app");
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Your account</Text>
            <Text style={styles.title}>Profile</Text>
          </View>

          <View style={styles.authCard}>
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={32} color={mobileTheme.colors.textFaint} />
            </View>
            <Text style={styles.authTitle}>Sign in to Poopin</Text>
            <Text style={styles.authCopy}>
              Create an account to write reviews, upload photos, and track your contributions to the community.
            </Text>
            <Pressable
              onPress={() => router.push("/sign-in?returnTo=%2F(tabs)%2Fprofile" as Href)}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.primaryButtonText}>Sign in or create account</Text>
            </Pressable>
          </View>

          <View style={styles.settingsSection}>
            <Text style={styles.sectionLabel}>Support</Text>
            <View style={styles.settingsCard}>
              <SettingsRow icon="mail-outline" label="Contact us" onPress={handleContact} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const emailInitial = (user.email ?? "?")[0]?.toUpperCase() ?? "?";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Your account</Text>
          <Text style={styles.title}>Profile</Text>
        </View>

        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{emailInitial}</Text>
          </View>
          <View style={styles.identityInfo}>
            <Text style={styles.identityEmail} numberOfLines={1}>{user.email ?? "Signed in"}</Text>
            <Text style={styles.identityMeta}>Poopin member</Text>
          </View>
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.sectionLabel}>Support</Text>
          <View style={styles.settingsCard}>
            <SettingsRow icon="mail-outline" label="Contact us" onPress={handleContact} />
          </View>
        </View>

        <View style={styles.settingsSection}>
          <View style={styles.settingsCard}>
            <SettingsRow
              icon="log-out-outline"
              label={isSigningOut ? "Signing out…" : "Sign out"}
              onPress={handleSignOut}
              destructive
            />
          </View>
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
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center"
  },
  loadingText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 15
  },
  container: {
    paddingHorizontal: mobileTheme.spacing.screenX,
    paddingTop: mobileTheme.spacing.screenTop,
    paddingBottom: 40,
    gap: mobileTheme.spacing.sectionGap
  },
  header: {},
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
    fontWeight: "700"
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
  avatarPlaceholder: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    height: 72,
    justifyContent: "center",
    width: 72
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
  identityCard: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    flexDirection: "row",
    gap: 16,
    padding: 20,
    ...mobileTheme.shadows.card
  },
  avatar: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.pill,
    flexShrink: 0,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  avatarText: {
    color: mobileTheme.colors.surface,
    fontSize: 22,
    fontWeight: "700"
  },
  identityInfo: {
    flex: 1,
    gap: 4
  },
  identityEmail: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700"
  },
  identityMeta: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13
  },
  settingsSection: {
    gap: 8
  },
  sectionLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    paddingHorizontal: 4,
    textTransform: "uppercase"
  },
  settingsCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    overflow: "hidden",
    ...mobileTheme.shadows.card
  },
  settingsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  settingsRowPressed: {
    backgroundColor: mobileTheme.colors.surfaceMuted
  },
  settingsRowIcon: {
    width: 22
  },
  settingsRowLabel: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 16,
    fontWeight: "500"
  },
  settingsRowLabelDestructive: {
    color: mobileTheme.colors.errorText
  }
});
