import {
  CHARACTER_HEIGHT,
  CHARACTER_WIDTH,
  type CharacterFrameName,
  type CharacterFrameSet,
  type CharacterLook,
  type PixelSprite,
} from "../types";
import { CAP_YELLOW, CHAR_WHITE, FALLBACK_SHIRT } from "./palette";
import { fillRect, gridRows, hLine, makeGrid, setPx, vLine, type Grid } from "./grid";
import { makeSprite, spriteWidth } from "./sprite";

// ---------------------------------------------------------------------------
// Local colors for the 20x30 Gather-style avatars. Kept local on purpose:
// palette.ts is owned by the tiles/furniture modules.
// ---------------------------------------------------------------------------

const OUTLINE_SOFT = "#2a2c38";
const SHOE_GRAY_BLUE = "#3a4356";
const EYE_DARK = "#20222c";
const BLUSH_PINK = "#e59a8e";
const MOUTH_HINT = "#b06a5a";
const HEADPHONE_BAND = "#262a36";
const HEADPHONE_CUP = "#4a5064";

// ---------------------------------------------------------------------------
// Appearance.
// ---------------------------------------------------------------------------

const SKIN_TONES = ["#f6d7b8", "#eebe98", "#d69a6c", "#a9714b", "#6f4a2f"] as const;

/** Hair colors, each paired with a 1px-lighter highlight band. */
const HAIR_COLORS = [
  { base: "#2c2c34", highlight: "#4a4c5a" }, // black
  { base: "#6b4a2e", highlight: "#8a6440" }, // brown
  { base: "#e6c15a", highlight: "#f4d98c" }, // blonde
  { base: "#b8452f", highlight: "#d96a48" }, // ginger
  { base: "#9a9aa2", highlight: "#bfbfc7" }, // gray
  { base: "#4a3a6b", highlight: "#6b5596" }, // violet
  { base: "#3d6b52", highlight: "#579375" }, // teal-green
] as const;

const HAIR_STYLES = ["short", "spiky", "long", "bob"] as const;
const PANTS_COLORS = ["#35406b", "#5a5f6e", "#5f4a33", "#24262e"] as const;

/** Small-cap accessory colors (base + darker brim). */
const CAP_COLORS = [
  { base: "#c94f43", brim: "#9c382f" },
  { base: "#4f9e43", brim: "#3c7d33" },
  { base: "#5a8fd9", brim: "#3f6cab" },
] as const;

type HairStyle = (typeof HAIR_STYLES)[number];
type Accessory = "none" | "headphones" | "cap";

type Appearance = {
  skin: string;
  hair: string;
  hairHighlight: string;
  hairStyle: HairStyle;
  pants: string;
  shirt: string;
  shirtShade: string;
  accessory: Accessory;
  capBase: string;
  capBrim: string;
  /** Janitor NPCs get a yellow cap band on the hair. */
  janitorCap: boolean;
};

