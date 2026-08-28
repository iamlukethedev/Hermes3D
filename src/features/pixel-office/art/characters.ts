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
// Local colors for the 40x60 Gather-style avatars. Kept local on purpose:
// palette.ts is owned by the tiles/furniture modules.
// ---------------------------------------------------------------------------

const OUTLINE_SOFT = "#2a2c38";
const OUTLINE_JOINT = "#20222e";
const SHOE_BASE = "#3a4356";
const SHOE_LIGHT = "#8f96a8";
const SOLE_DARK = "#262b38";
const EYE_DARK = "#20222c";
const BLUSH_PINK = "#e59a8e";
const MOUTH_HINT = "#b06a5a";
const HEADPHONE_BAND = "#262a36";
const HEADPHONE_CUP = "#4a5064";
const HEADPHONE_SHINE = "#7a83a0";

// ---------------------------------------------------------------------------
// Appearance.
// ---------------------------------------------------------------------------

const SKIN_TONES = ["#f6d7b8", "#eebe98", "#d69a6c", "#a9714b", "#6f4a2f"] as const;

/** Hair colors: base fill, lighter highlight band, and darker underside. */
const HAIR_COLORS = [
  { base: "#2c2c34", highlight: "#4a4c5a", dark: "#1d1d24" }, // black.
  { base: "#6b4a2e", highlight: "#8a6440", dark: "#4e3520" }, // brown.
  { base: "#e6c15a", highlight: "#f4d98c", dark: "#b8933c" }, // blonde.
  { base: "#b8452f", highlight: "#d96a48", dark: "#8c3222" }, // ginger.
  { base: "#9a9aa2", highlight: "#bfbfc7", dark: "#6e6e78" }, // gray.
  { base: "#4a3a6b", highlight: "#6b5596", dark: "#352a4e" }, // violet.
  { base: "#3d6b52", highlight: "#579375", dark: "#2b4d3a" }, // teal-green.
] as const;

const HAIR_STYLES = ["short", "spiky", "long", "bob"] as const;
const PANTS_COLORS = ["#35406b", "#5a5f6e", "#5f4a33", "#24262e"] as const;

/** Cap accessory colors (base + darker brim). */
const CAP_COLORS = [
  { base: "#c94f43", brim: "#9c382f" },
  { base: "#4f9e43", brim: "#3c7d33" },
  { base: "#5a8fd9", brim: "#3f6cab" },
] as const;

type HairStyle = (typeof HAIR_STYLES)[number];
type Accessory = "none" | "headphones" | "cap";

type Appearance = {
  skin: string;
  skinShade: string;
  hair: string;
  hairHighlight: string;
  hairDark: string;
  hairStyle: HairStyle;
  pants: string;
  pantsCrease: string;
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
      skinShade: darkenHex(SKIN_TONES[2], 0.85),
      hair: HAIR_COLORS[4].base,
      hairHighlight: HAIR_COLORS[4].highlight,
      hairDark: HAIR_COLORS[4].dark,
      hairStyle: "short",
      pants: PANTS_COLORS[0],
      pantsCrease: darkenHex(PANTS_COLORS[0], 0.72),
      shirt,
      shirtShade,
      accessory: "none",
      capBase: CAP_COLORS[0].base,
      capBrim: CAP_COLORS[0].brim,
      janitorCap: true,
    };
  }
  const h = hashSeed(look.seed);
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const hair = HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length];
  const pants = PANTS_COLORS[(h >>> 9) % PANTS_COLORS.length];
  const accessoryRoll = (h >>> 12) % 5;
  const cap = CAP_COLORS[(h >>> 15) % CAP_COLORS.length];
  return {
    skin,
    skinShade: darkenHex(skin, 0.85),
    hair: hair.base,
    hairHighlight: hair.highlight,
    hairDark: hair.dark,
    hairStyle: HAIR_STYLES[(h >>> 6) % HAIR_STYLES.length],
    pants,
    pantsCrease: darkenHex(pants, 0.72),
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
    O: OUTLINE_JOINT,
    h: app.hair,
    H: app.hairHighlight,
    g: app.hairDark,
    s: app.skin,
    S: app.skinShade,
    e: EYE_DARK,
    w: CHAR_WHITE,
    r: BLUSH_PINK,
    m: MOUTH_HINT,
    t: app.shirt,
    T: app.shirtShade,
    p: app.pants,
    P: app.pantsCrease,
    b: SHOE_BASE,
    c: SHOE_LIGHT,
    B: SOLE_DARK,
    y: CAP_YELLOW,
    k: app.capBase,
    K: app.capBrim,
    d: HEADPHONE_BAND,
    D: HEADPHONE_CUP,
    f: HEADPHONE_SHINE,
  };
}

