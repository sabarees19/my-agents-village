import { NextResponse } from "next/server";
import { upsertEvent } from "@/lib/events-store";
import { localDateString, parseAgentEvent } from "@/lib/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseAgentEvent(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || localDateString();
  const event = await upsertEvent(parsed.event, date);

  return NextResponse.json({ ok: true, event, date });
}
