import { OBJECT_FOOTPRINT, PIXEL_TILE_SIZE, type PixelObjectKind, type PixelSprite } from "../types";
import { LED_GREEN, NEAR_BLACK, PAPER_SHADE, PAPER_WHITE } from "./palette";
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

// ---------------------------------------------------------------------------
// Local colors for the soft "Gather" furniture look. New hues live here (not
// in palette.ts) so the shared palette stays owned by the tile/character art.
// ---------------------------------------------------------------------------

const OUTLINE_SOFT = "#3a3f4d";
const GROUND_SHADOW = "#00000026";

const WHITE_TOP = "#f7f5f0";
const WHITE_EDGE = "#dcd8cf";

const MONITOR_BODY = "#343a4a";
const SCREEN_DARK = "#262b3a";
const CODE_BLUE = "#6ec3f0";
const CODE_PINK = "#f27ebd";
const BRIGHT_GREEN = "#7ee08c";

const WOOD = "#d9b183";
const WOOD_DARK = "#c0925c";
const WOOD_LIGHT = "#ecd2a9";
const TRUNK_BROWN = "#9a7150";

const CHAIR_SEAT = "#4a4f5e";
const CHAIR_BACK = "#6a7080";
const GRAY_BLUE_LIGHT = "#8d93a6";

const SOFA_PEACH = "#f0c39a";
const SOFA_CUSHION = "#f7d7b7";
const SOFA_BASE = "#d9a877";

const LEAF_MID = "#68b258";
const LEAF_DARK = "#4f9a44";
const LEAF_LIGHT = "#86c977";
const LEAF_HI = "#a5dc93";

const TERRACOTTA = "#c98a66";
const TERRACOTTA_DARK = "#a86f4e";

const SOFT_RED = "#e0645a";
const SOFT_YELLOW = "#f2cf5b";
const SOFT_AMBER = "#eda75c";
const SOFT_BLUE = "#6a9fe0";
const SOFT_BLUE_DARK = "#4d7fc4";
const SOFT_PINK = "#f09ac0";
const SOFT_PURPLE = "#a08fd8";
const BOOTH_TEAL = "#5fb3a8";
const BOOTH_TEAL_DARK = "#478f86";
const WATER_BLUE = "#9fd4ec";
const WATER_BLUE_DARK = "#77b4d6";

const STEEL_LIGHT = "#c3cad4";
const STEEL_SHADE = "#98a1b0";
const CASE_GRAY_BLUE = "#7d8597";
const CASE_GRAY_DARK = "#666e80";
const SLATE = "#4e576a";
const SLATE_DARK = "#3d4454";

const SAGE = "#cfd6cd";
const SAGE_DARK = "#b2bcb0";

const INDIGO = "#6f7fc9";
const INDIGO_DARK = "#5b69ab";

const CORAL = "#e08a7a";
const CORAL_DARK = "#c26e5e";

const RUG_CREAM = "#f1e6d4";
const RUG_TERRA = "#d99a76";

const WARM_GLOW = "#ffe9b0";

/** Shared palette for every furniture sprite. */
const PAL: Record<string, string> = {
  o: OUTLINE_SOFT,
  x: NEAR_BLACK,
  z: GROUND_SHADOW,
  d: WHITE_TOP,
  D: WHITE_EDGE,
  n: PAPER_WHITE,
  N: PAPER_SHADE,
  m: MONITOR_BODY,
  M: SCREEN_DARK,
  c: CODE_BLUE,
  P: CODE_PINK,
  "1": BRIGHT_GREEN,
  w: WOOD,
  W: WOOD_DARK,
  k: WOOD_LIGHT,
  h: TRUNK_BROWN,
  i: CHAIR_SEAT,
  I: CHAIR_BACK,
  j: GRAY_BLUE_LIGHT,
  e: SOFA_PEACH,
  f: SOFA_CUSHION,
  E: SOFA_BASE,
  g: LEAF_MID,
  G: LEAF_DARK,
  l: LEAF_LIGHT,
  H: LEAF_HI,
  "2": TERRACOTTA,
  "3": TERRACOTTA_DARK,
  r: SOFT_RED,
  y: SOFT_YELLOW,
  a: SOFT_AMBER,
  b: SOFT_BLUE,
  B: SOFT_BLUE_DARK,
  p: SOFT_PINK,
  u: SOFT_PURPLE,
  t: BOOTH_TEAL,
  T: BOOTH_TEAL_DARK,
  q: WATER_BLUE,
  Q: WATER_BLUE_DARK,
  s: STEEL_LIGHT,
  S: STEEL_SHADE,
  C: CASE_GRAY_BLUE,
  F: CASE_GRAY_DARK,
  v: SLATE,
  V: SLATE_DARK,
  "4": SAGE,
  "5": SAGE_DARK,
  "6": INDIGO,
  "7": INDIGO_DARK,
  "8": CORAL,
  "9": CORAL_DARK,
  "0": RUG_CREAM,
  R: RUG_TERRA,
  Y: WARM_GLOW,
  L: LED_GREEN,
};

function sprite(kind: PixelObjectKind, grid: Grid): PixelSprite {
  return makeSprite(`furn_${kind}`, PAL, gridRows(grid));
}

/** Grid sized to the kind's footprint width and the requested height. */
function gridFor(kind: PixelObjectKind, height: number): Grid {
  return makeGrid(OBJECT_FOOTPRINT[kind][0] * PIXEL_TILE_SIZE, height);
}

/** 2-row translucent ground shadow; draw before the body so feet overlap it. */
function drawShadow(g: Grid, x: number, y: number, w: number): void {
  hLine(g, x, y, w, "z");
  hLine(g, x + 2, y + 1, w - 4, "z");
}