// ---------------------------------------------------------------------------
// Frame construction. Standing layout at 40x60 (x 0..39, y 0..59):
//   head  y0..19  (20px incl. hair volume, box at x10..29).
//   torso y20..43 (24px: neck, collar, shirt, hem, belt, hip band).
//   legs  y44..59 (16px: 10px pants + 6px two-tone shoes).
// Front frames are mirror-symmetric around x = 19.5 (pairs sum to 39).
// Walk frames drop the body 1px (bob) and lift one leg 2px; sitting frames
// redraw everything 12 rows lower with a lap band and hands resting on it.
// ---------------------------------------------------------------------------

type WalkPose = "idle" | "a" | "b";

/** Rounded outline of the 20x20 head box at x10..29, y dy..dy+19. */
function drawHeadOutline(g: Grid, dy: number): void {
  hLine(g, 12, dy, 16, "o");
  fillRect(g, 10, dy + 1, 2, 1, "o");
  fillRect(g, 28, dy + 1, 2, 1, "o");
  vLine(g, 10, dy + 2, 16, "o");
  vLine(g, 29, dy + 2, 16, "o");
  fillRect(g, 10, dy + 18, 2, 1, "o");
  fillRect(g, 28, dy + 18, 2, 1, "o");
  // Jaw line with a gap over the neck so the head connects to the body.
  hLine(g, 12, dy + 19, 5, "o");
  hLine(g, 23, dy + 19, 5, "o");
}

/** Fills the jaw gap so the chin flows into the neck without a hole. */
function drawNeckGapFill(g: Grid, dy: number, ch: string): void {
  fillRect(g, 17, dy + 19, 6, 1, ch);
}

/** Hair crown rows 1..7: base, tapered highlight band, dark under-edge. */
function drawHairCrown(g: Grid, dy: number): void {
  fillRect(g, 12, dy + 1, 16, 1, "h");
  fillRect(g, 11, dy + 2, 18, 1, "h");
  fillRect(g, 11, dy + 3, 2, 1, "h");
  fillRect(g, 13, dy + 3, 14, 1, "H");
  fillRect(g, 27, dy + 3, 2, 1, "h");
  fillRect(g, 11, dy + 4, 4, 1, "h");
  fillRect(g, 15, dy + 4, 10, 1, "H");
  fillRect(g, 25, dy + 4, 4, 1, "h");
  fillRect(g, 11, dy + 5, 18, 2, "h");
  fillRect(g, 11, dy + 7, 2, 1, "g");
  fillRect(g, 13, dy + 7, 14, 1, "h");
  fillRect(g, 27, dy + 7, 2, 1, "g");
}

/** Face fill under the crown, with soft chin shading above the jaw. */
function drawFaceBase(g: Grid, dy: number): void {
  fillRect(g, 11, dy + 8, 18, 10, "s");
  fillRect(g, 12, dy + 18, 16, 1, "s");
  fillRect(g, 17, dy + 17, 6, 1, "S");
  drawNeckGapFill(g, dy, "s");
}

