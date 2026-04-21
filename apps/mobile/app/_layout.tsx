import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/providers/session-provider";
import { useSession } from "../src/providers/session-provider";
import { mobileTheme } from "../src/ui/theme";

// Redirects signed-out users to /welcome and signed-in users away from it.
// Must live inside SessionProvider so it can call useSession().
function AuthGate({ children }: PropsWithChildren) {
  const { user, isLoading } = useSession();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    // Public auth routes that signed-out users are allowed to access.
    const isOnPublicRoute = segments[0] === "welcome" || segments[0] === "sign-in";

    if (!user && !isOnPublicRoute) {
      // Signed-out user hit a protected route — gate them to the welcome screen.
      router.replace("/welcome");
    } else if (user && isOnPublicRoute) {
      // Signed-in user has no reason to be on an auth screen — send to app.
      router.replace("/(tabs)");
    }
  }, [isLoading, user, segments, router]);

  // Show a branded loading screen while the session resolves to prevent a
  // flash of the wrong screen before the redirect fires.
  if (isLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={mobileTheme.colors.brand} size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <AuthGate>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: mobileTheme.colors.brandDeep
            },
            headerTintColor: "#f8fafc",
            headerTitleStyle: {
              fontWeight: "600"
            },
            contentStyle: {
              backgroundColor: mobileTheme.colors.pageBackground
            }
          }}
        >
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: "Sign in", headerBackButtonDisplayMode: "minimal" }} />
          <Stack.Screen name="restrooms/[id]" options={{ title: "Restroom detail", headerBackButtonDisplayMode: "minimal" }} />
          <Stack.Screen name="contact" options={{ headerShown: false }} />
          <Stack.Screen name="add-restroom" options={{ headerShown: false }} />
          <Stack.Screen name="add-review" options={{ headerShown: false }} />
          <Stack.Screen name="add-photo" options={{ headerShown: false }} />
        </Stack>
      </AuthGate>
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.pageBackground,
    flex: 1,
    justifyContent: "center"
  }
});