/** Stable FNV-1a hash so a seed always maps to the same appearance. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function normalizeHex(value: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

/** Darkens "#rrggbb" by multiplying each channel (0.75 = ~25% darker). */
function darkenHex(hex: string, factor: number): string {
  const channels = [1, 3, 5].map((i) => {
    const v = Math.round(parseInt(hex.slice(i, i + 2), 16) * factor);
    return Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function resolveAppearance(look: CharacterLook): Appearance {
  const shirt = normalizeHex(look.accentColor) ?? FALLBACK_SHIRT;
  const shirtShade = darkenHex(shirt, 0.75);
  if (look.seed.startsWith("npc-janitor")) {
    return {
      skin: SKIN_TONES[2],
      hair: HAIR_COLORS[4].base,
      hairHighlight: HAIR_COLORS[4].highlight,
      hairStyle: "short",
      pants: PANTS_COLORS[0],
      shirt,
      shirtShade,
      accessory: "none",
      capBase: CAP_COLORS[0].base,
      capBrim: CAP_COLORS[0].brim,
      janitorCap: true,
    };
  }
  const h = hashSeed(look.seed);
  const hair = HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length];
  const accessoryRoll = (h >>> 12) % 5;
  const cap = CAP_COLORS[(h >>> 15) % CAP_COLORS.length];
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hair: hair.base,
    hairHighlight: hair.highlight,
    hairStyle: HAIR_STYLES[(h >>> 6) % HAIR_STYLES.length],
    pants: PANTS_COLORS[(h >>> 9) % PANTS_COLORS.length],
    shirt,
    shirtShade,
    accessory: accessoryRoll === 3 ? "headphones" : accessoryRoll === 4 ? "cap" : "none",
    capBase: cap.base,
    capBrim: cap.brim,
    janitorCap: false,
  };
}

function paletteFor(app: Appearance): Record<string, string> {
  return {
    o: OUTLINE_SOFT,
    h: app.hair,
    H: app.hairHighlight,
    s: app.skin,
    e: EYE_DARK,
    r: BLUSH_PINK,
    m: MOUTH_HINT,
    t: app.shirt,
    T: app.shirtShade,
    w: CHAR_WHITE,
    p: app.pants,
    b: SHOE_GRAY_BLUE,
    y: CAP_YELLOW,
    k: app.capBase,
    K: app.capBrim,
    d: HEADPHONE_BAND,
    D: HEADPHONE_CUP,
  };
}

// ---------------------------------------------------------------------------
// Frame construction. Layout at 20x30 (x 0..19, y 0..29):
//   head  y0..9   (10px incl. hair, 10px wide at x5..14)
//   torso y10..21 (12px: neck, collar row, shirt, belt outline)
//   legs  y22..29 (8px: pants + 2px shoes)
// Sitting variants redraw everything 6 rows lower and replace the legs with a
// lap/knee band, so the figure reads 6px shorter.
// ---------------------------------------------------------------------------

type WalkPose = "idle" | "a" | "b";

/** Rounded outline of the 10x10 head box spanning x5..14, y0..9. */
function drawHeadOutline(g: Grid, dy: number): void {
  hLine(g, 6, dy, 8, "o");
  hLine(g, 6, dy + 9, 8, "o");
  vLine(g, 5, dy + 1, 8, "o");
  vLine(g, 14, dy + 1, 8, "o");
}

/** Hair crown: rows 1..3 with the 1px lighter highlight band on row 2. */
function drawHairCrown(g: Grid, dy: number): void {
  fillRect(g, 6, dy + 1, 8, 1, "h");
  setPx(g, 6, dy + 2, "h");
  fillRect(g, 7, dy + 2, 6, 1, "H");
  setPx(g, 13, dy + 2, "h");
  fillRect(g, 6, dy + 3, 8, 1, "h");
}

function drawAccessoriesFront(g: Grid, app: Appearance, dy: number): void {
  if (app.janitorCap) {
    // Yellow cap band across the top of the (gray) hair.
    fillRect(g, 6, dy + 1, 8, 2, "y");
  } else if (app.accessory === "cap") {
    fillRect(g, 6, dy + 1, 8, 3, "k");
    hLine(g, 4, dy + 4, 12, "K");
  } else if (app.accessory === "headphones") {
    hLine(g, 6, dy + 1, 8, "d");
    fillRect(g, 4, dy + 5, 2, 2, "D");
    fillRect(g, 14, dy + 5, 2, 2, "D");
  }
}

function drawAccessoriesSide(g: Grid, app: Appearance, dy: number): void {
  if (app.janitorCap) {
    fillRect(g, 6, dy + 1, 8, 2, "y");
  } else if (app.accessory === "cap") {
    fillRect(g, 6, dy + 1, 8, 3, "k");
    hLine(g, 3, dy + 4, 7, "K");
  } else if (app.accessory === "headphones") {
    hLine(g, 6, dy + 1, 8, "d");
    fillRect(g, 9, dy + 5, 2, 2, "D");
  }
}

/** Front head (face) with per-style fringe, eyes, blush, and mouth hint. */
function drawHeadFront(g: Grid, app: Appearance, dy: number): void {
  drawHeadOutline(g, dy);
  drawHairCrown(g, dy);
  // Fringe row 4 + face rows 5..8.
  fillRect(g, 6, dy + 5, 8, 4, "s");
  if (app.hairStyle === "spiky") {
    for (let x = 6; x <= 13; x += 1) setPx(g, x, dy + 4, x % 2 === 0 ? "h" : "s");
    setPx(g, 13, dy + 4, "h");
    setPx(g, 6, dy + 5, "h");
    setPx(g, 13, dy + 5, "h");
  } else if (app.hairStyle === "long" || app.hairStyle === "bob") {
    fillRect(g, 6, dy + 4, 2, 1, "h");
    fillRect(g, 8, dy + 4, 4, 1, "s");
    fillRect(g, 12, dy + 4, 2, 1, "h");
    setPx(g, 6, dy + 5, "h");
    setPx(g, 13, dy + 5, "h");
    const lockLen = app.hairStyle === "long" ? 9 : 6;
    vLine(g, 4, dy + 3, lockLen, "h");
    vLine(g, 15, dy + 3, lockLen, "h");
  } else {
    setPx(g, 6, dy + 4, "h");
    fillRect(g, 7, dy + 4, 6, 1, "s");
    setPx(g, 13, dy + 4, "h");
  }
  // Eyes: two 2x1 dark pixels.
  fillRect(g, 7, dy + 6, 2, 1, "e");
  fillRect(g, 11, dy + 6, 2, 1, "e");
  // Blush hint on the cheeks + mouth hint (down-facing only).
  setPx(g, 6, dy + 7, "r");
  setPx(g, 13, dy + 7, "r");
  fillRect(g, 9, dy + 8, 2, 1, "m");
  drawAccessoriesFront(g, app, dy);
}

/** Back of the head (up-facing): all hair, no face. */
function drawHeadBack(g: Grid, app: Appearance, dy: number): void {
  drawHeadOutline(g, dy);
  fillRect(g, 6, dy + 1, 8, 8, "h");
  setPx(g, 6, dy + 2, "h");
  fillRect(g, 7, dy + 2, 6, 1, "H");
  drawAccessoriesFront(g, app, dy);
}

/** Hair falling over the shoulders, drawn AFTER the torso on up-facing frames. */
function drawHairBackOverlay(g: Grid, app: Appearance, dy: number): void {
  if (app.hairStyle === "long") {
    fillRect(g, 5, dy + 9, 10, 2, "h");
    fillRect(g, 6, dy + 11, 8, 3, "h");
    vLine(g, 4, dy + 3, 9, "h");
    vLine(g, 15, dy + 3, 9, "h");
  } else if (app.hairStyle === "bob") {
    fillRect(g, 5, dy + 9, 10, 2, "h");
    vLine(g, 4, dy + 3, 6, "h");
    vLine(g, 15, dy + 3, 6, "h");
  }
}

/** Left-facing profile: face on the left, hair silhouette behind, one eye. */
function drawHeadSide(g: Grid, app: Appearance, dy: number): void {
  drawHeadOutline(g, dy);
  drawHairCrown(g, dy);
  // Fringe sweeps back: skin front, hair back.
  if (app.hairStyle === "spiky") {
    fillRect(g, 6, dy + 4, 2, 1, "s");
    setPx(g, 8, dy + 4, "h");
    setPx(g, 9, dy + 4, "s");
    fillRect(g, 10, dy + 4, 4, 1, "h");
  } else {
    fillRect(g, 6, dy + 4, 3, 1, "s");
    fillRect(g, 9, dy + 4, 5, 1, "h");
  }
  fillRect(g, 6, dy + 5, 5, 1, "s");
  fillRect(g, 11, dy + 5, 3, 1, "h");
  fillRect(g, 6, dy + 6, 2, 1, "e"); // single profile eye
  fillRect(g, 8, dy + 6, 3, 1, "s");
  fillRect(g, 11, dy + 6, 3, 1, "h");
  fillRect(g, 6, dy + 7, 5, 1, "s");
  fillRect(g, 11, dy + 7, 3, 1, "h");
  fillRect(g, 6, dy + 8, 6, 1, "s");
  fillRect(g, 12, dy + 8, 2, 1, "h");
  if (app.hairStyle === "long") {
    fillRect(g, 12, dy + 4, 3, 9, "h");
  } else if (app.hairStyle === "bob") {
    fillRect(g, 12, dy + 4, 3, 6, "h");
  }
  drawAccessoriesSide(g, app, dy);
}

/** Front torso: neck, white collar row, shirt with shaded sides, belt outline. */
function drawTorsoFront(g: Grid, dy: number): void {
  setPx(g, 8, dy + 10, "o");
  fillRect(g, 9, dy + 10, 2, 1, "s");
  setPx(g, 11, dy + 10, "o");
  setPx(g, 5, dy + 11, "o");
  fillRect(g, 6, dy + 11, 2, 1, "t");
  fillRect(g, 8, dy + 11, 4, 1, "w");
  fillRect(g, 12, dy + 11, 2, 1, "t");
  setPx(g, 14, dy + 11, "o");
  for (let y = dy + 12; y <= dy + 19; y += 1) {
    setPx(g, 5, y, "o");
    setPx(g, 6, y, "T");
    fillRect(g, 7, y, 6, 1, "t");
    setPx(g, 13, y, "T");
    setPx(g, 14, y, "o");
  }
  setPx(g, 5, dy + 20, "o");
  fillRect(g, 6, dy + 20, 8, 1, "T");
  setPx(g, 14, dy + 20, "o");
  hLine(g, 6, dy + 21, 8, "o");
}

/** Side torso (narrower), shaded back column, collar sliver at the front. */
function drawTorsoSide(g: Grid, dy: number): void {
  setPx(g, 8, dy + 10, "o");
  fillRect(g, 9, dy + 10, 2, 1, "s");
  setPx(g, 11, dy + 10, "o");
  setPx(g, 6, dy + 11, "o");
  fillRect(g, 7, dy + 11, 2, 1, "w");
  fillRect(g, 9, dy + 11, 3, 1, "t");
  setPx(g, 12, dy + 11, "T");
  setPx(g, 13, dy + 11, "o");
  for (let y = dy + 12; y <= dy + 19; y += 1) {
    setPx(g, 6, y, "o");
    fillRect(g, 7, y, 5, 1, "t");
    setPx(g, 12, y, "T");
    setPx(g, 13, y, "o");
  }
  setPx(g, 6, dy + 20, "o");
  fillRect(g, 7, dy + 20, 6, 1, "T");
  setPx(g, 13, dy + 20, "o");
  hLine(g, 7, dy + 21, 6, "o");
}

/** Front arms hang beside the torso; walk poses swing them 2px up/down. */
function drawArmsFront(g: Grid, pose: WalkPose, dy: number): void {
  const leftDy = pose === "idle" ? 0 : pose === "a" ? -2 : 2;
  const rightDy = -leftDy;
  vLine(g, 4, dy + 12 + leftDy, 4, "T");
  fillRect(g, 4, dy + 16 + leftDy, 1, 2, "s");
  vLine(g, 15, dy + 12 + rightDy, 4, "T");
  fillRect(g, 15, dy + 16 + rightDy, 1, 2, "s");
}

/** Single visible side arm; walk poses swing it 2px forward/back. */
function drawArmSide(g: Grid, pose: WalkPose, dy: number): void {
  const x = pose === "idle" ? 9 : pose === "a" ? 7 : 11;
  fillRect(g, x, dy + 12, 2, 4, "T");
  fillRect(g, x, dy + 16, 2, 2, "s");
}

/** Front legs: chunky 3px legs with a hip row; lifted legs raise the shoe 2px. */
function drawLegsFront(g: Grid, pose: WalkPose): void {
  fillRect(g, 6, 22, 8, 1, "p");
  const drawLeg = (x: number, lifted: boolean) => {
    if (lifted) {
      fillRect(g, x, 23, 3, 3, "p");
      fillRect(g, x, 26, 3, 2, "b");
    } else {
      fillRect(g, x, 23, 3, 5, "p");
      fillRect(g, x, 28, 3, 2, "b");
    }
  };
  drawLeg(6, pose === "a");
  drawLeg(11, pose === "b");
}

/** Side legs: idle stands square; "a" is the stride, "b" the passing frame. */
function drawLegsSide(g: Grid, pose: WalkPose): void {
  fillRect(g, 7, 22, 6, 1, "p");
  if (pose === "idle") {
    fillRect(g, 8, 23, 4, 5, "p");
    fillRect(g, 7, 28, 5, 2, "b");
    return;
  }
  if (pose === "a") {
    // Front leg strides toward the facing side; back heel lifts.
    fillRect(g, 6, 23, 2, 5, "p");
    fillRect(g, 5, 28, 3, 2, "b");
    fillRect(g, 10, 23, 3, 3, "p");
    fillRect(g, 11, 26, 3, 2, "b");
    return;
  }
  // Passing frame: legs together, slight 1px bounce.
  fillRect(g, 8, 23, 4, 4, "p");
  fillRect(g, 8, 27, 4, 2, "b");
}

// ---------------------------------------------------------------------------
// Full-frame grids.
// ---------------------------------------------------------------------------

function frontGrid(app: Appearance, pose: WalkPose, showFace: boolean): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  drawTorsoFront(g, 0);
  drawArmsFront(g, pose, 0);
  drawLegsFront(g, pose);
  if (showFace) {
    drawHeadFront(g, app, 0);
  } else {
    drawHeadBack(g, app, 0);
    drawHairBackOverlay(g, app, 0);
  }
  return g;
}