/** Brows, glinted 2x2 eyes, cheek blush, and the 2px mouth (front only). */
function drawFaceFeatures(g: Grid, dy: number): void {
  fillRect(g, 14, dy + 10, 2, 1, "g");
  fillRect(g, 24, dy + 10, 2, 1, "g");
  fillRect(g, 14, dy + 11, 2, 2, "e");
  fillRect(g, 24, dy + 11, 2, 2, "e");
  setPx(g, 15, dy + 11, "w");
  setPx(g, 24, dy + 11, "w");
  fillRect(g, 12, dy + 14, 2, 1, "r");
  fillRect(g, 26, dy + 14, 2, 1, "r");
  fillRect(g, 19, dy + 15, 2, 1, "m");
}

/** Style-specific fringe and hair silhouette for front-facing heads. */
function drawFringeFront(g: Grid, app: Appearance, dy: number): void {
  fillRect(g, 11, dy + 8, 18, 1, "h");
  if (app.hairStyle === "spiky") {
    // Jagged spikes biting into the forehead.
    for (const x of [11, 15, 19, 23, 27]) fillRect(g, x, dy + 9, 2, 1, "h");
    setPx(g, 11, dy + 10, "g");
    setPx(g, 28, dy + 10, "g");
  } else if (app.hairStyle === "long") {
    // Curtain part framing the face down to the jaw.
    fillRect(g, 11, dy + 9, 3, 1, "h");
    fillRect(g, 26, dy + 9, 3, 1, "h");
    vLine(g, 11, dy + 10, 8, "h");
    vLine(g, 28, dy + 10, 8, "h");
    // Shoulder locks hanging outside the head outline, with dark tips.
    fillRect(g, 8, dy + 4, 2, 26, "h");
    fillRect(g, 30, dy + 4, 2, 26, "h");
    fillRect(g, 8, dy + 29, 2, 1, "g");
    fillRect(g, 30, dy + 29, 2, 1, "g");
  } else if (app.hairStyle === "bob") {
    // Side panels curling inward at the chin plus outer volume.
    fillRect(g, 11, dy + 9, 2, 7, "h");
    fillRect(g, 27, dy + 9, 2, 7, "h");
    setPx(g, 13, dy + 15, "h");
    setPx(g, 26, dy + 15, "h");
    vLine(g, 9, dy + 3, 10, "h");
    vLine(g, 30, dy + 3, 10, "h");
  } else {
    // Short crop: straight fringe with small sideburn shadows.
    vLine(g, 11, dy + 9, 2, "g");
    vLine(g, 28, dy + 9, 2, "g");
  }
}

function drawAccessoriesFront(g: Grid, app: Appearance, dy: number): void {
  if (app.janitorCap) {
    // Yellow cap band across the top of the (gray) hair.
    fillRect(g, 12, dy + 1, 16, 1, "y");
    fillRect(g, 11, dy + 2, 18, 2, "y");
  } else if (app.accessory === "cap") {
    fillRect(g, 12, dy + 1, 16, 1, "k");
    fillRect(g, 11, dy + 2, 18, 3, "k");
    fillRect(g, 11, dy + 5, 18, 1, "K");
    // Wide front brim.
    hLine(g, 7, dy + 6, 26, "K");
  } else if (app.accessory === "headphones") {
    hLine(g, 12, dy, 16, "d");
    fillRect(g, 12, dy + 1, 16, 1, "d");
    fillRect(g, 8, dy + 10, 3, 4, "D");
    fillRect(g, 29, dy + 10, 3, 4, "D");
    setPx(g, 9, dy + 11, "f");
    setPx(g, 30, dy + 11, "f");
  }
}

function drawAccessoriesBack(g: Grid, app: Appearance, dy: number): void {
  if (app.janitorCap) {
    fillRect(g, 12, dy + 1, 16, 1, "y");
    fillRect(g, 11, dy + 2, 18, 2, "y");
  } else if (app.accessory === "cap") {
    fillRect(g, 12, dy + 1, 16, 1, "k");
    fillRect(g, 11, dy + 2, 18, 3, "k");
    fillRect(g, 11, dy + 5, 18, 1, "K");
  } else if (app.accessory === "headphones") {
    hLine(g, 12, dy, 16, "d");
    fillRect(g, 12, dy + 1, 16, 1, "d");
    fillRect(g, 8, dy + 10, 3, 4, "D");
    fillRect(g, 29, dy + 10, 3, 4, "D");
    setPx(g, 9, dy + 11, "f");
    setPx(g, 30, dy + 11, "f");
  }
}

