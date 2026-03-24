import { NextRequest, NextResponse } from "next/server";
import { sanitizeReturnTo } from "@/lib/auth/login";
import {
  createSupabaseRouteHandlerAuthClient,
  getAuthCookiePresence,
  getAppOrigin,
  getAuthCallbackErrorHint,
  isSupportedOtpType,
  logAuthConfigurationOnce
} from "@/lib/auth/server";
import { ensureUserProfileForAuthUser } from "@/lib/auth/userProfiles";

logAuthConfigurationOnce();

const buildRedirect = (request: NextRequest, path: string) => NextResponse.redirect(new URL(path, getAppOrigin(request.url)));

export async function GET(request: NextRequest) {
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const authError = request.nextUrl.searchParams.get("error");
  const authErrorDescription = request.nextUrl.searchParams.get("error_description");
  const successResponse = buildRedirect(request, returnTo);
  const supabase = createSupabaseRouteHandlerAuthClient(request, successResponse);

  if (!supabase) {
    console.error("[Poopin] Supabase auth callback failed.", { reason: "missing_supabase_config" });
    return new NextResponse(`Login could not be completed. ${getAuthCallbackErrorHint()}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }

  if (authError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Poopin] Supabase auth callback returned provider error.", {
        authError,
        authErrorDescription: authErrorDescription ?? null
      });
    }

    return buildRedirect(request, `/login?returnTo=${encodeURIComponent(returnTo)}&error=auth_callback`);
  }

  let errorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      errorMessage = error.message;
    }
  } else if (tokenHash && isSupportedOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      errorMessage = error.message;
    }
  } else {
    return buildRedirect(request, `/login?returnTo=${encodeURIComponent(returnTo)}&error=auth_missing_code`);
  }

  if (errorMessage) {
    const diagnostics = process.env.NODE_ENV === "development" ? getAuthCookiePresence(request) : undefined;
    console.error("[Poopin] Supabase auth callback failed.", {
      message: errorMessage,
      ...(diagnostics ? { diagnostics } : {})
    });
    return buildRedirect(request, `/login?returnTo=${encodeURIComponent(returnTo)}&error=auth_exchange_failed`);
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("[Poopin] Supabase auth session missing after callback.", {
      message: userError.message,
      ...(process.env.NODE_ENV === "development" ? { diagnostics: getAuthCookiePresence(request) } : {})
    });
    return buildRedirect(request, `/login?returnTo=${encodeURIComponent(returnTo)}&error=auth_session_missing`);
  }

  if (user) {
    try {
      const profile = await ensureUserProfileForAuthUser(user, { supabaseClient: supabase });
      if (!profile) {
        console.error("[Poopin] Supabase auth callback could not resolve a profile after sign-in.", {
          userId: user.id
        });
        return buildRedirect(request, `/login?returnTo=${encodeURIComponent(returnTo)}&error=profile_setup_failed`);
      }
    } catch (error) {
      console.error("[Poopin] Could not ensure user profile after sign-in.", error);
      return buildRedirect(request, `/login?returnTo=${encodeURIComponent(returnTo)}&error=profile_setup_failed`);
    }
  }

  return successResponse;
}
