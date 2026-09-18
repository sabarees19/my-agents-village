"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Float, OrbitControls, Sky, Text } from "@react-three/drei";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MOUSE, PCFShadowMap, TOUCH, Vector3, type Group } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type {
  Building as BuildingModel,
  VillageAgent,
  VillageState,
} from "@/lib/schema";
import styles from "./VillageScene3D.module.css";

type Props = {
  village: VillageState;
};

function pctToWorld(x: number, y: number): [number, number, number] {
  // Wider world units so % gaps between chats feel spacious.
  const wx = (x - 50) * 0.45;
  const wz = (y - 50) * 0.45;
  return [wx, 0, wz];
}

function villageGroundBounds(
  village: VillageState,
): { cx: number; cz: number; size: number } {
  const points: Array<[number, number]> = [
    pctToWorld(village.hut.x, village.hut.y),
    pctToWorld(village.wipYard.x, village.wipYard.y),
  ].map(([x, , z]) => [x, z] as [number, number]);

  for (const b of village.buildings) {
    const [x, , z] = pctToWorld(b.x, b.y);
    points.push([x, z]);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  const pad = 18;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const size = Math.max(maxX - minX, maxZ - minZ, 40) + pad * 2;
  return { cx, cz, size };
}

function FocusOnSelection({
  focus,
  controlsRef,
}: {
  focus: Vector3 | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const goalCam = useRef(new Vector3());
  const animating = useRef(false);

  useEffect(() => {
    if (!focus) {
      animating.current = false;
      return;
    }
    animating.current = true;
    // Isometric-ish offset — pull in close to the building.
    goalCam.current.set(focus.x + 4.2, 6.2, focus.z + 5.2);
  }, [focus]);

  useFrame(() => {
    if (!animating.current || !focus || !controlsRef.current) return;
    const controls = controlsRef.current;
    controls.target.lerp(focus, 0.12);
    camera.position.lerp(goalCam.current, 0.1);
    controls.update();

    const closeEnough =
      camera.position.distanceTo(goalCam.current) < 0.15 &&
      controls.target.distanceTo(focus) < 0.12;
    if (closeEnough) animating.current = false;
  });

  return null;
}

function BuildingMesh({
  building,
  selected,
  onSelect,
}: {
  building: BuildingModel;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  const [x, , z] = pctToWorld(building.x, building.y);
  const scale =
    building.size === "sm" ? 0.55 : building.size === "md" ? 0.85 : 1;
  const height =
    (building.stage === "roof" ? 1.6 : building.stage === "scaffolding" ? 1.1 : 0.55) *
    (building.kind === "subchat" ? 0.85 : 1);
  const roofColor =
    building.kind === "subchat"
      ? "#63b3ed"
      : building.stage === "roof"
        ? "#e53e3e"
        : building.stage === "scaffolding"
          ? "#ed8936"
          : "#d69e2e";
  const wallColor = selected
    ? "#f6e05e"
    : building.kind === "subchat"
      ? "#bee3f8"
      : "#cbd5e0";

  return (
    <group
      position={[x, 0, z]}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(building.key);
      }}
    >
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[1.8, 0.16, 1.8]} />
        <meshStandardMaterial color="#8b5a2b" />
      </mesh>
      <mesh position={[0, height / 2 + 0.08, 0]} castShadow>
        <boxGeometry args={[1.2, height, 1.2]} />
        <meshStandardMaterial
          color={wallColor}
          metalness={0.05}
          roughness={0.75}
        />
      </mesh>
      {building.stage === "scaffolding" && (
        <mesh position={[0, height + 0.25, 0]}>
          <boxGeometry args={[1.35, 0.08, 1.35]} />
          <meshStandardMaterial color="#dd6b20" wireframe />
        </mesh>
      )}
      {(building.stage === "roof" || building.kind === "subchat") && (
        <mesh position={[0, height + 0.35, 0]} castShadow>
          <coneGeometry args={[1.05, 0.7, 4]} />
          <meshStandardMaterial color={roofColor} />
        </mesh>
      )}
      <Float speed={1.4} floatIntensity={0.15} rotationIntensity={0.05}>
        <Text
          position={[0, height + (building.stage === "roof" ? 1.1 : 0.85), 0]}
          fontSize={building.kind === "subchat" ? 0.22 : 0.28}
          color="#1a362a"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#fffcf0"
          maxWidth={2.4}
        >
          {building.label}
        </Text>
      </Float>
    </group>
  );
}

