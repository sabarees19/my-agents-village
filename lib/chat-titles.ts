import { execFileSync } from "child_process";
import os from "os";
import path from "path";

let cachedTitles: Map<string, string> | null = null;
let cachedAt = 0;
const CACHE_MS = 15_000;

function dbPath(): string {
  return (
    process.env.CURSOR_CONVERSATION_DB ||
    path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Cursor",
      "User",
      "globalStorage",
      "conversation-search.db",
    )
  );
}

/**
 * Official Cursor chat titles live in conversation-search.db
 * (not in the transcript jsonl, which only has the first user message).
 */
function loadTitlesFromDb(file: string): Map<string, string> {
  const script = `
import sqlite3, json, sys
con = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
cur = con.cursor()
rows = cur.execute(
  "SELECT id, title FROM conversations WHERE title IS NOT NULL AND trim(title) != ''"
).fetchall()
print(json.dumps({i: t for i, t in rows}))
con.close()
`;
  try {
    const out = execFileSync(
      "python3",
      ["-c", script, /*turbopackIgnore: true*/ file],
      {
        encoding: "utf8",
        timeout: 8_000,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const parsed = JSON.parse(out) as Record<string, string>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

export function loadCursorChatTitles(force = false): Map<string, string> {
  const now = Date.now();
  if (!force && cachedTitles && now - cachedAt < CACHE_MS) {
    return cachedTitles;
  }
  const titles = loadTitlesFromDb(dbPath());
  cachedTitles = titles;
  cachedAt = now;
  return titles;
}

export function chatTitleForAgentId(
  agentId: string,
  fallback?: string,
): string {
  const titles = loadCursorChatTitles();
  const titled = titles.get(agentId)?.trim();
  if (titled) return titled;
  return (fallback || "").trim();
}
