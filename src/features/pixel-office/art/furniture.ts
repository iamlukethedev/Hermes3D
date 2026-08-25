import { OBJECT_FOOTPRINT, PIXEL_TILE_SIZE, type PixelObjectKind, type PixelSprite } from "../types";
import {
  ACCENT_AMBER,
  ACCENT_BLUE,
  ACCENT_BLUE_DARK,
  ACCENT_MAGENTA,
  ACCENT_PURPLE,
  ACCENT_RED,
  ACCENT_RED_DARK,
  ACCENT_TEAL,
  ACCENT_TEAL_DARK,
  ACCENT_YELLOW,
  DESK_WHITE,
  DESK_WHITE_SHADE,
  FLOOR_CREAM,
  FURN_WOOD,
  FURN_WOOD_DARK,
  FURN_WOOD_LIGHT,
  LEAF_GREEN,
  LEAF_GREEN_DARK,
  LEAF_GREEN_LIGHT,
  LED_GREEN,
  MONITOR_DARK,
  NEAR_BLACK,
  OUTLINE,
  PAPER_SHADE,
  PAPER_WHITE,
  RUG_RED,
  RUG_RED_DARK,
  SCREEN_OFF,
  SCREEN_ON,
  SOFA_ORANGE,
  SOFA_ORANGE_DARK,
  SOFA_ORANGE_LIGHT,
  SOFT_SHADOW,
  STEEL,
  STEEL_DARK,
  WARM_GLOW,
  WATER_AQUA,
  WATER_AQUA_DARK,
} from "./palette";
import {
  fillRect,
  gridRows,
  hLine,
  makeGrid,
  outlineRect,
  setPx,
  vLine,
  type Grid,
} from "./grid";
import { makeSprite } from "./sprite";

/** Shared palette for every furniture sprite. */
const PAL: Record<string, string> = {
  o: OUTLINE,
  x: NEAR_BLACK,
  w: FURN_WOOD,
  W: FURN_WOOD_DARK,
  k: FURN_WOOD_LIGHT,
  d: DESK_WHITE,
  D: DESK_WHITE_SHADE,
  m: MONITOR_DARK,
  c: SCREEN_ON,
  C: SCREEN_OFF,
  n: PAPER_WHITE,
  N: PAPER_SHADE,
  s: STEEL,
  S: STEEL_DARK,
  g: LEAF_GREEN,
  G: LEAF_GREEN_DARK,
  l: LEAF_GREEN_LIGHT,
  r: ACCENT_RED,
  R: ACCENT_RED_DARK,
  e: SOFA_ORANGE,
  E: SOFA_ORANGE_DARK,
  f: SOFA_ORANGE_LIGHT,
  y: ACCENT_YELLOW,
  Y: WARM_GLOW,
  a: ACCENT_AMBER,
  b: ACCENT_BLUE,
  B: ACCENT_BLUE_DARK,
  q: WATER_AQUA,
  Q: WATER_AQUA_DARK,
  t: ACCENT_TEAL,
  T: ACCENT_TEAL_DARK,
  u: ACCENT_PURPLE,
  p: ACCENT_MAGENTA,
  v: RUG_RED,
  V: RUG_RED_DARK,
  h: FLOOR_CREAM,
  L: LED_GREEN,
  z: SOFT_SHADOW,
};

function sprite(kind: PixelObjectKind, grid: Grid): PixelSprite {
  return makeSprite(`furn_${kind}`, PAL, gridRows(grid));
}

/** Grid sized to the kind's footprint width and the requested height. */
function gridFor(kind: PixelObjectKind, height: number): Grid {
  return makeGrid(OBJECT_FOOTPRINT[kind][0] * PIXEL_TILE_SIZE, height);
}

/** Desk slab with outline, white top, shaded lip, and two wood legs. */
function drawDeskBody(g: Grid, x: number, y: number, w: number, h: number): void {
  outlineRect(g, x, y, w, h - 3, "o");
  fillRect(g, x + 1, y + 1, w - 2, h - 6, "d");
  fillRect(g, x + 1, y + h - 5, w - 2, 2, "D");
  fillRect(g, x + 2, y + h - 3, 3, 3, "W");
  fillRect(g, x + w - 5, y + h - 3, 3, 3, "W");
}