function BuilderHut({
  hut,
  restingCount,
  onSelect,
  selected,
}: {
  hut: { x: number; y: number };
  restingCount: number;
  onSelect: () => void;
  selected: boolean;
}) {
  const [x, , z] = pctToWorld(hut.x, hut.y);
  return (
    <group
      position={[x, 0, z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[2.2, 2.4, 0.2, 20]} />
        <meshStandardMaterial color="#6b4f2a" />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[2.4, 1.5, 2.1]} />
        <meshStandardMaterial
          color={selected ? "#f6e05e" : "#c4a484"}
          roughness={0.85}
        />
      </mesh>
      <mesh position={[0, 1.95, 0]} castShadow>
        <coneGeometry args={[1.9, 1.2, 4]} />
        <meshStandardMaterial color="#8b3a2a" />
      </mesh>
      <mesh position={[0, 0.55, 1.05]}>
        <boxGeometry args={[0.55, 0.9, 0.12]} />
        <meshStandardMaterial color="#4a3728" />
      </mesh>
      <Text
        position={[0, 2.85, 0]}
        fontSize={0.32}
        color="#1a362a"
        anchorX="center"
        outlineWidth={0.02}
        outlineColor="#fffcf0"
      >
        Builders Hut
      </Text>
      <Text
        position={[0, 2.45, 0]}
        fontSize={0.22}
        color="#2f4f3e"
        anchorX="center"
        outlineWidth={0.015}
        outlineColor="#fffcf0"
      >
        {restingCount} resting
      </Text>
    </group>
  );
}

