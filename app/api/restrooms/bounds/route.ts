import { NextRequest, NextResponse } from "next/server";
import { getBathroomsInBoundsData } from "@/lib/data/restrooms";

const parseBound = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const minLat = parseBound(searchParams.get("minLat"));
  const maxLat = parseBound(searchParams.get("maxLat"));
  const minLng = parseBound(searchParams.get("minLng"));
  const maxLng = parseBound(searchParams.get("maxLng"));
  const limitParam = parseBound(searchParams.get("limit"));

  if (minLat === null || maxLat === null || minLng === null || maxLng === null) {
    return NextResponse.json({ error: "Missing or invalid map bounds." }, { status: 400 });
  }

  if (minLat > maxLat || minLng > maxLng) {
    return NextResponse.json({ error: "Invalid map bounds ordering." }, { status: 400 });
  }

  const limit = Math.min(Math.max(limitParam ?? 300, 50), 1000);
  const origin = {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2
  };

  const restrooms = await getBathroomsInBoundsData(
    {
      minLat,
      maxLat,
      minLng,
      maxLng
    },
    limit,
    origin,
    { includePreviewPhotoUrls: false }
  );

  return NextResponse.json({ restrooms });
}
