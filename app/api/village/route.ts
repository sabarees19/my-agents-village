import { NextResponse } from "next/server";
import { localDateString } from "@/lib/schema";
import { buildVillageState } from "@/lib/village";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || localDateString();
  const village = await buildVillageState(date);
  return NextResponse.json(village);
}