/** Front head (face) with per-style fringe, eyes, blush, and mouth. */
function drawHeadFront(g: Grid, app: Appearance, dy: number): void {
  drawHeadOutline(g, dy);
  drawFaceBase(g, dy);
  drawHairCrown(g, dy);
  drawFaceFeatures(g, dy);
  drawFringeFront(g, app, dy);
  drawAccessoriesFront(g, app, dy);
}

/** Back of the head (up-facing): all hair with highlight + dark edge. */
function drawHeadBack(g: Grid, app: Appearance, dy: number): void {
  drawHeadOutline(g, dy);
  fillRect(g, 12, dy + 1, 16, 1, "h");
  fillRect(g, 11, dy + 2, 18, 16, "h");
  fillRect(g, 13, dy + 3, 14, 1, "H");
  fillRect(g, 15, dy + 4, 10, 1, "H");
  fillRect(g, 12, dy + 18, 16, 1, "g");
  drawNeckGapFill(g, dy, "h");
  drawAccessoriesBack(g, app, dy);
}

/** Hair falling over the shoulders, drawn AFTER the torso on up frames. */
function drawHairBackOverlay(g: Grid, app: Appearance, dy: number): void {
  if (app.hairStyle === "long") {
    fillRect(g, 11, dy + 19, 18, 5, "h");
    fillRect(g, 12, dy + 24, 16, 4, "h");
    fillRect(g, 12, dy + 28, 16, 1, "g");
    fillRect(g, 8, dy + 4, 2, 26, "h");
    fillRect(g, 30, dy + 4, 2, 26, "h");
  } else if (app.hairStyle === "bob") {
    fillRect(g, 11, dy + 19, 18, 3, "h");
    fillRect(g, 11, dy + 22, 18, 1, "g");
    vLine(g, 9, dy + 3, 10, "h");
    vLine(g, 30, dy + 3, 10, "h");
  } else if (app.hairStyle === "spiky") {
    // Stray spikes poking off the silhouette, kept attached to the outline.
    setPx(g, 9, dy + 4, "h");
    setPx(g, 30, dy + 4, "h");
    fillRect(g, 8, dy + 7, 2, 1, "h");
    fillRect(g, 30, dy + 7, 2, 1, "h");
    setPx(g, 9, dy + 10, "h");
    setPx(g, 30, dy + 10, "h");
  }
}

