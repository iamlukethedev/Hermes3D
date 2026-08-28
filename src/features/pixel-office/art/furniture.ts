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
const PURPLE_DARK = "#8474c2";
const BOOTH_TEAL = "#5fb3a8";
const BOOTH_TEAL_DARK = "#478f86";
const WATER_BLUE = "#9fd4ec";
const WATER_BLUE_DARK = "#77b4d6";
const PALE_GLASS = "#d8eef8";

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
const INDIGO_LIGHT = "#8b98d9";

const CORAL = "#e08a7a";
const CORAL_DARK = "#c26e5e";

const RUG_CREAM = "#f1e6d4";
const RUG_TERRA = "#d99a76";

const WARM_GLOW = "#ffe9b0";
const GLOW_HALO = "#ffe9b04d";
const STEAM_WHITE = "#ffffff59";

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
  X: PURPLE_DARK,
  t: BOOTH_TEAL,
  T: BOOTH_TEAL_DARK,
  q: WATER_BLUE,
  Q: WATER_BLUE_DARK,
  A: PALE_GLASS,
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
  J: INDIGO_LIGHT,
  "8": CORAL,
  "9": CORAL_DARK,
  "0": RUG_CREAM,
  R: RUG_TERRA,
  Y: WARM_GLOW,
  K: GLOW_HALO,
  "*": STEAM_WHITE,
  L: LED_GREEN,
};

function sprite(kind: PixelObjectKind, grid: Grid): PixelSprite {
  return makeSprite(`furn_${kind}`, PAL, gridRows(grid));
}

/** Grid sized to the kind's footprint width and the requested height. */
function gridFor(kind: PixelObjectKind, height: number): Grid {
  return makeGrid(OBJECT_FOOTPRINT[kind][0] * PIXEL_TILE_SIZE, height);
}

/** 3-row translucent ground shadow; draw before the body so feet overlap it. */
function drawShadow(g: Grid, x: number, y: number, w: number): void {
  hLine(g, x + 2, y, w - 4, "z");
  hLine(g, x, y + 1, w, "z");
  hLine(g, x + 4, y + 2, w - 8, "z");
}

/** Knocks the four corner pixels out of a rect (radius-1 soft rounding). */
function trimCorners(g: Grid, x: number, y: number, w: number, h: number): void {
  setPx(g, x, y, ".");
  setPx(g, x + w - 1, y, ".");
  setPx(g, x, y + h - 1, ".");
  setPx(g, x + w - 1, y + h - 1, ".");
}

/** Outlined rect with radius-2 rounded corners; only safe over transparent ground. */
function roundRect(g: Grid, x: number, y: number, w: number, h: number): void {
  hLine(g, x + 2, y, w - 4, "o");
  hLine(g, x + 2, y + h - 1, w - 4, "o");
  vLine(g, x, y + 2, h - 4, "o");
  vLine(g, x + w - 1, y + 2, h - 4, "o");
  setPx(g, x + 1, y + 1, "o");
  setPx(g, x + w - 2, y + 1, "o");
  setPx(g, x + 1, y + h - 2, "o");
  setPx(g, x + w - 2, y + h - 2, "o");
}

