export type AgentSource = "cursor" | "claude" | "codex" | "other";
export type AgentKind = "agent" | "subagent";
export type AgentStatus = "idle" | "building" | "done";
export type BuildingStage = "foundation" | "scaffolding" | "roof";

export type AgentEvent = {
  id: string;
  source: AgentSource;
  agentKind: AgentKind;
  agentId: string;
  parentAgentId?: string;
  displayName?: string;
  status: AgentStatus;
  buildingKey?: string;
  title?: string;
  startedAt: string;
  updatedAt: string;
};

export type CommitSummary = {
  sha: string;
  shortSha: string;
  authoredAt: string;
  subject: string;
  isMerge: boolean;
};

export type BuildingKind = "chat" | "subchat" | "feature";

export type Building = {
  key: string;
  label: string;
  repo?: string;
  stage: BuildingStage;
  kind: BuildingKind;
  /** Parent chat key for subchat cottages. */
  parentKey?: string;
  /** Visual scale — subchats are smaller. */
  size: "sm" | "md" | "lg";
  commitCount: number;
  commits: CommitSummary[];
  x: number;
  y: number;
};

export type VillageAgent = AgentEvent & {
  color: string;
  x: number;
  y: number;
  /** Always the chat/subchat plot — used so walk-home starts from the worksite. */
  workX: number;
  workY: number;
  /** Target site: building key while working, or "HUT" when resting. */
  siteKey: string;
};

export type VillageState = {
  date: string;
  buildings: Building[];
  agents: VillageAgent[];
  wipYard: { x: number; y: number };
  hut: { x: number; y: number };
  scannedAt: string;
  gitError?: string;
};

export const AGENT_SOURCES: AgentSource[] = [
  "cursor",
  "claude",
  "codex",
  "other",
];

const SOURCE_COLORS: Record<
  AgentSource,
  { agent: string; subagent: string }
> = {
  cursor: { agent: "#2B6CB0", subagent: "#63B3ED" },
  claude: { agent: "#C05621", subagent: "#ED8936" },
  codex: { agent: "#276749", subagent: "#68D391" },
  other: { agent: "#4A5568", subagent: "#A0AEC0" },
};

export function agentColor(
  source: AgentSource,
  agentKind: AgentKind,
): string {
  const palette = SOURCE_COLORS[source] ?? SOURCE_COLORS.other;
  return agentKind === "subagent" ? palette.subagent : palette.agent;
}

export function isAgentSource(value: unknown): value is AgentSource {
  return (
    typeof value === "string" &&
    AGENT_SOURCES.includes(value as AgentSource)
  );
}

export function isAgentKind(value: unknown): value is AgentKind {
  return value === "agent" || value === "subagent";
}

export function isAgentStatus(value: unknown): value is AgentStatus {
  return value === "idle" || value === "building" || value === "done";
}

export function localDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseAgentEvent(
  input: unknown,
): { ok: true; event: AgentEvent } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Body must be a JSON object" };
  }

  const raw = input as Record<string, unknown>;
  const now = new Date().toISOString();

  if (!isAgentSource(raw.source)) {
    return {
      ok: false,
      error: `source must be one of: ${AGENT_SOURCES.join(", ")}`,
    };
  }
  if (!isAgentKind(raw.agentKind)) {
    return { ok: false, error: 'agentKind must be "agent" or "subagent"' };
  }
  if (typeof raw.agentId !== "string" || !raw.agentId.trim()) {
    return { ok: false, error: "agentId is required" };
  }
  if (raw.status !== undefined && !isAgentStatus(raw.status)) {
    return {
      ok: false,
      error: 'status must be "idle", "building", or "done"',
    };
  }

  const agentId = raw.agentId.trim();
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `${raw.source}:${agentId}`;

  const event: AgentEvent = {
    id,
    source: raw.source,
    agentKind: raw.agentKind,
    agentId,
    status: isAgentStatus(raw.status) ? raw.status : "building",
    startedAt:
      typeof raw.startedAt === "string" && raw.startedAt
        ? raw.startedAt
        : now,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : now,
  };

  if (typeof raw.parentAgentId === "string" && raw.parentAgentId.trim()) {
    event.parentAgentId = raw.parentAgentId.trim();
  }
  if (typeof raw.displayName === "string" && raw.displayName.trim()) {
    event.displayName = raw.displayName.trim();
  }
  if (typeof raw.buildingKey === "string" && raw.buildingKey.trim()) {
    event.buildingKey = raw.buildingKey.trim();
  }
  if (typeof raw.title === "string" && raw.title.trim()) {
    event.title = raw.title.trim();
  }

  return { ok: true, event };
}