function desk(): PixelSprite {
  const g = gridFor("desk", 16);
  drawDeskBody(g, 0, 2, 32, 14);
  return sprite("desk", g);
}

function deskMonitor(): PixelSprite {
  const g = gridFor("desk_monitor", 28);
  drawDeskBody(g, 0, 14, 32, 14);
  // Monitor above the desk with a lit screen and a stand.
  outlineRect(g, 10, 0, 12, 10, "o");
  fillRect(g, 11, 1, 10, 8, "m");
  fillRect(g, 12, 2, 8, 6, "c");
  setPx(g, 13, 3, "n");
  fillRect(g, 15, 10, 2, 3, "m");
  hLine(g, 13, 13, 6, "m");
  // Keyboard on the desk surface.
  fillRect(g, 12, 17, 8, 3, "m");
  hLine(g, 13, 18, 6, "C");
  return sprite("desk_monitor", g);
}

function chair(): PixelSprite {
  const g = gridFor("chair", 16);
  // Backrest, then seat, seen from above/behind.
  outlineRect(g, 3, 1, 10, 5, "o");
  fillRect(g, 4, 2, 8, 3, "x");
  outlineRect(g, 3, 6, 10, 7, "o");
  fillRect(g, 4, 7, 8, 5, "C");
  fillRect(g, 5, 8, 6, 2, "x");
  // Base feet.
  setPx(g, 4, 13, "o");
  setPx(g, 11, 13, "o");
  hLine(g, 5, 14, 6, "o");
  return sprite("chair", g);
}

function meetingTable(): PixelSprite {
  const g = gridFor("meeting_table", 32);
  outlineRect(g, 1, 3, 46, 26, "o");
  fillRect(g, 2, 4, 44, 20, "w");
  hLine(g, 2, 4, 44, "k");
  fillRect(g, 2, 24, 44, 4, "W");
  // Rounded corners.
  for (const [cx, cy] of [
    [1, 3],
    [46, 3],
    [1, 28],
    [46, 28],
  ]) {
    setPx(g, cx, cy, ".");
  }
  return sprite("meeting_table", g);
}

function sofaH(): PixelSprite {
  const g = gridFor("sofa_h", 20);
  // Backrest.
  outlineRect(g, 2, 1, 28, 7, "o");
  fillRect(g, 3, 2, 26, 5, "e");
  // Armrests.
  outlineRect(g, 0, 5, 5, 13, "o");
  fillRect(g, 1, 6, 3, 11, "e");
  outlineRect(g, 27, 5, 5, 13, "o");
  fillRect(g, 28, 6, 3, 11, "e");
  // Seat cushions facing down.
  outlineRect(g, 4, 7, 24, 9, "o");
  fillRect(g, 5, 8, 22, 5, "f");
  vLine(g, 15, 8, 5, "E");
  fillRect(g, 5, 13, 22, 2, "E");
  return sprite("sofa_h", g);
}

function sofaV(): PixelSprite {
  const g = gridFor("sofa_v", 32);
  // Backrest along the left edge (sofa faces right).
  outlineRect(g, 0, 1, 6, 29, "o");
  fillRect(g, 1, 2, 4, 27, "e");
  // Armrests top and bottom.
  outlineRect(g, 4, 0, 11, 5, "o");
  fillRect(g, 5, 1, 9, 3, "e");
  outlineRect(g, 4, 26, 11, 5, "o");
  fillRect(g, 5, 27, 9, 3, "e");
  // Seat cushions.
  outlineRect(g, 5, 4, 10, 23, "o");
  fillRect(g, 6, 5, 7, 21, "f");
  hLine(g, 6, 15, 7, "E");
  vLine(g, 13, 5, 21, "E");
  return sprite("sofa_v", g);
}

function coffeeTable(): PixelSprite {
  const g = gridFor("coffee_table", 16);
  outlineRect(g, 1, 3, 14, 9, "o");
  fillRect(g, 2, 4, 12, 5, "w");
  hLine(g, 2, 4, 12, "k");
  fillRect(g, 2, 9, 12, 2, "W");
  fillRect(g, 2, 12, 2, 3, "W");
  fillRect(g, 12, 12, 2, 3, "W");
  return sprite("coffee_table", g);
}

