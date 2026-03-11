import { createClient } from "@supabase/supabase-js";

interface ServerSupabaseConfig {
  url: string;
  anonKey: string;
}

const getServerSupabaseConfig = (): ServerSupabaseConfig | null => {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

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

export const getSupabaseServerClientConfigIssue = () => {
  const rawUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const rawAnonKey = (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

  if (!rawUrl) {
    return "Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.";
  }

  if (!rawAnonKey) {
    return "Missing SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.";
  }

  try {
    new URL(rawUrl);
  } catch {
    return "Supabase URL is invalid. It must include protocol, e.g. https://<project-ref>.supabase.co.";
  }

  return null;
};

export const getSupabaseServerClient = () => {
  const config = getServerSupabaseConfig();
  if (!config) {
    return null;
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};
