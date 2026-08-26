import type { PixelSprite } from "../types";
import {
  CARPET_BLUE,
  CARPET_BLUE_DOT,
  CARPET_PURPLE,
  CARPET_PURPLE_DOT,
  FLOOR_CREAM,
  FLOOR_CREAM_CHECK,
  FLOOR_CREAM_LINE,
  FLOOR_WHITE,
  FLOOR_WHITE_LINE,
  FLOOR_WOOD,
  FLOOR_WOOD_GRAIN,
  FLOOR_WOOD_SEAM,
  GRASS_ALT_BASE,
  GRASS_BASE,
  GRASS_BLADE,
  GRASS_DARK_BASE,
  GRASS_DARK_BLADE,
  GRASS_DARK_MOTTLE,
  GRASS_FLOWER,
  GRASS_MOTTLE,
  GYM_MAT,
  GYM_MAT_LINE,
  KITCHEN_TILE_DARK,
  KITCHEN_TILE_LIGHT,
  PATH_BASE,
  PATH_SPECKLE,
  SERVER_FLOOR,
  SERVER_FLOOR_GRID,
  WALL_BASEBOARD,
  WALL_EDGE,
  WALL_FACE,
  WALL_SEAM,
  WALL_TOP,
  WINDOW_FRAME,
  WINDOW_GLASS,
  WINDOW_SHEEN,
} from "./palette";
import { fillRect, gridRows, hLine, makeGrid, outlineRect, setPx, vLine, type Grid } from "./grid";
import { makeSprite } from "./sprite";

const T = 16;

/** Small soft mottle patch: a 2x2-ish blob of a lighter shade. */
function mottlePatch(grid: Grid, x: number, y: number, ch: string): void {
  setPx(grid, x, y, ch);
  setPx(grid, x + 1, y, ch);
  setPx(grid, x, y + 1, ch);
  setPx(grid, x + 1, y + 1, ch);
  setPx(grid, x + 2, y + 1, ch);
}

type GrassColors = {
  base: string;
  mottle: string;
  blade: string;
};

/**
 * Pastel grass: light desaturated base with lighter mottled patches, a few
 * 1px blade specks, and (optionally) one near-white flower speck.
 */
function grassTile(
  key: string,
  colors: GrassColors,
  layout: {
    mottles: Array<[number, number]>;
    blades: Array<[number, number]>;
    flower: [number, number] | null;
  },
): PixelSprite {
  const g = makeGrid(T, T, "g");
  for (const [x, y] of layout.mottles) mottlePatch(g, x, y, "m");
  for (const [x, y] of layout.blades) setPx(g, x, y, "b");
  const palette: Record<string, string> = {
    g: colors.base,
    m: colors.mottle,
    b: colors.blade,
  };
  if (layout.flower) {
    setPx(g, layout.flower[0], layout.flower[1], "f");
    palette.f = GRASS_FLOWER;
  }
  return makeSprite(key, palette, gridRows(g));
}

/** Light warm gray path with sparse, low-contrast pebble specks. */
function pathTile(): PixelSprite {
  const g = makeGrid(T, T, "g");
  const pebbles: Array<[number, number]> = [
    [3, 2],
    [4, 2],
    [10, 4],
    [13, 8],
    [6, 10],
    [7, 10],
    [2, 13],
    [11, 13],
  ];
  for (const [x, y] of pebbles) setPx(g, x, y, "d");
  return makeSprite("tile_path", { g: PATH_BASE, d: PATH_SPECKLE }, gridRows(g));
}

/** Ultra-subtle 8px checker floor (two quadrants per tile edge). */
function checkerFloorTile(key: string, base: string, check: string): PixelSprite {
  const g = makeGrid(T, T, "a");
  fillRect(g, 8, 0, 8, 8, "b");
  fillRect(g, 0, 8, 8, 8, "b");
  return makeSprite(key, { a: base, b: check }, gridRows(g));
}