function sideGrid(app: Appearance, pose: WalkPose): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  drawTorsoSide(g, 0);
  drawLegsSide(g, pose);
  drawHeadSide(g, app, 0);
  drawArmSide(g, pose, 0);
  return g;
}

/** Shifts rows y0..y1 (inclusive) horizontally by dx (-1 or 1) for head tilt. */
function shiftRows(g: Grid, y0: number, y1: number, dx: number): void {
  for (let y = y0; y <= y1 && y < g.length; y += 1) {
    if (dx > 0) {
      g[y].pop();
      g[y].unshift(".");
    } else {
      g[y].shift();
      g[y].push(".");
    }
  }
}

function danceGrid(app: Appearance, variant: "a" | "b"): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  // Head first so the 1px tilt only moves head pixels.
  drawHeadFront(g, app, 0);
  shiftRows(g, 0, 11, variant === "a" ? -1 : 1);
  drawTorsoFront(g, 0);
  // Legs spread wide.
  fillRect(g, 6, 22, 8, 1, "p");
  fillRect(g, 5, 23, 3, 5, "p");
  fillRect(g, 5, 28, 3, 2, "b");
  fillRect(g, 12, 23, 3, 5, "p");
  fillRect(g, 12, 28, 3, 2, "b");
  // Arms up, alternating heights between the two frames. Each arm gets a
  // diagonal connector pixel so it doesn't float away from the shoulder.
  const highArm = (x: number, shoulderX: number) => {
    vLine(g, x, 8, 5, "T");
    fillRect(g, x, 6, 1, 2, "s");
    setPx(g, shoulderX, 13, "T");
  };
  const midArm = (x: number, shoulderX: number) => {
    vLine(g, x, 10, 4, "T");
    fillRect(g, x, 8, 1, 2, "s");
    setPx(g, shoulderX, 14, "T");
  };
  if (variant === "a") {
    highArm(3, 4);
    midArm(16, 15);
  } else {
    midArm(3, 4);
    highArm(16, 15);
  }
  return g;
}

