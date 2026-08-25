// Shared contracts for the 2D pixel office (Gather-style renderer).
// Everything here is pure data — no Phaser or React imports — so the art,
// map, and simulation modules stay unit-testable in jsdom/node.

// ---------------------------------------------------------------------------
// Pixel art
// ---------------------------------------------------------------------------

/**
 * A pixel sprite described as character rows. Each character indexes into the
 * palette; "." and " " mean transparent. Rows may have differing lengths —
 * missing trailing cells are transparent.
 */
export type PixelSprite = {
  /** Unique texture key, e.g. "tile_floor_cream" or "furn_desk". */
  key: string;
  rows: string[];
  /** Char -> "#rrggbb" or "#rrggbbaa". */
  palette: Record<string, string>;
};

/** Facing directions for characters. */
export type PixelFacing = "down" | "up" | "left" | "right";

/**
 * Frame names produced by the character generator. Walk cycles are 3-frame
 * (idle acts as the middle frame): idle_X, walk_X_a, walk_X_b.
 */
export type CharacterFrameName =
  | "idle_down"
  | "walk_down_a"
  | "walk_down_b"
  | "idle_up"
  | "walk_up_a"
  | "walk_up_b"
  | "idle_left"
  | "walk_left_a"
  | "walk_left_b"
  | "idle_right"
  | "walk_right_a"
  | "walk_right_b"
  | "sit_down"
  | "sit_up"
  | "sit_left"
  | "sit_right"
  | "dance_a"
  | "dance_b";

/** Deterministic appearance derived from an agent's id + accent color. */
export type CharacterLook = {
  /** Stable seed (agent id). */
  seed: string;
  /** Accent color from the agent roster ("#rrggbb"); used for the shirt. */
  accentColor: string;
};

export const CHARACTER_WIDTH = 16;
export const CHARACTER_HEIGHT = 24;

/** All frames for a single character, keyed by frame name. */
export type CharacterFrameSet = Record<CharacterFrameName, PixelSprite>;

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

export const PIXEL_TILE_SIZE = 16;

/** Ground tile ids paintable in the ASCII grid. */
export type PixelGroundTile =
  | "grass"
  | "grass_dark"
  | "path"
  | "floor_cream"
  | "floor_white"
  | "floor_wood"
  | "carpet_purple"
  | "carpet_blue"
  | "kitchen_tile"
  | "gym_mat"
  | "server_floor"
  | "wall"
  | "void";

/** Furniture / decor object kinds the art module must provide sprites for. */
export type PixelObjectKind =
  | "desk"
  | "desk_monitor"
  | "chair"
  | "meeting_table"
  | "sofa_h"
  | "sofa_v"
  | "coffee_table"
  | "plant"
  | "plant_tall"
  | "bookshelf"
  | "kitchen_counter"
  | "fridge"
  | "coffee_machine"
  | "water_cooler"
  | "vending_machine"
  | "ping_pong_table"
  | "arcade"
  | "jukebox"
  | "kanban_board"
  | "phone_booth"
  | "sms_booth"
  | "treadmill"
  | "dumbbell_rack"
  | "server_rack"
  | "tv_stand"
  | "whiteboard"
  | "rug"
  | "tree"
  | "flower"
  | "atm"
  | "lamp"
  | "aquarium";

export type PixelMapObject = {
  id: string;
  kind: PixelObjectKind;
  /** Tile coordinates of the object's top-left tile. */
  tx: number;
  ty: number;
  /**
   * Whether the object blocks the nav grid. Defaults per kind; may be
   * overridden (e.g. rugs never block).
   */
  blocking?: boolean;
};

export type PixelZoneKind =
  | "team_pod"
  | "meeting"
  | "lounge"
  | "kitchen"
  | "library"
  | "game_room"
  | "gym"
  | "phone"
  | "server"
  | "focus"
  | "outdoor";

export type PixelZone = {
  id: string;
  kind: PixelZoneKind;
  label: string | null;
  /** Tile-rect bounds (inclusive of tx/ty, exclusive of tx+tw/ty+th). */
  tx: number;
  ty: number;
  tw: number;
  th: number;
};

/** A desk an agent can be assigned to. */
export type PixelDeskSlot = {
  id: string;
  /** Tile of the desk object itself. */
  deskTx: number;
  deskTy: number;
  /** Tile the agent stands/sits on while working. */
  seatTx: number;
  seatTy: number;
  /** Which way the seated agent faces. */
  facing: PixelFacing;
};

/** Stations agents visit for animation holds and idle wandering. */
export type PixelStationKind =
  | "gym"
  | "phone_booth"
  | "sms_booth"
  | "qa_lab"
  | "github_desk"
  | "jukebox"
  | "kanban"
  | "coffee"
  | "water_cooler"
  | "lounge_seat"
  | "ping_pong"
  | "arcade"
  | "meeting_seat"
  | "library"
  | "wander";

