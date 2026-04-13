import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, type AppStateStatus } from "react-native";
import { mobileEnv } from "./env";

declare global {
  var __poopinMobileSupabaseClient: SupabaseClient | undefined;
  var __poopinMobileAuthRefreshListenerRegistered: boolean | undefined;
}

const createMobileSupabaseClient = () =>
  createClient(mobileEnv.supabaseUrl, mobileEnv.supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock
    }
  });

export const supabase =
  globalThis.__poopinMobileSupabaseClient ?? (globalThis.__poopinMobileSupabaseClient = createMobileSupabaseClient());

const handleAppStateChange = (nextAppState: AppStateStatus) => {
  if (nextAppState === "active") {
    void supabase.auth.startAutoRefresh();
    return;
  }

  void supabase.auth.stopAutoRefresh();
};

if (!globalThis.__poopinMobileAuthRefreshListenerRegistered) {
  globalThis.__poopinMobileAuthRefreshListenerRegistered = true;
  handleAppStateChange(AppState.currentState);
  AppState.addEventListener("change", handleAppStateChange);
}
