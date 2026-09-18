import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { AgentEvent, AgentStatus } from "./schema";
import { localDateString } from "./schema";
import { loadCursorChatTitles } from "./chat-titles";

/** Subagent stream grace — short; then latch done. */
const SUB_STREAMING_MS = 10_000;
/**
 * Parent chat: stay "building" only while the transcript is freshly active.
 * Long tool gaps without transcript writes may briefly look idle — better than
 * staying "working" for minutes after the turn actually finished.
 */
const PARENT_BUSY_MS = 25_000;
/** Subagent launch / stalled with only a user prompt. */
const STALE_BUILDING_MS = 90_000;

/** Subagents only: stay done after finish even if the file is touched again. */
const completedSubagentIds = new Set<string>();

/**
 * Parents: user message or recent writes ⇒ working; quiet assistant ⇒ done.
 * Subagents: one-shot; latch done after assistant reply.
 */
function statusFromTranscript(
  agentKey: string,
  lastRole: string | null,
  mtimeMs: number,
  isSubagent: boolean,
): AgentStatus {
  const age = Date.now() - mtimeMs;

  if (isSubagent) {
    if (lastRole === "user" && age <= STALE_BUILDING_MS) {
      completedSubagentIds.delete(agentKey);
      return "building";
    }
    if (completedSubagentIds.has(agentKey)) {
      return "done";
    }
    if (lastRole === "assistant") {
      if (age <= SUB_STREAMING_MS) return "building";
      completedSubagentIds.add(agentKey);
      return "done";
    }
    if (age <= STALE_BUILDING_MS) return "building";
    completedSubagentIds.add(agentKey);
    return "done";
  }

  // Parent / main chat
  if (lastRole === "user") {
    return "building";
  }
  // Assistant last: working only while the file is still being written.
  if (age <= PARENT_BUSY_MS) {
    return "building";
  }
  return "done";
}

type TranscriptHit = {
  filePath: string;
  agentId: string;
  parentAgentId?: string;
  isSubagent: boolean;
  projectSlug: string;
  mtimeMs: number;
  birthMs: number;
};

function projectsRoot(): string {
  return (
    process.env.CURSOR_PROJECTS_ROOT ||
    path.join(os.homedir(), ".cursor", "projects")
  );
}

function dayBounds(date: string): { startMs: number; endMs: number } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

async function walkJsonl(
  dir: string,
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(/*turbopackIgnore: true*/ dir, {
      withFileTypes: true,
    });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkJsonl(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
}

function extractText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") parts.push(part);
    else if (part && typeof part === "object") {
      const p = part as { type?: string; text?: string };
      if (p.type === "text" && typeof p.text === "string") parts.push(p.text);
    }
  }
  return parts.join("\n");
}

function cleanTitle(raw: string): string {
  let text = raw
    .replace(/<timestamp>[\s\S]*?<\/timestamp>/gi, "")
    .replace(/<\/?user_query>/gi, "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > 72) text = `${text.slice(0, 69)}…`;
  return text || "Cursor session";
}

function shortDisplayName(title: string, isSub: boolean): string {
  const base = title.trim() || (isSub ? "Sub-chat" : "Chat");
  if (base.length <= 22) return base;
  return `${base.slice(0, 19)}…`;
}

async function readTranscriptMeta(filePath: string): Promise<{
  title: string;
  lastRole: string | null;
}> {
  let title = "Cursor session";
  let lastRole: string | null = null;
  try {
    const raw = await fs.readFile(/*turbopackIgnore: true*/ filePath, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { role?: string; message?: unknown };
        if (typeof row.role === "string") {
          lastRole = row.role;
        }
        if (title === "Cursor session" && row.role === "user") {
          const text = extractText(row.message);
          if (text.trim()) title = cleanTitle(text);
        }
      } catch {
        // skip corrupt lines
      }
    }
  } catch {
    // missing file
  }
  return { title, lastRole };
}

