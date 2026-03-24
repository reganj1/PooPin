import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType, SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import {
  AUTH_APP_BASE_URL,
  AUTH_CALLBACK_PATH,
  getAuthConfigIssue,
  getSupabaseAuthCookieOptions,
  isAuthConfigured,
  SUPABASE_AUTH_COOKIE_NAME
} from "@/lib/auth/config";
import { ensureUserProfileForAuthUser, type UserProfile } from "@/lib/auth/userProfiles";

declare global {
  var __poopinSupabaseAuthConfigLogged: boolean | undefined;
}

interface AuthSupabaseConfig {
  url: string;
  anonKey: string;
}

export interface AuthenticatedProfileContext {
  authUser: User;
  profile: UserProfile | null;
}

const getAuthSupabaseConfig = (): AuthSupabaseConfig | null => {
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

  return { url, anonKey };
};

export const createSupabaseServerAuthClient = async (): Promise<SupabaseClient | null> => {
  const config = getAuthSupabaseConfig();
  if (!config) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies; middleware/route handlers cover refresh.
        }
      }
    }
  });
};

export const createSupabaseRouteHandlerAuthClient = (
  request: NextRequest,
  response: NextResponse
): SupabaseClient | null => {
  const config = getAuthSupabaseConfig();
  if (!config) {
    return null;
  }

  return createServerClient(config.url, config.anonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });
};

export const getAuthUser = async (): Promise<User | null> => {
  const supabase = await createSupabaseServerAuthClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    console.warn("[Poopin] Could not resolve Supabase auth user.", error.message);
    return null;
  }

  return user;
};

export const getAuthSession = async () => {
  const supabase = await createSupabaseServerAuthClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  return session;
};

export const getAuthenticatedProfile = async (): Promise<AuthenticatedProfileContext | null> => {
  const authClient = await createSupabaseServerAuthClient();
  if (!authClient) {
    return null;
  }

  const {
    data: { user: authUser },
    error
  } = await authClient.auth.getUser();

  if (error) {
    console.warn("[Poopin] Could not resolve Supabase auth user.", error.message);
    return null;
  }

  if (!authUser) {
    return null;
  }

  let profile: UserProfile | null = null;
  try {
    profile = await ensureUserProfileForAuthUser(authUser, { supabaseClient: authClient });
  } catch (error) {
    console.error("[Poopin] Could not resolve authenticated profile.", error);
  }

  return {
    authUser,
    profile
  };
};

export const getAuthCallbackErrorHint = () => {
  const configIssue = getAuthConfigIssue();
  if (configIssue) {
    return configIssue;
  }

  return `Check your Supabase Site URL, redirect URLs, auth email provider settings, and make sure ${AUTH_CALLBACK_PATH} is allowed.`;
};

export const getAppOrigin = (requestUrl: string) => {
  if (AUTH_APP_BASE_URL) {
    return AUTH_APP_BASE_URL;
  }

  try {
    return new URL(requestUrl).origin;
  } catch {
    return "http://localhost:3000";
  }
};

export const isSupportedOtpType = (value: string | null): value is EmailOtpType => {
  return value === "magiclink" || value === "recovery" || value === "invite" || value === "email_change" || value === "email";
};

export const logAuthConfigurationOnce = () => {
  if (process.env.NODE_ENV !== "development" || globalThis.__poopinSupabaseAuthConfigLogged) {
    return;
  }

  globalThis.__poopinSupabaseAuthConfigLogged = true;
  console.info("[Poopin] Supabase auth configuration", {
    configured: isAuthConfigured,
    hasAppBaseUrl: Boolean(AUTH_APP_BASE_URL),
    cookieName: SUPABASE_AUTH_COOKIE_NAME,
    loginPath: "/login",
    callbackPath: AUTH_CALLBACK_PATH
  });
};

export const getAuthCookiePresence = (request: NextRequest) => {
  const cookiePrefix = SUPABASE_AUTH_COOKIE_NAME;
  const cookieNames = request.cookies.getAll().map(({ name }) => name);

  return {
    hasAuthCookies: cookieNames.some((name) => name.startsWith(cookiePrefix)),
    hasPkceVerifier: cookieNames.some((name) => name.startsWith(`${cookiePrefix}-code-verifier`)),
    authCookieCount: cookieNames.filter((name) => name.startsWith(cookiePrefix)).length
  };
};