/** Leafy blob with light and dark shading. */
function drawFoliage(g: Grid, x: number, y: number, w: number, h: number): void {
  fillRect(g, x + 2, y, w - 4, h, "g");
  fillRect(g, x, y + 2, w, h - 4, "g");
  fillRect(g, x + 1, y + 1, w - 2, h - 2, "g");
  setPx(g, x + 2, y + 1, "l");
  setPx(g, x + 3, y + 1, "l");
  setPx(g, x + 1, y + 2, "l");
  fillRect(g, x + 2, y + h - 2, w - 4, 2, "G");
  setPx(g, x + w - 2, y + h - 4, "G");
}

/** Terracotta pot with rim and shaded base. */
function drawPot(g: Grid, x: number, y: number, w: number, h: number): void {
  outlineRect(g, x, y, w, h, "o");
  fillRect(g, x + 1, y + 1, w - 2, 1, "r");
  fillRect(g, x + 1, y + 2, w - 2, h - 4, "r");
  fillRect(g, x + 1, y + h - 2, w - 2, 1, "R");
}

function plant(): PixelSprite {
  const g = gridFor("plant", 20);
  drawFoliage(g, 3, 1, 10, 11);
  drawPot(g, 4, 12, 8, 7);
  return sprite("plant", g);
}

function plantTall(): PixelSprite {
  const g = gridFor("plant_tall", 28);
  drawFoliage(g, 3, 0, 10, 12);
  drawFoliage(g, 4, 12, 8, 6);
  drawPot(g, 4, 19, 8, 8);
  return sprite("plant_tall", g);
}

function bookshelf(): PixelSprite {
  const g = gridFor("bookshelf", 28);
  outlineRect(g, 0, 0, 32, 27, "o");
  fillRect(g, 1, 1, 30, 25, "w");
  // Two shelf openings with colorful book spines.
  const spineColors = ["r", "b", "y", "g", "u", "t", "e", "p"];
  for (const [shelfY] of [[3], [13]] as Array<[number]>) {
    fillRect(g, 2, shelfY, 28, 8, "x");
    let ci = shelfY === 3 ? 0 : 3;
    for (let bx = 3; bx <= 26; bx += 3) {
      fillRect(g, bx, shelfY + 1, 2, 7, spineColors[ci % spineColors.length]);
      ci += 1;
    }
    hLine(g, 2, shelfY + 8, 28, "W");
  }
  // Cabinet base.
  fillRect(g, 2, 23, 28, 3, "W");
  vLine(g, 15, 23, 3, "o");
  return sprite("bookshelf", g);
}

function kitchenCounter(): PixelSprite {
  const g = gridFor("kitchen_counter", 24);
  // Items on top: a jar and a mug.
  fillRect(g, 5, 1, 3, 5, "b");
  setPx(g, 5, 1, "B");
  fillRect(g, 24, 2, 3, 4, "r");
  setPx(g, 27, 3, "r");
  // Counter top.
  outlineRect(g, 0, 6, 32, 5, "o");
  fillRect(g, 1, 7, 30, 3, "d");
  hLine(g, 1, 7, 30, "n");
  // Cabinet body with door seams and handles.
  outlineRect(g, 0, 10, 32, 13, "o");
  fillRect(g, 1, 11, 30, 11, "w");
  vLine(g, 15, 11, 11, "W");
  setPx(g, 12, 15, "W");
  setPx(g, 19, 15, "W");
  hLine(g, 1, 21, 30, "W");
  return sprite("kitchen_counter", g);
}

function fridge(): PixelSprite {
  const g = gridFor("fridge", 28);
  outlineRect(g, 2, 0, 12, 27, "o");
  fillRect(g, 3, 1, 10, 25, "d");
  vLine(g, 12, 1, 25, "D");
  hLine(g, 3, 9, 10, "S");
  // Handles.
  vLine(g, 11, 3, 3, "S");
  vLine(g, 11, 12, 5, "S");
  hLine(g, 3, 26, 10, "D");
  return sprite("fridge", g);
}

