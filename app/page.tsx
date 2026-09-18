"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { VillageState } from "@/lib/schema";
import { agentColor } from "@/lib/schema";
import styles from "./page.module.css";

const VillageScene3D = dynamic(
  () =>
    import("./components/VillageScene3D").then((m) => m.VillageScene3D),
  {
    ssr: false,
    loading: () => (
      <p className={styles.status}>Raising the 3D village…</p>
    ),
  },
);

const REFRESH_MS = 5_000;

export default function Home() {
  const [village, setVillage] = useState<VillageState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/village", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Village API ${res.status}`);
      }
      const data = (await res.json()) as VillageState;
      setVillage(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load village");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const agentCount =
    village?.agents.filter((a) => a.agentKind === "agent").length ?? 0;
  const subCount =
    village?.agents.filter((a) => a.agentKind === "subagent").length ?? 0;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.brand}>My Agents</p>
        <h1 className={styles.headline}>Today&apos;s 3D village</h1>
        <p className={styles.sub}>
          Each chat is a building; sub-chats are small cottages beside it.
          Working builders stay on site, then walk home to the distant hut.
          Use Move / Rotate above the map for one-finger drag; pinch to zoom.
        </p>
        <div className={styles.metaRow}>
          <span className={styles.pill}>{village?.date ?? "…"}</span>
          <span className={styles.pill}>
            {village?.buildings.filter((b) => b.kind === "chat").length ?? 0} chat
            {(village?.buildings.filter((b) => b.kind === "chat").length ?? 0) === 1
              ? ""
              : "s"}
          </span>
          <span className={styles.pill}>
            {village?.buildings.filter((b) => b.kind === "subchat").length ?? 0}{" "}
            sub-chat
            {(village?.buildings.filter((b) => b.kind === "subchat").length ?? 0) ===
            1
              ? ""
              : "s"}
          </span>
          <span className={styles.pill}>
            {agentCount} agent{agentCount === 1 ? "" : "s"}
          </span>
          <span className={styles.pill}>
            {subCount} subagent{subCount === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        <ul className={styles.legend} aria-label="Agent sources">
          {(
            [
              ["cursor", "agent"],
              ["claude", "agent"],
              ["codex", "agent"],
              ["other", "agent"],
              ["cursor", "subagent"],
            ] as const
          ).map(([source, kind]) => (
            <li key={`${source}-${kind}`}>
              <span
                className={styles.swatch}
                style={{ background: agentColor(source, kind) }}
              />
              {kind === "subagent" ? "subagent" : source}
            </li>
          ))}
        </ul>
      </header>

      {loading && !village ? (
        <p className={styles.status}>Scouting the village…</p>
      ) : error && !village ? (
        <p className={styles.status}>{error}</p>
      ) : village ? (
        <>
          <VillageScene3D village={village} />
        </>
      ) : null}
    </main>
  );
}