function AgentFigure({
  agent,
  hutWorld,
}: {
  agent: VillageAgent;
  hutWorld: Vector3;
}) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const hammer = useRef<Group>(null);
  const pos = useRef(new Vector3());
  const initialized = useRef(false);
  const prevStatus = useRef(agent.status);
  const [insideHut, setInsideHut] = useState(agent.status !== "building");
  const [working, setWorking] = useState(agent.status === "building");
  const doneTimer = useRef<number | null>(null);

  const isSub = agent.agentKind === "subagent";
  const scale = isSub ? 0.72 : 1;

  // Worksite stays on the chat building even after status flips to done.
  const workTarget = useMemo(() => {
    const [wx, , wz] = pctToWorld(agent.workX, agent.workY);
    return new Vector3(wx, 0, wz);
  }, [agent.workX, agent.workY]);

  // Debounce "done" so brief API gaps mid-tool-call don't send the figure home.
  useEffect(() => {
    if (agent.status === "building") {
      if (doneTimer.current) {
        window.clearTimeout(doneTimer.current);
        doneTimer.current = null;
      }
      setWorking(true);
      return;
    }
    // Subagents home quickly; parents after a short confirm.
    const delay = isSub ? 1_500 : 4_000;
    doneTimer.current = window.setTimeout(() => {
      setWorking(false);
      doneTimer.current = null;
    }, delay);
    return () => {
      if (doneTimer.current) {
        window.clearTimeout(doneTimer.current);
        doneTimer.current = null;
      }
    };
  }, [agent.status, isSub]);

  useEffect(() => {
    if (!initialized.current) {
      if (working) {
        pos.current.copy(workTarget);
        setInsideHut(false);
      } else {
        // Already done on first paint — start at hut (already resting).
        pos.current.copy(hutWorld);
        setInsideHut(true);
      }
      initialized.current = true;
    }
  }, [working, workTarget, hutWorld]);

  useEffect(() => {
    const wasWorking = prevStatus.current === "building";
    if (wasWorking && !working) {
      // Just finished → leave hut closed and walk from worksite to hut.
      setInsideHut(false);
      // If a poll jumped us, ensure we leave from the chat plot.
      if (pos.current.distanceTo(hutWorld) < 1.2) {
        pos.current.copy(workTarget);
      }
    }
    if (working) {
      setInsideHut(false);
    }
    prevStatus.current = agent.status;
  }, [agent.status, working, hutWorld, workTarget]);

  useFrame((state, dt) => {
    if (!root.current) return;
    const goal = working ? workTarget : hutWorld;
    // Walk home a bit faster so “done → hut” is obvious.
    const speed = working ? 2.4 : 2.8;
    pos.current.lerp(goal, Math.min(1, dt * speed));
    root.current.position.set(pos.current.x, 0, pos.current.z);

    const dist = pos.current.distanceTo(goal);
    const moving = dist > 0.12;

    if (!working && dist < 0.55) {
      setInsideHut(true);
    }

    const t = state.clock.elapsedTime;
    if (body.current) {
      const bob = working
        ? Math.sin(t * 7 + agent.workX) * 0.08
        : moving
          ? Math.abs(Math.sin(t * 10)) * 0.1
          : 0;
      body.current.position.y = bob;
      if (moving) {
        const dir = goal.clone().sub(pos.current);
        if (dir.lengthSq() > 0.0001) {
          root.current.rotation.y = Math.atan2(dir.x, dir.z);
        }
      } else if (working) {
        body.current.rotation.y = Math.sin(t * 2) * 0.2;
      }
    }
    if (hammer.current) {
      hammer.current.visible = working && !moving;
      if (working && !moving) {
        hammer.current.rotation.z = -0.4 + Math.sin(t * 10) * 0.55;
      }
    }
  });

  if (insideHut && !working) return null;

  return (
    <group ref={root} scale={scale}>
      <group ref={body}>
        <mesh position={[-0.12, 0.22, 0]} castShadow>
          <capsuleGeometry args={[0.06, 0.18, 4, 8]} />
          <meshStandardMaterial color="#2d3748" />
        </mesh>
        <mesh position={[0.12, 0.22, 0]} castShadow>
          <capsuleGeometry args={[0.06, 0.18, 4, 8]} />
          <meshStandardMaterial color="#2d3748" />
        </mesh>
        <mesh position={[0, 0.55, 0]} castShadow>
          <capsuleGeometry args={[0.18, 0.28, 6, 10]} />
          <meshStandardMaterial
            color={agent.color}
            metalness={0.15}
            roughness={0.45}
          />
        </mesh>
        <mesh position={[0, 0.95, 0]} castShadow>
          <sphereGeometry args={[0.16, 16, 16]} />
          <meshStandardMaterial color="#f6e05e" />
        </mesh>
        <mesh position={[0, 1.08, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.18, 0.1, 12]} />
          <meshStandardMaterial color={agent.color} />
        </mesh>
        <mesh position={[0, 1.04, 0.02]}>
          <boxGeometry args={[0.28, 0.03, 0.22]} />
          <meshStandardMaterial color={agent.color} />
        </mesh>
        <group position={[0.28, 0.55, 0]} ref={hammer}>
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[0.05, 0.36, 0.05]} />
            <meshStandardMaterial color="#8b5a2b" />
          </mesh>
          <mesh position={[0, 0.38, 0]}>
            <boxGeometry args={[0.18, 0.1, 0.1]} />
            <meshStandardMaterial
              color="#4a5568"
              metalness={0.5}
              roughness={0.35}
            />
          </mesh>
        </group>
        {isSub && (
          <mesh position={[0, 1.28, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial
              color="#fff"
              emissive={agent.color}
              emissiveIntensity={0.6}
            />
          </mesh>
        )}
      </group>
      {(working || !insideHut) && (
        <Text
          position={[0, 1.55, 0]}
          fontSize={0.16}
          color="#1a362a"
          anchorX="center"
          outlineWidth={0.015}
          outlineColor="#fffcf0"
          maxWidth={1.8}
        >
          {agent.displayName || agent.title || agent.agentId.slice(0, 8)}
        </Text>
      )}
    </group>
  );
}