/** Left-facing profile: nose bump, single glinted eye, swept-back hair. */
function drawHeadSide(g: Grid, app: Appearance, dy: number): void {
  drawHeadOutline(g, dy);
  drawFaceBase(g, dy);
  drawHairCrown(g, dy);
  // Swept-back hair mass with a diagonal fringe edge (dark leading pixel).
  const hairStarts = [13, 16, 18, 20, 20, 20, 20, 20, 21, 22];
  for (let i = 0; i < hairStarts.length; i += 1) {
    const y = dy + 8 + i;
    const sx = hairStarts[i];
    setPx(g, sx, y, "g");
    fillRect(g, sx + 1, y, 28 - sx, 1, "h");
  }
  fillRect(g, 23, dy + 18, 5, 1, "h");
  // Profile brow and single eye with glint.
  fillRect(g, 13, dy + 10, 2, 1, "g");
  fillRect(g, 13, dy + 11, 2, 2, "e");
  setPx(g, 13, dy + 11, "w");
  // Nose bump on the facing edge.
  setPx(g, 9, dy + 12, "o");
  setPx(g, 8, dy + 13, "o");
  setPx(g, 9, dy + 13, "s");
  setPx(g, 9, dy + 14, "o");
  setPx(g, 10, dy + 13, "s");
  if (app.hairStyle === "spiky") {
    // Spike tips off the back of the head plus a jagged forehead notch.
    fillRect(g, 30, dy + 4, 2, 1, "h");
    fillRect(g, 30, dy + 8, 2, 1, "h");
    setPx(g, 30, dy + 12, "h");
    fillRect(g, 11, dy + 8, 2, 1, "h");
    setPx(g, 12, dy + 9, "h");
  } else if (app.hairStyle === "long") {
    // Tail of hair running down the back, outlined on its far edge.
    fillRect(g, 25, dy + 8, 4, 22, "h");
    vLine(g, 29, dy + 18, 12, "o");
    fillRect(g, 25, dy + 29, 4, 1, "g");
  } else if (app.hairStyle === "bob") {
    // Bob mass wrapping below the jaw with a dark under-edge.
    fillRect(g, 24, dy + 18, 4, 3, "h");
    fillRect(g, 24, dy + 21, 4, 1, "g");
    vLine(g, 30, dy + 4, 10, "h");
  }
  drawAccessoriesSide(g, app, dy);
}

function drawAccessoriesSide(g: Grid, app: Appearance, dy: number): void {
  if (app.janitorCap) {
    fillRect(g, 12, dy + 1, 16, 1, "y");
    fillRect(g, 11, dy + 2, 18, 2, "y");
  } else if (app.accessory === "cap") {
    fillRect(g, 12, dy + 1, 16, 1, "k");
    fillRect(g, 11, dy + 2, 18, 3, "k");
    fillRect(g, 11, dy + 5, 18, 1, "K");
    // Brim pointing toward the facing side.
    hLine(g, 4, dy + 6, 16, "K");
  } else if (app.accessory === "headphones") {
    hLine(g, 12, dy, 16, "d");
    fillRect(g, 12, dy + 1, 16, 1, "d");
    // Single cup over the ear.
    fillRect(g, 17, dy + 10, 4, 4, "D");
    setPx(g, 18, dy + 11, "f");
  }
}

/** Front torso: neck, collar band with wings, shaded shirt, hem, hips. */
function drawTorsoFront(g: Grid, dy: number): void {
  // Neck with a shadow row under the chin.
  setPx(g, 16, dy + 20, "o");
  fillRect(g, 17, dy + 20, 6, 1, "s");
  setPx(g, 23, dy + 20, "o");
  setPx(g, 16, dy + 21, "o");
  fillRect(g, 17, dy + 21, 6, 1, "S");
  setPx(g, 23, dy + 21, "o");
  // Shoulder line and white collar band.
  hLine(g, 10, dy + 22, 6, "o");
  fillRect(g, 16, dy + 22, 8, 1, "w");
  hLine(g, 24, dy + 22, 6, "o");
  // Collar row with wing tips; darker joint pixels at the shoulder corners.
  setPx(g, 10, dy + 23, "O");
  fillRect(g, 11, dy + 23, 2, 1, "T");
  fillRect(g, 13, dy + 23, 2, 1, "t");
  fillRect(g, 15, dy + 23, 10, 1, "w");
  fillRect(g, 25, dy + 23, 2, 1, "t");
  fillRect(g, 27, dy + 23, 2, 1, "T");
  setPx(g, 29, dy + 23, "O");
  // Shirt body with side shading columns.
  for (let y = dy + 24; y <= dy + 37; y += 1) {
    setPx(g, 10, y, "o");
    fillRect(g, 11, y, 2, 1, "T");
    fillRect(g, 13, y, 14, 1, "t");
    fillRect(g, 27, y, 2, 1, "T");
    setPx(g, 29, y, "o");
  }
  // Two-row hem.
  for (let y = dy + 38; y <= dy + 39; y += 1) {
    setPx(g, 10, y, "o");
    fillRect(g, 11, y, 18, 1, "T");
    setPx(g, 29, y, "o");
  }
  // Belt outline between shirt and hips.
  hLine(g, 11, dy + 40, 18, "o");
  // Hip band with darker joint pixels at the top corners.
  for (let y = dy + 41; y <= dy + 43; y += 1) {
    setPx(g, 11, y, y === dy + 41 ? "O" : "o");
    fillRect(g, 12, y, 16, 1, "p");
    setPx(g, 28, y, y === dy + 41 ? "O" : "o");
  }
}

