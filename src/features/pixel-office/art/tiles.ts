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
  FLOOR_WHITE_SPECK,
  FLOOR_WOOD,
  FLOOR_WOOD_GRAIN,
  FLOOR_WOOD_LIGHT,
  FLOOR_WOOD_SEAM,
  FLOOR_WOOD_TONE,
  GRASS_ALT_BASE,
  GRASS_BASE,
  GRASS_BLADE,
  GRASS_DARK_BASE,
  GRASS_DARK_BLADE,
  GRASS_DARK_MOTTLE,
  GRASS_DARK_MOTTLE_DEEP,
  GRASS_FLOWER,
  GRASS_FLOWER_CENTER,
  GRASS_FLOWER_PINK,
  GRASS_MOTTLE,
  GRASS_MOTTLE_DEEP,
  GYM_MAT,
  GYM_MAT_LINE,
  GYM_MAT_SEAM,
  KITCHEN_TILE_DARK,
  KITCHEN_TILE_DARK_BEVEL,
  KITCHEN_TILE_LIGHT,
  KITCHEN_TILE_LIGHT_BEVEL,
  PATH_BASE,
  PATH_PEBBLE_LIGHT,
  PATH_SPECKLE,
  SERVER_FLOOR,
  SERVER_FLOOR_GRID,
  SERVER_FLOOR_LIGHT,
  SERVER_FLOOR_VENT,
  WALL_BASEBOARD,
  WALL_EDGE,
  WALL_FACE,
  WALL_FLOOR_SHADOW,
  WALL_SEAM,
  WALL_SEAM_HIGHLIGHT,
  WALL_TOP,
  WALL_TOP_SHEEN,
  WINDOW_FRAME,
  WINDOW_GLASS,
  WINDOW_SHEEN,
  WINDOW_SILL_SHADOW,
  WINDOW_SKY_TOP,
} from "./palette";
import { fillRect, gridRows, hLine, makeGrid, setPx, vLine, type Grid } from "./grid";
import { makeSprite } from "./sprite";

const T = 32;

// ---------------------------------------------------------------------------
// Grass.
// ---------------------------------------------------------------------------

type BlobShape = ReadonlyArray<readonly [number, number]>;

