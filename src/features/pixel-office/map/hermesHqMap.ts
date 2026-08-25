// The default Hermes HQ pixel map: a hand-authored Gather-style office.
// All coordinates are in tiles (16px each). The layout mirrors the immersive
// office's rooms: meeting room, kitchen, team pods, lounge, game corner,
// phone/SMS booths, gym, reading nook, ops corner, and a server room.

import type {
  PixelDeskSlot,
  PixelFacing,
  PixelGroundTile,
  PixelMapObject,
  PixelOfficeMap,
  PixelObjectKind,
  PixelStation,
  PixelStationKind,
  PixelZone,
} from "@/features/pixel-office/types";

export const HQ_COLS = 56;
export const HQ_ROWS = 42;

type Grid = PixelGroundTile[];

const fillRect = (
  ground: Grid,
  tile: PixelGroundTile,
  tx: number,
  ty: number,
  tw: number,
  th: number,
) => {
  for (let y = ty; y < ty + th; y += 1) {
    for (let x = tx; x < tx + tw; x += 1) {
      if (x < 0 || y < 0 || x >= HQ_COLS || y >= HQ_ROWS) continue;
      ground[y * HQ_COLS + x] = tile;
    }
  }
};

/** Paints a horizontal wall run, skipping listed door tiles. */
const hWall = (ground: Grid, y: number, x1: number, x2: number, doors: number[] = []) => {
  for (let x = x1; x <= x2; x += 1) {
    if (doors.includes(x)) continue;
    fillRect(ground, "wall", x, y, 1, 1);
  }
};

/** Paints a vertical wall run, skipping listed door tiles. */
const vWall = (ground: Grid, x: number, y1: number, y2: number, doors: number[] = []) => {
  for (let y = y1; y <= y2; y += 1) {
    if (doors.includes(y)) continue;
    fillRect(ground, "wall", x, y, 1, 1);
  }
};

let objectSeq = 0;
const obj = (
  kind: PixelObjectKind,
  tx: number,
  ty: number,
  blocking?: boolean,
): PixelMapObject => {
  objectSeq += 1;
  return { id: `obj-${kind}-${objectSeq}`, kind, tx, ty, ...(blocking === undefined ? {} : { blocking }) };
};

let stationSeq = 0;
const station = (
  kind: PixelStationKind,
  tx: number,
  ty: number,
  facing: PixelFacing,
): PixelStation => {
  stationSeq += 1;
  return { id: `st-${kind}-${stationSeq}`, kind, tx, ty, facing };
};

const desk = (
  id: string,
  deskTx: number,
  deskTy: number,
  seatTx: number,
  seatTy: number,
  facing: PixelFacing = "down",
): PixelDeskSlot => ({ id, deskTx, deskTy, seatTx, seatTy, facing });

const zone = (
  id: string,
  kind: PixelZone["kind"],
  label: string | null,
  tx: number,
  ty: number,
  tw: number,
  th: number,
): PixelZone => ({ id, kind, label, tx, ty, tw, th });