/** Side torso (narrower box at x12..27) with a shaded back column. */
function drawTorsoSide(g: Grid, dy: number): void {
  setPx(g, 16, dy + 20, "o");
  fillRect(g, 17, dy + 20, 6, 1, "s");
  setPx(g, 23, dy + 20, "o");
  setPx(g, 16, dy + 21, "o");
  fillRect(g, 17, dy + 21, 6, 1, "S");
  setPx(g, 23, dy + 21, "o");
  hLine(g, 13, dy + 22, 3, "o");
  fillRect(g, 16, dy + 22, 8, 1, "w");
  hLine(g, 24, dy + 22, 3, "o");
  setPx(g, 12, dy + 23, "O");
  setPx(g, 13, dy + 23, "t");
  fillRect(g, 14, dy + 23, 4, 1, "w");
  fillRect(g, 18, dy + 23, 6, 1, "t");
  fillRect(g, 24, dy + 23, 3, 1, "T");
  setPx(g, 27, dy + 23, "O");
  for (let y = dy + 24; y <= dy + 37; y += 1) {
    setPx(g, 12, y, "o");
    fillRect(g, 13, y, 11, 1, "t");
    fillRect(g, 24, y, 3, 1, "T");
    setPx(g, 27, y, "o");
  }
  for (let y = dy + 38; y <= dy + 39; y += 1) {
    setPx(g, 12, y, "o");
    fillRect(g, 13, y, 14, 1, "T");
    setPx(g, 27, y, "o");
  }
  hLine(g, 13, dy + 40, 14, "o");
  for (let y = dy + 41; y <= dy + 43; y += 1) {
    setPx(g, 13, y, "o");
    fillRect(g, 14, y, 12, 1, "p");
    setPx(g, 26, y, "o");
  }
}

/** One hanging front arm: outlined sleeve, cuff row, and a visible hand. */
function drawArmFrontAt(g: Grid, sleeveX: number, outlineX: number, top: number): void {
  hLine(g, sleeveX, top + 22, 2, "o");
  vLine(g, outlineX, top + 23, 13, "o");
  fillRect(g, sleeveX, top + 23, 2, 8, "t");
  fillRect(g, sleeveX, top + 31, 2, 1, "T");
  fillRect(g, sleeveX, top + 32, 2, 4, "s");
  hLine(g, sleeveX, top + 36, 2, "o");
}

/** Front arms hang beside the torso; walk poses swing them 2px up/down. */
function drawArmsFront(g: Grid, pose: WalkPose, dy: number): void {
  const lift = pose === "idle" ? 0 : pose === "a" ? -2 : 2;
  drawArmFrontAt(g, 8, 7, dy + lift);
  drawArmFrontAt(g, 30, 32, dy - lift);
}

/** Single visible side arm; walk poses swing it 4px forward/back. */
function drawArmSide(g: Grid, pose: WalkPose, dy: number): void {
  const x = pose === "idle" ? 16 : pose === "a" ? 12 : 20;
  vLine(g, x - 1, dy + 24, 13, "o");
  fillRect(g, x, dy + 24, 4, 8, "T");
  fillRect(g, x, dy + 32, 4, 1, "w");
  fillRect(g, x + 1, dy + 33, 2, 4, "s");
  hLine(g, x + 1, dy + 37, 2, "o");
}

