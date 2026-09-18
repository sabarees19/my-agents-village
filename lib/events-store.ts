import { promises as fs } from "fs";
import path from "path";
import type { AgentEvent } from "./schema";
import { localDateString } from "./schema";

const DATA_DIR = path.join(process.cwd(), "data", "events");

function fileForDate(date: string): string {
  return path.join(DATA_DIR, `${date}.jsonl`);
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readEventsForDate(
  date = localDateString(),
): Promise<AgentEvent[]> {
  await ensureDataDir();
  const file = fileForDate(date);

  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const byId = new Map<string, AgentEvent>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as AgentEvent;
      if (event?.id) {
        byId.set(event.id, event);
      }
    } catch {
      // skip corrupt lines
    }
  }
  return Array.from(byId.values());
}

export async function upsertEvent(
  event: AgentEvent,
  date = localDateString(),
): Promise<AgentEvent> {
  await ensureDataDir();
  const existing = await readEventsForDate(date);
  const next = existing.filter((e) => e.id !== event.id);
  const previous = existing.find((e) => e.id === event.id);
  const merged: AgentEvent = {
    ...previous,
    ...event,
    startedAt: previous?.startedAt ?? event.startedAt,
    updatedAt: event.updatedAt || new Date().toISOString(),
  };
  next.push(merged);

  const file = fileForDate(date);
  const body = next.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await fs.writeFile(file, body, "utf8");
  return merged;
}
