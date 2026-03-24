import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerAuthClient, getAuthenticatedProfile } from "@/lib/auth/server";
import { insertReviewComment } from "@/lib/supabase/reviewEngagement";
import { reviewCommentCreateSchema } from "@/lib/validations/reviewEngagement";

interface ReviewCommentsRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: NextRequest, context: ReviewCommentsRouteContext) {
  const authContext = await getAuthenticatedProfile();
  if (!authContext) {
    return NextResponse.json({ error: "Sign in to comment on reviews." }, { status: 401 });
  }

  if (!authContext.profile) {
    return NextResponse.json({ error: "Could not load your account right now." }, { status: 503 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Please submit a valid comment." }, { status: 400 });
  }

  const parsed = reviewCommentCreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check your comment and try again." }, { status: 400 });
  }

  const supabase = await createSupabaseServerAuthClient();
  if (!supabase) {
    return NextResponse.json({ error: "Comments are temporarily unavailable." }, { status: 503 });
  }

  const { id: reviewId } = await context.params;

  try {
    const comment = await insertReviewComment(supabase, reviewId, authContext.profile.id, parsed.data);
    return NextResponse.json(
      {
        success: true,
        comment: {
          ...comment,
          author_display_name: authContext.profile.display_name
        }
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add that comment right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
