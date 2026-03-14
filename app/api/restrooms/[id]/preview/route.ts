import { NextResponse } from "next/server";
import { getApprovedBathroomPreviewPhotoData } from "@/lib/data/photos";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      {
        success: false,
        photoUrl: null
      },
      { status: 400 }
    );
  }

  try {
    const photoUrl = await getApprovedBathroomPreviewPhotoData(id);
    return NextResponse.json(
      {
        success: true,
        photoUrl
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=600"
        }
      }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        photoUrl: null
      },
      { status: 500 }
    );
  }
}