/** Knocks the four corner pixels out of an outlined rect (soft rounding). */
function trimCorners(g: Grid, x: number, y: number, w: number, h: number): void {
  setPx(g, x, y, ".");
  setPx(g, x + w - 1, y, ".");
  setPx(g, x, y + h - 1, ".");
  setPx(g, x + w - 1, y + h - 1, ".");
}

/** Outlined rect with rounded corners; only safe over transparent ground. */
function roundRect(g: Grid, x: number, y: number, w: number, h: number): void {
  outlineRect(g, x, y, w, h, "o");
  trimCorners(g, x, y, w, h);
}

// ---------------------------------------------------------------------------
// Foliage (plants + tree) built from hard-threshold circle unions.
// ---------------------------------------------------------------------------

type FoliageBlob = [cx: number, cy: number, r: number];

type FoliageOpts = {
  /** x + y below this reads as top-lit (light leaf). */
  light: number;
  /** x + y above this reads as shaded (dark leaf). */
  dark: number;
  /** Highlight clusters [x, y, w, h], painted only over leaf pixels. */
  highlights: Array<[number, number, number, number]>;
};

/** Fluffy outlined canopy: soft outline, lit top-left, shaded bottom-right. */
function drawFoliage(g: Grid, blobs: FoliageBlob[], opts: FoliageOpts): void {
  const height = g.length;
  const width = g[0]?.length ?? 0;
  const member = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    for (const [cx, cy, r] of blobs) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) return true;
    }
    return false;
  };
  // Body + outline pass.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!member(x, y)) continue;
      // Skip isolated 1px-wide circle tangents; they read as stray dots.
      if (!member(x - 1, y) && !member(x + 1, y)) continue;
      const edge =
        !member(x - 1, y) || !member(x + 1, y) || !member(x, y - 1) || !member(x, y + 1);
      if (edge) {
        setPx(g, x, y, "o");
      } else if (x + y < opts.light) {
        setPx(g, x, y, "l");
      } else if (x + y > opts.dark) {
        setPx(g, x, y, "G");
      } else {
        setPx(g, x, y, "g");
      }
    }
  }
  // Inner rim just inside the outline: lit up-left, dark down-right.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const ch = g[y][x];
      if (ch !== "g" && ch !== "l" && ch !== "G") continue;
      const nearOutline =
        g[y]?.[x - 1] === "o" || g[y]?.[x + 1] === "o" || g[y - 1]?.[x] === "o" || g[y + 1]?.[x] === "o";
      if (!nearOutline) continue;
      setPx(g, x, y, x + y > (opts.light + opts.dark) / 2 ? "G" : "l");
    }
  }
  // Highlight clusters, clipped to leaf pixels.
  for (const [hx, hy, hw, hh] of opts.highlights) {
    for (let y = hy; y < hy + hh; y += 1) {
      for (let x = hx; x < hx + hw; x += 1) {
        const ch = g[y]?.[x];
        if (ch === "g" || ch === "l") setPx(g, x, y, "H");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Desks
// ---------------------------------------------------------------------------

/** White pod desk slab: rounded top, shaded lip, legs, ground shadow. */
function drawDeskBody(g: Grid, y: number): void {
  drawShadow(g, 3, y + 16, 26);
  // Legs.
  fillRect(g, 2, y + 15, 3, 3, "D");
  fillRect(g, 27, y + 15, 3, 3, "D");
  hLine(g, 2, y + 17, 3, "S");
  hLine(g, 27, y + 17, 3, "S");
  // Slab.
  roundRect(g, 0, y, 32, 15);
  fillRect(g, 1, y + 1, 30, 10, "d");
  fillRect(g, 1, y + 11, 30, 3, "D");
}

function desk(): PixelSprite {
  const g = gridFor("desk", 18);
  drawDeskBody(g, 0);
  // Paper stack.
  fillRect(g, 5, 3, 7, 5, "n");
  hLine(g, 5, 7, 7, "N");
  hLine(g, 6, 4, 4, "N");
  hLine(g, 6, 6, 3, "N");
  // Coffee mug with handle.
  fillRect(g, 23, 4, 3, 3, "r");
  hLine(g, 23, 4, 3, "9");
  setPx(g, 26, 5, "9");
  return sprite("desk", g);
}

function deskMonitor(): PixelSprite {
  const g = gridFor("desk_monitor", 30);
  drawDeskBody(g, 12);
  // Monitor with a colorful code editor screen.
  outlineRect(g, 7, 0, 14, 11, "o");
  fillRect(g, 8, 1, 12, 9, "m");
  fillRect(g, 9, 2, 10, 7, "M");
  hLine(g, 10, 3, 2, "P");
  hLine(g, 13, 3, 3, "c");
  hLine(g, 10, 5, 2, "c");
  hLine(g, 13, 5, 2, "1");
  setPx(g, 16, 5, "n");
  setPx(g, 10, 7, "n");
  hLine(g, 12, 7, 2, "P");
  hLine(g, 15, 7, 2, "1");
  // Stand.
  fillRect(g, 13, 11, 2, 2, "m");
  hLine(g, 11, 13, 6, "m");
  // Keyboard + mouse on the desk top.
  fillRect(g, 8, 17, 9, 3, "s");
  hLine(g, 9, 18, 7, "S");
  fillRect(g, 19, 18, 2, 2, "s");
  // Small potted plant on the right.
  setPx(g, 26, 12, "l");
  setPx(g, 27, 12, "g");
  fillRect(g, 25, 13, 4, 2, "g");
  setPx(g, 25, 13, "l");
  setPx(g, 28, 14, "G");
  fillRect(g, 25, 15, 4, 2, "2");
  hLine(g, 25, 17, 4, "3");
  // Loose papers on the left.
  fillRect(g, 3, 16, 4, 3, "n");
  hLine(g, 4, 17, 2, "N");
  return sprite("desk_monitor", g);
}

// ---------------------------------------------------------------------------
// Seating
// ---------------------------------------------------------------------------

function chair(): PixelSprite {
  const g = gridFor("chair", 16);
  drawShadow(g, 3, 14, 10);
  // Star base + post.
  hLine(g, 4, 13, 8, "o");
  setPx(g, 4, 14, "o");
  setPx(g, 11, 14, "o");
  fillRect(g, 7, 11, 2, 2, "V");
  // Seat pan.
  outlineRect(g, 2, 6, 12, 6, "o");
  fillRect(g, 3, 7, 10, 4, "i");
  hLine(g, 3, 10, 10, "V");
  // Backrest with highlight (seen from behind).
  outlineRect(g, 3, 0, 10, 7, "o");
  fillRect(g, 4, 1, 8, 5, "I");
  hLine(g, 5, 1, 6, "j");
  setPx(g, 4, 2, "j");
  return sprite("chair", g);
}

function sofaH(): PixelSprite {
  const g = gridFor("sofa_h", 22);
  drawShadow(g, 2, 20, 28);
  // Backrest.
  outlineRect(g, 2, 0, 28, 8, "o");
  trimCorners(g, 2, 0, 28, 8);
  fillRect(g, 3, 1, 26, 6, "e");
  hLine(g, 4, 1, 24, "f");
  // Front base bar.
  outlineRect(g, 4, 16, 24, 4, "o");
  fillRect(g, 5, 17, 22, 2, "E");
  // Seat cushions with a divot line.
  outlineRect(g, 5, 7, 22, 10, "o");
  fillRect(g, 6, 8, 20, 8, "f");
  vLine(g, 16, 8, 7, "E");
  hLine(g, 6, 14, 20, "e");
  hLine(g, 6, 15, 20, "E");
  // Armrests on top.
  outlineRect(g, 0, 5, 6, 14, "o");
  setPx(g, 0, 5, ".");
  setPx(g, 0, 18, ".");
  fillRect(g, 1, 6, 4, 12, "e");
  hLine(g, 1, 6, 4, "f");
  outlineRect(g, 26, 5, 6, 14, "o");
  setPx(g, 31, 5, ".");
  setPx(g, 31, 18, ".");
  fillRect(g, 27, 6, 4, 12, "e");
  hLine(g, 27, 6, 4, "f");
  return sprite("sofa_h", g);
}

function sofaV(): PixelSprite {
  const g = gridFor("sofa_v", 34);
  drawShadow(g, 2, 32, 12);
  // Backrest along the left edge (sofa faces right).
  outlineRect(g, 0, 2, 7, 28, "o");
  trimCorners(g, 0, 2, 7, 28);
  fillRect(g, 1, 3, 5, 26, "e");
  vLine(g, 1, 3, 26, "f");
  // Seat cushions.
  outlineRect(g, 6, 5, 10, 22, "o");
  fillRect(g, 7, 6, 8, 20, "f");
  hLine(g, 7, 16, 8, "E");
  vLine(g, 14, 6, 20, "e");
  // Armrests top and bottom.
  outlineRect(g, 4, 0, 12, 6, "o");
  setPx(g, 15, 0, ".");
  fillRect(g, 5, 1, 10, 4, "e");
  hLine(g, 5, 1, 10, "f");
  outlineRect(g, 4, 26, 12, 6, "o");
  setPx(g, 15, 31, ".");
  setPx(g, 4, 31, ".");
  fillRect(g, 5, 27, 10, 4, "e");
  return sprite("sofa_v", g);
}

function coffeeTable(): PixelSprite {
  const g = gridFor("coffee_table", 16);
  drawShadow(g, 2, 14, 12);
  // Legs.
  fillRect(g, 3, 11, 2, 3, "W");
  fillRect(g, 11, 11, 2, 3, "W");
  // Light wood top with a magazine.
  roundRect(g, 1, 2, 14, 9);
  fillRect(g, 2, 3, 12, 5, "k");
  fillRect(g, 2, 8, 12, 2, "w");
  fillRect(g, 5, 4, 5, 3, "n");
  hLine(g, 6, 5, 2, "b");
  setPx(g, 9, 5, "p");
  return sprite("coffee_table", g);
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function meetingTable(): PixelSprite {
  const g = gridFor("meeting_table", 32);
  roundRect(g, 1, 2, 46, 30);
  fillRect(g, 2, 3, 44, 28, "w");
  hLine(g, 3, 3, 42, "k");
  // Apron / front edge.
  fillRect(g, 2, 28, 44, 3, "W");
  // Subtle placemats.
  fillRect(g, 8, 6, 8, 4, "k");
  fillRect(g, 32, 6, 8, 4, "k");
  fillRect(g, 8, 18, 8, 4, "k");
  fillRect(g, 32, 18, 8, 4, "k");
  // Tiny centerpiece plant.
  fillRect(g, 22, 12, 4, 2, "g");
  setPx(g, 22, 12, "l");
  hLine(g, 22, 14, 4, "2");
  hLine(g, 22, 15, 4, "3");
  return sprite("meeting_table", g);
}

// ---------------------------------------------------------------------------
// Plants + outdoor
// ---------------------------------------------------------------------------

function plant(): PixelSprite {
  const g = gridFor("plant", 22);
  drawShadow(g, 4, 20, 8);
  // Terracotta pot.
  outlineRect(g, 4, 13, 8, 7, "o");
  fillRect(g, 5, 14, 6, 4, "2");
  hLine(g, 5, 18, 6, "3");
  drawFoliage(
    g,
    [
      [7, 6, 5],
      [5, 9, 4],
      [10, 9, 4],
    ],
    { light: 10, dark: 22, highlights: [[5, 4, 3, 2], [9, 7, 2, 2]] },
  );
  return sprite("plant", g);
}

function plantTall(): PixelSprite {
  const g = gridFor("plant_tall", 30);
  drawShadow(g, 4, 28, 8);
  // White pot.
  outlineRect(g, 4, 20, 8, 8, "o");
  fillRect(g, 5, 21, 6, 6, "d");
  hLine(g, 5, 26, 6, "D");
  drawFoliage(
    g,
    [
      [8, 5, 5],
      [5, 10, 4],
      [11, 10, 4],
      [8, 16, 4],
    ],
    { light: 10, dark: 24, highlights: [[6, 3, 3, 2], [4, 9, 2, 2], [10, 12, 2, 2]] },
  );
  return sprite("plant_tall", g);
}

function tree(): PixelSprite {
  const g = gridFor("tree", 40);
  drawShadow(g, 6, 38, 20);
  // Trunk (top tucks under the canopy).
  outlineRect(g, 12, 22, 8, 16, "o");
  fillRect(g, 14, 23, 5, 14, "h");
  vLine(g, 13, 23, 14, "W");
  // Big fluffy canopy: three heavily overlapping lobes.
  drawFoliage(
    g,
    [
      [15, 12, 11],
      [9, 10, 8],
      [22, 10, 8],
    ],
    {
      light: 16,
      dark: 34,
      highlights: [
        [8, 5, 4, 2],
        [14, 3, 4, 2],
        [5, 10, 3, 2],
        [19, 6, 3, 2],
        [12, 8, 2, 2],
      ],
    },
  );
  return sprite("tree", g);
}

/** Small plus-shaped bloom with a contrasting center. */
function drawBloom(g: Grid, x: number, y: number, petal: string, center: string): void {
  setPx(g, x, y - 1, petal);
  setPx(g, x - 1, y, petal);
  setPx(g, x + 1, y, petal);
  setPx(g, x, y + 1, petal);
  setPx(g, x, y, center);
}

function flower(): PixelSprite {
  const g = gridFor("flower", 16);
  hLine(g, 3, 15, 10, "z");
  // Wooden planter with soil.
  outlineRect(g, 1, 9, 14, 6, "o");
  fillRect(g, 2, 10, 12, 3, "w");
  hLine(g, 2, 10, 12, "3");
  hLine(g, 2, 13, 12, "W");
  // Stems, leaves, blooms.
  vLine(g, 4, 7, 3, "g");
  vLine(g, 8, 6, 4, "g");
  vLine(g, 12, 7, 3, "g");
  setPx(g, 5, 8, "l");
  setPx(g, 11, 8, "l");
  drawBloom(g, 4, 5, "p", "y");
  drawBloom(g, 8, 3, "y", "a");
  drawBloom(g, 12, 5, "p", "y");
  return sprite("flower", g);
}

// ---------------------------------------------------------------------------
// Storage + library
// ---------------------------------------------------------------------------

function bookshelf(): PixelSprite {
  const g = gridFor("bookshelf", 30);
  drawShadow(g, 2, 28, 28);
  // Gray-blue case.
  outlineRect(g, 0, 0, 32, 28, "o");
  fillRect(g, 1, 1, 30, 26, "C");
  fillRect(g, 1, 1, 30, 2, "j");
  // Two shelf openings.
  fillRect(g, 2, 4, 28, 9, "V");
  hLine(g, 2, 13, 28, "F");
  fillRect(g, 2, 15, 28, 9, "V");
  hLine(g, 2, 24, 28, "F");
  // Colorful book spines with varied heights.
  const topColors = ["r", "b", "y", "1", "u", "p", "a", "t", "r"];
  const topHeights = [6, 8, 5, 7, 6, 8, 5, 7, 6];
  for (let i = 0; i < 9; i += 1) {
    fillRect(g, 3 + i * 3, 13 - topHeights[i], 2, topHeights[i], topColors[i]);
  }
  const lowColors = ["t", "p", "1", "y", "b", "u", "r", "a"];
  const lowHeights = [7, 5, 8, 6, 7, 5, 6, 8];
  for (let i = 0; i < 8; i += 1) {
    fillRect(g, 3 + i * 3, 24 - lowHeights[i], 2, lowHeights[i], lowColors[i]);
  }
  // Tiny plant at the end of the lower shelf.
  fillRect(g, 27, 21, 2, 3, "2");
  setPx(g, 27, 19, "g");
  setPx(g, 28, 19, "l");
  setPx(g, 28, 20, "g");
  // Plinth.
  fillRect(g, 1, 25, 30, 2, "F");
  return sprite("bookshelf", g);
}

// ---------------------------------------------------------------------------
// Kitchen
// ---------------------------------------------------------------------------

function kitchenCounter(): PixelSprite {
  const g = gridFor("kitchen_counter", 25);
  drawShadow(g, 2, 23, 28);
  // Faucet.
  vLine(g, 7, 1, 3, "S");
  setPx(g, 8, 1, "S");
  // Steel top with sink + cutting board.
  outlineRect(g, 0, 4, 32, 6, "o");
  fillRect(g, 1, 5, 30, 4, "s");
  hLine(g, 1, 8, 30, "S");
  fillRect(g, 4, 5, 8, 3, "S");
  fillRect(g, 5, 6, 6, 2, "F");
  fillRect(g, 20, 5, 7, 3, "w");
  hLine(g, 21, 6, 5, "k");
  setPx(g, 25, 5, "r");
  // Sage cabinets.
  outlineRect(g, 0, 10, 32, 13, "o");
  fillRect(g, 1, 11, 30, 11, "4");
  vLine(g, 15, 11, 11, "5");
  vLine(g, 13, 14, 3, "S");
  vLine(g, 18, 14, 3, "S");
  hLine(g, 1, 21, 30, "5");
  return sprite("kitchen_counter", g);
}

function fridge(): PixelSprite {
  const g = gridFor("fridge", 30);
  drawShadow(g, 3, 28, 10);
  roundRect(g, 2, 0, 12, 28);
  fillRect(g, 3, 1, 10, 26, "d");
  vLine(g, 12, 1, 26, "D");
  hLine(g, 4, 1, 6, "n");
  // Freezer seam + handles.
  hLine(g, 3, 9, 10, "D");
  vLine(g, 4, 3, 4, "S");
  vLine(g, 4, 11, 7, "S");
  hLine(g, 3, 26, 10, "D");
  return sprite("fridge", g);
}

function coffeeMachine(): PixelSprite {
  const g = gridFor("coffee_machine", 26);
  drawShadow(g, 3, 24, 10);
  roundRect(g, 2, 2, 12, 22);
  fillRect(g, 3, 3, 10, 20, "v");
  hLine(g, 3, 3, 10, "j");
  // Display + red brew light.
  fillRect(g, 5, 5, 4, 2, "M");
  setPx(g, 6, 5, "c");
  setPx(g, 11, 5, "r");
  // Brew cavity with mug + pouring coffee.
  fillRect(g, 4, 9, 8, 8, "V");
  hLine(g, 7, 9, 2, "S");
  vLine(g, 7, 10, 3, "h");
  fillRect(g, 6, 13, 3, 3, "n");
  setPx(g, 9, 14, "n");
  // Drip tray + base.
  fillRect(g, 4, 17, 8, 2, "S");
  hLine(g, 5, 21, 6, "V");
  hLine(g, 3, 22, 10, "V");
  return sprite("coffee_machine", g);
}

function waterCooler(): PixelSprite {
  const g = gridFor("water_cooler", 26);
  drawShadow(g, 3, 24, 10);
  // Blue bottle.
  outlineRect(g, 4, 0, 8, 8, "o");
  trimCorners(g, 4, 0, 8, 8);
  fillRect(g, 5, 1, 6, 6, "q");
  vLine(g, 6, 2, 3, "n");
  hLine(g, 5, 6, 6, "Q");
  // White body with taps + recess.
  outlineRect(g, 3, 8, 10, 14, "o");
  fillRect(g, 4, 9, 8, 12, "d");
  fillRect(g, 6, 12, 4, 4, "D");
  setPx(g, 5, 12, "b");
  setPx(g, 10, 12, "r");
  fillRect(g, 4, 19, 8, 2, "D");
  // Feet.
  fillRect(g, 5, 22, 2, 2, "S");
  fillRect(g, 9, 22, 2, 2, "S");
  return sprite("water_cooler", g);
}

function vendingMachine(): PixelSprite {
  const g = gridFor("vending_machine", 31);
  drawShadow(g, 3, 29, 10);
  roundRect(g, 2, 0, 12, 29);
  fillRect(g, 3, 1, 10, 27, "b");
  vLine(g, 12, 2, 26, "B");
  // Glass window with can rows.
  outlineRect(g, 4, 3, 8, 14, "o");
  fillRect(g, 5, 4, 6, 12, "M");
  hLine(g, 5, 7, 6, "F");
  hLine(g, 5, 11, 6, "F");
  hLine(g, 5, 15, 6, "F");
  fillRect(g, 5, 5, 2, 2, "r");
  fillRect(g, 8, 5, 2, 2, "y");
  fillRect(g, 5, 9, 2, 2, "1");
  fillRect(g, 8, 9, 2, 2, "p");
  fillRect(g, 5, 13, 2, 2, "a");
  fillRect(g, 8, 13, 2, 2, "c");
  setPx(g, 10, 4, "n");
  setPx(g, 9, 5, "n");
  // Coin panel + dispenser flap.
  fillRect(g, 9, 18, 3, 4, "v");
  setPx(g, 10, 19, "x");
  setPx(g, 10, 21, "L");
  fillRect(g, 4, 23, 8, 3, "v");
  hLine(g, 5, 24, 6, "x");
  hLine(g, 3, 27, 10, "B");
  return sprite("vending_machine", g);
}

// ---------------------------------------------------------------------------
// Game room
// ---------------------------------------------------------------------------

function pingPongTable(): PixelSprite {
  const g = gridFor("ping_pong_table", 32);
  drawShadow(g, 3, 30, 42);
  // Indigo table with a soft edge.
  roundRect(g, 1, 0, 46, 30);
  fillRect(g, 2, 1, 44, 28, "6");
  fillRect(g, 2, 27, 44, 2, "7");
  // White boundary + centerline.
  outlineRect(g, 3, 2, 42, 24, "n");
  hLine(g, 4, 14, 40, "n");
  // Net across the middle.
  vLine(g, 23, 1, 28, "n");
  vLine(g, 24, 1, 28, "S");
  fillRect(g, 23, 0, 2, 1, "x");
  fillRect(g, 23, 29, 2, 1, "x");
  // Paddles + ball.
  fillRect(g, 9, 6, 3, 3, "r");
  setPx(g, 11, 8, "9");
  setPx(g, 12, 9, "w");
  setPx(g, 13, 10, "w");
  fillRect(g, 35, 20, 3, 3, "b");
  setPx(g, 35, 22, "B");
  setPx(g, 34, 23, "w");
  setPx(g, 33, 24, "w");
  setPx(g, 30, 8, "n");
  return sprite("ping_pong_table", g);
}

function arcade(): PixelSprite {
  const g = gridFor("arcade", 29);
  drawShadow(g, 3, 27, 10);
  roundRect(g, 2, 0, 12, 27);
  fillRect(g, 3, 1, 10, 25, "u");
  // Marquee.
  fillRect(g, 3, 1, 10, 2, "p");
  setPx(g, 5, 2, "y");
  setPx(g, 7, 2, "n");
  setPx(g, 9, 2, "y");
  // Bright screen with tiny game pixels.
  outlineRect(g, 4, 4, 8, 8, "o");
  fillRect(g, 5, 5, 6, 6, "M");
  setPx(g, 5, 5, "y");
  setPx(g, 6, 6, "1");
  setPx(g, 8, 6, "1");
  setPx(g, 10, 6, "1");
  setPx(g, 7, 8, "n");
  setPx(g, 7, 9, "c");
  hLine(g, 6, 10, 3, "c");
  // Control deck: joystick + buttons.
  fillRect(g, 4, 13, 8, 3, "j");
  setPx(g, 6, 12, "r");
  setPx(g, 6, 13, "x");
  setPx(g, 9, 14, "y");
  setPx(g, 11, 14, "b");
  // Front panel decal + vents.
  fillRect(g, 6, 19, 4, 4, "p");
  hLine(g, 5, 24, 6, "V");
  hLine(g, 3, 25, 10, "V");
  return sprite("arcade", g);
}

function jukebox(): PixelSprite {
  const g = gridFor("jukebox", 30);
  drawShadow(g, 3, 28, 10);
  // Rounded dome top.
  hLine(g, 5, 0, 6, "o");
  setPx(g, 4, 1, "o");
  setPx(g, 11, 1, "o");
  fillRect(g, 5, 1, 6, 1, "p");
  setPx(g, 3, 2, "o");
  setPx(g, 12, 2, "o");
  setPx(g, 4, 2, "p");
  setPx(g, 11, 2, "p");
  fillRect(g, 5, 2, 6, 1, "Y");
  // Body.
  vLine(g, 2, 3, 25, "o");
  vLine(g, 13, 3, 25, "o");
  fillRect(g, 3, 3, 10, 24, "w");
  hLine(g, 2, 27, 12, "o");
  // Glow arch.
  vLine(g, 3, 3, 6, "p");
  vLine(g, 12, 3, 6, "p");
  vLine(g, 4, 3, 6, "Y");
  vLine(g, 11, 3, 6, "Y");
  // Record window.
  fillRect(g, 6, 4, 4, 4, "M");
  fillRect(g, 7, 5, 2, 2, "x");
  setPx(g, 6, 4, "n");
  // Song list + colorful buttons.
  fillRect(g, 4, 10, 8, 3, "n");
  hLine(g, 5, 11, 6, "N");
  setPx(g, 5, 13, "r");
  setPx(g, 7, 13, "y");
  setPx(g, 9, 13, "1");
  setPx(g, 11, 13, "b");
  // Speaker grill.
  fillRect(g, 4, 15, 8, 10, "h");
  hLine(g, 5, 17, 6, "x");
  hLine(g, 5, 20, 6, "x");
  hLine(g, 5, 23, 6, "x");
  // Base.
  hLine(g, 3, 25, 10, "W");
  hLine(g, 3, 26, 10, "W");
  return sprite("jukebox", g);
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** White board face on slate legs with a ground shadow. */
function drawBoardFrame(g: Grid): void {
  drawShadow(g, 3, 28, 26);
  fillRect(g, 6, 21, 2, 7, "v");
  fillRect(g, 24, 21, 2, 7, "v");
  hLine(g, 5, 27, 4, "v");
  hLine(g, 23, 27, 4, "v");
  outlineRect(g, 1, 0, 30, 22, "o");
  fillRect(g, 2, 1, 28, 20, "n");
}

function kanbanBoard(): PixelSprite {
  const g = gridFor("kanban_board", 30);
  drawBoardFrame(g);
  // Column dividers + header rule.
  hLine(g, 2, 4, 28, "N");
  vLine(g, 11, 1, 20, "N");
  vLine(g, 21, 1, 20, "N");
  hLine(g, 4, 2, 5, "S");
  hLine(g, 13, 2, 6, "S");
  hLine(g, 23, 2, 6, "S");
  // Sticky notes.
  const notes: Array<[number, number, string]> = [
    [3, 6, "y"],
    [7, 7, "p"],
    [3, 11, "b"],
    [6, 15, "y"],
    [13, 6, "1"],
    [16, 10, "y"],
    [13, 14, "u"],
    [23, 6, "b"],
    [26, 10, "p"],
    [23, 15, "1"],
  ];
  for (const [x, y, ch] of notes) fillRect(g, x, y, 3, 3, ch);
  return sprite("kanban_board", g);
}

function whiteboard(): PixelSprite {
  const g = gridFor("whiteboard", 30);
  drawBoardFrame(g);
  // Marker scribbles.
  hLine(g, 4, 3, 12, "b");
  hLine(g, 4, 5, 16, "S");
  hLine(g, 4, 7, 10, "S");
  setPx(g, 3, 5, "r");
  setPx(g, 3, 7, "r");
  // Bar chart.
  outlineRect(g, 19, 3, 9, 8, "S");
  fillRect(g, 20, 8, 1, 2, "t");
  fillRect(g, 22, 6, 1, 4, "b");
  fillRect(g, 24, 7, 1, 3, "r");
  fillRect(g, 26, 5, 1, 5, "1");
  // Green arrow.
  hLine(g, 4, 12, 8, "1");
  setPx(g, 11, 11, "1");
  setPx(g, 12, 12, "1");
  setPx(g, 11, 13, "1");
  // Note line + pink sticky.
  hLine(g, 4, 16, 11, "m");
  fillRect(g, 25, 14, 3, 3, "p");
  // Marker tray with markers.
  hLine(g, 3, 22, 26, "s");
  setPx(g, 6, 21, "r");
  setPx(g, 8, 21, "b");
  setPx(g, 10, 21, "1");
  return sprite("whiteboard", g);
}

// ---------------------------------------------------------------------------
// Booths
// ---------------------------------------------------------------------------

/** Tall booth: rounded casing, glass pane, sign icon plate, base + shadow. */
function drawBooth(g: Grid, body: string, shade: string): void {
  drawShadow(g, 3, 38, 10);
  roundRect(g, 2, 0, 12, 38);
  fillRect(g, 3, 1, 10, 36, body);
  fillRect(g, 3, 1, 10, 3, shade);
  // Glass pane with a shine.
  outlineRect(g, 4, 5, 8, 17, "o");
  fillRect(g, 5, 6, 6, 15, "q");
  vLine(g, 6, 7, 5, "n");
  // Icon plate + base.
  fillRect(g, 5, 24, 6, 6, shade);
  fillRect(g, 3, 34, 10, 3, shade);
}

function phoneBooth(): PixelSprite {
  const g = gridFor("phone_booth", 40);
  drawBooth(g, "t", "T");
  // Handset icon on the roof band and the plate.
  setPx(g, 5, 2, "n");
  setPx(g, 10, 2, "n");
  hLine(g, 6, 3, 4, "n");
  setPx(g, 6, 26, "n");
  setPx(g, 9, 26, "n");
  hLine(g, 6, 27, 4, "n");
  return sprite("phone_booth", g);
}

function smsBooth(): PixelSprite {
  const g = gridFor("sms_booth", 40);
  drawBooth(g, "8", "9");
  // Speech bubble icons.
  fillRect(g, 6, 2, 4, 2, "n");
  setPx(g, 6, 4, "n");
  fillRect(g, 5, 25, 6, 4, "n");
  setPx(g, 6, 29, "n");
  setPx(g, 6, 26, "9");
  setPx(g, 8, 26, "9");
  return sprite("sms_booth", g);
}

// ---------------------------------------------------------------------------
// Gym
// ---------------------------------------------------------------------------

function treadmill(): PixelSprite {
  const g = gridFor("treadmill", 32);
  // Console (top-down).
  roundRect(g, 2, 0, 12, 6);
  fillRect(g, 3, 1, 10, 4, "m");
  fillRect(g, 5, 2, 6, 2, "c");
  setPx(g, 6, 2, "n");
  setPx(g, 11, 2, "r");
  setPx(g, 11, 3, "y");
  // Side rails.
  vLine(g, 1, 5, 26, "o");
  vLine(g, 2, 5, 26, "s");
  vLine(g, 14, 5, 26, "o");
  vLine(g, 13, 5, 26, "s");
  // Gray-blue belt with tread stripes.
  fillRect(g, 3, 6, 10, 24, "v");
  hLine(g, 3, 6, 10, "V");
  for (let y = 8; y < 30; y += 4) hLine(g, 3, y, 10, "V");
  hLine(g, 3, 30, 10, "v");
  hLine(g, 1, 31, 14, "o");
  return sprite("treadmill", g);
}

/** Dumbbell: two colored plates and a steel bar. */
function drawDumbbell(g: Grid, x: number, y: number, ch: string): void {
  fillRect(g, x, y, 2, 4, ch);
  hLine(g, x + 2, y + 1, 2, "s");
  hLine(g, x + 2, y + 2, 2, "S");
  fillRect(g, x + 4, y, 2, 4, ch);
}

function dumbbellRack(): PixelSprite {
  const g = gridFor("dumbbell_rack", 22);
  drawShadow(g, 2, 20, 28);
  // Slate posts.
  vLine(g, 1, 3, 17, "v");
  vLine(g, 2, 3, 17, "V");
  vLine(g, 29, 3, 17, "V");
  vLine(g, 30, 3, 17, "v");
  // Two shelf bars.
  hLine(g, 3, 9, 26, "v");
  hLine(g, 3, 10, 26, "V");
  hLine(g, 3, 16, 26, "v");
  hLine(g, 3, 17, 26, "V");
  // Weights.
  drawDumbbell(g, 4, 5, "r");
  drawDumbbell(g, 13, 5, "b");
  drawDumbbell(g, 22, 5, "y");
  drawDumbbell(g, 8, 12, "1");
  drawDumbbell(g, 18, 12, "u");
  return sprite("dumbbell_rack", g);
}

// ---------------------------------------------------------------------------
// Tech
// ---------------------------------------------------------------------------

function serverRack(): PixelSprite {
  const g = gridFor("server_rack", 30);
  drawShadow(g, 3, 28, 10);
  outlineRect(g, 2, 0, 12, 28, "o");
  fillRect(g, 3, 1, 10, 26, "v");
  hLine(g, 3, 1, 10, "j");
  // Rack units with vents and green + amber LEDs.
  for (let i = 0; i < 4; i += 1) {
    const y = 3 + i * 6;
    fillRect(g, 4, y, 8, 4, "V");
    hLine(g, 5, y + 2, 4, "x");
    setPx(g, 10, y + 1, "L");
    setPx(g, 11, y + 1, i % 2 === 0 ? "a" : "L");
  }
  hLine(g, 3, 26, 10, "V");
  return sprite("server_rack", g);
}

function tvStand(): PixelSprite {
  const g = gridFor("tv_stand", 26);
  drawShadow(g, 2, 24, 28);
  // Wood console.
  roundRect(g, 1, 13, 30, 10);
  fillRect(g, 2, 14, 28, 8, "w");
  hLine(g, 2, 14, 28, "k");
  vLine(g, 11, 15, 6, "W");
  vLine(g, 21, 15, 6, "W");
  setPx(g, 9, 17, "W");
  setPx(g, 23, 17, "W");
  hLine(g, 2, 21, 28, "W");
  fillRect(g, 3, 23, 2, 1, "W");
  fillRect(g, 27, 23, 2, 1, "W");
  // TV with a colorful sunset scene.
  outlineRect(g, 4, 0, 24, 12, "o");
  fillRect(g, 5, 1, 22, 10, "m");
  fillRect(g, 6, 2, 20, 4, "c");
  fillRect(g, 21, 3, 3, 2, "y");
  fillRect(g, 6, 6, 20, 4, "1");
  fillRect(g, 6, 8, 20, 2, "g");
  hLine(g, 8, 12, 3, "m");
  hLine(g, 21, 12, 3, "m");
  return sprite("tv_stand", g);
}

function atm(): PixelSprite {
  const g = gridFor("atm", 26);
  drawShadow(g, 3, 24, 10);
  roundRect(g, 2, 0, 12, 24);
  fillRect(g, 3, 1, 10, 22, "s");
  vLine(g, 12, 2, 21, "S");
  fillRect(g, 3, 1, 10, 2, "t");
  // Small green screen.
  outlineRect(g, 4, 4, 8, 6, "o");
  fillRect(g, 5, 5, 6, 4, "M");
  hLine(g, 6, 6, 3, "1");
  hLine(g, 6, 8, 2, "1");
  // Keypad, card slot, cash tray.
  for (const y of [12, 14]) {
    setPx(g, 5, y, "x");
    setPx(g, 7, y, "x");
    setPx(g, 9, y, "x");
  }
  hLine(g, 5, 17, 6, "x");
  fillRect(g, 5, 19, 6, 2, "V");
  hLine(g, 6, 20, 4, "x");
  hLine(g, 3, 22, 10, "S");
  return sprite("atm", g);
}

// ---------------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------------

function rug(): PixelSprite {
  const g = gridFor("rug", 32);
  // Round cream rug with a terracotta ring (hard threshold, no AA).
  const cx = 15.5;
  const cy = 15.5;
  const radius = 16;
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const nx = (x - cx) / radius;
      const ny = (y - cy) / radius;
      const rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      if (rr > 0.8) setPx(g, x, y, "R");
      else if (rr > 0.36) setPx(g, x, y, "0");
      else if (rr > 0.22) setPx(g, x, y, "R");
      else setPx(g, x, y, "0");
    }
  }
  // Small center motif.
  fillRect(g, 15, 15, 2, 2, "R");
  return sprite("rug", g);
}

function lamp(): PixelSprite {
  const g = gridFor("lamp", 30);
  drawShadow(g, 4, 28, 8);
  // Warm halo.
  fillRect(g, 3, 0, 10, 9, "Y");
  trimCorners(g, 3, 0, 10, 9);
  // Shade (trapezoid).
  hLine(g, 6, 1, 4, "o");
  setPx(g, 5, 2, "o");
  fillRect(g, 6, 2, 4, 1, "y");
  setPx(g, 10, 2, "o");
  setPx(g, 5, 3, "o");
  fillRect(g, 6, 3, 4, 1, "y");
  setPx(g, 10, 3, "o");
  setPx(g, 4, 4, "o");
  fillRect(g, 5, 4, 6, 1, "y");
  setPx(g, 11, 4, "o");
  setPx(g, 4, 5, "o");
  fillRect(g, 5, 5, 6, 1, "a");
  setPx(g, 11, 5, "o");
  hLine(g, 4, 6, 8, "o");
  // Pole + base.
  vLine(g, 7, 7, 18, "o");
  vLine(g, 8, 7, 18, "v");
  hLine(g, 6, 25, 4, "v");
  hLine(g, 5, 26, 6, "v");
  hLine(g, 4, 27, 8, "V");
  return sprite("lamp", g);
}

/** Small orange fish; dir 1 faces right, -1 faces left. */
function drawFish(g: Grid, x: number, y: number, dir: 1 | -1): void {
  fillRect(g, x, y, 3, 2, "a");
  const tailX = dir === 1 ? x - 1 : x + 3;
  setPx(g, tailX, y, "8");
  setPx(g, tailX, y + 1, "8");
  setPx(g, dir === 1 ? x + 2 : x, y, "x");
}

function aquarium(): PixelSprite {
  const g = gridFor("aquarium", 26);
  drawShadow(g, 2, 24, 28);
  // Tank.
  outlineRect(g, 1, 0, 30, 17, "o");
  hLine(g, 2, 1, 28, "s");
  fillRect(g, 2, 2, 28, 14, "q");
  fillRect(g, 2, 11, 28, 5, "Q");
  hLine(g, 2, 15, 28, "S");
  // Plants.
  vLine(g, 4, 9, 6, "g");
  setPx(g, 3, 10, "l");
  setPx(g, 5, 12, "l");
  vLine(g, 27, 8, 7, "g");
  setPx(g, 26, 9, "l");
  setPx(g, 28, 12, "G");
  // Fish + bubbles.
  drawFish(g, 8, 5, 1);
  drawFish(g, 19, 9, -1);
  setPx(g, 14, 4, "n");
  setPx(g, 15, 7, "n");
  setPx(g, 13, 10, "n");
  setPx(g, 24, 4, "n");
  // Slate stand.
  outlineRect(g, 1, 17, 30, 7, "o");
  fillRect(g, 2, 18, 28, 5, "v");
  vLine(g, 15, 18, 5, "V");
  hLine(g, 2, 22, 28, "V");
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