function coffeeMachine(): PixelSprite {
  const g = gridFor("coffee_machine", 24);
  outlineRect(g, 3, 2, 10, 20, "o");
  fillRect(g, 4, 3, 8, 18, "m");
  hLine(g, 4, 3, 8, "S");
  // Ready light.
  setPx(g, 10, 6, "r");
  // Dispenser cavity with a cup.
  fillRect(g, 5, 9, 6, 7, "C");
  fillRect(g, 7, 12, 2, 3, "n");
  // Drip tray.
  fillRect(g, 4, 19, 8, 2, "S");
  return sprite("coffee_machine", g);
}

function waterCooler(): PixelSprite {
  const g = gridFor("water_cooler", 24);
  // Blue bottle.
  outlineRect(g, 4, 0, 8, 8, "o");
  fillRect(g, 5, 1, 6, 6, "b");
  setPx(g, 6, 2, "q");
  setPx(g, 6, 3, "q");
  // Body.
  outlineRect(g, 3, 8, 10, 15, "o");
  fillRect(g, 4, 9, 8, 12, "d");
  // Taps.
  setPx(g, 5, 12, "b");
  setPx(g, 10, 12, "r");
  fillRect(g, 4, 19, 8, 2, "D");
  return sprite("water_cooler", g);
}

function vendingMachine(): PixelSprite {
  const g = gridFor("vending_machine", 28);
  outlineRect(g, 2, 0, 12, 28, "o");
  fillRect(g, 3, 1, 10, 26, "B");
  // Glass window with colorful items on two shelves.
  fillRect(g, 4, 2, 8, 12, "x");
  for (const [row, colors] of [
    [4, ["y", "r", "g"]],
    [9, ["e", "b", "p"]],
  ] as Array<[number, string[]]>) {
    colors.forEach((ch, i) => {
      fillRect(g, 5 + i * 3, row, 2, 2, ch);
    });
    hLine(g, 4, row + 2, 8, "S");
  }
  // Coin panel and dispenser flap.
  fillRect(g, 10, 16, 2, 3, "s");
  fillRect(g, 4, 22, 8, 3, "x");
  hLine(g, 5, 23, 6, "S");
  return sprite("vending_machine", g);
}

function pingPongTable(): PixelSprite {
  const g = gridFor("ping_pong_table", 32);
  outlineRect(g, 1, 2, 46, 28, "o");
  fillRect(g, 2, 3, 44, 26, "g");
  // White boundary lines and center net line.
  outlineRect(g, 3, 4, 42, 24, "n");
  vLine(g, 23, 3, 26, "n");
  vLine(g, 24, 3, 26, "n");
  // Paddle and ball for flavor.
  fillRect(g, 8, 8, 3, 3, "r");
  setPx(g, 10, 11, "w");
  setPx(g, 36, 22, "n");
  return sprite("ping_pong_table", g);
}

function arcade(): PixelSprite {
  const g = gridFor("arcade", 28);
  outlineRect(g, 2, 0, 12, 28, "o");
  fillRect(g, 3, 1, 10, 26, "m");
  // Marquee.
  fillRect(g, 4, 1, 8, 2, "p");
  // Glowing cyan screen.
  fillRect(g, 4, 4, 8, 6, "c");
  setPx(g, 5, 5, "n");
  hLine(g, 4, 10, 8, "C");
  // Control panel with buttons and stick.
  fillRect(g, 4, 12, 8, 3, "S");
  setPx(g, 6, 13, "r");
  setPx(g, 8, 13, "y");
  setPx(g, 10, 13, "b");
  // Front body panel.
  fillRect(g, 4, 17, 8, 8, "C");
  return sprite("arcade", g);
}

function jukebox(): PixelSprite {
  const g = gridFor("jukebox", 28);
  outlineRect(g, 2, 1, 12, 27, "o");
  fillRect(g, 3, 2, 10, 25, "E");
  // Glowing arch: magenta outer, amber inner.
  hLine(g, 5, 2, 6, "p");
  setPx(g, 4, 3, "p");
  setPx(g, 11, 3, "p");
  vLine(g, 3, 4, 6, "p");
  vLine(g, 12, 4, 6, "p");
  hLine(g, 6, 3, 4, "a");
  setPx(g, 5, 4, "a");
  setPx(g, 10, 4, "a");
  vLine(g, 4, 5, 4, "a");
  vLine(g, 11, 5, 4, "a");
  // Record window.
  fillRect(g, 6, 5, 4, 4, "x");
  setPx(g, 7, 6, "n");
  // Speaker grill.
  fillRect(g, 4, 13, 8, 11, "W");
  for (const y of [15, 18, 21]) hLine(g, 5, y, 6, "x");
  return sprite("jukebox", g);
}

