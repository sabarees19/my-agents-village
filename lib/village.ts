import { readEventsForDate } from "./events-store";
import { loadCursorAgentsToday } from "./cursor-agents";
import {
  bindEventsToChatBuildings,
  buildingsFromChats,
} from "./chat-buildings";
import {
  agentColor,
  localDateString,
  type AgentEvent,
  type VillageAgent,
  type VillageState,
} from "./schema";

/** Far from the chat cluster (chats sit ~24+ x / 30+ y). */
const HUT = { x: 12, y: 10 };
const WIP_YARD = { x: 88, y: 12 };

function agentOffset(index: number, total: number): { dx: number; dy: number } {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const radius = 2.6 + Math.min(total, 6) * 0.25;
  return {
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle) * radius * 0.7,
  };
}

function mergeEvents(manual: AgentEvent[], discovered: AgentEvent[]): AgentEvent[] {
  const byId = new Map<string, AgentEvent>();
  for (const event of discovered) {
    byId.set(event.id, event);
  }
  const now = Date.now();
  for (const event of manual) {
    const updatedMs = Date.parse(event.updatedAt);
    const stale =
      event.status === "building" &&
      Number.isFinite(updatedMs) &&
      now - updatedMs > 90_000;
    byId.set(event.id, stale ? { ...event, status: "done" } : event);
  }
  return Array.from(byId.values());
}

export async function buildVillageState(
  date = localDateString(),
): Promise<VillageState> {
  const [manualEvents, cursorEvents] = await Promise.all([
    readEventsForDate(date),
    loadCursorAgentsToday(date),
  ]);

  const events = bindEventsToChatBuildings(
    mergeEvents(manualEvents, cursorEvents),
  );
  const buildings = buildingsFromChats(events);
  const buildingByKey = new Map(buildings.map((b) => [b.key, b]));

  const hasUnmatchedWorking = events.some(
    (e) =>
      e.status === "building" &&
      (!e.buildingKey || !buildingByKey.has(e.buildingKey)),
  );
  if (hasUnmatchedWorking && !buildingByKey.has("WIP")) {
    buildings.push({
      key: "WIP",
      label: "WIP yard",
      stage: "foundation",
      kind: "feature",
      size: "md",
      commitCount: 0,
      commits: [],
      x: WIP_YARD.x,
      y: WIP_YARD.y,
    });
    buildingByKey.set("WIP", buildings[buildings.length - 1]);
  }

  const agents: VillageAgent[] = [];

  events.forEach((event, index) => {
    const siteKey =
      event.buildingKey && buildingByKey.has(event.buildingKey)
        ? event.buildingKey
        : event.status === "building"
          ? "WIP"
          : "HUT";
    const siteBuilding =
      siteKey === "HUT"
        ? null
        : buildingByKey.get(siteKey) ?? buildingByKey.get("WIP");

    const workX = siteBuilding?.x ?? WIP_YARD.x;
    const workY = (siteBuilding?.y ?? WIP_YARD.y) + 4;
    const { dx, dy } = agentOffset(index % 8, 8);

    if (event.status === "building") {
      agents.push({
        ...event,
        color: agentColor(event.source, event.agentKind),
        siteKey: siteKey === "HUT" ? "WIP" : siteKey,
        workX: workX + dx,
        workY: workY + dy,
        x: workX + dx,
        y: workY + dy,
      });
    } else {
      // Resting: target hut, but remember worksite for walk-home animation.
      agents.push({
        ...event,
        color: agentColor(event.source, event.agentKind),
        siteKey: "HUT",
        workX: workX + dx * 0.5,
        workY: workY + dy * 0.5,
        x: HUT.x,
        y: HUT.y,
      });
    }
  });

  return {
    date,
    buildings,
    agents,
    wipYard: WIP_YARD,
    hut: HUT,
    scannedAt: new Date().toISOString(),
  };
}
