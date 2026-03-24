import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerAuthClient, getAuthenticatedProfile } from "@/lib/auth/server";
import { awardPointsForContribution } from "@/lib/points/pointEvents";
import { insertReview, toAddReviewErrorMessage } from "@/lib/supabase/reviews";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { reviewCreateSchema } from "@/lib/validations/review";

export async function POST(request: NextRequest) {
  const authContext = await getAuthenticatedProfile();
  if (!authContext) {
    return NextResponse.json({ error: "Sign in to write a review." }, { status: 401 });
  }
  if (!authContext.profile) {
    return NextResponse.json({ error: "Could not load your account right now." }, { status: 503 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Please submit a valid review." }, { status: 400 });
  }

  const parsed = reviewCreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Please check your review and try again."
      },
      { status: 400 }
    );
  }

  const { profile } = authContext;

  const supabaseAdmin = getSupabaseAdminClient();
  const supabase = supabaseAdmin ?? (await createSupabaseServerAuthClient());
  if (!supabase) {
    return NextResponse.json({ error: "Review submission is temporarily unavailable." }, { status: 503 });
  }

  try {
    const result = await insertReview(supabase, parsed.data, { profileId: profile.id });
    if (supabaseAdmin) {
      try {
        await awardPointsForContribution(supabaseAdmin, {
          profileId: profile.id,
          eventType: "review_created",
          entityType: "review",
          entityId: result.reviewId
        });
      } catch (pointsError) {
        console.error("[Poopin] Review created but point award failed.", pointsError);
      }
    } else {
      console.warn("[Poopin] Review created without awarding points because SUPABASE_SERVICE_ROLE_KEY is missing.");
    }

    return NextResponse.json({ success: true, reviewId: result.reviewId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: toAddReviewErrorMessage(error) }, { status: 500 });
  }
}
