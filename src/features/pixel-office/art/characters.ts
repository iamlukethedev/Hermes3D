import {
  CHARACTER_HEIGHT,
  CHARACTER_WIDTH,
  type CharacterFrameName,
  type CharacterFrameSet,
  type CharacterLook,
  type PixelSprite,
} from "../types";
import {
  CAP_YELLOW,
  CHAR_EYE,
  CHAR_OUTLINE,
  CHAR_SHOE,
  CHAR_WHITE,
  FALLBACK_SHIRT,
} from "./palette";
import { fillRect, gridRows, hLine, makeGrid, setPx, vLine, type Grid } from "./grid";
import { makeSprite, spriteWidth } from "./sprite";

// ---------------------------------------------------------------------------
// Appearance.
// ---------------------------------------------------------------------------

const SKIN_TONES = ["#f6d7b8", "#eebe98", "#d69a6c", "#a9714b", "#6f4a2f"] as const;
const HAIR_COLORS = ["#2c2c34", "#6b4a2e", "#e6c15a", "#b8452f", "#9a9aa2", "#4a6fd9"] as const;
const HAIR_STYLES = ["short", "spiky", "long", "bob"] as const;
const PANTS_COLORS = ["#35406b", "#5a5f6e", "#5f4a33", "#24262e"] as const;

type HairStyle = (typeof HAIR_STYLES)[number];

type Appearance = {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  pants: string;
  shirt: string;
  shirtShade: string;
  /** Janitor NPCs get a yellow cap band on the hair. */
  cap: boolean;
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
      hair: HAIR_COLORS[4],
      hairStyle: "short",
      pants: PANTS_COLORS[0],
      shirt,
      shirtShade,
      cap: true,
    };
  }
  const h = hashSeed(look.seed);
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hair: HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length],
    hairStyle: HAIR_STYLES[(h >>> 6) % HAIR_STYLES.length],
    pants: PANTS_COLORS[(h >>> 9) % PANTS_COLORS.length],
    shirt,
    shirtShade,
    cap: false,
  };
}

function paletteFor(app: Appearance): Record<string, string> {
  return {
    o: CHAR_OUTLINE,
    h: app.hair,
    s: app.skin,
    t: app.shirt,
    T: app.shirtShade,
    p: app.pants,
    b: CHAR_SHOE,
    e: CHAR_EYE,
    w: CHAR_WHITE,
    y: CAP_YELLOW,
  };
}

// ---------------------------------------------------------------------------
// Frame construction.
// ---------------------------------------------------------------------------

type WalkPose = "idle" | "a" | "b";

/** Rounded head outline box spanning x 3..12, y 2..11. */
function drawHeadOutline(g: Grid): void {
  hLine(g, 4, 2, 8, "o");
  hLine(g, 4, 11, 8, "o");
  vLine(g, 3, 3, 8, "o");
  vLine(g, 12, 3, 8, "o");
}

function applyHairStyle(g: Grid, app: Appearance, facing: "down" | "up" | "left"): void {
  if (app.hairStyle === "spiky") {
    for (const x of [4, 6, 8, 10]) setPx(g, x, 1, "h");
  } else if (app.hairStyle === "long") {
    if (facing === "left") {
      vLine(g, 13, 4, 10, "h");
    } else {
      vLine(g, 2, 4, 10, "h");
      vLine(g, 13, 4, 10, "h");
    }
  } else if (app.hairStyle === "bob") {
    if (facing === "left") {
      vLine(g, 13, 4, 6, "h");
    } else {
      vLine(g, 2, 4, 6, "h");
      vLine(g, 13, 4, 6, "h");
    }
  }
  if (app.cap) {
    // Yellow cap: a 2px band across the top of the hair.
    fillRect(g, 4, 3, 8, 2, "y");
  }
}

/** Head interior for down (face) or up (back of head). */
function drawHeadFront(g: Grid, showFace: boolean): void {
  fillRect(g, 4, 3, 8, 8, "h");
  if (showFace) {
    fillRect(g, 5, 6, 6, 5, "s");
    fillRect(g, 5, 10, 6, 1, "s");
    setPx(g, 4, 7, "h");
    setPx(g, 11, 7, "h");
    fillRect(g, 4, 8, 1, 3, "s");
    fillRect(g, 11, 8, 1, 3, "s");
    setPx(g, 6, 7, "e");
    setPx(g, 9, 7, "e");
  }
}

/** Head interior for a left-facing profile: face left, hair behind. */
function drawHeadSide(g: Grid): void {
  fillRect(g, 4, 3, 8, 8, "h");
  fillRect(g, 4, 6, 4, 5, "s");
  fillRect(g, 4, 9, 7, 2, "s");
  setPx(g, 5, 7, "e");
}

/** Torso with outlined sides, shirt fill, and shaded hem row. */
function drawTorso(g: Grid): void {
  vLine(g, 4, 12, 6, "o");
  vLine(g, 11, 12, 6, "o");
  fillRect(g, 5, 12, 6, 5, "t");
  fillRect(g, 5, 17, 6, 1, "T");
}

function drawFrontArms(g: Grid, pose: WalkPose): void {
  const leftUp = pose === "a";
  const rightUp = pose === "b";
  const leftY = pose === "idle" ? 13 : leftUp ? 12 : 14;
  const rightY = pose === "idle" ? 13 : rightUp ? 12 : 14;
  vLine(g, 3, leftY, 2, "t");
  setPx(g, 3, leftY + 2, "s");
  vLine(g, 12, rightY, 2, "t");
  setPx(g, 12, rightY + 2, "s");
}

