import type { AgentEvent, Building, BuildingStage } from "./schema";

function chatKey(agentId: string): string {
  return `chat:${agentId}`;
}

function subchatKey(agentId: string): string {
  return `subchat:${agentId}`;
}

function stageFromStatus(status: AgentEvent["status"]): BuildingStage {
  if (status === "building") return "scaffolding";
  return "roof";
}

function shortLabel(title: string | undefined, fallback: string): string {
  const t = (title || fallback).trim();
  if (t.length <= 40) return t;
  return `${t.slice(0, 37)}…`;
}

function layoutParentSlots(count: number): Array<{ x: number; y: number }> {
  // Wide grid so chat buildings don't stack on each other.
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const colGap = 34;
  const rowGap = 32;
  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: 24 + col * colGap,
      y: 30 + row * rowGap,
    });
  }
  return positions;
}

function subchatOffset(index: number, total: number): { dx: number; dy: number } {
  // Small cottages in an arc beside the parent — still closer than parent-parent gaps.
  const spread = Math.min(total, 6);
  const angle =
    -Math.PI * 0.2 + (index / Math.max(spread - 1, 1)) * Math.PI * 0.65;
  const radius = 11;
  return {
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle) * radius * 0.7 + 5,
  };
}

/** Walk up when Cursor nests a sub under another subagent id. */
function resolveParentAgentId(
  sub: AgentEvent,
  parentById: Map<string, AgentEvent>,
  subById: Map<string, AgentEvent>,
): string {
  let current = sub.parentAgentId || "__orphan__";
  const seen = new Set<string>();
  while (current !== "__orphan__" && !parentById.has(current)) {
    if (seen.has(current)) return "__orphan__";
    seen.add(current);
    const nested = subById.get(current);
    if (!nested?.parentAgentId) break;
    current = nested.parentAgentId;
  }
  return current;
}

/**
 * Parent chats → main buildings.
 * Subagent chats → smaller buildings clustered beside their parent.
 */
export function buildingsFromChats(events: AgentEvent[]): Building[] {
  const parents = events.filter((e) => e.agentKind === "agent");
  const subs = events.filter((e) => e.agentKind === "subagent");
  const subById = new Map(subs.map((s) => [s.agentId, s]));

  // Dedupe parents by agentId (manual + cursor can overlap).
  const parentById = new Map<string, AgentEvent>();
  for (const parent of parents) {
    const prev = parentById.get(parent.agentId);
    if (
      !prev ||
      parent.updatedAt.localeCompare(prev.updatedAt) > 0 ||
      (parent.status === "building" && prev.status !== "building")
    ) {
      parentById.set(parent.agentId, parent);
    }
  }

  // Ensure every sub has a true parent chat building (never promote a subagent id).
  for (const sub of subs) {
    const parentId = resolveParentAgentId(sub, parentById, subById);
    if (parentId === "__orphan__" || parentById.has(parentId)) continue;
    if (subById.has(parentId)) continue;
    const synthetic: AgentEvent = {
      id: `cursor:${parentId}`,
      source: sub.source,
      agentKind: "agent",
      agentId: parentId,
      displayName: `Chat ${parentId.slice(0, 8)}`,
      status: "done",
      title: `Chat ${parentId.slice(0, 8)}`,
      startedAt: sub.startedAt,
      updatedAt: sub.updatedAt,
      buildingKey: chatKey(parentId),
    };
    parentById.set(parentId, synthetic);
  }

  const uniqueParents = Array.from(parentById.values());
  uniqueParents.sort((a, b) => {
    if (a.status === "building" && b.status !== "building") return -1;
    if (b.status === "building" && a.status !== "building") return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const slots = layoutParentSlots(uniqueParents.length);
  const buildings: Building[] = [];
  const parentPos = new Map<string, { x: number; y: number }>();
  const usedKeys = new Set<string>();

  uniqueParents.forEach((parent, index) => {
    const pos = slots[index] ?? { x: 50, y: 40 };
    parentPos.set(parent.agentId, pos);
    const key = chatKey(parent.agentId);
    if (usedKeys.has(key)) return;
    usedKeys.add(key);
    buildings.push({
      key,
      label: shortLabel(parent.title, parent.displayName || "Chat"),
      repo: parent.source,
      stage: stageFromStatus(parent.status),
      kind: "chat",
      size: "lg",
      commitCount: 0,
      commits: [],
      x: pos.x,
      y: pos.y,
    });
  });

  const subsByParent = new Map<string, AgentEvent[]>();
  for (const sub of subs) {
    const parentId = resolveParentAgentId(sub, parentById, subById);
    const list = subsByParent.get(parentId) ?? [];
    list.push(sub);
    subsByParent.set(parentId, list);
  }

  for (const [parentId, group] of subsByParent) {
    const base =
      parentPos.get(parentId) ??
      ({ x: 40, y: 50 } as { x: number; y: number });
    group
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .forEach((sub, index) => {
        const { dx, dy } = subchatOffset(index, group.length);
        const key = subchatKey(sub.agentId);
        if (usedKeys.has(key)) return;
        usedKeys.add(key);
        buildings.push({
          key,
          label: shortLabel(
            sub.title,
            sub.displayName || `Sub ${sub.agentId.slice(0, 6)}`,
          ),
          repo: sub.source,
          stage: stageFromStatus(sub.status),
          kind: "subchat",
          parentKey:
            parentId === "__orphan__" ? undefined : chatKey(parentId),
          size: "sm",
          commitCount: 0,
          commits: [],
          x: base.x + dx,
          y: base.y + dy,
        });
      });
  }

  return buildings;
}

export function bindEventsToChatBuildings(
  events: AgentEvent[],
): AgentEvent[] {
  return events.map((event) => ({
    ...event,
    buildingKey:
      event.agentKind === "subagent"
        ? subchatKey(event.agentId)
        : chatKey(event.agentId),
  }));
}
