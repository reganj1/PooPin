import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthConfigIssue } from "@/lib/auth/config";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

const getSupabaseOtpClient = () => {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};

const normalizeEmail = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isDuplicateUserError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already registered") ||
    normalized.includes("already been registered") ||
    normalized.includes("already exists") ||
    normalized.includes("duplicate") ||
    normalized.includes("unique constraint")
  );
};

const getExistingAuthUserByEmail = async (email: string) => {
  if (!isSupabaseAdminConfigured) {
    return null;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return null;
  }

  let page = 1;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (error) {
      throw new Error(error.message);
    }

    const existingUser =
      data.users.find((user) => normalizeEmail(user.email) === email) ??
      null;

    if (existingUser) {
      return existingUser;
    }

    if (!data.nextPage) {
      break;
    }

    page = data.nextPage;
  }

  return null;
};

const ensureAuthUserExistsForOtp = async (email: string) => {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new Error("Email auth needs SUPABASE_SERVICE_ROLE_KEY to create new users in the shared OTP flow.");
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true
  });

  if (error && !isDuplicateUserError(error.message)) {
    throw new Error(error.message);
  }

  if (error) {
    const existingUser = await getExistingAuthUserByEmail(email);
    if (existingUser && !existingUser.email_confirmed_at) {
      const { error: updateError } = await admin.auth.admin.updateUserById(existingUser.id, {
        email_confirm: true
      });

      if (updateError) {
        throw new Error(updateError.message);
      }
    }
  }
};

export async function POST(request: NextRequest) {
  const configIssue = getAuthConfigIssue();
  if (configIssue) {
    return NextResponse.json({ error: configIssue }, { status: 500 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = normalizeEmail((payload as { email?: unknown } | null)?.email);
  if (!email || !isLikelyEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const otpClient = getSupabaseOtpClient();
  if (!otpClient) {
    return NextResponse.json({ error: "Supabase email auth is not configured yet." }, { status: 500 });
  }

  try {
    // We explicitly provision missing users first so both brand new and returning
    // users always go through the same passwordless email-code flow.
    await ensureAuthUserExistsForOtp(email);

    const { error } = await otpClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false
      }
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn’t send a code right now.";
    console.error("[Poopin] Unified email OTP send failed.", { email, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