/** Alt cream floor: same checker plus a faint 2x2 dot decal. */
function creamAltFloorTile(): PixelSprite {
  const g = makeGrid(T, T, "a");
  fillRect(g, 8, 0, 8, 8, "b");
  fillRect(g, 0, 8, 8, 8, "b");
  fillRect(g, 4, 4, 2, 2, "d");
  return makeSprite(
    "tile_floor_cream_alt",
    { a: FLOOR_CREAM, b: FLOOR_CREAM_CHECK, d: FLOOR_CREAM_LINE },
    gridRows(g),
  );
}

/**
 * Light pink-beige wood: horizontal plank seams every 4 rows, staggered
 * vertical joints, sparse 2px grain ticks. Alt offsets the seam rows so
 * adjacent tiles do not tile visibly.
 */
function woodTile(key: string, alt: boolean): PixelSprite {
  const g = makeGrid(T, T, "w");
  const seamRows = alt ? [1, 5, 9, 13] : [3, 7, 11, 15];
  for (const y of seamRows) hLine(g, 0, y, T, "s");
  const joints: Array<[number, number]> = alt
    ? [
        [10, 2],
        [4, 6],
        [13, 10],
        [6, 14],
      ]
    : [
        [5, 0],
        [12, 4],
        [2, 8],
        [9, 12],
      ];
  for (const [x, y] of joints) vLine(g, x, y, 3, "s");
  const grain: Array<[number, number]> = alt
    ? [
        [2, 3],
        [12, 7],
        [7, 11],
      ]
    : [
        [8, 1],
        [3, 5],
        [13, 9],
        [6, 13],
      ];
  for (const [x, y] of grain) hLine(g, x, y, 2, "t");
  return makeSprite(
    key,
    { w: FLOOR_WOOD, s: FLOOR_WOOD_SEAM, t: FLOOR_WOOD_GRAIN },
    gridRows(g),
  );
}

/** Soft carpet with a sparse offset-dot weave texture. */
function carpetTile(key: string, base: string, dot: string): PixelSprite {
  const g = makeGrid(T, T, "c");
  for (let y = 2; y < T; y += 4) {
    const offset = Math.floor(y / 4) % 2 === 0 ? 0 : 2;
    for (let x = 2; x < T; x += 4) {
      setPx(g, x + offset, y, "d");
    }
  }
  return makeSprite(key, { c: base, d: dot }, gridRows(g));
}

/** Soft sage 8px checker for the kitchen. */
function kitchenTile(): PixelSprite {
  const g = makeGrid(T, T, "a");
  fillRect(g, 8, 0, 8, 8, "b");
  fillRect(g, 0, 8, 8, 8, "b");
  return makeSprite(
    "tile_kitchen_tile",
    { a: KITCHEN_TILE_LIGHT, b: KITCHEN_TILE_DARK },
    gridRows(g),
  );
}

/** Blue-gray gym mat with a 1px seam border. */
function gymMatTile(): PixelSprite {
  const g = makeGrid(T, T, "m");
  outlineRect(g, 0, 0, T, T, "l");
  return makeSprite("tile_gym_mat", { m: GYM_MAT, l: GYM_MAT_LINE }, gridRows(g));
}

/** Medium slate raised floor with a grid line on the right/bottom edges. */
function serverFloorTile(): PixelSprite {
  const g = makeGrid(T, T, "f");
  vLine(g, T - 1, 0, T, "l");
  hLine(g, 0, T - 1, T, "l");
  setPx(g, 7, 7, "l");
  return makeSprite("tile_server_floor", { f: SERVER_FLOOR, l: SERVER_FLOOR_GRID }, gridRows(g));
}

// Wall layout shared by tile_wall and tile_wall_window:
// row 0        = 1px light top edge
// rows 1..5    = top surface
// rows 6..14   = front face
// row 15       = 1px darker baseboard
const WALL_FACE_TOP = 6;

/** Paints the shared light-gray wall frame (edge, top surface, face, baseboard). */
function paintWallFrame(g: Grid): void {
  hLine(g, 0, 0, T, "e");
  fillRect(g, 0, 1, T, WALL_FACE_TOP - 1, "t");
  fillRect(g, 0, WALL_FACE_TOP, T, T - WALL_FACE_TOP - 1, "f");
  hLine(g, 0, T - 1, T, "b");
}

