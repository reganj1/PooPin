import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/providers/session-provider";

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: "#0f172a"
          },
          headerTintColor: "#f8fafc",
          headerTitleStyle: {
            fontWeight: "600"
          },
          contentStyle: {
            backgroundColor: "#020617"
          }
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
        <Stack.Screen name="restrooms/[id]" options={{ title: "Restroom detail" }} />
      </Stack>
    </SessionProvider>
  );
}
