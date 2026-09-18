import type { VillageAgent } from "@/lib/schema";
import styles from "./AgentSprite.module.css";

type Props = {
  agent: VillageAgent;
};

export function AgentSprite({ agent }: Props) {
  const title = [
    agent.displayName || agent.agentId,
    agent.source,
    agent.agentKind,
    agent.status,
    agent.title,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`${styles.sprite} ${
        agent.status === "done" ? styles.bobDone : styles.bob
      }`}
      style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
      title={title}
      aria-label={title}
    >
      <span className={styles.head} />
      <span className={styles.hat} style={{ background: agent.color }} />
      <span className={styles.body} style={{ background: agent.color }} />
    </div>
  );
}