function kanbanBoard(): PixelSprite {
  const g = gridFor("kanban_board", 28);
  // Board face.
  outlineRect(g, 1, 0, 30, 21, "o");
  fillRect(g, 2, 1, 28, 19, "n");
  // Three columns.
  vLine(g, 11, 1, 19, "N");
  vLine(g, 21, 1, 19, "N");
  hLine(g, 2, 3, 28, "N");
  // Tiny sticky notes per column.
  const notes: Array<[number, number, string]> = [
    [4, 5, "y"],
    [7, 8, "r"],
    [4, 12, "b"],
    [13, 5, "g"],
    [16, 9, "y"],
    [13, 14, "u"],
    [23, 6, "b"],
    [26, 10, "g"],
    [23, 15, "r"],
  ];
  for (const [x, y, ch] of notes) fillRect(g, x, y, 2, 2, ch);
  // Stand legs.
  fillRect(g, 4, 21, 2, 7, "o");
  fillRect(g, 26, 21, 2, 7, "o");
  return sprite("kanban_board", g);
}

/** Tall booth body shared by phone and sms booths. */
function drawBooth(g: Grid, body: string, shade: string): void {
  outlineRect(g, 2, 0, 12, 39, "o");
  fillRect(g, 3, 1, 10, 37, body);
  // Roof band.
  fillRect(g, 3, 1, 10, 2, shade);
  // Window.
  outlineRect(g, 4, 4, 8, 11, "o");
  fillRect(g, 5, 5, 6, 9, "q");
  setPx(g, 6, 6, "n");
  // Base.
  fillRect(g, 3, 35, 10, 3, shade);
}

function phoneBooth(): PixelSprite {
  const g = gridFor("phone_booth", 40);
  drawBooth(g, "r", "R");
  // Handset icon on the lower panel.
  hLine(g, 6, 20, 4, "n");
  setPx(g, 5, 21, "n");
  setPx(g, 10, 21, "n");
  return sprite("phone_booth", g);
}

function smsBooth(): PixelSprite {
  const g = gridFor("sms_booth", 40);
  drawBooth(g, "t", "T");
  // Speech bubble icon with a tail.
  fillRect(g, 5, 18, 6, 5, "n");
  setPx(g, 6, 23, "n");
  setPx(g, 6, 20, "T");
  setPx(g, 8, 20, "T");
  return sprite("sms_booth", g);
}

function treadmill(): PixelSprite {
  const g = gridFor("treadmill", 32);
  // Console at the top, seen from above.
  outlineRect(g, 2, 0, 12, 5, "o");
  fillRect(g, 3, 1, 10, 3, "m");
  fillRect(g, 5, 2, 6, 1, "c");
  // Side rails.
  vLine(g, 2, 5, 26, "o");
  vLine(g, 3, 5, 26, "S");
  vLine(g, 13, 5, 26, "o");
  vLine(g, 12, 5, 26, "S");
  // Belt with tread stripes.
  fillRect(g, 4, 5, 8, 26, "x");
  for (let y = 7; y < 30; y += 4) hLine(g, 4, y, 8, "C");
  return sprite("treadmill", g);
}

function dumbbellRack(): PixelSprite {
  const g = gridFor("dumbbell_rack", 20);
  // Frame posts and two shelf bars.
  vLine(g, 1, 2, 17, "o");
  vLine(g, 30, 2, 17, "o");
  hLine(g, 1, 8, 30, "W");
  hLine(g, 1, 9, 30, "o");
  hLine(g, 1, 15, 30, "W");
  hLine(g, 1, 16, 30, "o");
  // Dumbbells resting on each shelf.
  for (const [x, y] of [
    [4, 5],
    [13, 5],
    [22, 5],
    [8, 12],
    [18, 12],
  ] as Array<[number, number]>) {
    fillRect(g, x, y, 2, 3, "x");
    hLine(g, x + 2, y + 1, 3, "S");
    fillRect(g, x + 5, y, 2, 3, "x");
  }
  hLine(g, 1, 19, 30, "o");
  return sprite("dumbbell_rack", g);
}