const WALL_FRAME_PALETTE: Record<string, string> = {
  e: WALL_EDGE,
  t: WALL_TOP,
  f: WALL_FACE,
  s: WALL_SEAM,
  b: WALL_BASEBOARD,
};

/**
 * Gather-style light paneled wall: light top edge, gray top surface, lighter
 * face with subtle vertical panel seams every 5px, and a darker baseboard.
 */
function wallTile(): PixelSprite {
  const g = makeGrid(T, T, "f");
  paintWallFrame(g);
  for (const x of [5, 10]) vLine(g, x, WALL_FACE_TOP, T - WALL_FACE_TOP - 1, "s");
  return makeSprite("tile_wall", WALL_FRAME_PALETTE, gridRows(g));
}

/**
 * Wall with a window: same frame as tile_wall, but most of the face is a
 * sky-blue glass pane with a white diagonal sheen inside a 1px light frame.
 */
function wallWindowTile(): PixelSprite {
  const g = makeGrid(T, T, "f");
  paintWallFrame(g);
  // 1px light frame around the pane, inset from the tile edges.
  outlineRect(g, 1, WALL_FACE_TOP, T - 2, T - WALL_FACE_TOP - 1, "r");
  fillRect(g, 2, WALL_FACE_TOP + 1, T - 4, T - WALL_FACE_TOP - 3, "p");
  // Two-pixel-wide diagonal sheen across the pane.
  for (let i = 0; i < 6; i += 1) {
    const y = WALL_FACE_TOP + 1 + i;
    const x = 11 - i;
    setPx(g, x, y, "h");
    setPx(g, x + 1, y, "h");
  }
  return makeSprite(
    "tile_wall_window",
    { ...WALL_FRAME_PALETTE, r: WINDOW_FRAME, p: WINDOW_GLASS, h: WINDOW_SHEEN },
    gridRows(g),
  );
}

/**
 * Builds one 16x16 sprite per paintable ground tile (all PixelGroundTile
 * values except "void"), plus _alt variants for large-area tiles.
 */
export function buildGroundTileSprites(): PixelSprite[] {
  return [
    grassTile(
      "tile_grass",
      { base: GRASS_BASE, mottle: GRASS_MOTTLE, blade: GRASS_BLADE },
      {
        mottles: [
          [2, 2],
          [10, 4],
          [5, 9],
          [12, 12],
        ],
        blades: [
          [7, 1],
          [1, 7],
          [14, 8],
          [8, 14],
        ],
        flower: [13, 2],
      },
    ),
    grassTile(
      "tile_grass_alt",
      { base: GRASS_ALT_BASE, mottle: GRASS_MOTTLE, blade: GRASS_BLADE },
      {
        mottles: [
          [6, 1],
          [1, 6],
          [11, 8],
          [4, 12],
        ],
        blades: [
          [12, 3],
          [8, 6],
          [2, 10],
          [14, 14],
        ],
        flower: [3, 3],
      },
    ),
    grassTile(
      "tile_grass_dark",
      { base: GRASS_DARK_BASE, mottle: GRASS_DARK_MOTTLE, blade: GRASS_DARK_BLADE },
      {
        mottles: [
          [3, 3],
          [11, 2],
          [6, 8],
          [1, 12],
          [12, 11],
        ],
        blades: [
          [8, 5],
          [14, 7],
          [4, 14],
        ],
        flower: null,
      },
    ),
    pathTile(),
    checkerFloorTile("tile_floor_cream", FLOOR_CREAM, FLOOR_CREAM_CHECK),
    creamAltFloorTile(),
    checkerFloorTile("tile_floor_white", FLOOR_WHITE, FLOOR_WHITE_LINE),
    woodTile("tile_floor_wood", false),
    woodTile("tile_floor_wood_alt", true),
    carpetTile("tile_carpet_purple", CARPET_PURPLE, CARPET_PURPLE_DOT),
    carpetTile("tile_carpet_blue", CARPET_BLUE, CARPET_BLUE_DOT),
    kitchenTile(),
    gymMatTile(),
    serverFloorTile(),
    wallTile(),
    wallWindowTile(),
  ];
}