/**
 * Seated frames: the whole figure is redrawn 6 rows lower (transparent top
 * padding) and the legs collapse into a lap/knee band + shoes, so the sprite
 * reads ~6px shorter when overlapped with a chair.
 */
function sitFrontGrid(app: Appearance, showFace: boolean): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  const dy = 6;
  drawTorsoFront(g, dy);
  drawArmsFront(g, "idle", dy);
  if (showFace) {
    drawHeadFront(g, app, dy);
  } else {
    drawHeadBack(g, app, dy);
    drawHairBackOverlay(g, app, dy);
  }
  // Lap band + knees/shoes peeking below the torso.
  fillRect(g, 6, 28, 8, 1, "p");
  fillRect(g, 6, 29, 3, 1, "b");
  fillRect(g, 11, 29, 3, 1, "b");
  return g;
}

function sitSideGrid(app: Appearance): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  const dy = 6;
  drawTorsoSide(g, dy);
  drawHeadSide(g, app, dy);
  drawArmSide(g, "idle", dy);
  // Thigh extends toward the facing side, foot below the knee.
  fillRect(g, 4, 28, 8, 1, "p");
  fillRect(g, 4, 29, 3, 1, "b");
  return g;
}

// ---------------------------------------------------------------------------
// Sprite transforms.
// ---------------------------------------------------------------------------

