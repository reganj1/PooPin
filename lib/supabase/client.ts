import { createBrowserClient } from "@supabase/ssr";
import { type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAuthCookieOptions } from "@/lib/auth/config";

interface BrowserSupabaseConfig {
  url: string;
  anonKey: string;
}

declare global {
  var __poopinSupabaseBrowserClient: SupabaseClient | undefined;
  var __poopinSupabaseBrowserClientConfigKey: string | undefined;
}

const getBrowserSupabaseConfig = (): BrowserSupabaseConfig | null => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url || !anonKey) {
    return null;
  }

  try {
    new URL(url);
  } catch {
    return null;
  }

  return {
    url,
    anonKey
  };
};

export const getSupabaseBrowserClient = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const config = getBrowserSupabaseConfig();
  if (!config) {
    return null;
  }

  const configKey = `${config.url}::${config.anonKey}`;
  if (globalThis.__poopinSupabaseBrowserClient && globalThis.__poopinSupabaseBrowserClientConfigKey === configKey) {
    return globalThis.__poopinSupabaseBrowserClient;
  }

  const client = createBrowserClient(config.url, config.anonKey, {
    cookieOptions: getSupabaseAuthCookieOptions()
  });

  globalThis.__poopinSupabaseBrowserClient = client;
  globalThis.__poopinSupabaseBrowserClientConfigKey = configKey;
  return client;
};