// Irregular blob silhouettes (relative offsets) so mottles read as organic
// patches instead of stamped rectangles.
const BLOB_ROUND: BlobShape = [
  [1, 0],
  [2, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [0, 2],
  [1, 2],
  [2, 2],
  [3, 2],
  [1, 3],
  [2, 3],
];

const BLOB_WIDE: BlobShape = [
  [1, 0],
  [2, 0],
  [3, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
  [2, 2],
  [3, 2],
];

const BLOB_SMALL: BlobShape = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
  [2, 1],
];

/** Paints one blob shape at (x, y). */
function paintBlob(grid: Grid, x: number, y: number, shape: BlobShape, ch: string): void {
  for (const [dx, dy] of shape) setPx(grid, x + dx, y + dy, ch);
}

/** Tiny 3x3 plus-shaped flower: four petals around a warm center pixel. */
function paintFlower(grid: Grid, x: number, y: number, petalCh: string): void {
  setPx(grid, x, y - 1, petalCh);
  setPx(grid, x - 1, y, petalCh);
  setPx(grid, x + 1, y, petalCh);
  setPx(grid, x, y + 1, petalCh);
  setPx(grid, x, y, "q");
}

type GrassColors = {
  base: string;
  mottle: string;
  mottleDeep: string;
  blade: string;
};

type GrassLayout = {
  /** Lighter organic patches: [x, y, shape]. */
  mottles: Array<[number, number, BlobShape]>;
  /** Slightly deeper patches for depth: [x, y, shape]. */
  deepMottles: Array<[number, number, BlobShape]>;
  /** 2px-tall blade sprigs (top pixel coordinate). */
  blades: Array<[number, number]>;
  /** Optional flowers: [x, y, petal char ("p" white or "k" pink)]. */
  flowers: Array<[number, number, "p" | "k"]>;
};

/**
 * Pastel grass: uniform base (so edges tile seamlessly) with scattered
 * organic mottle blobs in two close shades, sparse 2px blades, and an
 * occasional tiny flower.
 */
function grassTile(key: string, colors: GrassColors, layout: GrassLayout): PixelSprite {
  const g = makeGrid(T, T, "g");
  for (const [x, y, shape] of layout.mottles) paintBlob(g, x, y, shape, "m");
  for (const [x, y, shape] of layout.deepMottles) paintBlob(g, x, y, shape, "n");
  for (const [x, y] of layout.blades) {
    setPx(g, x, y, "b");
    setPx(g, x, y + 1, "b");
  }
  for (const [x, y, petal] of layout.flowers) paintFlower(g, x, y, petal);
  return makeSprite(
    key,
    {
      g: colors.base,
      m: colors.mottle,
      n: colors.mottleDeep,
      b: colors.blade,
      p: GRASS_FLOWER,
      k: GRASS_FLOWER_PINK,
      q: GRASS_FLOWER_CENTER,
    },
    gridRows(g),
  );
}

// ---------------------------------------------------------------------------
// Path.
// ---------------------------------------------------------------------------

/**
 * Light warm gray path with sparse low-contrast pebbles: small 2-3px
 * clusters in two close tones plus a few single-pixel specks.
 */
function pathTile(): PixelSprite {
  const g = makeGrid(T, T, "g");
  // Darker pebble clusters (2px pairs and 3px L-shapes).
  const darkPairs: Array<[number, number]> = [
    [5, 4],
    [21, 3],
    [12, 9],
    [27, 13],
    [3, 18],
    [16, 21],
    [24, 26],
    [8, 28],
  ];
  for (const [x, y] of darkPairs) {
    setPx(g, x, y, "d");
    setPx(g, x + 1, y, "d");
  }
  const darkCorners: Array<[number, number]> = [
    [13, 10],
    [4, 19],
    [25, 27],
  ];
  for (const [x, y] of darkCorners) setPx(g, x, y, "d");
  // Lighter pebbles for variety.
  const lightPairs: Array<[number, number]> = [
    [10, 2],
    [26, 7],
    [7, 13],
    [19, 15],
    [29, 20],
    [13, 25],
    [2, 26],
  ];
  for (const [x, y] of lightPairs) {
    setPx(g, x, y, "l");
    setPx(g, x + 1, y, "l");
  }
  // Single-pixel specks.
  const specks: Array<[number, number]> = [
    [17, 6],
    [1, 9],
    [23, 11],
    [10, 18],
    [30, 24],
    [20, 30],
  ];
  for (const [x, y] of specks) setPx(g, x, y, "d");
  return makeSprite(
    "tile_path",
    { g: PATH_BASE, d: PATH_SPECKLE, l: PATH_PEBBLE_LIGHT },
    gridRows(g),
  );
}

// ---------------------------------------------------------------------------
// Cream / white office floors.
// ---------------------------------------------------------------------------

/**
 * Near-uniform floor: ultra-subtle 16px checker (two quadrants per edge)
 * plus rare 1px specks. Contrast is kept so low it does not read as a
 * pattern when zoomed out.
 */
function subtleFloorTile(
  key: string,
  base: string,
  check: string,
  speck: string,
  specks: Array<[number, number]>,
  decal: [number, number] | null,
): PixelSprite {
  const g = makeGrid(T, T, "a");
  fillRect(g, 16, 0, 16, 16, "b");
  fillRect(g, 0, 16, 16, 16, "b");
  for (const [x, y] of specks) setPx(g, x, y, "d");
  if (decal) fillRect(g, decal[0], decal[1], 2, 2, "d");
  return makeSprite(key, { a: base, b: check, d: speck }, gridRows(g));
}

// ---------------------------------------------------------------------------
// Wood.
// ---------------------------------------------------------------------------

/**
 * Light pink-beige wood: two 16px plank rows per tile with a subtle tone
 * shift between the upper and lower plank, a 1px lighter bevel along each
 * plank's top edge, seam lines at each plank's bottom edge, one staggered
 * butt joint per plank, and sparse 2-3px grain ticks. Band tones are shared
 * by both variants so planks run continuously across tile boundaries; the
 * alt variant only moves the joints and grain to break up repetition.
 */
function woodTile(key: string, alt: boolean): PixelSprite {
  const g = makeGrid(T, T, "w");
  // Lower plank band rows 16..30 in the second tone.
  fillRect(g, 0, 16, T, 15, "v");
  // 1px lighter bevel along the top edge of each plank.
  hLine(g, 0, 0, T, "l");
  hLine(g, 0, 16, T, "l");
  // Plank seams at the bottom edge of each band (rows 15 and 31) so the
  // pattern wraps cleanly to the next tile below.
  hLine(g, 0, 15, T, "s");
  hLine(g, 0, 31, T, "s");
  // One staggered butt joint per plank band.
  vLine(g, alt ? 26 : 10, 0, 15, "s");
  vLine(g, alt ? 6 : 22, 16, 15, "s");
  // Sparse short grain ticks, kept clear of joints and seams.
  const grain: Array<[number, number, number]> = alt
    ? [
        [4, 3, 3],
        [16, 7, 2],
        [30, 11, 2],
        [12, 19, 3],
        [22, 24, 2],
        [2, 28, 2],
      ]
    : [
        [4, 4, 3],
        [19, 8, 2],
        [28, 2, 2],
        [13, 12, 3],
        [7, 20, 2],
        [24, 25, 3],
        [15, 29, 2],
        [2, 23, 2],
      ];
  for (const [x, y, len] of grain) hLine(g, x, y, len, "t");
  return makeSprite(
    key,
    {
      w: FLOOR_WOOD,
      v: FLOOR_WOOD_TONE,
      l: FLOOR_WOOD_LIGHT,
      s: FLOOR_WOOD_SEAM,
      t: FLOOR_WOOD_GRAIN,
    },
    gridRows(g),
  );
}

// ---------------------------------------------------------------------------
// Carpets.
// ---------------------------------------------------------------------------

/**
 * Soft two-tone basket weave: 4x4 thread blocks alternate between
 * horizontal and vertical 1px threads. The 8px pattern period divides the
 * tile size so the carpet stays fully seamless.
 */
function carpetTile(key: string, base: string, weave: string): PixelSprite {
  const g = makeGrid(T, T, "c");
  for (let y = 0; y < T; y += 1) {
    for (let x = 0; x < T; x += 1) {
      const horizontalBlock = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      const thread = horizontalBlock ? y % 4 : x % 4;
      if (thread === 1 || thread === 3) setPx(g, x, y, "d");
    }
  }
  return makeSprite(key, { c: base, d: weave }, gridRows(g));
}

// ---------------------------------------------------------------------------
// Kitchen.
// ---------------------------------------------------------------------------

/**
 * Soft sage 16px checker (four cells per tile) with a slight bevel: each
 * cell gets a 1px lighter top edge so the tiles read gently raised.
 */
function kitchenTile(): PixelSprite {
  const g = makeGrid(T, T, "a");
  fillRect(g, 16, 0, 16, 16, "b");
  fillRect(g, 0, 16, 16, 16, "b");
  hLine(g, 0, 0, 16, "p");
  hLine(g, 16, 0, 16, "q");
  hLine(g, 0, 16, 16, "q");
  hLine(g, 16, 16, 16, "p");
  return makeSprite(
    "tile_kitchen_tile",
    {
      a: KITCHEN_TILE_LIGHT,
      b: KITCHEN_TILE_DARK,
      p: KITCHEN_TILE_LIGHT_BEVEL,
      q: KITCHEN_TILE_DARK_BEVEL,
    },
    gridRows(g),
  );
}

// ---------------------------------------------------------------------------
// Gym mat.
// ---------------------------------------------------------------------------

/**
 * Blue-gray gym mat: inset border with trimmed ends plus diagonal corner
 * pixels for rounded-corner hints, and softer cross seams that quarter
 * the mat.
 */
function gymMatTile(): PixelSprite {
  const g = makeGrid(T, T, "m");
  // Softer cross seams first so the border paints over their ends.
  vLine(g, 16, 2, 28, "e");
  hLine(g, 2, 16, 28, "e");
  // Border inset 1px from the tile edge, ends trimmed at the corners.
  hLine(g, 3, 1, 26, "l");
  hLine(g, 3, 30, 26, "l");
  vLine(g, 1, 3, 26, "l");
  vLine(g, 30, 3, 26, "l");
  // Rounded corner hints.
  setPx(g, 2, 2, "l");
  setPx(g, 29, 2, "l");
  setPx(g, 2, 29, "l");
  setPx(g, 29, 29, "l");
  return makeSprite(
    "tile_gym_mat",
    { m: GYM_MAT, l: GYM_MAT_LINE, e: GYM_MAT_SEAM },
    gridRows(g),
  );
}

// ---------------------------------------------------------------------------
// Server floor.
// ---------------------------------------------------------------------------

/**
 * Slate raised-floor panel: lighter top/left edges against darker
 * right/bottom grid lines, corner screw dots, and a cluster of tiny vent
 * slots. Adjacent tiles form a continuous panel grid.
 */
function serverFloorTile(): PixelSprite {
  const g = makeGrid(T, T, "f");
  hLine(g, 0, 0, T, "h");
  vLine(g, 0, 0, T, "h");
  vLine(g, T - 1, 0, T, "l");
  hLine(g, 0, T - 1, T, "l");
  // Corner screws.
  setPx(g, 3, 3, "l");
  setPx(g, 28, 3, "l");
  setPx(g, 3, 28, "l");
  setPx(g, 28, 28, "l");
  // Three tiny vent slots, offset from center.
  for (const y of [12, 15, 18]) hLine(g, 20, y, 5, "v");
  return makeSprite(
    "tile_server_floor",
    { f: SERVER_FLOOR, l: SERVER_FLOOR_GRID, h: SERVER_FLOOR_LIGHT, v: SERVER_FLOOR_VENT },
    gridRows(g),
  );
}

// ---------------------------------------------------------------------------
// Walls.
// ---------------------------------------------------------------------------

// Shared wall layout for tile_wall and tile_wall_window:
// rows 0..1   = 2px bright top edge.
// rows 2..13  = top surface (~12px) with a soft horizontal sheen band.
// row 14      = 1px contact shadow under the ledge.
// rows 15..28 = front face (panel seams live here).
// rows 29..30 = 2px baseboard.
// row 31      = 1px shadow line at the floor junction.
const WALL_LEDGE_SHADOW_ROW = 14;
const WALL_FACE_TOP = 15;
const WALL_BASEBOARD_TOP = 29;
const WALL_FACE_ROWS = WALL_BASEBOARD_TOP - WALL_FACE_TOP;

/** Paints the shared wall frame (edge, top surface, face, baseboard). */
function paintWallFrame(g: Grid): void {
  fillRect(g, 0, 0, T, 2, "e");
  fillRect(g, 0, 2, T, WALL_LEDGE_SHADOW_ROW - 2, "t");
  // Subtle horizontal sheen band across the top surface.
  fillRect(g, 0, 5, T, 2, "n");
  hLine(g, 0, WALL_LEDGE_SHADOW_ROW, T, "s");
  fillRect(g, 0, WALL_FACE_TOP, T, WALL_FACE_ROWS, "f");
  fillRect(g, 0, WALL_BASEBOARD_TOP, T, 2, "b");
  hLine(g, 0, T - 1, T, "d");
}

const WALL_FRAME_PALETTE: Record<string, string> = {
  e: WALL_EDGE,
  t: WALL_TOP,
  n: WALL_TOP_SHEEN,
  f: WALL_FACE,
  s: WALL_SEAM,
  h: WALL_SEAM_HIGHLIGHT,
  b: WALL_BASEBOARD,
  d: WALL_FLOOR_SHADOW,
};

/**
 * Gather-style paneled wall: bright top edge, top surface with a soft
 * sheen, front face with vertical panel seams every 8px (each seam followed
 * by a 1px highlight; the x=0 highlight pairs with the neighbor's x=31 seam
 * so rows of wall tiles chain seamlessly), and a shadowed baseboard.
 */
function wallTile(): PixelSprite {
  const g = makeGrid(T, T, "f");
  paintWallFrame(g);
  for (const x of [7, 15, 23, 31]) vLine(g, x, WALL_FACE_TOP, WALL_FACE_ROWS, "s");
  for (const x of [0, 8, 16, 24]) vLine(g, x, WALL_FACE_TOP, WALL_FACE_ROWS, "h");
  return makeSprite("tile_wall", WALL_FRAME_PALETTE, gridRows(g));
}

/**
 * Wall with a window: same frame as tile_wall, plus a large glass pane in a
 * 2px white frame with a sill, a center mullion splitting the glass into
 * two panels, a slight two-blue sky gradient, and a 2px diagonal sheen band
 * in each panel.
 */
function wallWindowTile(): PixelSprite {
  const g = makeGrid(T, T, "f");
  paintWallFrame(g);
  // Keep the outer face seam/highlight so adjacent wall tiles chain.
  vLine(g, 31, WALL_FACE_TOP, WALL_FACE_ROWS, "s");
  vLine(g, 0, WALL_FACE_TOP, WALL_FACE_ROWS, "h");
  // 2px white frame block, then the glass inset inside it.
  fillRect(g, 3, 14, 26, 13, "r");
  fillRect(g, 5, 16, 22, 9, "p");
  // Slight sky gradient: lighter blue on the upper glass rows.
  fillRect(g, 5, 16, 22, 4, "y");
  // Diagonal sheen band (2px wide) in each of the two panels.
  for (const panelX of [5, 17]) {
    for (let i = 0; i < 9; i += 1) {
      const y = 16 + i;
      const x = panelX + 8 - i;
      setPx(g, x, y, "z");
      if (x + 1 <= panelX + 9) setPx(g, x + 1, y, "z");
    }
  }
  // Center mullion splitting the glass into two panels.
  fillRect(g, 15, 16, 2, 9, "r");
  // Sill: 1px wider than the frame, with a shadow line beneath.
  hLine(g, 2, 27, 28, "r");
  hLine(g, 2, 28, 28, "i");
  return makeSprite(
    "tile_wall_window",
    {
      ...WALL_FRAME_PALETTE,
      r: WINDOW_FRAME,
      p: WINDOW_GLASS,
      y: WINDOW_SKY_TOP,
      z: WINDOW_SHEEN,
      i: WINDOW_SILL_SHADOW,
    },
    gridRows(g),
  );
}

// ---------------------------------------------------------------------------
// Exports.
// ---------------------------------------------------------------------------

/**
 * Builds one 32x32 sprite per paintable ground tile (all PixelGroundTile
 * values except "void"), plus _alt variants for large-area tiles.
 */
export function buildGroundTileSprites(): PixelSprite[] {
  return [
    grassTile(
      "tile_grass",
      {
        base: GRASS_BASE,
        mottle: GRASS_MOTTLE,
        mottleDeep: GRASS_MOTTLE_DEEP,
        blade: GRASS_BLADE,
      },
      {
        mottles: [
          [3, 2, BLOB_ROUND],
          [18, 4, BLOB_WIDE],
          [9, 12, BLOB_SMALL],
          [24, 15, BLOB_ROUND],
          [4, 22, BLOB_WIDE],
          [16, 26, BLOB_SMALL],
        ],
        deepMottles: [
          [13, 7, BLOB_SMALL],
          [2, 16, BLOB_SMALL],
          [21, 21, BLOB_SMALL],
          [27, 27, BLOB_SMALL],
        ],
        blades: [
          [8, 6],
          [26, 9],
          [4, 13],
          [14, 19],
          [29, 18],
          [10, 28],
          [22, 28],
          [1, 26],
        ],
        flowers: [[27, 3, "p"]],
      },
    ),
    grassTile(
      "tile_grass_alt",
      {
        base: GRASS_ALT_BASE,
        mottle: GRASS_MOTTLE,
        mottleDeep: GRASS_MOTTLE_DEEP,
        blade: GRASS_BLADE,
      },
      {
        mottles: [
          [12, 1, BLOB_WIDE],
          [2, 7, BLOB_ROUND],
          [22, 9, BLOB_SMALL],
          [15, 15, BLOB_ROUND],
          [26, 20, BLOB_WIDE],
          [6, 27, BLOB_SMALL],
        ],
        deepMottles: [
          [24, 2, BLOB_SMALL],
          [8, 14, BLOB_SMALL],
          [1, 21, BLOB_SMALL],
          [18, 24, BLOB_SMALL],
        ],
        blades: [
          [19, 5],
          [6, 4],
          [29, 13],
          [11, 20],
          [2, 15],
          [24, 27],
          [14, 29],
          [30, 26],
        ],
        flowers: [[4, 18, "k"]],
      },
    ),
    grassTile(
      "tile_grass_dark",
      {
        base: GRASS_DARK_BASE,
        mottle: GRASS_DARK_MOTTLE,
        mottleDeep: GRASS_DARK_MOTTLE_DEEP,
        blade: GRASS_DARK_BLADE,
      },
      {
        mottles: [
          [6, 3, BLOB_ROUND],
          [21, 2, BLOB_SMALL],
          [13, 10, BLOB_WIDE],
          [2, 18, BLOB_SMALL],
          [24, 17, BLOB_ROUND],
          [10, 25, BLOB_WIDE],
        ],
        deepMottles: [
          [17, 5, BLOB_SMALL],
          [27, 10, BLOB_SMALL],
          [5, 12, BLOB_SMALL],
          [20, 27, BLOB_SMALL],
          [1, 28, BLOB_SMALL],
        ],
        blades: [
          [11, 6],
          [28, 5],
          [3, 8],
          [16, 18],
          [30, 22],
          [6, 22],
          [25, 24],
        ],
        flowers: [],
      },
    ),
    pathTile(),
    subtleFloorTile(
      "tile_floor_cream",
      FLOOR_CREAM,
      FLOOR_CREAM_CHECK,
      FLOOR_CREAM_LINE,
      [
        [6, 5],
        [23, 10],
        [12, 20],
        [28, 27],
      ],
      null,
    ),
    subtleFloorTile(
      "tile_floor_cream_alt",
      FLOOR_CREAM,
      FLOOR_CREAM_CHECK,
      FLOOR_CREAM_LINE,
      [
        [18, 3],
        [4, 14],
        [26, 18],
        [10, 29],
      ],
      [14, 14],
    ),
    subtleFloorTile(
      "tile_floor_white",
      FLOOR_WHITE,
      FLOOR_WHITE_LINE,
      FLOOR_WHITE_SPECK,
      [
        [9, 7],
        [25, 13],
        [5, 24],
        [19, 28],
      ],
      null,
    ),
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