function serverRack(): PixelSprite {
  const g = gridFor("server_rack", 28);
  outlineRect(g, 2, 0, 12, 28, "o");
  fillRect(g, 3, 1, 10, 26, "x");
  // Rack units with blinking LEDs.
  for (let unitY = 2; unitY <= 22; unitY += 5) {
    hLine(g, 3, unitY + 3, 10, "C");
    setPx(g, 4, unitY + 1, "L");
    setPx(g, 6, unitY + 1, unitY % 2 === 0 ? "a" : "L");
    setPx(g, 8, unitY + 1, "L");
    hLine(g, 10, unitY + 1, 2, "S");
  }
  return sprite("server_rack", g);
}

function tvStand(): PixelSprite {
  const g = gridFor("tv_stand", 24);
  // Wide TV.
  outlineRect(g, 3, 0, 26, 12, "o");
  fillRect(g, 4, 1, 24, 10, "m");
  fillRect(g, 5, 2, 22, 8, "c");
  setPx(g, 6, 3, "n");
  // TV feet.
  hLine(g, 6, 12, 3, "m");
  hLine(g, 23, 12, 3, "m");
  // Wood cabinet.
  outlineRect(g, 1, 14, 30, 10, "o");
  fillRect(g, 2, 15, 28, 7, "w");
  vLine(g, 15, 15, 7, "W");
  hLine(g, 2, 21, 28, "W");
  fillRect(g, 2, 22, 28, 1, "W");
  return sprite("tv_stand", g);
}

function whiteboard(): PixelSprite {
  const g = gridFor("whiteboard", 24);
  outlineRect(g, 1, 0, 30, 18, "o");
  fillRect(g, 2, 1, 28, 16, "n");
  // Scribbles.
  hLine(g, 4, 4, 10, "b");
  hLine(g, 4, 7, 14, "b");
  hLine(g, 4, 10, 8, "r");
  fillRect(g, 20, 3, 7, 6, "x");
  fillRect(g, 21, 4, 5, 4, "n");
  hLine(g, 22, 5, 3, "r");
  hLine(g, 4, 13, 12, "x");
  // Marker tray and legs.
  hLine(g, 3, 18, 26, "S");
  fillRect(g, 5, 19, 2, 5, "o");
  fillRect(g, 25, 19, 2, 5, "o");
  return sprite("whiteboard", g);
}

function rug(): PixelSprite {
  const g = gridFor("rug", 32);
  // Round-ish rug from hard-threshold circles (no anti-aliasing).
  const cx = 15.5;
  const cy = 15.5;
  const radius = 14.5;
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const nx = (x - cx) / radius;
      const ny = (y - cy) / radius;
      const rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      if (rr > 0.82) setPx(g, x, y, "V");
      else if (rr > 0.45) setPx(g, x, y, "v");
      else if (rr > 0.32) setPx(g, x, y, "h");
      else setPx(g, x, y, "v");
    }
  }
  setPx(g, 15, 15, "h");
  setPx(g, 16, 15, "h");
  setPx(g, 15, 16, "h");
  setPx(g, 16, 16, "h");
  return sprite("rug", g);
}

function tree(): PixelSprite {
  const g = gridFor("tree", 40);
  // Soft ground shadow.
  fillRect(g, 8, 36, 16, 3, "z");
  setPx(g, 7, 37, "z");
  setPx(g, 24, 37, "z");
  // Trunk.
  outlineRect(g, 12, 24, 8, 13, "o");
  fillRect(g, 13, 25, 6, 11, "W");
  vLine(g, 14, 25, 11, "w");
  // Leafy crown from hard-threshold circle.
  const cx = 15.5;
  const cy = 13;
  const radius = 13.5;
  for (let y = 0; y < 27; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const nx = (x - cx) / radius;
      const ny = (y - cy) / (radius * 0.95);
      const rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      if (rr > 0.8) setPx(g, x, y, "G");
      else setPx(g, x, y, "g");
    }
  }
  // Highlights top-left, shade bottom-right.
  fillRect(g, 8, 4, 5, 3, "l");
  fillRect(g, 6, 8, 3, 2, "l");
  fillRect(g, 18, 18, 6, 3, "G");
  return sprite("tree", g);
}