export type PixelStation = {
  id: string;
  kind: PixelStationKind;
  /** Tile the agent occupies when using the station. */
  tx: number;
  ty: number;
  facing: PixelFacing;
};

export type PixelOfficeMap = {
  /** Grid dimensions in tiles. */
  cols: number;
  rows: number;
  /** Ground tile per cell, row-major. */
  ground: PixelGroundTile[];
  objects: PixelMapObject[];
  zones: PixelZone[];
  desks: PixelDeskSlot[];
  stations: PixelStation[];
  /** Where new agents appear before walking to their spot. */
  spawn: { tx: number; ty: number };
};

/** Object kinds that block movement by default. */
export const BLOCKING_OBJECT_KINDS: ReadonlySet<PixelObjectKind> = new Set([
  "desk",
  "desk_monitor",
  "meeting_table",
  "sofa_h",
  "sofa_v",
  "coffee_table",
  "plant",
  "plant_tall",
  "bookshelf",
  "kitchen_counter",
  "fridge",
  "coffee_machine",
  "water_cooler",
  "vending_machine",
  "ping_pong_table",
  "arcade",
  "jukebox",
  "kanban_board",
  "treadmill",
  "dumbbell_rack",
  "server_rack",
  "tv_stand",
  "whiteboard",
  "tree",
  "atm",
  "lamp",
  "aquarium",
]);

/** Footprint in tiles for each object kind: [width, height]. */
export const OBJECT_FOOTPRINT: Readonly<Record<PixelObjectKind, [number, number]>> = {
  desk: [2, 1],
  desk_monitor: [2, 1],
  chair: [1, 1],
  meeting_table: [3, 2],
  sofa_h: [2, 1],
  sofa_v: [1, 2],
  coffee_table: [1, 1],
  plant: [1, 1],
  plant_tall: [1, 1],
  bookshelf: [2, 1],
  kitchen_counter: [2, 1],
  fridge: [1, 1],
  coffee_machine: [1, 1],
  water_cooler: [1, 1],
  vending_machine: [1, 1],
  ping_pong_table: [3, 2],
  arcade: [1, 1],
  jukebox: [1, 1],
  kanban_board: [2, 1],
  phone_booth: [1, 1],
  sms_booth: [1, 1],
  treadmill: [1, 2],
  dumbbell_rack: [2, 1],
  server_rack: [1, 1],
  tv_stand: [2, 1],
  whiteboard: [2, 1],
  rug: [2, 2],
  tree: [2, 2],
  flower: [1, 1],
  atm: [1, 1],
  lamp: [1, 1],
  aquarium: [2, 1],
};

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** What a Hermes agent currently looks like to the pixel office. */
export type PixelAgentInput = {
  id: string;
  name: string;
  status: "working" | "idle" | "error";
  color: string;
  /** True while the agent streams tokens (drives speech bubble). */
  streaming: boolean;
  /** True while the agent is in a reasoning/thinking stretch. */
  thinking: boolean;
  /** True while the agent waits for a human approval. */
  awaitingApproval: boolean;
  /** True until the timestamp while a dance trigger is active. */
  dancing: boolean;
  /** Active hold routing the agent to a station (highest priority first). */
  hold:
    | "phone_booth"
    | "sms_booth"
    | "gym"
    | "qa_lab"
    | "github_desk"
    | "jukebox"
    | "kanban"
    | null;
  /** True when a standup meeting is gathering everyone. */
  standup: boolean;
};

export type PixelAgentActivity =
  | "sitting_desk"
  | "walking"
  | "standing"
  | "station"
  | "dancing"
  | "meeting";

/** Live pose of one agent inside the pixel office. */
export type PixelAgentPose = {
  id: string;
  /** World position in pixels. */
  x: number;
  y: number;
  facing: PixelFacing;
  activity: PixelAgentActivity;
  /** True while mid-path (drives the walk animation). */
  moving: boolean;
  /** Station id when activity === "station". */
  stationId: string | null;
  /** Desk slot id when the agent has an assigned desk. */
  deskId: string | null;
};

export type PixelSimAgentState = {
  id: string;
  x: number;
  y: number;
  facing: PixelFacing;
  /** Remaining waypoints in world pixels. */
  path: Array<{ x: number; y: number }>;
  /** What the agent is currently doing or heading to do. */
  goalKind:
    | "desk"
    | "station"
    | "wander"
    | "meeting"
    | "dance"
    | "idle_pause";
  /** Station id for station goals. */
  goalStationId: string | null;
  deskId: string | null;
  /** Epoch ms until which the agent pauses before picking a new wander target. */
  pauseUntil: number;
  /** True once the agent reached its goal tile. */
  arrived: boolean;
};

export type PixelSimState = {
  agents: Record<string, PixelSimAgentState>;
  /** Deterministic desk assignment: agentId -> desk slot id. */
  deskByAgentId: Record<string, string>;
  /** Janitor NPC state, present while cleaning cues are active. */
  janitor: PixelSimAgentState | null;
};