/** Flips a sprite horizontally (rows padded to full width first). */
export function mirrorSprite(sprite: PixelSprite, key: string): PixelSprite {
  const width = spriteWidth(sprite);
  const rows = sprite.rows.map((row) =>
    row.padEnd(width, ".").split("").reverse().join(""),
  );
  return { key, rows, palette: sprite.palette };
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/** Fixed look for the cleaning-crew NPC. */
export const JANITOR_LOOK: CharacterLook = {
  seed: "npc-janitor",
  accentColor: "#8a8f98",
};

/** Builds all 18 animation frames for one character look. */
export function buildCharacterFrames(look: CharacterLook): CharacterFrameSet {
  const app = resolveAppearance(look);
  const pal = paletteFor(app);
  const key = (name: CharacterFrameName) => `char_${look.seed}_${name}`;
  const front = (name: CharacterFrameName, pose: WalkPose, showFace: boolean) =>
    makeSprite(key(name), pal, gridRows(frontGrid(app, pose, showFace)));
  const side = (name: CharacterFrameName, pose: WalkPose) =>
    makeSprite(key(name), pal, gridRows(sideGrid(app, pose)));

  const idleLeft = side("idle_left", "idle");
  const sitLeft = makeSprite(key("sit_left"), pal, gridRows(sitSideGrid(app)));

  return {
    idle_down: front("idle_down", "idle", true),
    walk_down_a: front("walk_down_a", "a", true),
    walk_down_b: front("walk_down_b", "b", true),
    idle_up: front("idle_up", "idle", false),
    walk_up_a: front("walk_up_a", "a", false),
    walk_up_b: front("walk_up_b", "b", false),
    idle_left: idleLeft,
    walk_left_a: side("walk_left_a", "a"),
    walk_left_b: side("walk_left_b", "b"),
    idle_right: mirrorSprite(idleLeft, key("idle_right")),
    walk_right_a: mirrorSprite(side("walk_left_a", "a"), key("walk_right_a")),
    walk_right_b: mirrorSprite(side("walk_left_b", "b"), key("walk_right_b")),
    sit_down: makeSprite(key("sit_down"), pal, gridRows(sitFrontGrid(app, true))),
    sit_up: makeSprite(key("sit_up"), pal, gridRows(sitFrontGrid(app, false))),
    sit_left: sitLeft,
    sit_right: mirrorSprite(sitLeft, key("sit_right")),
    dance_a: makeSprite(key("dance_a"), pal, gridRows(danceGrid(app, "a"))),
    dance_b: makeSprite(key("dance_b"), pal, gridRows(danceGrid(app, "b"))),
  };
}
