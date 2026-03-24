import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerAuthClient, getAuthenticatedProfile } from "@/lib/auth/server";
import { updateUserDisplayName } from "@/lib/auth/userProfiles";

const profileDisplayNameSchema = z.object({
  displayName: z
    .string({ required_error: "Display name is required." })
    .trim()
    .min(3, "Display name must be at least 3 characters.")
    .max(40, "Display name must be 40 characters or fewer.")
    .regex(/^[A-Za-z0-9' -]+$/, "Use letters, numbers, spaces, apostrophes, or hyphens only.")
});

export async function POST(request: NextRequest) {
  const authContext = await getAuthenticatedProfile();
  if (!authContext) {
    return NextResponse.json({ error: "Sign in to update your profile." }, { status: 401 });
  }
  if (!authContext.profile) {
    return NextResponse.json({ error: "Could not load your profile right now." }, { status: 503 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Please submit a valid display name." }, { status: 400 });
  }

  const parsed = profileDisplayNameSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please enter a valid display name." }, { status: 400 });
  }

  const { profile } = authContext;
  const sessionSupabase = await createSupabaseServerAuthClient();

  try {
    const updatedProfile = await updateUserDisplayName(profile.id, parsed.data.displayName, {
      supabaseClient: sessionSupabase,
      supabaseAuthUserId: authContext.authUser.id
    });
    return NextResponse.json({ success: true, displayName: updatedProfile.display_name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update your name right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