/** Fills the interior of a radius-2 roundRect with one color. */
function fillRound(g: Grid, x: number, y: number, w: number, h: number, ch: string): void {
  fillRect(g, x + 1, y + 2, w - 2, h - 4, ch);
  fillRect(g, x + 2, y + 1, w - 4, h - 2, ch);
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

/** White pod desk slab: rounded top with sheen, shaded lip, legs, shadow. */
function drawDeskBody(g: Grid, y: number): void {
  drawShadow(g, 3, y + 33, 58);
  // Legs with an inner shade column.
  fillRect(g, 5, y + 26, 6, 8, "D");
  vLine(g, 10, y + 26, 8, "S");
  hLine(g, 5, y + 33, 6, "S");
  fillRect(g, 53, y + 26, 6, 8, "D");
  vLine(g, 58, y + 26, 8, "S");
  hLine(g, 53, y + 33, 6, "S");
  // Slab with rounded corners.
  roundRect(g, 0, y, 64, 28);
  fillRound(g, 0, y, 64, 28, "d");
  // Top sheen.
  hLine(g, 3, y + 1, 58, "n");
  hLine(g, 2, y + 2, 8, "n");
  // Front lip with a base line.
  fillRect(g, 1, y + 20, 62, 6, "D");
  hLine(g, 1, y + 26, 62, "S");
}

function desk(): PixelSprite {
  const g = gridFor("desk", 36);
  drawDeskBody(g, 0);
  // Two loosely stacked paper sheets.
  fillRect(g, 10, 4, 11, 8, "n");
  vLine(g, 20, 5, 6, "N");
  fillRect(g, 6, 7, 12, 9, "n");
  hLine(g, 8, 9, 8, "N");
  hLine(g, 8, 11, 6, "N");
  hLine(g, 8, 13, 8, "N");
  // Blue notebook with a spine and label band.
  fillRect(g, 27, 9, 11, 8, "b");
  vLine(g, 27, 9, 8, "B");
  hLine(g, 29, 11, 7, "n");
  // Pen.
  hLine(g, 30, 18, 4, "x");
  // Coffee mug with rim, coffee, handle, and a steam hint.
  fillRect(g, 44, 7, 8, 8, "r");
  hLine(g, 44, 7, 8, "9");
  hLine(g, 46, 8, 4, "h");
  hLine(g, 45, 13, 6, "9");
  outlineRect(g, 52, 9, 3, 4, "9");
  setPx(g, 47, 2, "*");
  setPx(g, 46, 4, "*");
  setPx(g, 49, 3, "*");
  setPx(g, 48, 5, "*");
  return sprite("desk", g);
}

function deskMonitor(): PixelSprite {
  const g = gridFor("desk_monitor", 60);
  drawDeskBody(g, 24);
  // Monitor panel with a rounded bezel.
  roundRect(g, 14, 0, 36, 21);
  fillRound(g, 14, 0, 36, 21, "m");
  fillRect(g, 17, 3, 30, 15, "M");
  // Window chrome bar with traffic-light dots and a title dash.
  fillRect(g, 17, 3, 30, 3, "v");
  setPx(g, 19, 4, "r");
  setPx(g, 21, 4, "y");
  setPx(g, 23, 4, "1");
  hLine(g, 28, 4, 10, "S");
  // Six colored code lines with varied indents.
  hLine(g, 19, 7, 4, "P");
  hLine(g, 24, 7, 9, "c");
  hLine(g, 21, 9, 5, "c");
  hLine(g, 27, 9, 6, "1");
  hLine(g, 19, 11, 3, "y");
  hLine(g, 23, 11, 6, "P");
  hLine(g, 30, 11, 4, "n");
  hLine(g, 21, 13, 10, "c");
  hLine(g, 32, 13, 3, "1");
  hLine(g, 19, 15, 5, "P");
  hLine(g, 25, 15, 4, "c");
  hLine(g, 30, 15, 6, "n");
  // Stand neck + base plate on the desk.
  fillRect(g, 30, 20, 4, 5, "m");
  fillRect(g, 26, 25, 12, 2, "m");
  hLine(g, 26, 26, 12, "V");
  // Keyboard with key rows and a space bar.
  outlineRect(g, 15, 31, 20, 9, "o");
  fillRect(g, 16, 32, 18, 7, "s");
  for (let ky = 33; ky <= 35; ky += 2) {
    for (let kx = 17; kx <= 31; kx += 3) hLine(g, kx, ky, 2, "S");
  }
  hLine(g, 21, 37, 8, "S");
  // Mouse pad + mouse.
  fillRect(g, 38, 32, 12, 9, "v");
  trimCorners(g, 38, 32, 12, 9);
  fillRect(g, 42, 34, 4, 6, "s");
  vLine(g, 43, 37, 2, "S");
  setPx(g, 42, 34, "n");
  // Mug with steam beside the stand.
  fillRect(g, 40, 25, 6, 6, "r");
  hLine(g, 40, 25, 6, "9");
  hLine(g, 41, 26, 3, "h");
  outlineRect(g, 46, 26, 2, 3, "9");
  setPx(g, 42, 23, "*");
  setPx(g, 44, 22, "*");
  setPx(g, 43, 21, "*");
  // Small potted plant on the right.
  fillRect(g, 52, 32, 7, 6, "2");
  hLine(g, 52, 32, 7, "e");
  hLine(g, 52, 37, 7, "3");
  fillRect(g, 52, 26, 7, 6, "g");
  trimCorners(g, 52, 26, 7, 6);
  setPx(g, 53, 26, "l");
  setPx(g, 54, 27, "l");
  setPx(g, 52, 28, "l");
  setPx(g, 57, 30, "G");
  setPx(g, 58, 31, "G");
  setPx(g, 55, 24, "g");
  setPx(g, 56, 25, "l");
  // Loose papers on the left.
  fillRect(g, 3, 29, 10, 8, "n");
  hLine(g, 5, 31, 6, "N");
  hLine(g, 5, 33, 5, "N");
  return sprite("desk_monitor", g);
}

// ---------------------------------------------------------------------------
// Seating
// ---------------------------------------------------------------------------

function chair(): PixelSprite {
  const g = gridFor("chair", 32);
  drawShadow(g, 5, 29, 22);
  // 5-star base: post, spokes, casters.
  hLine(g, 5, 26, 9, "o");
  hLine(g, 18, 26, 9, "o");
  setPx(g, 12, 27, "o");
  setPx(g, 11, 28, "o");
  setPx(g, 19, 27, "o");
  setPx(g, 20, 28, "o");
  fillRect(g, 3, 26, 3, 3, "V");
  fillRect(g, 26, 26, 3, 3, "V");
  fillRect(g, 9, 28, 3, 3, "V");
  fillRect(g, 20, 28, 3, 3, "V");
  fillRect(g, 14, 20, 4, 6, "V");
  vLine(g, 14, 20, 6, "v");
  // Backrest seen from behind: top highlight band, bolsters, lumbar seam.
  roundRect(g, 5, 0, 22, 14);
  fillRound(g, 5, 0, 22, 14, "I");
  fillRect(g, 8, 1, 16, 3, "j");
  vLine(g, 6, 3, 9, "i");
  vLine(g, 25, 3, 9, "i");
  setPx(g, 9, 7, "i");
  hLine(g, 10, 8, 12, "i");
  setPx(g, 22, 7, "i");
  // Seat pan with a lit rear edge and a darker front skirt.
  roundRect(g, 3, 12, 26, 10);
  fillRound(g, 3, 12, 26, 10, "i");
  hLine(g, 6, 13, 20, "j");
  fillRect(g, 4, 18, 24, 3, "V");
  // Armrests hugging the seat sides.
  outlineRect(g, 0, 8, 4, 11, "o");
  fillRect(g, 1, 9, 2, 9, "v");
  hLine(g, 1, 9, 2, "s");
  outlineRect(g, 28, 8, 4, 11, "o");
  fillRect(g, 29, 9, 2, 9, "v");
  hLine(g, 29, 9, 2, "s");
  return sprite("chair", g);
}

function sofaH(): PixelSprite {
  const g = gridFor("sofa_h", 44);
  drawShadow(g, 4, 41, 56);
  // Base bar with feet.
  roundRect(g, 6, 28, 52, 11);
  fillRound(g, 6, 28, 52, 11, "E");
  hLine(g, 8, 29, 48, "e");
  fillRect(g, 9, 39, 4, 3, "V");
  fillRect(g, 51, 39, 4, 3, "V");
  // Seat cushions: divot split, piping, shaded front roll.
  roundRect(g, 9, 14, 46, 18);
  fillRound(g, 9, 14, 46, 18, "f");
  hLine(g, 11, 15, 42, "e");
  vLine(g, 31, 16, 13, "E");
  vLine(g, 32, 16, 13, "e");
  fillRect(g, 11, 26, 42, 3, "e");
  fillRect(g, 11, 29, 42, 2, "E");
  // Backrest with a lit top band, divot, and bottom piping.
  roundRect(g, 4, 0, 56, 16);
  fillRound(g, 4, 0, 56, 16, "e");
  fillRect(g, 6, 1, 52, 4, "f");
  vLine(g, 31, 2, 12, "E");
  vLine(g, 32, 2, 12, "e");
  hLine(g, 6, 14, 52, "E");
  // Armrests with lit caps and inner shading.
  roundRect(g, 0, 10, 10, 25);
  fillRound(g, 0, 10, 10, 25, "e");
  fillRect(g, 2, 11, 6, 4, "f");
  vLine(g, 8, 15, 16, "E");
  fillRect(g, 1, 30, 8, 3, "E");
  roundRect(g, 54, 10, 10, 25);
  fillRound(g, 54, 10, 10, 25, "e");
  fillRect(g, 56, 11, 6, 4, "f");
  vLine(g, 55, 15, 16, "E");
  fillRect(g, 55, 30, 8, 3, "E");
  // Blue throw pillow on the right cushion.
  fillRect(g, 37, 16, 10, 9, "b");
  trimCorners(g, 37, 16, 10, 9);
  hLine(g, 39, 18, 4, "n");
  hLine(g, 38, 23, 8, "B");
  return sprite("sofa_h", g);
}

function sofaV(): PixelSprite {
  const g = gridFor("sofa_v", 68);
  drawShadow(g, 4, 65, 24);
  // Seat cushions (sofa faces right): split, shaded front edge.
  roundRect(g, 9, 8, 21, 48);
  fillRound(g, 9, 8, 21, 48, "f");
  hLine(g, 11, 31, 17, "E");
  hLine(g, 11, 32, 17, "e");
  vLine(g, 26, 10, 44, "e");
  vLine(g, 27, 10, 44, "e");
  vLine(g, 28, 10, 44, "E");
  // Backrest along the left edge with piping.
  roundRect(g, 0, 2, 11, 60);
  fillRound(g, 0, 2, 11, 60, "e");
  fillRect(g, 2, 3, 7, 4, "f");
  vLine(g, 9, 4, 56, "E");
  // Armrests top and bottom with lit caps.
  roundRect(g, 6, 0, 26, 11);
  fillRound(g, 6, 0, 26, 11, "e");
  fillRect(g, 8, 1, 22, 3, "f");
  roundRect(g, 6, 53, 26, 11);
  fillRound(g, 6, 53, 26, 11, "e");
  fillRect(g, 8, 54, 22, 2, "f");
  fillRect(g, 8, 60, 22, 2, "E");
  // Blue throw pillow near the top seat.
  fillRect(g, 12, 12, 9, 9, "b");
  trimCorners(g, 12, 12, 9, 9);
  hLine(g, 14, 14, 4, "n");
  hLine(g, 13, 19, 7, "B");
  // Feet.
  fillRect(g, 8, 63, 3, 4, "V");
  fillRect(g, 25, 63, 3, 4, "V");
  return sprite("sofa_v", g);
}

function coffeeTable(): PixelSprite {
  const g = gridFor("coffee_table", 32);
  drawShadow(g, 3, 29, 26);
  // Wooden legs.
  fillRect(g, 5, 22, 3, 8, "W");
  vLine(g, 5, 22, 8, "h");
  fillRect(g, 24, 22, 3, 8, "W");
  vLine(g, 24, 22, 8, "h");
  // Light wood top with a front lip and grain dashes.
  roundRect(g, 0, 4, 32, 20);
  fillRound(g, 0, 4, 32, 20, "k");
  fillRect(g, 1, 17, 30, 4, "w");
  fillRect(g, 1, 21, 30, 2, "W");
  hLine(g, 6, 9, 5, "w");
  hLine(g, 20, 12, 5, "w");
  hLine(g, 10, 14, 4, "w");
  // Magazine with a title line.
  fillRect(g, 7, 7, 11, 8, "n");
  trimCorners(g, 7, 7, 11, 8);
  hLine(g, 9, 9, 6, "b");
  hLine(g, 9, 11, 7, "N");
  hLine(g, 9, 13, 5, "N");
  setPx(g, 16, 9, "p");
  // Teal mug.
  fillRect(g, 21, 8, 5, 5, "t");
  hLine(g, 21, 8, 5, "T");
  hLine(g, 22, 9, 3, "h");
  vLine(g, 26, 9, 3, "T");
  return sprite("coffee_table", g);
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function meetingTable(): PixelSprite {
  const g = gridFor("meeting_table", 64);
  drawShadow(g, 6, 61, 84);
  // Big rounded slab with a lit top edge.
  roundRect(g, 1, 0, 94, 61);
  fillRound(g, 1, 0, 94, 61, "w");
  hLine(g, 4, 1, 88, "k");
  hLine(g, 3, 2, 90, "k");
  // Soft diagonal sheen dashes near the lit corner.
  for (let y = 4; y < 18; y += 1) hLine(g, 40 - y, y, 9, "k");
  for (let y = 6; y < 14; y += 1) hLine(g, 54 - y, y, 4, "k");
  // Wood grain dashes.
  hLine(g, 20, 18, 6, "W");
  hLine(g, 70, 20, 5, "W");
  hLine(g, 10, 30, 5, "W");
  hLine(g, 82, 32, 4, "W");
  hLine(g, 30, 49, 6, "W");
  hLine(g, 60, 48, 5, "W");
  // Apron / front edge.
  fillRect(g, 2, 53, 92, 6, "W");
  // Six rounded placemats.
  for (const [mx, my] of [
    [14, 7],
    [40, 7],
    [66, 7],
    [14, 37],
    [40, 37],
    [66, 37],
  ] as Array<[number, number]>) {
    fillRect(g, mx, my, 16, 9, "0");
    trimCorners(g, mx, my, 16, 9);
    hLine(g, mx + 1, my + 8, 14, "k");
  }
  // Centerpiece plant in a terracotta pot.
  fillRect(g, 43, 22, 10, 6, "g");
  trimCorners(g, 43, 22, 10, 6);
  hLine(g, 44, 22, 4, "l");
  setPx(g, 43, 23, "l");
  setPx(g, 51, 26, "G");
  setPx(g, 52, 27, "G");
  hLine(g, 42, 28, 12, "2");
  fillRect(g, 43, 29, 10, 3, "2");
  hLine(g, 44, 29, 5, "e");
  hLine(g, 43, 31, 10, "3");
  return sprite("meeting_table", g);
}

// ---------------------------------------------------------------------------
// Plants + outdoor
// ---------------------------------------------------------------------------

function plant(): PixelSprite {
  const g = gridFor("plant", 44);
  drawShadow(g, 6, 41, 20);
  // Layered foliage first so the pot rim overlaps the lowest leaves.
  drawFoliage(
    g,
    [
      [16, 13, 10],
      [9, 18, 7],
      [23, 18, 7],
      [16, 22, 7],
    ],
    {
      light: 22,
      dark: 44,
      highlights: [
        [10, 8, 6, 3],
        [18, 14, 4, 2],
        [6, 16, 3, 2],
      ],
    },
  );
  // Terracotta pot: outlined rim with a highlight, tapered shaded body.
  outlineRect(g, 6, 25, 20, 5, "o");
  trimCorners(g, 6, 25, 20, 5);
  fillRect(g, 7, 26, 18, 3, "2");
  hLine(g, 8, 26, 14, "e");
  vLine(g, 8, 30, 11, "o");
  vLine(g, 23, 30, 11, "o");
  fillRect(g, 9, 30, 14, 11, "2");
  fillRect(g, 20, 30, 3, 11, "3");
  hLine(g, 9, 40, 14, "3");
  hLine(g, 9, 41, 14, "o");
  return sprite("plant", g);
}

function plantTall(): PixelSprite {
  const g = gridFor("plant_tall", 60);
  drawShadow(g, 6, 57, 20);
  drawFoliage(
    g,
    [
      [16, 10, 9],
      [9, 19, 7],
      [23, 19, 7],
      [16, 26, 8],
      [16, 36, 6],
    ],
    {
      light: 20,
      dark: 50,
      highlights: [
        [11, 5, 6, 3],
        [5, 16, 4, 2],
        [19, 22, 4, 2],
        [13, 32, 4, 2],
      ],
    },
  );
  // Tall white pot with a rim and shaded side.
  outlineRect(g, 6, 41, 20, 5, "o");
  trimCorners(g, 6, 41, 20, 5);
  fillRect(g, 7, 42, 18, 3, "d");
  hLine(g, 8, 42, 14, "n");
  vLine(g, 8, 46, 11, "o");
  vLine(g, 23, 46, 11, "o");
  fillRect(g, 9, 46, 14, 11, "d");
  fillRect(g, 20, 46, 3, 11, "D");
  hLine(g, 9, 56, 14, "D");
  hLine(g, 9, 57, 14, "o");
  return sprite("plant_tall", g);
}

function tree(): PixelSprite {
  const g = gridFor("tree", 80);
  drawShadow(g, 14, 77, 36);
  // Trunk with a shaded left side and a root flare.
  vLine(g, 26, 40, 36, "o");
  vLine(g, 37, 40, 36, "o");
  fillRect(g, 27, 40, 10, 36, "h");
  fillRect(g, 27, 40, 2, 36, "W");
  vLine(g, 35, 42, 32, "k");
  fillRect(g, 23, 72, 18, 4, "h");
  fillRect(g, 23, 72, 3, 4, "W");
  hLine(g, 23, 76, 18, "o");
  vLine(g, 22, 73, 3, "o");
  vLine(g, 41, 73, 3, "o");
  // Big fluffy canopy: heavily overlapping lobes.
  drawFoliage(
    g,
    [
      [32, 22, 20],
      [16, 20, 13],
      [48, 20, 13],
      [32, 10, 13],
      [10, 30, 9],
      [54, 30, 9],
      [24, 34, 10],
      [42, 34, 10],
    ],
    {
      light: 40,
      dark: 72,
      highlights: [
        [14, 8, 8, 3],
        [26, 4, 8, 3],
        [40, 10, 6, 3],
        [8, 20, 5, 3],
        [50, 16, 5, 3],
        [20, 14, 4, 2],
        [34, 20, 5, 2],
      ],
    },
  );
  return sprite("tree", g);
}

/** Chunky bloom: 2x2 center with four 2x2 petals. */
function drawBloom(g: Grid, x: number, y: number, petal: string, center: string): void {
  fillRect(g, x, y - 2, 2, 2, petal);
  fillRect(g, x, y + 2, 2, 2, petal);
  fillRect(g, x - 2, y, 2, 2, petal);
  fillRect(g, x + 2, y, 2, 2, petal);
  fillRect(g, x, y, 2, 2, center);
}

function flower(): PixelSprite {
  const g = gridFor("flower", 32);
  hLine(g, 4, 30, 24, "z");
  hLine(g, 6, 31, 20, "z");
  // Wooden planter with soil.
  outlineRect(g, 2, 20, 28, 10, "o");
  trimCorners(g, 2, 20, 28, 10);
  fillRect(g, 3, 21, 26, 8, "w");
  fillRect(g, 4, 21, 24, 2, "3");
  fillRect(g, 3, 26, 26, 3, "W");
  // Stems + leaves.
  vLine(g, 7, 13, 8, "g");
  vLine(g, 15, 10, 11, "g");
  vLine(g, 23, 13, 8, "g");
  setPx(g, 9, 16, "l");
  setPx(g, 10, 15, "l");
  setPx(g, 13, 14, "l");
  setPx(g, 21, 16, "l");
  setPx(g, 22, 15, "l");
  // Blooms + small buds.
  drawBloom(g, 6, 9, "p", "y");
  drawBloom(g, 14, 5, "y", "a");
  drawBloom(g, 22, 9, "u", "y");
  fillRect(g, 11, 12, 2, 2, "p");
  fillRect(g, 19, 12, 2, 2, "r");
  return sprite("flower", g);
}

// ---------------------------------------------------------------------------
// Storage + library
// ---------------------------------------------------------------------------

function bookshelf(): PixelSprite {
  const g = gridFor("bookshelf", 60);
  drawShadow(g, 3, 57, 58);
  // Gray-blue case with a lit top face and shaded side.
  roundRect(g, 0, 8, 64, 46);
  fillRound(g, 0, 8, 64, 46, "C");
  fillRect(g, 2, 9, 60, 3, "j");
  fillRect(g, 61, 12, 2, 40, "F");
  // Two shelf openings with board edges.
  fillRect(g, 4, 13, 56, 15, "V");
  hLine(g, 4, 28, 56, "j");
  hLine(g, 4, 29, 56, "F");
  fillRect(g, 4, 30, 56, 15, "V");
  hLine(g, 4, 45, 56, "j");
  hLine(g, 4, 46, 56, "F");
  // Plinth.
  fillRect(g, 2, 47, 60, 5, "F");
  hLine(g, 2, 52, 60, "V");
  // Top shelf: varied book spines, one leaning book, a steel bookend.
  const topColors = ["r", "b", "y", "1", "u", "p", "a", "t", "6", "q"];
  const topHeights = [11, 13, 9, 12, 10, 14, 9, 12, 11, 10];
  for (let i = 0; i < 10; i += 1) {
    fillRect(g, 6 + i * 4, 28 - topHeights[i], 3, topHeights[i], topColors[i]);
    if (i % 3 === 0) setPx(g, 7 + i * 4, 24, "n");
  }
  for (let k = 0; k < 12; k += 1) hLine(g, 47 + (k >> 2), 16 + k, 4, "8");
  fillRect(g, 55, 20, 2, 8, "s");
  vLine(g, 56, 20, 8, "S");
  // Lower shelf: spines plus a flat stack.
  const lowColors = ["t", "p", "1", "y", "b", "u", "r", "a"];
  const lowHeights = [12, 9, 13, 10, 12, 9, 11, 13];
  for (let i = 0; i < 8; i += 1) {
    fillRect(g, 6 + i * 4, 45 - lowHeights[i], 3, lowHeights[i], lowColors[i]);
    if (i % 3 === 1) setPx(g, 7 + i * 4, 41, "n");
  }
  fillRect(g, 41, 42, 14, 3, "6");
  fillRect(g, 42, 39, 12, 3, "y");
  fillRect(g, 43, 36, 10, 3, "p");
  // Small potted plant on top of the case.
  hLine(g, 46, 3, 10, "2");
  fillRect(g, 47, 4, 8, 3, "2");
  hLine(g, 47, 6, 8, "3");
  fillRect(g, 46, 0, 10, 3, "g");
  trimCorners(g, 46, 0, 10, 3);
  setPx(g, 47, 0, "l");
  setPx(g, 49, 1, "l");
  setPx(g, 54, 2, "G");
  return sprite("bookshelf", g);
}

// ---------------------------------------------------------------------------
// Kitchen
// ---------------------------------------------------------------------------

function kitchenCounter(): PixelSprite {
  const g = gridFor("kitchen_counter", 50);
  drawShadow(g, 3, 47, 58);
  // Gooseneck faucet with a handle.
  fillRect(g, 14, 4, 2, 7, "s");
  hLine(g, 14, 3, 5, "s");
  vLine(g, 18, 4, 2, "S");
  setPx(g, 18, 7, "q");
  fillRect(g, 11, 5, 2, 2, "S");
  // Counter block: steel top, lip, sage cabinet faces, kick.
  roundRect(g, 0, 10, 64, 36);
  fillRound(g, 0, 10, 64, 36, "s");
  hLine(g, 2, 11, 60, "n");
  fillRect(g, 1, 18, 62, 2, "S");
  fillRect(g, 1, 20, 62, 20, "4");
  vLine(g, 32, 22, 15, "5");
  outlineRect(g, 6, 22, 22, 15, "5");
  outlineRect(g, 36, 22, 22, 15, "5");
  vLine(g, 25, 25, 6, "S");
  vLine(g, 39, 25, 6, "S");
  fillRect(g, 1, 40, 62, 2, "5");
  fillRect(g, 1, 42, 62, 3, "F");
  // Sink: rim, shaded basin, water glint, drain.
  fillRect(g, 6, 11, 20, 7, "S");
  fillRect(g, 8, 12, 16, 5, "F");
  hLine(g, 9, 13, 6, "q");
  hLine(g, 8, 16, 16, "V");
  fillRect(g, 15, 15, 2, 1, "x");
  // Cutting board with a knife and a tomato.
  fillRect(g, 36, 12, 16, 6, "w");
  trimCorners(g, 36, 12, 16, 6);
  fillRect(g, 38, 13, 12, 2, "k");
  hLine(g, 39, 16, 6, "s");
  hLine(g, 45, 16, 3, "h");
  fillRect(g, 50, 13, 2, 2, "r");
  setPx(g, 50, 12, "x");
  return sprite("kitchen_counter", g);
}

function fridge(): PixelSprite {
  const g = gridFor("fridge", 60);
  drawShadow(g, 4, 57, 24);
  // Tall white body with a shaded right side and top sheen.
  roundRect(g, 3, 0, 26, 54);
  fillRound(g, 3, 0, 26, 54, "d");
  fillRect(g, 26, 2, 2, 50, "D");
  hLine(g, 5, 1, 18, "n");
  hLine(g, 5, 2, 8, "n");
  // Freezer / fridge door seam.
  hLine(g, 4, 18, 24, "D");
  hLine(g, 4, 19, 24, "S");
  // Door handles with a lit edge.
  fillRect(g, 6, 4, 3, 11, "s");
  vLine(g, 6, 4, 11, "n");
  hLine(g, 6, 14, 3, "S");
  fillRect(g, 6, 22, 3, 16, "s");
  vLine(g, 6, 22, 16, "n");
  hLine(g, 6, 37, 3, "S");
  // Water dispenser recess with a cup.
  outlineRect(g, 14, 24, 10, 8, "S");
  fillRect(g, 15, 25, 8, 6, "M");
  fillRect(g, 17, 27, 3, 3, "n");
  setPx(g, 21, 25, "L");
  // Vent lines + feet.
  hLine(g, 6, 48, 20, "S");
  hLine(g, 6, 50, 20, "S");
  fillRect(g, 6, 54, 4, 4, "S");
  fillRect(g, 22, 54, 4, 4, "S");
  return sprite("fridge", g);
}

function coffeeMachine(): PixelSprite {
  const g = gridFor("coffee_machine", 52);
  drawShadow(g, 4, 49, 24);
  // Slate body with a lit top and shaded side.
  roundRect(g, 3, 2, 26, 46);
  fillRound(g, 3, 2, 26, 46, "v");
  hLine(g, 5, 3, 22, "j");
  fillRect(g, 26, 4, 2, 42, "V");
  // Display with text and a red brew light.
  fillRect(g, 7, 6, 10, 5, "M");
  hLine(g, 8, 7, 5, "c");
  hLine(g, 8, 9, 3, "n");
  setPx(g, 15, 7, "L");
  fillRect(g, 21, 6, 2, 2, "r");
  // Brew cavity: spout, drip stream, glass carafe with coffee.
  fillRect(g, 6, 14, 20, 19, "V");
  fillRect(g, 13, 15, 6, 3, "S");
  fillRect(g, 15, 18, 2, 1, "x");
  vLine(g, 15, 19, 5, "h");
  vLine(g, 16, 19, 5, "h");
  outlineRect(g, 10, 24, 12, 8, "o");
  trimCorners(g, 10, 24, 12, 8);
  fillRect(g, 11, 25, 10, 3, "A");
  fillRect(g, 11, 28, 10, 3, "h");
  vLine(g, 22, 26, 4, "o");
  // Drip tray with slots.
  fillRect(g, 6, 34, 20, 3, "S");
  hLine(g, 8, 35, 16, "x");
  // Button row.
  fillRect(g, 7, 40, 2, 2, "r");
  fillRect(g, 11, 40, 2, 2, "y");
  fillRect(g, 15, 40, 2, 2, "1");
  // Base band + feet.
  fillRect(g, 4, 43, 24, 4, "V");
  fillRect(g, 6, 48, 4, 2, "S");
  fillRect(g, 22, 48, 4, 2, "S");
  return sprite("coffee_machine", g);
}

function waterCooler(): PixelSprite {
  const g = gridFor("water_cooler", 52);
  drawShadow(g, 5, 49, 22);
  // Translucent bottle with water and a shine.
  roundRect(g, 7, 0, 18, 15);
  fillRound(g, 7, 0, 18, 15, "A");
  fillRect(g, 8, 6, 16, 7, "q");
  hLine(g, 8, 6, 16, "Q");
  vLine(g, 10, 2, 10, "n");
  fillRect(g, 12, 15, 8, 2, "S");
  // White body with a shaded side and lit top.
  roundRect(g, 6, 17, 20, 28);
  fillRound(g, 6, 17, 20, 28, "d");
  fillRect(g, 23, 18, 2, 25, "D");
  hLine(g, 8, 18, 14, "n");
  // Cup sleeve on the left.
  outlineRect(g, 1, 19, 5, 12, "o");
  fillRect(g, 2, 20, 3, 10, "s");
  for (let cy = 21; cy <= 29; cy += 2) hLine(g, 2, cy, 3, "S");
  // Taps + drip recess with two cups.
  fillRect(g, 9, 26, 3, 3, "b");
  setPx(g, 10, 29, "x");
  fillRect(g, 20, 26, 3, 3, "r");
  setPx(g, 21, 29, "x");
  fillRect(g, 12, 31, 8, 4, "D");
  hLine(g, 12, 34, 8, "S");
  fillRect(g, 13, 32, 2, 2, "n");
  fillRect(g, 17, 32, 2, 2, "n");
  // Vents + feet.
  hLine(g, 9, 39, 14, "S");
  hLine(g, 9, 41, 14, "S");
  fillRect(g, 8, 45, 4, 5, "S");
  fillRect(g, 20, 45, 4, 5, "S");
  return sprite("water_cooler", g);
}

function vendingMachine(): PixelSprite {
  const g = gridFor("vending_machine", 62);
  drawShadow(g, 4, 59, 24);
  // Blue cabinet with a shaded side and top sheen.
  roundRect(g, 2, 0, 28, 58);
  fillRound(g, 2, 0, 28, 58, "b");
  fillRect(g, 26, 2, 2, 54, "B");
  hLine(g, 4, 1, 22, "n");
  // Header band with brand dashes.
  fillRect(g, 4, 2, 24, 4, "B");
  hLine(g, 7, 3, 4, "n");
  hLine(g, 13, 3, 3, "n");
  hLine(g, 18, 3, 4, "n");
  // Glass window: two shelves of colorful cans behind a reflection.
  outlineRect(g, 4, 7, 17, 32, "o");
  fillRect(g, 5, 8, 15, 30, "M");
  hLine(g, 5, 18, 15, "F");
  hLine(g, 5, 28, 15, "F");
  const canColors: Array<[number, number, string]> = [
    [6, 12, "r"],
    [10, 12, "y"],
    [14, 12, "1"],
    [6, 22, "p"],
    [10, 22, "a"],
    [14, 22, "c"],
  ];
  for (const [cx, cy, ch] of canColors) {
    fillRect(g, cx, cy, 3, 6, ch);
    setPx(g, cx, cy, "n");
  }
  // Diagonal glass reflection streaks.
  for (let k = 0; k < 14; k += 1) {
    const rx = 6 + k;
    const ry = 9 + k;
    if (rx >= 5 && rx <= 19 && ry >= 8 && ry <= 37) {
      setPx(g, rx, ry, "A");
      if (rx + 1 <= 19) setPx(g, rx + 1, ry, "A");
    }
  }
  for (let k = 0; k < 8; k += 1) setPx(g, 12 + k, 26 + k, "A");
  // Coin panel: screen, keypad, coin slot, LED.
  fillRect(g, 22, 9, 5, 12, "v");
  fillRect(g, 23, 10, 3, 2, "M");
  setPx(g, 23, 14, "x");
  setPx(g, 25, 14, "x");
  setPx(g, 23, 16, "x");
  setPx(g, 25, 16, "x");
  vLine(g, 24, 18, 2, "x");
  setPx(g, 24, 8, "L");
  // Dispenser flap.
  fillRect(g, 5, 44, 16, 7, "v");
  hLine(g, 5, 44, 16, "V");
  fillRect(g, 7, 46, 12, 3, "x");
  // Bottom band, vents, feet.
  fillRect(g, 3, 52, 26, 3, "B");
  hLine(g, 6, 55, 20, "S");
  fillRect(g, 5, 56, 4, 4, "V");
  fillRect(g, 23, 56, 4, 4, "V");
  return sprite("vending_machine", g);
}

// ---------------------------------------------------------------------------
// Game room
// ---------------------------------------------------------------------------

function pingPongTable(): PixelSprite {
  const g = gridFor("ping_pong_table", 64);
  drawShadow(g, 6, 61, 84);
  // Indigo top with a lit edge and a darker front face.
  roundRect(g, 1, 0, 94, 58);
  fillRound(g, 1, 0, 94, 58, "6");
  hLine(g, 4, 1, 88, "J");
  hLine(g, 3, 2, 90, "J");
  fillRect(g, 2, 52, 92, 5, "7");
  // White boundary + doubles centerline.
  outlineRect(g, 6, 5, 84, 44, "n");
  hLine(g, 7, 26, 82, "n");
  hLine(g, 7, 27, 82, "n");
  // Net with posts, mesh, and a soft cast shadow.
  fillRect(g, 45, 1, 6, 4, "V");
  fillRect(g, 45, 50, 6, 4, "V");
  fillRect(g, 46, 5, 4, 45, "n");
  for (let ny = 5; ny < 50; ny += 1) {
    for (let nx = 46; nx < 50; nx += 1) {
      if ((nx + ny) % 2 === 0) setPx(g, nx, ny, "S");
    }
  }
  vLine(g, 51, 6, 44, "7");
  // Red paddle with a wooden handle.
  fillRect(g, 17, 10, 6, 6, "r");
  trimCorners(g, 17, 10, 6, 6);
  hLine(g, 18, 15, 4, "9");
  setPx(g, 22, 14, "9");
  setPx(g, 23, 16, "w");
  setPx(g, 24, 16, "w");
  setPx(g, 24, 17, "w");
  setPx(g, 25, 17, "w");
  setPx(g, 25, 18, "w");
  setPx(g, 26, 18, "w");
  // Blue paddle mirrored on the far side.
  fillRect(g, 70, 38, 6, 6, "b");
  trimCorners(g, 70, 38, 6, 6);
  hLine(g, 71, 43, 4, "B");
  setPx(g, 70, 42, "B");
  setPx(g, 69, 44, "w");
  setPx(g, 68, 44, "w");
  setPx(g, 68, 45, "w");
  setPx(g, 67, 45, "w");
  setPx(g, 67, 46, "w");
  setPx(g, 66, 46, "w");
  // Ball with a tiny cast shadow.
  fillRect(g, 58, 14, 3, 3, "n");
  trimCorners(g, 58, 14, 3, 3);
  hLine(g, 58, 18, 3, "7");
  return sprite("ping_pong_table", g);
}

function arcade(): PixelSprite {
  const g = gridFor("arcade", 58);
  drawShadow(g, 4, 55, 24);
  // Purple cabinet with a shaded side.
  roundRect(g, 2, 0, 28, 54);
  fillRound(g, 2, 0, 28, 54, "u");
  fillRect(g, 26, 2, 2, 50, "X");
  // Marquee with lights and a glow line.
  fillRect(g, 3, 1, 26, 6, "p");
  hLine(g, 9, 3, 4, "n");
  setPx(g, 15, 3, "n");
  hLine(g, 18, 3, 4, "n");
  setPx(g, 6, 4, "y");
  setPx(g, 25, 4, "y");
  hLine(g, 4, 7, 24, "Y");
  // Screen with a tiny invaders scene.
  outlineRect(g, 4, 9, 24, 18, "o");
  fillRect(g, 5, 10, 22, 16, "m");
  fillRect(g, 7, 12, 18, 12, "M");
  for (let i = 0; i < 3; i += 1) fillRect(g, 9 + i * 5, 13, 3, 2, "1");
  for (let i = 0; i < 3; i += 1) fillRect(g, 9 + i * 5, 16, 3, 2, "p");
  setPx(g, 17, 19, "n");
  fillRect(g, 15, 21, 4, 2, "c");
  setPx(g, 16, 20, "c");
  setPx(g, 17, 20, "c");
  // Control deck: joystick with a red ball, two buttons.
  fillRect(g, 4, 27, 24, 6, "j");
  hLine(g, 4, 27, 24, "s");
  hLine(g, 4, 32, 24, "S");
  fillRect(g, 10, 25, 2, 3, "x");
  fillRect(g, 9, 22, 3, 3, "r");
  trimCorners(g, 9, 22, 3, 3);
  fillRect(g, 18, 28, 3, 2, "y");
  fillRect(g, 23, 28, 3, 2, "b");
  // Front decal with a tiny alien.
  fillRect(g, 10, 36, 12, 8, "p");
  hLine(g, 14, 38, 4, "n");
  setPx(g, 13, 39, "n");
  setPx(g, 18, 39, "n");
  hLine(g, 13, 40, 6, "n");
  // Vents, base, feet.
  hLine(g, 6, 46, 20, "X");
  hLine(g, 6, 48, 20, "X");
  fillRect(g, 3, 50, 26, 3, "X");
  fillRect(g, 5, 53, 4, 3, "V");
  fillRect(g, 23, 53, 4, 3, "V");
  return sprite("arcade", g);
}

function jukebox(): PixelSprite {
  const g = gridFor("jukebox", 60);
  drawShadow(g, 4, 57, 24);
  // Rounded dome from circle bands: outline, pink glow ring, warm ring, wood.
  const domeCx = 15.5;
  const domeCy = 16;
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const d = Math.sqrt((x - domeCx) * (x - domeCx) + (y - domeCy) * (y - domeCy));
      if (d > 14.5) continue;
      if (d > 13.2) setPx(g, x, y, "o");
      else if (d > 11.2) setPx(g, x, y, "p");
      else if (d > 9.2) setPx(g, x, y, "Y");
      else setPx(g, x, y, "w");
    }
  }
  // Body below the dome with glow columns continuing the arch.
  vLine(g, 2, 16, 38, "o");
  vLine(g, 29, 16, 38, "o");
  fillRect(g, 3, 16, 26, 38, "w");
  fillRect(g, 4, 16, 2, 14, "p");
  fillRect(g, 6, 16, 2, 14, "Y");
  fillRect(g, 26, 16, 2, 14, "p");
  fillRect(g, 24, 16, 2, 14, "Y");
  setPx(g, 5, 20, "n");
  setPx(g, 26, 24, "n");
  // Record window with a spinning vinyl.
  outlineRect(g, 9, 8, 14, 10, "o");
  fillRect(g, 10, 9, 12, 8, "M");
  fillRect(g, 13, 10, 6, 6, "x");
  trimCorners(g, 13, 10, 6, 6);
  fillRect(g, 15, 12, 2, 2, "r");
  setPx(g, 14, 10, "n");
  // Song list card with entries.
  fillRect(g, 8, 20, 16, 8, "n");
  vLine(g, 16, 21, 6, "N");
  hLine(g, 10, 22, 5, "N");
  hLine(g, 18, 22, 5, "N");
  hLine(g, 10, 24, 4, "N");
  hLine(g, 18, 24, 5, "N");
  hLine(g, 10, 26, 5, "N");
  hLine(g, 18, 26, 4, "N");
  // Colorful button row.
  fillRect(g, 8, 30, 3, 2, "r");
  fillRect(g, 12, 30, 3, 2, "y");
  fillRect(g, 16, 30, 3, 2, "1");
  fillRect(g, 20, 30, 3, 2, "b");
  fillRect(g, 24, 30, 3, 2, "u");
  // Speaker grill.
  outlineRect(g, 7, 34, 18, 12, "W");
  fillRect(g, 8, 35, 16, 10, "h");
  hLine(g, 9, 37, 14, "x");
  hLine(g, 9, 39, 14, "x");
  hLine(g, 9, 41, 14, "x");
  hLine(g, 9, 43, 14, "x");
  // Base + feet.
  fillRect(g, 3, 48, 26, 6, "W");
  hLine(g, 3, 54, 26, "o");
  fillRect(g, 5, 55, 4, 3, "V");
  fillRect(g, 23, 55, 4, 3, "V");
  return sprite("jukebox", g);
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** White board face on slate legs with a marker tray and ground shadow. */
function drawBoardFrame(g: Grid): void {
  drawShadow(g, 5, 57, 54);
  // Legs with feet.
  fillRect(g, 12, 44, 4, 13, "v");
  vLine(g, 15, 44, 13, "V");
  fillRect(g, 48, 44, 4, 13, "v");
  vLine(g, 51, 44, 13, "V");
  fillRect(g, 9, 55, 10, 3, "V");
  fillRect(g, 45, 55, 10, 3, "V");
  // Marker tray.
  fillRect(g, 16, 45, 32, 2, "s");
  hLine(g, 16, 47, 32, "S");
  // Board face with a soft inner shade.
  roundRect(g, 2, 0, 60, 44);
  fillRound(g, 2, 0, 60, 44, "n");
  hLine(g, 4, 1, 56, "N");
  vLine(g, 60, 2, 40, "N");
}

/** Sticky note with a shaded fold edge and scribble dashes. */
function drawSticky(g: Grid, x: number, y: number, ch: string): void {
  fillRect(g, x, y, 7, 7, ch);
  hLine(g, x + 1, y + 2, 4, "S");
  hLine(g, x + 1, y + 4, 3, "S");
  setPx(g, x + 6, y + 6, "N");
}

function kanbanBoard(): PixelSprite {
  const g = gridFor("kanban_board", 60);
  drawBoardFrame(g);
  // Column dividers + labeled headers.
  vLine(g, 22, 2, 40, "N");
  vLine(g, 42, 2, 40, "N");
  fillRect(g, 6, 3, 13, 4, "b");
  hLine(g, 8, 4, 9, "n");
  fillRect(g, 26, 3, 13, 4, "y");
  hLine(g, 28, 4, 9, "S");
  fillRect(g, 46, 3, 13, 4, "1");
  hLine(g, 48, 4, 9, "S");
  // Sticky notes per column.
  drawSticky(g, 5, 10, "y");
  drawSticky(g, 13, 13, "p");
  drawSticky(g, 6, 19, "b");
  drawSticky(g, 13, 25, "y");
  drawSticky(g, 5, 32, "1");
  drawSticky(g, 25, 10, "1");
  drawSticky(g, 33, 14, "y");
  drawSticky(g, 26, 20, "u");
  drawSticky(g, 33, 27, "p");
  drawSticky(g, 45, 11, "b");
  drawSticky(g, 52, 16, "p");
  drawSticky(g, 45, 22, "1");
  return sprite("kanban_board", g);
}

function whiteboard(): PixelSprite {
  const g = gridFor("whiteboard", 60);
  drawBoardFrame(g);
  // Title + bullet scribbles.
  fillRect(g, 6, 4, 16, 2, "b");
  setPx(g, 4, 9, "r");
  hLine(g, 6, 9, 20, "S");
  setPx(g, 4, 12, "r");
  hLine(g, 6, 12, 16, "S");
  setPx(g, 4, 15, "r");
  hLine(g, 6, 15, 18, "S");
  // Bar chart with axes.
  vLine(g, 36, 6, 16, "S");
  hLine(g, 36, 21, 22, "S");
  fillRect(g, 38, 15, 3, 6, "t");
  fillRect(g, 43, 11, 3, 10, "b");
  fillRect(g, 48, 16, 3, 5, "r");
  fillRect(g, 53, 8, 3, 13, "1");
  // Rising green arrow.
  for (let k = 0; k < 10; k += 1) setPx(g, 6 + k, 30 - k, "1");
  setPx(g, 15, 20, "1");
  setPx(g, 14, 20, "1");
  setPx(g, 15, 22, "1");
  // Extra note lines + pink sticky.
  hLine(g, 24, 32, 12, "S");
  hLine(g, 24, 35, 9, "S");
  drawSticky(g, 51, 28, "p");
  // Corner magnets.
  fillRect(g, 4, 2, 2, 2, "r");
  fillRect(g, 57, 2, 2, 2, "b");
  fillRect(g, 4, 39, 2, 2, "y");
  fillRect(g, 57, 39, 2, 2, "1");
  // Markers resting on the tray.
  fillRect(g, 20, 43, 6, 2, "r");
  fillRect(g, 28, 43, 6, 2, "b");
  fillRect(g, 36, 43, 6, 2, "1");
  return sprite("whiteboard", g);
}

// ---------------------------------------------------------------------------
// Booths
// ---------------------------------------------------------------------------

/** Tall booth: rounded casing, roof sign, glass door, base; icons drawn by caller. */
function drawBooth(g: Grid, body: string, shade: string): void {
  drawShadow(g, 4, 77, 24);
  // Casing with a shaded side and a band under the roof.
  roundRect(g, 2, 8, 28, 66);
  fillRound(g, 2, 8, 28, 66, body);
  fillRect(g, 26, 10, 2, 62, shade);
  fillRect(g, 3, 9, 26, 3, shade);
  // Roof sign plate.
  roundRect(g, 4, 0, 24, 9);
  fillRound(g, 4, 0, 24, 9, shade);
  // Glass door: frame, pale glass, tinted lower half, mid rail.
  outlineRect(g, 6, 14, 20, 48, "o");
  fillRect(g, 7, 15, 18, 46, "A");
  fillRect(g, 7, 38, 18, 23, "q");
  hLine(g, 6, 37, 20, "o");
  // Door handle.
  fillRect(g, 22, 40, 2, 7, "s");
  vLine(g, 23, 40, 7, "S");
  // Base band with vents and feet.
  fillRect(g, 3, 66, 26, 6, shade);
  hLine(g, 6, 68, 20, "V");
  hLine(g, 6, 70, 20, "V");
  fillRect(g, 5, 74, 5, 4, "V");
  fillRect(g, 22, 74, 5, 4, "V");
}

/** Diagonal reflection streaks over booth glass. */
function drawBoothReflection(g: Grid): void {
  for (let k = 0; k < 13; k += 1) {
    setPx(g, 9 + k, 16 + k, "n");
    setPx(g, 10 + k, 16 + k, "n");
  }
  for (let k = 0; k < 7; k += 1) setPx(g, 8 + k, 42 + k, "n");
}

function phoneBooth(): PixelSprite {
  const g = gridFor("phone_booth", 80);
  drawBooth(g, "t", "T");
  // White handset icon on the roof sign.
  hLine(g, 10, 3, 12, "n");
  fillRect(g, 9, 4, 3, 3, "n");
  fillRect(g, 20, 4, 3, 3, "n");
  // Interior hint: wall phone with a handset and keypad.
  fillRect(g, 10, 22, 8, 10, "v");
  vLine(g, 11, 23, 6, "n");
  setPx(g, 14, 24, "x");
  setPx(g, 16, 24, "x");
  setPx(g, 14, 26, "x");
  setPx(g, 16, 26, "x");
  // Interior shelf line behind the glass.
  hLine(g, 8, 44, 12, "T");
  drawBoothReflection(g);
  return sprite("phone_booth", g);
}

function smsBooth(): PixelSprite {
  const g = gridFor("sms_booth", 80);
  drawBooth(g, "8", "9");
  // White speech bubble icon with dots and a tail.
  fillRect(g, 10, 2, 12, 5, "n");
  trimCorners(g, 10, 2, 12, 5);
  setPx(g, 12, 4, "9");
  setPx(g, 15, 4, "9");
  setPx(g, 18, 4, "9");
  setPx(g, 12, 7, "n");
  setPx(g, 11, 7, "n");
  // Interior hint: glowing message screen.
  fillRect(g, 10, 22, 10, 8, "v");
  fillRect(g, 11, 23, 8, 6, "c");
  hLine(g, 12, 24, 5, "n");
  hLine(g, 12, 26, 4, "n");
  hLine(g, 8, 44, 12, "9");
  drawBoothReflection(g);
  return sprite("sms_booth", g);
}

// ---------------------------------------------------------------------------
// Gym
// ---------------------------------------------------------------------------

function treadmill(): PixelSprite {
  const g = gridFor("treadmill", 64);
  drawShadow(g, 5, 61, 22);
  // Console with a display and buttons.
  roundRect(g, 4, 0, 24, 9);
  fillRound(g, 4, 0, 24, 9, "m");
  fillRect(g, 8, 2, 12, 4, "c");
  hLine(g, 9, 3, 4, "n");
  setPx(g, 17, 3, "r");
  fillRect(g, 22, 3, 2, 2, "r");
  fillRect(g, 25, 3, 2, 2, "y");
  // Side rails running the full deck.
  vLine(g, 2, 8, 52, "o");
  fillRect(g, 3, 8, 2, 52, "s");
  vLine(g, 29, 8, 52, "o");
  fillRect(g, 27, 8, 2, 52, "s");
  // Deck frame + belt with tread stripes.
  fillRect(g, 5, 10, 22, 51, "V");
  fillRect(g, 7, 12, 18, 46, "v");
  hLine(g, 7, 12, 18, "j");
  for (let y = 17; y < 58; y += 6) hLine(g, 7, y, 18, "V");
  // Rear roller line.
  hLine(g, 7, 56, 18, "S");
  return sprite("treadmill", g);
}

/** Dumbbell: two outlined colored plates joined by a steel bar. */
function drawDumbbell(g: Grid, x: number, y: number, ch: string): void {
  outlineRect(g, x, y, 5, 10, "o");
  fillRect(g, x + 1, y + 1, 3, 8, ch);
  setPx(g, x + 1, y + 1, "n");
  fillRect(g, x + 5, y + 4, 5, 2, "s");
  hLine(g, x + 5, y + 6, 5, "S");
  outlineRect(g, x + 10, y, 5, 10, "o");
  fillRect(g, x + 11, y + 1, 3, 8, ch);
  setPx(g, x + 11, y + 1, "n");
}

function dumbbellRack(): PixelSprite {
  const g = gridFor("dumbbell_rack", 44);
  drawShadow(g, 3, 41, 58);
  // Slate side posts.
  vLine(g, 1, 4, 36, "o");
  fillRect(g, 2, 4, 4, 36, "v");
  vLine(g, 5, 4, 36, "V");
  vLine(g, 62, 4, 36, "o");
  fillRect(g, 58, 4, 4, 36, "v");
  vLine(g, 58, 4, 36, "V");
  // Two shelf tiers.
  fillRect(g, 5, 16, 54, 4, "v");
  hLine(g, 5, 16, 54, "s");
  hLine(g, 5, 19, 54, "V");
  fillRect(g, 5, 30, 54, 4, "v");
  hLine(g, 5, 30, 54, "s");
  hLine(g, 5, 33, 54, "V");
  // Feet.
  fillRect(g, 1, 38, 6, 4, "V");
  fillRect(g, 57, 38, 6, 4, "V");
  // Color-coded weights on both tiers.
  drawDumbbell(g, 7, 6, "r");
  drawDumbbell(g, 25, 6, "b");
  drawDumbbell(g, 43, 6, "y");
  drawDumbbell(g, 15, 20, "1");
  drawDumbbell(g, 33, 20, "u");
  return sprite("dumbbell_rack", g);
}

// ---------------------------------------------------------------------------
// Tech
// ---------------------------------------------------------------------------

function serverRack(): PixelSprite {
  const g = gridFor("server_rack", 72);
  drawShadow(g, 4, 69, 24);
  // Cabinet with a lit top edge and shaded side.
  roundRect(g, 2, 0, 28, 66);
  fillRound(g, 2, 0, 28, 66, "v");
  hLine(g, 4, 1, 24, "j");
  fillRect(g, 26, 2, 2, 62, "V");
  // Four rack units: vents, LED clusters, drive slots.
  for (let i = 0; i < 4; i += 1) {
    const uy = 4 + i * 13;
    fillRect(g, 4, uy, 24, 10, "V");
    hLine(g, 4, uy, 24, "S");
    hLine(g, 6, uy + 3, 10, "x");
    hLine(g, 6, uy + 5, 10, "x");
    hLine(g, 6, uy + 7, 10, "x");
    setPx(g, 20, uy + 3, "L");
    setPx(g, 22, uy + 3, "L");
    setPx(g, 24, uy + 3, "L");
    setPx(g, 20, uy + 5, "a");
    setPx(g, 22, uy + 5, "a");
    setPx(g, 24, uy + 5, i === 2 ? "r" : "L");
    hLine(g, 18, uy + 8, 8, "S");
  }
  // Cable hints in the gaps between units.
  for (const cy of [15, 28, 41]) {
    setPx(g, 23, cy, "y");
    setPx(g, 24, cy + 1, "y");
    setPx(g, 20, cy, "c");
    setPx(g, 21, cy + 1, "c");
  }
  // Base band with vents + feet.
  fillRect(g, 4, 56, 24, 6, "V");
  hLine(g, 6, 58, 20, "x");
  fillRect(g, 5, 66, 4, 4, "V");
  fillRect(g, 23, 66, 4, 4, "V");
  return sprite("server_rack", g);
}

function tvStand(): PixelSprite {
  const g = gridFor("tv_stand", 52);
  drawShadow(g, 3, 49, 58);
  // Wood console with doors, knobs, and feet.
  roundRect(g, 1, 30, 62, 17);
  fillRound(g, 1, 30, 62, 17, "w");
  fillRect(g, 3, 31, 58, 3, "k");
  outlineRect(g, 8, 35, 20, 9, "W");
  outlineRect(g, 36, 35, 20, 9, "W");
  fillRect(g, 24, 38, 2, 2, "k");
  fillRect(g, 38, 38, 2, 2, "k");
  fillRect(g, 2, 44, 60, 2, "W");
  fillRect(g, 4, 47, 4, 3, "W");
  fillRect(g, 56, 47, 4, 3, "W");
  // TV with a colorful landscape scene.
  outlineRect(g, 8, 0, 48, 24, "o");
  fillRect(g, 9, 1, 46, 22, "m");
  fillRect(g, 11, 3, 42, 10, "c");
  fillRect(g, 42, 5, 6, 4, "y");
  trimCorners(g, 42, 5, 6, 4);
  hLine(g, 16, 6, 7, "n");
  hLine(g, 18, 7, 5, "n");
  fillRect(g, 11, 13, 42, 4, "l");
  fillRect(g, 11, 17, 42, 4, "g");
  fillRect(g, 22, 15, 4, 4, "G");
  // Stand neck + soundbar with a grill.
  fillRect(g, 29, 24, 6, 3, "m");
  fillRect(g, 14, 27, 36, 3, "v");
  for (let sx = 16; sx <= 45; sx += 3) setPx(g, sx, 28, "x");
  setPx(g, 47, 28, "L");
  return sprite("tv_stand", g);
}

function atm(): PixelSprite {
  const g = gridFor("atm", 52);
  drawShadow(g, 4, 49, 24);
  // Steel kiosk with a teal header.
  roundRect(g, 2, 0, 28, 46);
  fillRound(g, 2, 0, 28, 46, "s");
  fillRect(g, 26, 2, 2, 42, "S");
  fillRect(g, 3, 1, 26, 5, "t");
  hLine(g, 8, 3, 4, "n");
  vLine(g, 15, 2, 3, "n");
  hLine(g, 18, 3, 5, "n");
  // Green screen with text lines.
  outlineRect(g, 6, 8, 20, 13, "o");
  fillRect(g, 7, 9, 18, 11, "M");
  hLine(g, 9, 11, 8, "1");
  hLine(g, 9, 13, 12, "1");
  hLine(g, 9, 15, 6, "1");
  hLine(g, 9, 17, 8, "c");
  // Keypad grid.
  for (let kr = 0; kr < 4; kr += 1) {
    for (let kc = 0; kc < 3; kc += 1) {
      fillRect(g, 7 + kc * 4, 24 + kr * 3, 3, 2, "x");
    }
  }
  // Card slot with an LED + receipt slot.
  setPx(g, 24, 22, "L");
  fillRect(g, 21, 24, 7, 2, "V");
  hLine(g, 22, 24, 5, "x");
  fillRect(g, 21, 29, 7, 2, "V");
  hLine(g, 22, 29, 5, "x");
  // Cash tray.
  fillRect(g, 6, 37, 20, 5, "V");
  fillRect(g, 8, 39, 16, 2, "x");
  // Base + feet.
  fillRect(g, 3, 42, 26, 3, "S");
  fillRect(g, 5, 46, 4, 4, "V");
  fillRect(g, 23, 46, 4, 4, "V");
  return sprite("atm", g);
}

// ---------------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------------

function rug(): PixelSprite {
  const g = gridFor("rug", 64);
  // Round cream rug with a double terracotta ring (hard threshold, no AA).
  const cx = 31.5;
  const cy = 31.5;
  const radius = 32;
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const nx = (x - cx) / radius;
      const ny = (y - cy) / radius;
      const rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      if (rr > 0.88) setPx(g, x, y, "R");
      else if (rr > 0.78) setPx(g, x, y, "0");
      else if (rr > 0.68) setPx(g, x, y, "R");
      else if (rr > 0.24) setPx(g, x, y, "0");
      else if (rr > 0.14) setPx(g, x, y, "R");
      else setPx(g, x, y, "0");
    }
  }
  // Center medallion diamond.
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      if (Math.abs(x - cx) + Math.abs(y - cy) < 5) setPx(g, x, y, "R");
    }
  }
  // Eight small motif crosses around the field.
  for (let k = 0; k < 8; k += 1) {
    const ang = (k * Math.PI) / 4;
    const mx = Math.round(cx + 15 * Math.cos(ang));
    const my = Math.round(cy + 15 * Math.sin(ang));
    setPx(g, mx, my - 1, "R");
    setPx(g, mx - 1, my, "R");
    setPx(g, mx, my, "R");
    setPx(g, mx + 1, my, "R");
    setPx(g, mx, my + 1, "R");
  }
  return sprite("rug", g);
}

