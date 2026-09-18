"use client";

import { useMemo, useState } from "react";
import type { VillageState } from "@/lib/schema";
import { AgentSprite } from "./AgentSprite";
import { Building } from "./Building";
import styles from "./VillageMap.module.css";

type Props = {
  village: VillageState;
};

export function VillageMap({ village }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selected = useMemo(
    () => village.buildings.find((b) => b.key === selectedKey) ?? null,
    [village.buildings, selectedKey],
  );

  const linkedAgents = useMemo(() => {
    if (!selected) return [];
    return village.agents.filter((a) => {
      if (selected.key === "WIP") {
        return !a.buildingKey || a.buildingKey === "WIP";
      }
      return a.buildingKey === selected.key;
    });
  }, [selected, village.agents]);

  const isEmpty =
    village.buildings.length === 0 && village.agents.length === 0;

  return (
    <div className={styles.map}>
      {isEmpty ? (
        <p className={styles.empty}>
          No buildings yet today — make a commit or emit an agent event
        </p>
      ) : (
        <>
          {village.buildings.map((building) => (
            <Building
              key={building.key}
              building={building}
              selected={building.key === selectedKey}
              onSelect={setSelectedKey}
            />
          ))}
          {village.agents.map((agent) => (
            <AgentSprite key={agent.id} agent={agent} />
          ))}
        </>
      )}

      {selected && (
        <aside className={styles.panel} aria-live="polite">
          <button
            type="button"
            className={styles.close}
            onClick={() => setSelectedKey(null)}
            aria-label="Close panel"
          >
            ×
          </button>
          <h2>{selected.label}</h2>
          <p className={styles.meta}>
            {selected.repo ? `${selected.repo} · ` : ""}
            {selected.commitCount} commit
            {selected.commitCount === 1 ? "" : "s"} · {selected.stage}
          </p>

          <p className={styles.sectionTitle}>Agents</p>
          {linkedAgents.length === 0 ? (
            <p className={styles.meta}>No agents linked yet</p>
          ) : (
            <ul className={styles.list}>
              {linkedAgents.map((agent) => (
                <li key={agent.id}>
                  <span style={{ color: agent.color }}>●</span>{" "}
                  {agent.displayName || agent.agentId}{" "}
                  <span className={styles.meta}>
                    ({agent.source}
                    {agent.agentKind === "subagent" ? " subagent" : ""}
                    {agent.parentAgentId
                      ? ` ← ${agent.parentAgentId}`
                      : ""}
                    )
                  </span>
                  {agent.title ? ` — ${agent.title}` : ""}
                </li>
              ))}
            </ul>
          )}

          <p className={styles.sectionTitle}>Commits</p>
          {selected.commits.length === 0 ? (
            <p className={styles.meta}>No commits on this plot</p>
          ) : (
            <ul className={styles.list}>
              {selected.commits.map((c) => (
                <li key={c.sha}>
                  <code>{c.shortSha}</code> {c.subject}
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </div>
  );
}
