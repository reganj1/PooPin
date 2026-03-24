import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerAuthClient, getAuthenticatedProfile } from "@/lib/auth/server";
import { awardPointsForContribution } from "@/lib/points/pointEvents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { uploadBathroomPhoto, toUploadPhotoErrorMessage } from "@/lib/supabase/photos";
import { getSafeImageUploadFileName } from "@/lib/utils/files";
import { validatePhotoFileBasics } from "@/lib/validations/photo";

interface PhotoUploadRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: NextRequest, context: PhotoUploadRouteContext) {
  const authContext = await getAuthenticatedProfile();
  if (!authContext) {
    return NextResponse.json({ error: "Sign in to upload a photo." }, { status: 401 });
  }
  if (!authContext.profile) {
    return NextResponse.json({ error: "Could not load your account right now." }, { status: 503 });
  }

  const { id: bathroomId } = await context.params;
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Select a photo to upload." }, { status: 400 });
  }

  const basicValidationMessage = validatePhotoFileBasics(file);
  if (basicValidationMessage) {
    return NextResponse.json({ error: basicValidationMessage }, { status: 400 });
  }

  const { profile } = authContext;

  const supabaseAdmin = getSupabaseAdminClient();
  const supabase = supabaseAdmin ?? (await createSupabaseServerAuthClient());
  if (!supabase) {
    return NextResponse.json({ error: "Photo upload is temporarily unavailable." }, { status: 503 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const normalizedFile = new File([buffer], getSafeImageUploadFileName(file), {
      type: file.type,
      lastModified: Date.now()
    });

    const result = await uploadBathroomPhoto(supabase, {
      bathroomId,
      file: normalizedFile,
      moderationState: "pending",
      profileId: profile.id
    });

    if (supabaseAdmin) {
      try {
        await awardPointsForContribution(supabaseAdmin, {
          profileId: profile.id,
          eventType: "photo_uploaded",
          entityType: "photo",
          entityId: result.photoId
        });
      } catch (pointsError) {
        console.error("[Poopin] Photo uploaded but point award failed.", pointsError);
      }
    } else {
      console.warn("[Poopin] Photo uploaded without awarding points because SUPABASE_SERVICE_ROLE_KEY is missing.");
    }

    return NextResponse.json({ success: true, photoId: result.photoId, moderationState: result.moderationState }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: toUploadPhotoErrorMessage(error) }, { status: 500 });
  }
}
