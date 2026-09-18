import type { Building as BuildingModel } from "@/lib/schema";
import styles from "./Building.module.css";

type Props = {
  building: BuildingModel;
  selected: boolean;
  onSelect: (key: string) => void;
};

function progressWidth(stage: BuildingModel["stage"]): string {
  if (stage === "roof") return "100%";
  if (stage === "scaffolding") return "66%";
  return "33%";
}

export function Building({ building, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      className={`${styles.plot} ${selected ? styles.selected : ""}`}
      style={{ left: `${building.x}%`, top: `${building.y}%` }}
      onClick={() => onSelect(building.key)}
      aria-pressed={selected}
      aria-label={`Building ${building.label}`}
    >
      <div className={styles.iso}>
        <div className={styles.base} />
        {(building.stage === "scaffolding" || building.stage === "roof") && (
          <div className={styles.wall} />
        )}
        {building.stage === "scaffolding" && (
          <div className={styles.scaffold} aria-hidden />
        )}
        {building.stage === "roof" && <div className={styles.roof} />}
        <div className={styles.progress}>
          <span
            className={styles.fill}
            style={{ width: progressWidth(building.stage) }}
          />
        </div>
      </div>
      <span className={styles.label}>{building.label}</span>
    </button>
  );
}