async function discoverHits(
  date: string,
): Promise<TranscriptHit[]> {
  const root = projectsRoot();
  const { startMs, endMs } = dayBounds(date);
  let projects: string[] = [];
  try {
    projects = await fs.readdir(/*turbopackIgnore: true*/ root);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const project of projects) {
    const transcripts = path.join(root, project, "agent-transcripts");
    await walkJsonl(transcripts, files);
  }

  const hits: TranscriptHit[] = [];
  for (const filePath of files) {
    let stat;
    try {
      stat = await fs.stat(/*turbopackIgnore: true*/ filePath);
    } catch {
      continue;
    }
    // Include if touched today (activity) or created today.
    const birthMs =
      typeof stat.birthtimeMs === "number" && stat.birthtimeMs > 0
        ? stat.birthtimeMs
        : stat.ctimeMs;
    if (stat.mtimeMs < startMs && birthMs < startMs) continue;
    if (stat.mtimeMs >= endMs && birthMs >= endMs) continue;
    // Prefer mtime within today window; allow birth today even if edited later.
    const inToday =
      (stat.mtimeMs >= startMs && stat.mtimeMs < endMs) ||
      (birthMs >= startMs && birthMs < endMs);
    if (!inToday) continue;

    const parts = filePath.split(path.sep);
    const atIndex = parts.lastIndexOf("agent-transcripts");
    if (atIndex < 1) continue;
    const projectSlug = parts[atIndex - 1] ?? "project";
    const after = parts.slice(atIndex + 1);
    const isSubagent = after.includes("subagents");
    const agentId = path.basename(filePath, ".jsonl");

    let parentAgentId: string | undefined;
    if (isSubagent) {
      // .../agent-transcripts/<parentId>/subagents/<id>.jsonl
      const parentIdx = after.indexOf("subagents") - 1;
      if (parentIdx >= 0) parentAgentId = after[parentIdx];
    }

    hits.push({
      filePath,
      agentId,
      parentAgentId,
      isSubagent,
      projectSlug,
      mtimeMs: stat.mtimeMs,
      birthMs,
    });
  }

  // Synthetic parents when only subagents exist for a conversation.
  const parentIds = new Set(
    hits.filter((h) => !h.isSubagent).map((h) => h.agentId),
  );
  const synthetic: TranscriptHit[] = [];
  for (const hit of hits) {
    if (!hit.isSubagent || !hit.parentAgentId) continue;
    if (parentIds.has(hit.parentAgentId)) continue;
    parentIds.add(hit.parentAgentId);
    synthetic.push({
      filePath: hit.filePath,
      agentId: hit.parentAgentId,
      isSubagent: false,
      projectSlug: hit.projectSlug,
      mtimeMs: hit.mtimeMs,
      birthMs: hit.birthMs,
    });
  }

  return [...hits, ...synthetic];
}

export async function loadCursorAgentsToday(
  date = localDateString(),
): Promise<AgentEvent[]> {
  const hits = await discoverHits(date);
  const officialTitles = loadCursorChatTitles(true);
  const events: AgentEvent[] = [];

  for (const hit of hits) {
    const metaPath = hit.isSubagent
      ? hit.filePath
      : hit.filePath.includes(`${path.sep}subagents${path.sep}`)
        ? path.join(
            path.dirname(path.dirname(hit.filePath)),
            `${hit.agentId}.jsonl`,
          )
        : hit.filePath;

    const meta = await readTranscriptMeta(metaPath);
    // Synthetic parents may lack a parent jsonl — fall back to the subagent file.
    const fallbackMeta =
      meta.lastRole === null && metaPath !== hit.filePath
        ? await readTranscriptMeta(hit.filePath)
        : meta;

    const official =
      officialTitles.get(hit.agentId)?.trim() ||
      (hit.parentAgentId
        ? officialTitles.get(hit.parentAgentId)?.trim()
        : undefined);

    let resolvedTitle: string;
    if (hit.isSubagent) {
      const subOfficial = officialTitles.get(hit.agentId)?.trim();
      if (subOfficial) {
        resolvedTitle = subOfficial;
      } else {
        const subMeta = await readTranscriptMeta(hit.filePath);
        if (subMeta.title !== "Cursor session") {
          resolvedTitle = subMeta.title;
        } else if (official) {
          resolvedTitle = `Sub · ${official}`;
        } else {
          resolvedTitle = `Sub · ${hit.agentId.slice(0, 8)}`;
        }
      }
    } else if (official) {
      // Prefer Cursor's real chat tab title over the first user message.
      resolvedTitle = official;
    } else if (
      fallbackMeta.title &&
      fallbackMeta.title !== "Cursor session"
    ) {
      resolvedTitle = fallbackMeta.title;
    } else {
      resolvedTitle = `Chat ${hit.agentId.slice(0, 8)}`;
    }

    const startedAt = new Date(hit.birthMs).toISOString();
    const updatedAt = new Date(hit.mtimeMs).toISOString();
    const ownMeta = hit.isSubagent
      ? await readTranscriptMeta(hit.filePath)
      : fallbackMeta;

    const event: AgentEvent = {
      id: `cursor:${hit.agentId}`,
      source: "cursor",
      agentKind: hit.isSubagent ? "subagent" : "agent",
      agentId: hit.agentId,
      displayName: shortDisplayName(resolvedTitle, hit.isSubagent),
      status: statusFromTranscript(
        hit.agentId,
        ownMeta.lastRole,
        hit.mtimeMs,
        hit.isSubagent,
      ),
      title: resolvedTitle,
      buildingKey: hit.isSubagent
        ? `subchat:${hit.agentId}`
        : `chat:${hit.agentId}`,
      startedAt,
      updatedAt,
    };
    if (hit.parentAgentId) event.parentAgentId = hit.parentAgentId;
    events.push(event);
  }

  return events;
}
