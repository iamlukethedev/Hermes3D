// Pure agent-behavior simulation for the 2D pixel office. No Phaser or React
// imports, so the logic stays unit-testable in node/jsdom. The scene layer
// feeds PixelAgentInput[] in and renders the returned PixelAgentPose[].

import { astar2D } from "@/lib/office/pathfinding";
import { buildPixelNavGrid, tileCenter } from "@/features/pixel-office/map/navGrid";
import {
  PIXEL_TILE_SIZE,
  type PixelAgentActivity,
  type PixelAgentInput,
  type PixelAgentPose,
  type PixelFacing,
  type PixelOfficeMap,
  type PixelSimAgentState,
  type PixelSimState,
  type PixelStation,
  type PixelStationKind,
} from "@/features/pixel-office/types";

export type PixelSimulation = {
  tick: (params: {
    inputs: PixelAgentInput[];
    nowMs: number;
    dtMs: number;
    cleaningActive: boolean;
  }) => PixelAgentPose[];
  /** Exposes internal state for tests/debugging. */
  getState: () => PixelSimState;
};

export const JANITOR_ID = "npc-janitor";

// Walking speeds in world pixels per second (~5.6 and ~4.4 tiles/s).
const AGENT_SPEED = 180;
const JANITOR_SPEED = 140;
// Movement dt is capped so a sleeping tab does not teleport agents on resume.
const MAX_STEP_MS = 100;
// Idle wanderers pause 4-10 seconds at a station before picking a new one.
const IDLE_PAUSE_MIN_MS = 4000;
const IDLE_PAUSE_RANGE_MS = 6000;
// The janitor pauses briefly at each wander spot while cleaning.
const JANITOR_PAUSE_MS = 2000;

/** Station kinds idle agents wander between. */
const IDLE_STATION_KINDS: readonly PixelStationKind[] = [
  "coffee",
  "water_cooler",
  "lounge_seat",
  "library",
  "ping_pong",
  "arcade",
  "wander",
];

type HoldKind = NonNullable<PixelAgentInput["hold"]>;

/** Hold cue -> station kind the agent should walk to. */
const HOLD_TO_STATION_KIND: Readonly<Record<HoldKind, PixelStationKind>> = {
  phone_booth: "phone_booth",
  sms_booth: "sms_booth",
  gym: "gym",
  qa_lab: "qa_lab",
  github_desk: "github_desk",
  jukebox: "jukebox",
  kanban: "kanban",
};

/** Sim agent state plus private bookkeeping the public contract omits. */
type InternalAgentState = PixelSimAgentState & {
  /** Seeded per-agent PRNG so wandering is deterministic in tests. */
  rng: () => number;
  /** Hold currently being serviced; keeps the chosen station sticky. */
  holdKind: PixelAgentInput["hold"];
  /** Exact world target and its tile, used to detect goal changes. */
  targetX: number;
  targetY: number;
  targetTx: number;
  targetTy: number;
  /** Facing to snap to on arrival (station/desk facing). */
  targetFacing: PixelFacing;
  /** Last wander station, excluded from the next random pick. */
  lastStationId: string | null;
  /** Janitor-only cursor into the wander station cycle. */
  wanderIndex: number;
};

