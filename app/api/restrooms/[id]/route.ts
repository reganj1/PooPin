import { NextResponse } from "next/server";
import { getBathroomByIdData } from "@/lib/data/restrooms";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing restroom id." }, { status: 400 });
  }

  const restroom = await getBathroomByIdData(id);
  if (!restroom) {
    return NextResponse.json({ error: "Restroom not found." }, { status: 404 });
  }

  return NextResponse.json({ restroom }, { status: 200 });
}
