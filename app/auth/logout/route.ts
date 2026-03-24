import { NextRequest, NextResponse } from "next/server";
import { sanitizeReturnTo } from "@/lib/auth/login";
import { createSupabaseRouteHandlerAuthClient, getAppOrigin } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const response = NextResponse.redirect(new URL(returnTo, getAppOrigin(request.url)));
  const supabase = createSupabaseRouteHandlerAuthClient(request, response);

  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[Poopin] Supabase sign-out failed.", error.message);
    }
  }

  return response;
}