function lamp(): PixelSprite {
  const g = gridFor("lamp", 60);
  drawShadow(g, 8, 57, 16);
  // Translucent warm halo painted first so the shade covers its center.
  for (let y = 0; y < 22; y += 1) {
    for (let x = 3; x < 29; x += 1) {
      if ((x - 16) * (x - 16) + (y - 9) * (y - 9) <= 144) setPx(g, x, y, "K");
    }
  }
  // Trapezoid shade: lit yellow top, amber base, glowing mouth.
  hLine(g, 11, 2, 10, "o");
  for (let r = 0; r < 10; r += 1) {
    const half = 5 + Math.floor(r / 2);
    const left = 15 - half;
    const right = 16 + half;
    const row = 3 + r;
    setPx(g, left, row, "o");
    setPx(g, right, row, "o");
    const body = r < 6 ? "y" : "a";
    hLine(g, left + 1, row, right - left - 1, body);
  }
  hLine(g, 7, 12, 18, "Y");
  hLine(g, 7, 13, 18, "o");
  setPx(g, 15, 1, "o");
  setPx(g, 16, 1, "o");
  // Pole with a highlight and shade.
  vLine(g, 15, 14, 36, "o");
  vLine(g, 16, 14, 36, "v");
  vLine(g, 17, 14, 36, "V");
  // Domed base.
  hLine(g, 13, 50, 6, "v");
  hLine(g, 11, 51, 10, "v");
  fillRect(g, 9, 52, 14, 2, "v");
  fillRect(g, 8, 54, 16, 2, "V");
  hLine(g, 8, 56, 16, "o");
  return sprite("lamp", g);
}

