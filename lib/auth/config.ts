export const AUTH_APP_BASE_URL = (process.env.APP_BASE_URL ?? "").trim() || null;
export const SUPABASE_AUTH_COOKIE_NAME = "poopin-sb-auth";
export const AUTH_CALLBACK_PATH = "/auth/callback";

export const isAuthConfigured = Boolean(
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim() &&
    (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim()
);

export const getAuthConfigIssue = () => {
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

export const getSupabaseAuthCookieOptions = () => ({
  name: SUPABASE_AUTH_COOKIE_NAME,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production"
});