/** One outlined front leg with a crease line and a three-tone shoe. */
function drawLegFront(g: Grid, x: number, creaseX: number, lift: number): void {
  const h = 10 - lift;
  vLine(g, x - 1, 44, h, "o");
  vLine(g, x + 6, 44, h, "o");
  fillRect(g, x, 44, 6, h, "p");
  vLine(g, creaseX, 44, h, "P");
  const sy = 54 - lift;
  fillRect(g, x - 1, sy, 8, 3, "b");
  fillRect(g, x - 1, sy + 3, 8, 2, "c");
  fillRect(g, x - 1, sy + 5, 8, 1, "B");
}

/** Front legs: chunky 6px legs; the swing leg lifts its shoe 2px. */
function drawLegsFront(g: Grid, pose: WalkPose): void {
  drawLegFront(g, 12, 14, pose === "a" ? 2 : 0);
  drawLegFront(g, 22, 25, pose === "b" ? 2 : 0);
}

/** Side shoe with a rounded toe: upper, light midsole, and dark sole line. */
function drawShoeSide(g: Grid, x: number, y: number, w: number): void {
  fillRect(g, x, y, w, 3, "b");
  fillRect(g, x, y + 3, w, 2, "c");
  fillRect(g, x, y + 5, w, 1, "B");
  setPx(g, x, y, ".");
}

/** Side legs: idle stands square; "a" is the stride, "b" the passing frame. */
function drawLegsSide(g: Grid, pose: WalkPose): void {
  if (pose === "idle") {
    vLine(g, 15, 44, 10, "o");
    fillRect(g, 16, 44, 7, 10, "p");
    vLine(g, 19, 44, 10, "P");
    vLine(g, 23, 44, 10, "o");
    drawShoeSide(g, 13, 54, 11);
    return;
  }
  if (pose === "a") {
    // Front leg strides forward and stays planted; back leg lifts 2px.
    vLine(g, 11, 44, 10, "o");
    fillRect(g, 12, 44, 5, 10, "p");
    vLine(g, 14, 44, 10, "P");
    fillRect(g, 21, 44, 5, 8, "p");
    vLine(g, 23, 44, 8, "P");
    vLine(g, 26, 44, 8, "o");
    drawShoeSide(g, 9, 54, 8);
    drawShoeSide(g, 20, 52, 8);
    return;
  }
  // Passing frame: legs together with a 1px bounce off the ground.
  vLine(g, 15, 44, 9, "o");
  fillRect(g, 16, 44, 7, 9, "p");
  vLine(g, 19, 44, 9, "P");
  vLine(g, 23, 44, 9, "o");
  drawShoeSide(g, 13, 53, 11);
}

// ---------------------------------------------------------------------------
// Full-frame grids.
// ---------------------------------------------------------------------------

function frontGrid(app: Appearance, pose: WalkPose, showFace: boolean): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  // Walk frames drop the body 1px for the bob while the legs stay grounded.
  const dy = pose === "idle" ? 0 : 1;
  drawLegsFront(g, pose);
  drawTorsoFront(g, dy);
  drawArmsFront(g, pose, dy);
  if (showFace) {
    drawHeadFront(g, app, dy);
  } else {
    drawHeadBack(g, app, dy);
    drawHairBackOverlay(g, app, dy);
  }
  return g;
}

