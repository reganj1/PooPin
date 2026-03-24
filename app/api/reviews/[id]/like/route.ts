import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerAuthClient, getAuthenticatedProfile } from "@/lib/auth/server";
import { likeReview, unlikeReview } from "@/lib/supabase/reviewEngagement";

interface ReviewLikeRouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface ReviewLikeAuthContext {
  profileId: string;
}

const getAuthContextOrResponse = async () => {
  const authContext = await getAuthenticatedProfile();
  if (!authContext) {
    return NextResponse.json({ error: "Sign in to like reviews." }, { status: 401 });
  }

  if (!authContext.profile) {
    return NextResponse.json({ error: "Could not load your account right now." }, { status: 503 });
  }

  return { profileId: authContext.profile.id } satisfies ReviewLikeAuthContext;
};

export async function POST(_request: NextRequest, context: ReviewLikeRouteContext) {
  const authContextOrResponse = await getAuthContextOrResponse();
  if (authContextOrResponse instanceof NextResponse) {
    return authContextOrResponse;
  }

  const supabase = await createSupabaseServerAuthClient();
  if (!supabase) {
    return NextResponse.json({ error: "Review likes are temporarily unavailable." }, { status: 503 });
  }

  const { id: reviewId } = await context.params;

  try {
    await likeReview(supabase, reviewId, authContextOrResponse.profileId);
    return NextResponse.json({ success: true, liked: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not like this review right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: ReviewLikeRouteContext) {
  const authContextOrResponse = await getAuthContextOrResponse();
  if (authContextOrResponse instanceof NextResponse) {
    return authContextOrResponse;
  }

  const supabase = await createSupabaseServerAuthClient();
  if (!supabase) {
    return NextResponse.json({ error: "Review likes are temporarily unavailable." }, { status: 503 });
  }

  const { id: reviewId } = await context.params;

  try {
    await unlikeReview(supabase, reviewId, authContextOrResponse.profileId);
    return NextResponse.json({ success: true, liked: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove your like right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