export const buildHermesHqMap = (): PixelOfficeMap => {
  objectSeq = 0;
  stationSeq = 0;

  const ground: Grid = new Array<PixelGroundTile>(HQ_COLS * HQ_ROWS).fill("grass");

  // ---------------------------------------------------------------------
  // Floors. The building interior spans x 6..53, y 2..39.
  // ---------------------------------------------------------------------
  fillRect(ground, "floor_cream", 6, 2, 48, 38);
  // Left column of rooms.
  fillRect(ground, "carpet_purple", 6, 2, 11, 10); // Meeting room.
  fillRect(ground, "floor_white", 6, 13, 11, 9); // Phone booths.
  fillRect(ground, "gym_mat", 6, 23, 11, 10); // Gym.
  // Top rooms.
  fillRect(ground, "kitchen_tile", 18, 2, 10, 7); // Kitchen.
  fillRect(ground, "floor_white", 29, 2, 10, 7); // CX team pod.
  fillRect(ground, "floor_wood", 40, 2, 14, 11); // Reading nook.
  // Center + south.
  fillRect(ground, "carpet_purple", 18, 25, 16, 15); // Lounge.
  fillRect(ground, "carpet_blue", 34, 25, 11, 9); // Game corner.
  fillRect(ground, "server_floor", 45, 25, 9, 15); // Server room.

  // ---------------------------------------------------------------------
  // Walls. Perimeter first, then interior dividers with door gaps.
  // ---------------------------------------------------------------------
  hWall(ground, 1, 5, 54);
  hWall(ground, 40, 5, 54);
  vWall(ground, 5, 1, 40, [35, 36]); // Entrance on the west side.
  vWall(ground, 54, 1, 40);
  // Left column divider (meeting/phone/gym vs. central floor).
  vWall(ground, 17, 2, 39, [17, 18, 36, 37]);
  // Meeting room south wall.
  hWall(ground, 12, 6, 16, [11, 12]);
  // Phone room south wall.
  hWall(ground, 22, 6, 16, [10, 11]);
  // Gym south wall.
  hWall(ground, 33, 6, 16, [9, 10]);
  // Kitchen + CX south wall.
  hWall(ground, 9, 18, 38, [22, 23, 33, 34]);
  // Kitchen | CX divider.
  vWall(ground, 28, 2, 8);
  // CX | reading nook divider with a doorway.
  vWall(ground, 39, 2, 8, [4, 5]);
  // Server room walls.
  vWall(ground, 44, 24, 39, [30, 31]);
  hWall(ground, 24, 45, 53);

  // ---------------------------------------------------------------------
  // Objects.
  // ---------------------------------------------------------------------
  const objects: PixelMapObject[] = [
    // Outdoors.
    obj("tree", 1, 3),
    obj("tree", 2, 13),
    obj("tree", 1, 25),
    obj("tree", 3, 33),
    obj("flower", 3, 8),
    obj("flower", 2, 20),
    obj("flower", 4, 29),
    obj("flower", 1, 38),

    // Meeting room.
    obj("whiteboard", 7, 2),
    obj("tv_stand", 12, 2),
    obj("meeting_table", 10, 6),
    obj("plant_tall", 6, 2),
    obj("plant", 16, 10),

    // Kitchen.
    obj("kitchen_counter", 19, 2),
    obj("kitchen_counter", 21, 2),
    obj("coffee_machine", 23, 2),
    obj("fridge", 24, 2),
    obj("vending_machine", 26, 2),
    obj("coffee_table", 21, 6),
    obj("water_cooler", 27, 8),
    obj("plant", 18, 8),

    // CX team pod.
    obj("desk_monitor", 30, 4),
    obj("desk_monitor", 34, 4),
    obj("desk_monitor", 30, 7),
    obj("desk_monitor", 34, 7),
    obj("chair", 30, 5, false),
    obj("chair", 34, 5, false),
    obj("chair", 30, 8, false),
    obj("chair", 34, 8, false),
    obj("plant", 37, 2),
    obj("kanban_board", 32, 2),

    // Reading nook.
    obj("bookshelf", 41, 2),
    obj("bookshelf", 43, 2),
    obj("bookshelf", 45, 2),
    obj("bookshelf", 47, 2),
    obj("aquarium", 50, 2),
    obj("lamp", 52, 2),
    obj("sofa_h", 44, 5),
    obj("coffee_table", 44, 7),
    obj("sofa_h", 44, 9),
    obj("plant_tall", 40, 2),
    obj("plant", 53, 11),
    obj("rug", 47, 6, false),

    // Product team pods (two pods of four desks).
    obj("desk_monitor", 20, 13),
    obj("desk_monitor", 23, 13),
    obj("desk_monitor", 20, 16),
    obj("desk_monitor", 23, 16),
    obj("chair", 20, 14, false),
    obj("chair", 23, 14, false),
    obj("chair", 20, 17, false),
    obj("chair", 23, 17, false),
    obj("desk_monitor", 29, 13),
    obj("desk_monitor", 32, 13),
    obj("desk_monitor", 29, 16),
    obj("desk_monitor", 32, 16),
    obj("chair", 29, 14, false),
    obj("chair", 32, 14, false),
    obj("chair", 29, 17, false),
    obj("chair", 32, 17, false),
    obj("kanban_board", 26, 11),
    obj("plant", 18, 10),
    obj("plant", 38, 10),
    obj("water_cooler", 38, 14),

    // Planter row between product area and lounge.
    obj("plant", 19, 24),
    obj("plant_tall", 24, 24),
    obj("plant", 29, 24),
    obj("plant_tall", 34, 24),
    obj("plant", 39, 24),

    // Ops corner (east of product pods).
    obj("desk_monitor", 45, 15),
    obj("chair", 45, 16, false),
    obj("whiteboard", 48, 13),
    obj("plant", 41, 13),
    obj("atm", 52, 20),

    // Phone booths room.
    obj("phone_booth", 8, 14),
    obj("phone_booth", 10, 14),
    obj("sms_booth", 13, 14),
    obj("plant", 6, 13),
    obj("plant", 16, 13),
    obj("sofa_v", 6, 17),
    obj("lamp", 16, 20),

    // Gym.
    obj("treadmill", 8, 24, false),
    obj("treadmill", 11, 24, false),
    obj("dumbbell_rack", 13, 24),
    obj("water_cooler", 6, 30),
    obj("plant", 16, 31),

    // Entry hall (south-west).
    obj("plant_tall", 6, 34),
    obj("plant_tall", 6, 38),
    obj("rug", 8, 36, false),
    obj("bookshelf", 12, 34),

    // Lounge.
    obj("tv_stand", 20, 26),
    obj("sofa_h", 24, 29),
    obj("sofa_v", 22, 30),
    obj("sofa_v", 27, 30),
    obj("coffee_table", 25, 31),
    obj("rug", 24, 30, false),
    obj("ping_pong_table", 29, 34),
    obj("plant", 18, 25),
    obj("plant", 18, 38),
    obj("flower", 33, 38),

    // Game corner.
    obj("arcade", 36, 26),
    obj("arcade", 38, 26),
    obj("jukebox", 42, 26),
    obj("plant", 34, 25),
    obj("vending_machine", 44, 30),

    // South-east hall.
    obj("water_cooler", 35, 36),
    obj("plant", 43, 38),

    // Server room.
    obj("server_rack", 46, 26),
    obj("server_rack", 48, 26),
    obj("server_rack", 50, 26),
    obj("server_rack", 52, 26),
    obj("desk_monitor", 47, 31),
    obj("chair", 47, 32, false),
    obj("lamp", 52, 37),
  ];

  // ---------------------------------------------------------------------
  // Desks (assignable seats). The github/qa desks are reserved stations.
  // ---------------------------------------------------------------------
  const desks: PixelDeskSlot[] = [
    desk("desk-a1", 20, 13, 20, 14),
    desk("desk-a2", 23, 13, 23, 14),
    desk("desk-a3", 20, 16, 20, 17),
    desk("desk-a4", 23, 16, 23, 17),
    desk("desk-b1", 29, 13, 29, 14),
    desk("desk-b2", 32, 13, 32, 14),
    desk("desk-b3", 29, 16, 29, 17),
    desk("desk-b4", 32, 16, 32, 17),
    desk("desk-cx1", 30, 4, 30, 5),
    desk("desk-cx2", 34, 4, 34, 5),
    desk("desk-cx3", 30, 7, 30, 8),
    desk("desk-cx4", 34, 7, 34, 8),
  ];

  // ---------------------------------------------------------------------
  // Stations for holds and idle wandering.
  // ---------------------------------------------------------------------
  const stations: PixelStation[] = [
    // Hold targets.
    station("phone_booth", 8, 15, "up"),
    station("phone_booth", 10, 15, "up"),
    station("sms_booth", 13, 15, "up"),
    station("gym", 8, 25, "up"),
    station("gym", 11, 25, "up"),
    station("gym", 13, 25, "up"),
    station("gym", 10, 29, "down"),
    station("qa_lab", 47, 32, "down"),
    station("github_desk", 45, 16, "down"),
    station("jukebox", 42, 27, "up"),
    station("kanban", 26, 12, "up"),
    station("kanban", 27, 12, "up"),
    // Meeting seats around the big table.
    station("meeting_seat", 10, 5, "down"),
    station("meeting_seat", 11, 5, "down"),
    station("meeting_seat", 12, 5, "down"),
    station("meeting_seat", 10, 8, "up"),
    station("meeting_seat", 11, 8, "up"),
    station("meeting_seat", 12, 8, "up"),
    station("meeting_seat", 9, 6, "right"),
    station("meeting_seat", 9, 7, "right"),
    station("meeting_seat", 13, 6, "left"),
    station("meeting_seat", 13, 7, "left"),
    // Idle wandering spots.
    station("coffee", 23, 3, "up"),
    station("coffee", 24, 3, "up"),
    station("coffee", 20, 6, "right"),
    station("coffee", 22, 6, "left"),
    station("water_cooler", 26, 8, "right"),
    station("water_cooler", 38, 15, "up"),
    station("water_cooler", 35, 37, "up"),
    station("lounge_seat", 24, 29, "down"),
    station("lounge_seat", 25, 29, "down"),
    station("lounge_seat", 22, 30, "right"),
    station("lounge_seat", 27, 30, "left"),
    station("library", 44, 5, "down"),
    station("library", 45, 5, "down"),
    station("library", 44, 9, "down"),
    station("library", 45, 9, "down"),
    station("ping_pong", 28, 34, "right"),
    station("ping_pong", 32, 34, "left"),
    station("arcade", 36, 27, "up"),
    station("arcade", 38, 27, "up"),
    station("wander", 27, 20, "down"),
    station("wander", 21, 11, "down"),
    station("wander", 35, 11, "down"),
    station("wander", 41, 18, "down"),
    station("wander", 21, 33, "right"),
    station("wander", 40, 35, "left"),
    station("wander", 12, 37, "up"),
    station("wander", 10, 30, "down"),
  ];

  // ---------------------------------------------------------------------
  // Zones with Gather-style floating labels.
  // ---------------------------------------------------------------------
  const zones: PixelZone[] = [
    zone("z-meeting", "meeting", "Meeting room", 6, 2, 11, 10),
    zone("z-kitchen", "kitchen", "Kitchen", 18, 2, 10, 7),
    zone("z-cx", "team_pod", "CX team", 29, 2, 10, 7),
    zone("z-reading", "library", "Reading nook", 40, 2, 14, 11),
    zone("z-product", "team_pod", "Product team", 18, 10, 21, 15),
    zone("z-ops", "focus", "Ops corner", 40, 13, 14, 11),
    zone("z-phone", "phone", "Phone booths", 6, 13, 11, 9),
    zone("z-gym", "gym", "Gym", 6, 23, 11, 10),
    zone("z-lounge", "lounge", "Lounge", 18, 25, 16, 15),
    zone("z-game", "game_room", "Game room", 34, 25, 11, 9),
    zone("z-server", "server", "Server room", 45, 25, 9, 15),
  ];

  return {
    cols: HQ_COLS,
    rows: HQ_ROWS,
    ground,
    objects,
    zones,
    desks,
    stations,
    spawn: { tx: 8, ty: 37 },
  };
};