const hashString = (value: string): number => {
  // FNV-1a keeps the seed stable and well-distributed across agent ids.
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const createPixelSimulation = (map: PixelOfficeMap): PixelSimulation => {
  const navGrid = buildPixelNavGrid(map);
  const stationById = new Map<string, PixelStation>(
    map.stations.map((stationSlot) => [stationSlot.id, stationSlot]),
  );
  const stationsByKind = new Map<PixelStationKind, PixelStation[]>();
  for (const stationSlot of map.stations) {
    const bucket = stationsByKind.get(stationSlot.kind);
    if (bucket) bucket.push(stationSlot);
    else stationsByKind.set(stationSlot.kind, [stationSlot]);
  }
  const wanderStations = stationsByKind.get("wander") ?? [];
  const idleStations = map.stations.filter((stationSlot) =>
    IDLE_STATION_KINDS.includes(stationSlot.kind),
  );
  const deskById = new Map(map.desks.map((deskSlot) => [deskSlot.id, deskSlot]));
  const spawnCenter = tileCenter(map.spawn.tx, map.spawn.ty);

  const state: {
    agents: Record<string, InternalAgentState>;
    deskByAgentId: Record<string, string>;
    janitor: InternalAgentState | null;
  } = {
    agents: {},
    deskByAgentId: {},
    janitor: null,
  };

  const createAgentState = (id: string): InternalAgentState => ({
    id,
    x: spawnCenter.x,
    y: spawnCenter.y,
    facing: "down",
    path: [],
    goalKind: "wander",
    goalStationId: null,
    deskId: null,
    pauseUntil: 0,
    arrived: false,
    rng: mulberry32(hashString(id)),
    holdKind: null,
    targetX: spawnCenter.x,
    targetY: spawnCenter.y,
    // Sentinel target tile so the first real goal always triggers a repath.
    targetTx: -1,
    targetTy: -1,
    targetFacing: "down",
    lastStationId: null,
    wanderIndex: 0,
  });

  /** True when another agent currently targets or sits on the station. */
  const isStationOccupied = (stationId: string, selfId: string): boolean => {
    for (const other of Object.values(state.agents)) {
      if (other.id !== selfId && other.goalStationId === stationId) return true;
    }
    return false;
  };

  const distanceSq = (agent: InternalAgentState, stationSlot: PixelStation): number => {
    const center = tileCenter(stationSlot.tx, stationSlot.ty);
    const dx = center.x - agent.x;
    const dy = center.y - agent.y;
    return dx * dx + dy * dy;
  };

  /** Nearest station, preferring unoccupied; map order breaks distance ties. */
  const pickNearestStation = (
    agent: InternalAgentState,
    candidates: PixelStation[],
  ): PixelStation | null => {
    const free = candidates.filter(
      (stationSlot) => !isStationOccupied(stationSlot.id, agent.id),
    );
    const pool = free.length > 0 ? free : candidates;
    let best: PixelStation | null = null;
    let bestDistance = Infinity;
    for (const stationSlot of pool) {
      const distance = distanceSq(agent, stationSlot);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = stationSlot;
      }
    }
    return best;
  };

  /** Random idle station via the agent's seeded RNG, preferring unoccupied. */
  const pickRandomIdleStation = (agent: InternalAgentState): PixelStation | null => {
    const withoutLast = idleStations.filter(
      (stationSlot) => stationSlot.id !== agent.lastStationId,
    );
    const candidates = withoutLast.length > 0 ? withoutLast : idleStations;
    const free = candidates.filter(
      (stationSlot) => !isStationOccupied(stationSlot.id, agent.id),
    );
    const pool = free.length > 0 ? free : candidates;
    if (pool.length === 0) return null;
    return pool[Math.min(pool.length - 1, Math.floor(agent.rng() * pool.length))];
  };

  /** Records the goal point and repaths only when the target tile changed. */
  const setTarget = (
    agent: InternalAgentState,
    x: number,
    y: number,
    facing: PixelFacing,
  ) => {
    const targetTx = Math.floor(x / PIXEL_TILE_SIZE);
    const targetTy = Math.floor(y / PIXEL_TILE_SIZE);
    agent.targetX = x;
    agent.targetY = y;
    agent.targetFacing = facing;
    if (targetTx !== agent.targetTx || targetTy !== agent.targetTy) {
      agent.targetTx = targetTx;
      agent.targetTy = targetTy;
      agent.arrived = false;
      agent.path = astar2D(agent.x, agent.y, x, y, navGrid);
    } else if (!agent.arrived && agent.path.length === 0) {
      // Retry unreachable goals; astar2D returned an empty path last time.
      agent.path = astar2D(agent.x, agent.y, x, y, navGrid);
    }
  };

  /** Parks the agent in place (used for dancing and missing stations). */
  const holdPosition = (agent: InternalAgentState) => {
    agent.path = [];
    agent.arrived = true;
    // Invalidate the target tile so the next real goal always repaths.
    agent.targetTx = -1;
    agent.targetTy = -1;
    agent.targetX = agent.x;
    agent.targetY = agent.y;
  };

  const resolveWander = (agent: InternalAgentState, nowMs: number) => {
    if (agent.goalKind !== "wander" && agent.goalKind !== "idle_pause") {
      agent.goalKind = "wander";
      agent.goalStationId = null;
      agent.pauseUntil = 0;
    }
    if (agent.goalStationId && agent.arrived) {
      if (agent.pauseUntil === 0) {
        agent.pauseUntil =
          nowMs + IDLE_PAUSE_MIN_MS + agent.rng() * IDLE_PAUSE_RANGE_MS;
        agent.goalKind = "idle_pause";
      } else if (nowMs >= agent.pauseUntil) {
        agent.lastStationId = agent.goalStationId;
        agent.goalStationId = null;
        agent.pauseUntil = 0;
        agent.goalKind = "wander";
      }
    }
    if (!agent.goalStationId) {
      const pick = pickRandomIdleStation(agent);
      agent.goalStationId = pick?.id ?? null;
    }
    const stationSlot = agent.goalStationId
      ? stationById.get(agent.goalStationId)
      : undefined;
    if (stationSlot) {
      const center = tileCenter(stationSlot.tx, stationSlot.ty);
      setTarget(agent, center.x, center.y, stationSlot.facing);
    } else {
      holdPosition(agent);
    }
  };

  const resolveGoal = (
    agent: InternalAgentState,
    input: PixelAgentInput,
    nowMs: number,
  ) => {
    // Priority a: an active hold routes the agent to a matching station.
    if (input.hold) {
      if (agent.holdKind !== input.hold || agent.goalKind !== "station") {
        agent.holdKind = input.hold;
        agent.goalKind = "station";
        agent.pauseUntil = 0;
        const candidates = stationsByKind.get(HOLD_TO_STATION_KIND[input.hold]) ?? [];
        agent.goalStationId = pickNearestStation(agent, candidates)?.id ?? null;
      }
      const stationSlot = agent.goalStationId
        ? stationById.get(agent.goalStationId)
        : undefined;
      if (stationSlot) {
        const center = tileCenter(stationSlot.tx, stationSlot.ty);
        setTarget(agent, center.x, center.y, stationSlot.facing);
      } else {
        holdPosition(agent);
      }
      return;
    }
    agent.holdKind = null;

    // Priority b: standup gathers everyone at meeting seats.
    if (input.standup) {
      if (agent.goalKind !== "meeting" || !agent.goalStationId) {
        agent.goalKind = "meeting";
        agent.pauseUntil = 0;
        const seats = stationsByKind.get("meeting_seat") ?? [];
        agent.goalStationId = pickNearestStation(agent, seats)?.id ?? null;
      }
      const stationSlot = agent.goalStationId
        ? stationById.get(agent.goalStationId)
        : undefined;
      if (stationSlot) {
        const center = tileCenter(stationSlot.tx, stationSlot.ty);
        setTarget(agent, center.x, center.y, stationSlot.facing);
      } else {
        holdPosition(agent);
      }
      return;
    }
    if (agent.goalKind === "meeting") {
      // Release the meeting seat once the standup ends.
      agent.goalStationId = null;
    }

    // Priority c: dancing happens in place.
    if (input.dancing) {
      agent.goalKind = "dance";
      agent.goalStationId = null;
      holdPosition(agent);
      return;
    }

    // Priority d: working/error agents head to their assigned desk seat.
    if (input.status === "working" || input.status === "error") {
      const deskId = state.deskByAgentId[input.id];
      const deskSlot = deskId ? deskById.get(deskId) : undefined;
      if (deskSlot) {
        if (agent.goalKind !== "desk") {
          agent.goalKind = "desk";
          agent.goalStationId = null;
          agent.pauseUntil = 0;
        }
        const seat = tileCenter(deskSlot.seatTx, deskSlot.seatTy);
        setTarget(agent, seat.x, seat.y, deskSlot.facing);
        return;
      }
      // No free desk: fall through to wander behavior.
    }

    // Priority e: idle agents wander between break stations.
    resolveWander(agent, nowMs);
  };

  const moveAgent = (agent: InternalAgentState, stepMs: number, speed: number) => {
    if (agent.arrived) return;
    let budget = speed * (stepMs / 1000);
    while (budget > 0 && agent.path.length > 0) {
      const waypoint = agent.path[0];
      const dx = waypoint.x - agent.x;
      const dy = waypoint.y - agent.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1e-6) {
        agent.path.shift();
        continue;
      }
      // Face along the dominant axis of the current path segment.
      agent.facing =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up";
      if (distance <= budget) {
        agent.x = waypoint.x;
        agent.y = waypoint.y;
        budget -= distance;
        agent.path.shift();
      } else {
        agent.x += (dx / distance) * budget;
        agent.y += (dy / distance) * budget;
        budget = 0;
      }
    }
    if (agent.path.length === 0) {
      const dx = agent.targetX - agent.x;
      const dy = agent.targetY - agent.y;
      if (Math.hypot(dx, dy) < 0.5) {
        // Snap exactly onto the goal and adopt the station/desk facing.
        agent.x = agent.targetX;
        agent.y = agent.targetY;
        agent.arrived = true;
        agent.facing = agent.targetFacing;
      }
    }
  };

  const activityFor = (agent: InternalAgentState): PixelAgentActivity => {
    if (agent.goalKind === "dance") return "dancing";
    if (!agent.arrived && agent.path.length > 0) return "walking";
    if (!agent.arrived) return "standing";
    switch (agent.goalKind) {
      case "desk":
        return "sitting_desk";
      case "meeting":
        return "meeting";
      case "station":
      case "wander":
      case "idle_pause": {
        const stationSlot = agent.goalStationId
          ? stationById.get(agent.goalStationId)
          : undefined;
        if (!stationSlot) return "standing";
        return stationSlot.kind === "wander" ? "standing" : "station";
      }
      default:
        return "standing";
    }
  };

  const poseFor = (agent: InternalAgentState): PixelAgentPose => ({
    id: agent.id,
    x: agent.x,
    y: agent.y,
    facing: agent.facing,
    activity: activityFor(agent),
    moving: agent.goalKind !== "dance" && !agent.arrived && agent.path.length > 0,
    stationId: agent.goalStationId,
    deskId: state.deskByAgentId[agent.id] ?? null,
  });

  const updateJanitor = (nowMs: number, stepMs: number, cleaningActive: boolean) => {
    if (cleaningActive) {
      if (!state.janitor) {
        state.janitor = createAgentState(JANITOR_ID);
      }
      const janitor = state.janitor;
      if (wanderStations.length === 0) {
        holdPosition(janitor);
        return;
      }
      if (janitor.arrived && janitor.goalStationId) {
        if (janitor.pauseUntil === 0) {
          janitor.pauseUntil = nowMs + JANITOR_PAUSE_MS;
        } else if (nowMs >= janitor.pauseUntil) {
          janitor.wanderIndex = (janitor.wanderIndex + 1) % wanderStations.length;
          janitor.pauseUntil = 0;
        }
      }
      const stationSlot = wanderStations[janitor.wanderIndex];
      janitor.goalKind = "wander";
      janitor.goalStationId = stationSlot.id;
      const center = tileCenter(stationSlot.tx, stationSlot.ty);
      setTarget(janitor, center.x, center.y, stationSlot.facing);
      moveAgent(janitor, stepMs, JANITOR_SPEED);
      return;
    }
    if (!state.janitor) return;
    const janitor = state.janitor;
    janitor.goalKind = "wander";
    janitor.goalStationId = null;
    janitor.pauseUntil = 0;
    setTarget(janitor, spawnCenter.x, spawnCenter.y, "down");
    moveAgent(janitor, stepMs, JANITOR_SPEED);
    if (janitor.arrived) {
      // Back at the spawn door: the janitor leaves the office.
      state.janitor = null;
    }
  };

  const tick = ({
    inputs,
    nowMs,
    dtMs,
    cleaningActive,
  }: {
    inputs: PixelAgentInput[];
    nowMs: number;
    dtMs: number;
    cleaningActive: boolean;
  }): PixelAgentPose[] => {
    const stepMs = Math.min(Math.max(dtMs, 0), MAX_STEP_MS);

    // Roster sync: drop absent agents and free their desks.
    const inputIds = new Set(inputs.map((input) => input.id));
    for (const id of Object.keys(state.agents)) {
      if (!inputIds.has(id)) {
        delete state.agents[id];
        delete state.deskByAgentId[id];
      }
    }

    // Iterate agents sorted by id so assignments and picks are deterministic.
    const sortedInputs = [...inputs].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    for (const input of sortedInputs) {
      if (!state.agents[input.id]) {
        state.agents[input.id] = createAgentState(input.id);
      }
    }

    // Sticky desk assignment: first free desk in map order, agents by id.
    for (const input of sortedInputs) {
      if (input.status !== "working" && input.status !== "error") continue;
      if (state.deskByAgentId[input.id]) continue;
      const used = new Set(Object.values(state.deskByAgentId));
      const freeDesk = map.desks.find((deskSlot) => !used.has(deskSlot.id));
      if (freeDesk) state.deskByAgentId[input.id] = freeDesk.id;
    }

    for (const input of sortedInputs) {
      const agent = state.agents[input.id];
      agent.deskId = state.deskByAgentId[input.id] ?? null;
      resolveGoal(agent, input, nowMs);
      moveAgent(agent, stepMs, AGENT_SPEED);
    }

    updateJanitor(nowMs, stepMs, cleaningActive);

    const poses = inputs.map((input) => poseFor(state.agents[input.id]));
    if (state.janitor) poses.push(poseFor(state.janitor));
    return poses;
  };

  return {
    tick,
    getState: () => state,
  };
};