function drawFrontLegs(g: Grid, pose: WalkPose): void {
  const drawLeg = (x: number, lifted: boolean) => {
    if (lifted) {
      fillRect(g, x, 18, 2, 3, "p");
      fillRect(g, x, 21, 2, 2, "b");
    } else {
      fillRect(g, x, 18, 2, 4, "p");
      fillRect(g, x, 22, 2, 2, "b");
    }
  };
  drawLeg(5, pose === "a");
  drawLeg(9, pose === "b");
}

function drawSideArm(g: Grid, pose: WalkPose): void {
  const x = pose === "idle" ? 5 : pose === "a" ? 4 : 6;
  vLine(g, x, 13, 2, "T");
  setPx(g, x, 15, "s");
}

function drawSideLegs(g: Grid, pose: WalkPose): void {
  if (pose === "idle") {
    fillRect(g, 6, 18, 4, 4, "p");
    fillRect(g, 5, 22, 5, 1, "b");
    fillRect(g, 5, 23, 2, 1, "b");
    return;
  }
  if (pose === "a") {
    // Front leg strides forward (toward the left), back leg trails lifted.
    fillRect(g, 4, 18, 2, 4, "p");
    fillRect(g, 3, 22, 3, 2, "b");
    fillRect(g, 8, 18, 2, 3, "p");
    fillRect(g, 8, 21, 3, 1, "b");
    return;
  }
  // Pose "b": legs pass close together mid-stride.
  fillRect(g, 6, 18, 2, 4, "p");
  fillRect(g, 5, 22, 3, 2, "b");
  fillRect(g, 8, 18, 2, 4, "p");
  fillRect(g, 8, 22, 2, 1, "b");
}

function frontGrid(app: Appearance, pose: WalkPose, showFace: boolean): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  drawHeadOutline(g);
  drawHeadFront(g, showFace);
  applyHairStyle(g, app, showFace ? "down" : "up");
  drawTorso(g);
  drawFrontArms(g, pose);
  drawFrontLegs(g, pose);
  return g;
}

function sideGrid(app: Appearance, pose: WalkPose): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  drawHeadOutline(g);
  drawHeadSide(g);
  applyHairStyle(g, app, "left");
  drawTorso(g);
  drawSideArm(g, pose);
  drawSideLegs(g, pose);
  return g;
}

/** Shifts rows y0..y1 (inclusive) one pixel to the right for a head tilt. */
function shiftRowsRight(g: Grid, y0: number, y1: number): void {
  for (let y = y0; y <= y1 && y < g.length; y += 1) {
    g[y].pop();
    g[y].unshift(".");
  }
}

function danceGrid(app: Appearance, variant: "a" | "b"): Grid {
  const g = makeGrid(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  drawHeadOutline(g);
  drawHeadFront(g, true);
  applyHairStyle(g, app, "down");
  if (variant === "b") shiftRowsRight(g, 0, 11);
  drawTorso(g);
  drawFrontLegs(g, "idle");
  if (variant === "a") {
    // Both arms straight up beside the head.
    for (const x of [2, 13]) {
      vLine(g, x, 10, 3, "t");
      setPx(g, x, 9, "s");
    }
  } else {
    // Arms out diagonally.
    setPx(g, 2, 13, "t");
    setPx(g, 1, 12, "t");
    setPx(g, 1, 11, "s");
    setPx(g, 13, 13, "t");
    setPx(g, 14, 12, "t");
    setPx(g, 14, 11, "s");
  }
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

/**
 * Seated variant: drops three leg rows and re-pads the top, so the figure is
 * shorter and reads as sitting when overlapped with a chair.
 */
function toSitting(sprite: PixelSprite, key: string): PixelSprite {
  const kept = sprite.rows.filter((_, i) => i < 18 || i > 20);
  const blank = ".".repeat(CHARACTER_WIDTH);
  return { key, rows: [blank, blank, blank, ...kept], palette: sprite.palette };
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

  const idleDown = front("idle_down", "idle", true);
  const idleUp = front("idle_up", "idle", false);
  const idleLeft = side("idle_left", "idle");
  const idleRight = mirrorSprite(idleLeft, key("idle_right"));

  return {
    idle_down: idleDown,
    walk_down_a: front("walk_down_a", "a", true),
    walk_down_b: front("walk_down_b", "b", true),
    idle_up: idleUp,
    walk_up_a: front("walk_up_a", "a", false),
    walk_up_b: front("walk_up_b", "b", false),
    idle_left: idleLeft,
    walk_left_a: side("walk_left_a", "a"),
    walk_left_b: side("walk_left_b", "b"),
    idle_right: idleRight,
    walk_right_a: mirrorSprite(side("walk_left_a", "a"), key("walk_right_a")),
    walk_right_b: mirrorSprite(side("walk_left_b", "b"), key("walk_right_b")),
    sit_down: toSitting(idleDown, key("sit_down")),
    sit_up: toSitting(idleUp, key("sit_up")),
    sit_left: toSitting(idleLeft, key("sit_left")),
    sit_right: toSitting(idleRight, key("sit_right")),
    dance_a: makeSprite(key("dance_a"), pal, gridRows(danceGrid(app, "a"))),
    dance_b: makeSprite(key("dance_b"), pal, gridRows(danceGrid(app, "b"))),
  };
}
