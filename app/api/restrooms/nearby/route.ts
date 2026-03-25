import { NextRequest, NextResponse } from "next/server";
import { getNearbyBathroomsData } from "@/lib/data/restrooms";

const parseCoordinate = (value: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseCoordinate(searchParams.get("lat"));
  const lng = parseCoordinate(searchParams.get("lng"));
  const limit = parseCoordinate(searchParams.get("limit"));

  if (lat === null || lng === null) {
    return NextResponse.json({ error: "Missing or invalid nearby coordinates." }, { status: 400 });
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Nearby coordinates are out of range." }, { status: 400 });
  }

  const nearbyRestrooms = await getNearbyBathroomsData(
    { lat, lng },
    Math.min(Math.max(limit ?? 120, 20), 200)
  );

  return NextResponse.json({ restrooms: nearbyRestrooms });
}
