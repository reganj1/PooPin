import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerAuthClient, getAuthenticatedProfile } from "@/lib/auth/server";
import { getCollectibleCardByKey, isCollectibleCardUnlocked } from "@/lib/collectibles/cards";
import { getProfileCollectibleProgress } from "@/lib/collectibles/progress";
import { updateUserActiveCardKey } from "@/lib/auth/userProfiles";

const activeCardSchema = z.object({
  activeCardKey: z.string({ required_error: "Choose a card to showcase." }).trim().min(1, "Choose a card to showcase.")
});

export async function POST(request: NextRequest) {
  const authContext = await getAuthenticatedProfile();
  if (!authContext) {
    return NextResponse.json({ error: "Sign in to update your showcased card." }, { status: 401 });
  }

  if (!authContext.profile) {
    return NextResponse.json({ error: "Could not load your profile right now." }, { status: 503 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Please submit a valid card choice." }, { status: 400 });
  }

  const parsed = activeCardSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please choose a valid card." }, { status: 400 });
  }

  const selectedCard = getCollectibleCardByKey(parsed.data.activeCardKey);
  if (!selectedCard) {
    return NextResponse.json({ error: "That collectible card does not exist." }, { status: 400 });
  }

  const progress = await getProfileCollectibleProgress(authContext.profile.id, authContext.profile.active_card_key);
  if (!isCollectibleCardUnlocked(selectedCard.key, progress.contributionScore)) {
    return NextResponse.json({ error: "Unlock this card before you showcase it." }, { status: 400 });
  }

  const sessionSupabase = await createSupabaseServerAuthClient();

  try {
    const updatedProfile = await updateUserActiveCardKey(authContext.profile.id, selectedCard.key, {
      supabaseClient: sessionSupabase,
      supabaseAuthUserId: authContext.authUser.id
    });

    return NextResponse.json({
      success: true,
      activeCardKey: updatedProfile.active_card_key
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update your showcased card right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