/** Small fish: colored body, contrasting tail; dir 1 faces right, -1 left. */
function drawFish(
  g: Grid,
  x: number,
  y: number,
  dir: 1 | -1,
  body: string,
  tail: string,
): void {
  fillRect(g, x, y, 5, 3, body);
  trimCorners(g, x, y, 5, 3);
  setPx(g, x + 2, y - 1, tail);
  const tailX = dir === 1 ? x - 2 : x + 5;
  fillRect(g, tailX, y, 2, 3, tail);
  setPx(g, dir === 1 ? x + 3 : x + 1, y + 1, "x");
}

function aquarium(): PixelSprite {
  const g = gridFor("aquarium", 52);
  drawShadow(g, 3, 49, 58);
  // Tank with a steel rim.
  outlineRect(g, 2, 0, 60, 36, "o");
  fillRect(g, 3, 1, 58, 3, "s");
  hLine(g, 4, 3, 56, "S");
  // Water gradient: pale surface, mid blue, deep bottom.
  fillRect(g, 3, 4, 58, 5, "A");
  fillRect(g, 3, 9, 58, 14, "q");
  fillRect(g, 3, 23, 58, 8, "Q");
  // Gravel bed.
  fillRect(g, 3, 31, 58, 4, "S");
  for (let x = 4; x < 61; x += 3) setPx(g, x, 31, "2");
  for (let x = 5; x < 61; x += 4) setPx(g, x, 33, "h");
  hLine(g, 3, 34, 58, "F");
  // Wavy seaweed strands + a leafy bush.
  for (let k = 0; k < 14; k += 1) {
    setPx(g, 10 + ((k >> 2) % 2), 30 - k, "g");
  }
  setPx(g, 9, 18, "l");
  setPx(g, 12, 23, "l");
  for (let k = 0; k < 9; k += 1) {
    setPx(g, 15 + ((k >> 1) % 2), 30 - k, "G");
  }
  fillRect(g, 47, 24, 9, 7, "G");
  trimCorners(g, 47, 24, 9, 7);
  setPx(g, 48, 24, "g");
  setPx(g, 50, 25, "g");
  setPx(g, 49, 27, "l");
  setPx(g, 53, 26, "g");
  // Three fish.
  drawFish(g, 20, 12, 1, "a", "8");
  drawFish(g, 38, 17, -1, "y", "a");
  drawFish(g, 27, 24, 1, "p", "u");
  // Bubbles rising near the bush.
  setPx(g, 52, 6, "n");
  setPx(g, 54, 10, "n");
  setPx(g, 51, 14, "n");
  setPx(g, 53, 18, "n");
  fillRect(g, 52, 21, 2, 2, "n");
  trimCorners(g, 52, 21, 2, 2);
  // Slate stand with doors + feet.
  roundRect(g, 1, 36, 62, 12);
  fillRound(g, 1, 36, 62, 12, "v");
  hLine(g, 3, 37, 58, "j");
  vLine(g, 31, 39, 7, "V");
  fillRect(g, 27, 41, 2, 2, "S");
  fillRect(g, 34, 41, 2, 2, "S");
  fillRect(g, 2, 45, 60, 2, "V");
  fillRect(g, 4, 47, 5, 3, "V");
  fillRect(g, 55, 47, 5, 3, "V");
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