function VillageWorld({
  village,
  selectedKey,
  onSelect,
}: {
  village: VillageState;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const hutWorld = useMemo(() => {
    const [x, , z] = pctToWorld(village.hut.x, village.hut.y);
    return new Vector3(x, 0, z);
  }, [village.hut.x, village.hut.y]);

  const focusPoint = useMemo(() => {
    if (!selectedKey) return null;
    if (selectedKey === "HUT") {
      return new Vector3(hutWorld.x, 0.5, hutWorld.z);
    }
    const building = village.buildings.find((b) => b.key === selectedKey);
    if (!building) return null;
    const [x, , z] = pctToWorld(building.x, building.y);
    return new Vector3(x, 0.5, z);
  }, [selectedKey, village.buildings, hutWorld]);

  const restingCount = village.agents.filter((a) => a.status !== "building").length;
  const ground = useMemo(() => villageGroundBounds(village), [village]);

  return (
    <>
      <color attach="background" args={["#87b7ff"]} />
      <Sky sunPosition={[40, 18, 20]} turbidity={4} rayleigh={1.2} />
      <ambientLight intensity={0.55} />
      <directionalLight
        castShadow
        position={[18, 22, 12]}
        intensity={1.35}
        shadow-mapSize={[1024, 1024]}
      />
      {/* Large green field sized to cover every building + hut */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[ground.cx, -0.02, ground.cz]}
        receiveShadow
        onClick={() => onSelect(null)}
      >
        <planeGeometry args={[ground.size, ground.size]} />
        <meshStandardMaterial color="#4caf50" />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[ground.cx, -0.015, ground.cz]}
      >
        <planeGeometry args={[ground.size * 0.72, ground.size * 0.72]} />
        <meshStandardMaterial color="#43a047" />
      </mesh>

      {village.buildings.map((b) => (
        <BuildingMesh
          key={b.key}
          building={b}
          selected={b.key === selectedKey}
          onSelect={onSelect}
        />
      ))}

      <BuilderHut
        hut={village.hut}
        restingCount={restingCount}
        selected={selectedKey === "HUT"}
        onSelect={() => onSelect("HUT")}
      />

      {village.agents.map((a) => (
        <AgentFigure key={a.id} agent={a} hutWorld={hutWorld} />
      ))}

      <ContactShadows
        position={[ground.cx, 0.01, ground.cz]}
        opacity={0.3}
        scale={ground.size}
        blur={2.6}
        far={20}
      />

      <FocusOnSelection focus={focusPoint} controlsRef={controlsRef} />

      {/* Clash-style: one-finger pan, pinch zoom, locked tilt */}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableRotate={false}
        enablePan
        enableZoom
        screenSpacePanning
        minDistance={3}
        maxDistance={Math.max(70, ground.size * 0.9)}
        minPolarAngle={Math.PI / 3.05}
        maxPolarAngle={Math.PI / 3.05}
        target={[ground.cx, 0.4, ground.cz]}
        touches={{
          ONE: TOUCH.PAN,
          TWO: TOUCH.DOLLY_PAN,
        }}
        mouseButtons={{
          LEFT: MOUSE.PAN,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.PAN,
        }}
      />
    </>
  );
}