function flower(): PixelSprite {
  const g = gridFor("flower", 16);
  // Three small flowers with stems and leaves.
  const blooms: Array<[number, number, string]> = [
    [3, 3, "r"],
    [10, 2, "y"],
    [7, 8, "p"],
  ];
  for (const [x, y, ch] of blooms) {
    setPx(g, x, y - 1, ch);
    setPx(g, x - 1, y, ch);
    setPx(g, x + 1, y, ch);
    setPx(g, x, y + 1, ch);
    setPx(g, x, y, "y");
    vLine(g, x, y + 2, 3, "g");
    setPx(g, x + 1, y + 3, "l");
  }
  setPx(g, 2, 13, "l");
  setPx(g, 12, 12, "l");
  return sprite("flower", g);
}

function atm(): PixelSprite {
  const g = gridFor("atm", 24);
  outlineRect(g, 3, 1, 10, 21, "o");
  fillRect(g, 4, 2, 8, 19, "s");
  hLine(g, 4, 2, 8, "S");
  // Green screen.
  outlineRect(g, 4, 4, 8, 6, "o");
  fillRect(g, 5, 5, 6, 4, "L");
  setPx(g, 6, 6, "n");
  // Keypad dots.
  for (const y of [12, 14]) {
    setPx(g, 5, y, "x");
    setPx(g, 7, y, "x");
    setPx(g, 9, y, "x");
  }
  // Card slot and cash slot.
  hLine(g, 5, 17, 6, "x");
  hLine(g, 5, 19, 6, "S");
  return sprite("atm", g);
}

function lamp(): PixelSprite {
  const g = gridFor("lamp", 28);
  // Warm glow halo around the shade.
  fillRect(g, 3, 1, 10, 7, "Y");
  setPx(g, 3, 1, ".");
  setPx(g, 12, 1, ".");
  // Shade.
  outlineRect(g, 4, 1, 8, 6, "o");
  fillRect(g, 5, 2, 6, 4, "y");
  hLine(g, 5, 5, 6, "a");
  // Pole and base.
  vLine(g, 7, 7, 17, "o");
  vLine(g, 8, 7, 17, "x");
  hLine(g, 4, 24, 8, "x");
  hLine(g, 3, 25, 10, "o");
  return sprite("lamp", g);
}

function aquarium(): PixelSprite {
  const g = gridFor("aquarium", 24);
  // Tank with rim.
  outlineRect(g, 1, 0, 30, 18, "o");
  hLine(g, 2, 1, 28, "S");
  fillRect(g, 2, 2, 28, 15, "q");
  fillRect(g, 2, 13, 28, 4, "Q");
  // Orange fish.
  fillRect(g, 8, 6, 3, 2, "e");
  setPx(g, 7, 7, "e");
  setPx(g, 11, 6, "E");
  fillRect(g, 20, 10, 3, 2, "e");
  setPx(g, 23, 11, "E");
  // Bubbles and seaweed.
  setPx(g, 14, 4, "n");
  setPx(g, 15, 7, "n");
  vLine(g, 5, 12, 5, "g");
  vLine(g, 26, 11, 6, "g");
  setPx(g, 25, 13, "l");
  // Wood stand.
  outlineRect(g, 1, 18, 30, 6, "o");
  fillRect(g, 2, 19, 28, 4, "w");
  hLine(g, 2, 22, 28, "W");
  return sprite("aquarium", g);
}

/** Builds one sprite per PixelObjectKind, keyed `furn_<kind>`. */
export function buildFurnitureSprites(): PixelSprite[] {
  return [
    desk(),
    deskMonitor(),
    chair(),
    meetingTable(),
    sofaH(),
    sofaV(),
    coffeeTable(),
    plant(),
    plantTall(),
    bookshelf(),
    kitchenCounter(),
    fridge(),
    coffeeMachine(),
    waterCooler(),
    vendingMachine(),
    pingPongTable(),
    arcade(),
    jukebox(),
    kanbanBoard(),
    phoneBooth(),
    smsBooth(),
    treadmill(),
    dumbbellRack(),
    serverRack(),
    tvStand(),
    whiteboard(),
    rug(),
    tree(),
    flower(),
    atm(),
    lamp(),
    aquarium(),
  ];
}