function sideGrid(app: Appearance, pose: WalkPose): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  const dy = pose === "idle" ? 0 : 1;
  drawLegsSide(g, pose);
  drawTorsoSide(g, dy);
  drawHeadSide(g, app, dy);
  drawArmSide(g, pose, dy);
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
  // Head first so the 1px tilt only moves head (and hair) pixels.
  drawHeadFront(g, app, 0);
  shiftRows(g, 0, CHARACTER_HEIGHT - 1, variant === "a" ? -1 : 1);
  drawTorsoFront(g, 0);
  // Wide stance.
  drawLegFront(g, 10, 12, 0);
  drawLegFront(g, 24, 27, 0);
  // Arms up, alternating heights between the two frames. Each arm gets
  // diagonal connector pixels so it doesn't float away from the shoulder.
  const highArm = (x: number, cx: number, cdir: number) => {
    fillRect(g, x, 10, 3, 4, "s");
    fillRect(g, x, 14, 3, 1, "w");
    fillRect(g, x, 15, 3, 8, "T");
    setPx(g, cx, 23, "T");
    setPx(g, cx + cdir, 24, "T");
  };
  const midArm = (x: number, cx: number, cdir: number) => {
    fillRect(g, x, 16, 3, 4, "s");
    fillRect(g, x, 20, 3, 1, "w");
    fillRect(g, x, 21, 3, 7, "T");
    setPx(g, cx, 26, "T");
    setPx(g, cx + cdir, 25, "T");
  };
  if (variant === "a") {
    highArm(5, 8, 1);
    midArm(32, 31, -1);
  } else {
    midArm(5, 8, 1);
    highArm(32, 31, -1);
  }
  return g;
}

/**
 * Seated front frames: the figure is redrawn 12 rows lower (transparent top
 * padding) with a lap band, knees, feet stubs, and hands resting on the lap,
 * so the sprite reads ~12px shorter when overlapped with a chair.
 */
function sitFrontGrid(app: Appearance, showFace: boolean): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  const dy = 12;
  drawTorsoFront(g, dy);
  if (showFace) {
    drawHeadFront(g, app, dy);
  } else {
    drawHeadBack(g, app, dy);
    drawHairBackOverlay(g, app, dy);
  }
  // Lap band with knee shading at the outer edges.
  for (let y = 56; y <= 57; y += 1) {
    setPx(g, 10, y, "o");
    fillRect(g, 11, y, 18, 1, "p");
    setPx(g, 29, y, "o");
  }
  fillRect(g, 12, 56, 2, 2, "P");
  fillRect(g, 26, 56, 2, 2, "P");
  // Feet peeking below the lap.
  fillRect(g, 12, 58, 5, 1, "b");
  fillRect(g, 12, 59, 5, 1, "B");
  fillRect(g, 23, 58, 5, 1, "b");
  fillRect(g, 23, 59, 5, 1, "B");
  // Bent arms: sleeve down the side, forearm crossing to hands on the lap.
  hLine(g, 8, 34, 2, "o");
  vLine(g, 7, 35, 18, "o");
  fillRect(g, 8, 35, 2, 14, "t");
  fillRect(g, 8, 49, 2, 2, "T");
  fillRect(g, 8, 51, 2, 3, "s");
  vLine(g, 10, 52, 2, "o");
  fillRect(g, 10, 54, 6, 2, "s");
  fillRect(g, 16, 55, 3, 2, "s");
  hLine(g, 30, 34, 2, "o");
  vLine(g, 32, 35, 18, "o");
  fillRect(g, 30, 35, 2, 14, "t");
  fillRect(g, 30, 49, 2, 2, "T");
  fillRect(g, 30, 51, 2, 3, "s");
  vLine(g, 29, 52, 2, "o");
  fillRect(g, 24, 54, 6, 2, "s");
  fillRect(g, 21, 55, 3, 2, "s");
  return g;
}

function sitSideGrid(app: Appearance): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  const dy = 12;
  drawTorsoSide(g, dy);
  // Thigh extends toward the facing side with knee shading, shin drops down.
  hLine(g, 6, 52, 9, "o");
  for (let y = 53; y <= 55; y += 1) {
    setPx(g, 5, y, "o");
    fillRect(g, 6, y, 8, 1, "p");
  }
  fillRect(g, 6, 53, 2, 3, "P");
  fillRect(g, 6, 56, 3, 2, "p");
  fillRect(g, 4, 58, 6, 1, "b");
  fillRect(g, 4, 59, 6, 1, "B");
  drawHeadSide(g, app, dy);
  // Arm resting down toward the thigh.
  fillRect(g, 15, dy + 24, 4, 8, "T");
  fillRect(g, 15, dy + 32, 4, 1, "w");
  fillRect(g, 16, dy + 33, 2, 7, "s");
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