export function VillageScene3D({ village }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const selectedBuilding = useMemo(
    () => village.buildings.find((b) => b.key === selectedKey) ?? null,
    [village.buildings, selectedKey],
  );

  const hutSelected = selectedKey === "HUT";

  const searchMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const buildings = village.buildings.filter((b) => {
      const hay = `${b.label} ${b.kind} ${b.repo ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    const hutHit =
      "builders hut".includes(q) || "hut".includes(q) || q.includes("hut");
    const items: Array<{ key: string; label: string; kind: string }> = buildings.map(
      (b) => ({
        key: b.key,
        label: b.label,
        kind: b.kind === "subchat" ? "sub-chat" : b.kind,
      }),
    );
    if (hutHit) {
      items.unshift({ key: "HUT", label: "Builders' Hut", kind: "hut" });
    }
    return items.slice(0, 40);
  }, [query, village.buildings]);

  const linkedAgents = useMemo(() => {
    if (hutSelected) {
      return village.agents.filter((a) => a.status !== "building");
    }
    if (!selectedBuilding) return [];
    return village.agents.filter((a) => {
      if (a.status !== "building") return false;
      if (selectedBuilding.key === "WIP") {
        return (
          !a.buildingKey ||
          a.buildingKey === "WIP" ||
          !village.buildings.some((b) => b.key === a.buildingKey)
        );
      }
      return a.buildingKey === selectedBuilding.key;
    });
  }, [hutSelected, selectedBuilding, village.agents, village.buildings]);

  const isEmpty =
    village.buildings.length === 0 && village.agents.length === 0;

  const workingCount = village.agents.filter((a) => a.status === "building").length;
  const restingCount = village.agents.length - workingCount;

  return (
    <div className={styles.wrap}>
      <div className={styles.canvas}>
        {isEmpty ? (
          <p className={styles.empty}>
            No buildings yet today — make a commit or start an agent
          </p>
        ) : (
          <Canvas
            shadows
            camera={{ position: [8, 22, 28], fov: 40, near: 0.1, far: 220 }}
            dpr={[1, 1.75]}
            onCreated={({ gl }) => {
              gl.shadowMap.type = PCFShadowMap;
            }}
          >
            <Suspense fallback={null}>
              <VillageWorld
                village={village}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
              />
            </Suspense>
          </Canvas>
        )}
      </div>

      <aside className={styles.searchPanel}>
        <label className={styles.searchLabel} htmlFor="village-search">
          Search chats
        </label>
        <input
          id="village-search"
          className={styles.searchInput}
          type="search"
          placeholder="Type a chat name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {query.trim() && (
          <ul className={styles.searchList}>
            {searchMatches.length === 0 ? (
              <li className={styles.searchEmpty}>No matches</li>
            ) : (
              searchMatches.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className={`${styles.searchItem} ${
                      selectedKey === item.key ? styles.searchItemActive : ""
                    }`}
                    onClick={() => setSelectedKey(item.key)}
                  >
                    <span className={styles.searchItemLabel}>{item.label}</span>
                    <span className={styles.searchItemKind}>{item.kind}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </aside>

      <div className={styles.hud}>
        <span>{workingCount} working</span>
        <span>{restingCount} in hut</span>
        <span>drag / pinch like CoC</span>
      </div>

      {(selectedBuilding || hutSelected) && (
        <aside className={styles.panel} aria-live="polite">
          <button
            type="button"
            className={styles.close}
            onClick={() => setSelectedKey(null)}
            aria-label="Close panel"
          >
            ×
          </button>
          <h2>{hutSelected ? "Builders' Hut" : selectedBuilding?.label}</h2>
          <p className={styles.meta}>
            {hutSelected
              ? `${restingCount} resting agent${restingCount === 1 ? "" : "s"}`
              : selectedBuilding?.kind === "subchat"
                ? `Sub-chat beside ${selectedBuilding.parentKey?.replace(/^chat:/, "").slice(0, 8) ?? "parent"} · ${selectedBuilding.stage}`
                : selectedBuilding?.kind === "chat"
                  ? `Chat · ${selectedBuilding.repo ?? "agent"} · ${selectedBuilding.stage}`
                  : `${selectedBuilding?.repo ? `${selectedBuilding.repo} · ` : ""}${selectedBuilding?.stage}`}
          </p>

          <p className={styles.sectionTitle}>
            {hutSelected ? "Resting" : "Working here"}
          </p>
          {linkedAgents.length === 0 ? (
            <p className={styles.meta}>
              {hutSelected ? "Hut is empty" : "No builders on this plot"}
            </p>
          ) : (
            <ul className={styles.list}>
              {linkedAgents.map((agent) => (
                <li key={agent.id}>
                  <span style={{ color: agent.color }}>●</span>{" "}
                  {agent.displayName || agent.agentId.slice(0, 8)}{" "}
                  <span className={styles.meta}>
                    ({agent.source}
                    {agent.agentKind === "subagent" ? " subagent" : ""} ·{" "}
                    {agent.status})
                  </span>
                  {agent.title ? ` — ${agent.title}` : ""}
                </li>
              ))}
            </ul>
          )}

          {!hutSelected &&
            selectedBuilding?.kind === "chat" &&
            (() => {
              const kids = village.buildings.filter(
                (b) => b.parentKey === selectedBuilding.key,
              );
              if (kids.length === 0) return null;
              return (
                <>
                  <p className={styles.sectionTitle}>Sub-chats</p>
                  <ul className={styles.list}>
                    {kids.map((b) => (
                      <li key={b.key}>{b.label}</li>
                    ))}
                  </ul>
                </>
              );
            })()}
        </aside>
      )}
    </div>
  );
}
