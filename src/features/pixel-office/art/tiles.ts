import type { PixelSprite } from "../types";
import {
  CARPET_BLUE,
  CARPET_BLUE_DOT,
  CARPET_PURPLE,
  CARPET_PURPLE_DOT,
  FLOOR_CREAM,
  FLOOR_CREAM_LINE,
  FLOOR_WHITE,
  FLOOR_WHITE_LINE,
  FLOOR_WOOD,
  FLOOR_WOOD_SEAM,
  GRASS_ALT_BASE,
  GRASS_BASE,
  GRASS_BLADE,
  GRASS_DARK_BASE,
  GRASS_DARK_BLADE,
  GYM_MAT,
  GYM_MAT_LINE,
  KITCHEN_TILE_DARK,
  KITCHEN_TILE_LIGHT,
  PATH_BASE,
  PATH_SPECKLE,
  SERVER_FLOOR,
  SERVER_FLOOR_GRID,
  WALL_EDGE,
  WALL_FACE,
  WALL_TOP,
} from "./palette";
import { fillRect, gridRows, hLine, makeGrid, outlineRect, setPx, vLine, type Grid } from "./grid";
import { makeSprite } from "./sprite";

const T = 16;

/** Small L-shaped grass blade cluster. */
function bladeCluster(grid: Grid, x: number, y: number, ch: string): void {
  setPx(grid, x, y, ch);
  setPx(grid, x + 1, y, ch);
  setPx(grid, x, y + 1, ch);
  setPx(grid, x + 2, y + 1, ch);
}

function grassTile(key: string, base: string, blade: string, alt: boolean): PixelSprite {
  const g = makeGrid(T, T, "g");
  const spots: Array<[number, number]> = alt
    ? [
        [1, 2],
        [9, 5],
        [4, 11],
        [12, 12],
      ]
    : [
        [3, 3],
        [11, 2],
        [6, 8],
        [1, 12],
        [12, 10],
      ];
  for (const [x, y] of spots) bladeCluster(g, x, y, "d");
  return makeSprite(key, { g: base, d: blade }, gridRows(g));
}

function pathTile(): PixelSprite {
  const g = makeGrid(T, T, "g");
  const speckles: Array<[number, number]> = [
    [2, 3],
    [3, 3],
    [9, 1],
    [13, 6],
    [5, 9],
    [6, 9],
    [11, 12],
    [1, 14],
  ];
  for (const [x, y] of speckles) setPx(g, x, y, "d");
  return makeSprite("tile_path", { g: PATH_BASE, d: PATH_SPECKLE }, gridRows(g));
}

/** Floor with a subtle 1px grid line along the right and bottom edges. */
function gridFloorTile(key: string, base: string, line: string): PixelSprite {
  const g = makeGrid(T, T, "f");
  vLine(g, T - 1, 0, T, "l");
  hLine(g, 0, T - 1, T, "l");
  return makeSprite(key, { f: base, l: line }, gridRows(g));
}

/** Alt floor variant: no grid line, just a couple of faint specks. */
function altFloorTile(key: string, base: string, line: string): PixelSprite {
  const g = makeGrid(T, T, "f");
  vLine(g, T - 1, 0, T, "l");
  hLine(g, 0, T - 1, T, "l");
  setPx(g, 4, 5, "l");
  setPx(g, 10, 11, "l");
  return makeSprite(key, { f: base, l: line }, gridRows(g));
}

function woodTile(key: string, alt: boolean): PixelSprite {
  const g = makeGrid(T, T, "w");
  // Horizontal plank seams every 4 rows.
  for (const y of [3, 7, 11, 15]) hLine(g, 0, y, T, "s");
  // Staggered vertical joints between planks.
  const joints: Array<[number, number]> = alt
    ? [
        [11, 0],
        [3, 4],
        [13, 8],
        [7, 12],
      ]
    : [
        [5, 0],
        [12, 4],
        [2, 8],
        [9, 12],
      ];
  for (const [x, y] of joints) vLine(g, x, y, 3, "s");
  return makeSprite(key, { w: FLOOR_WOOD, s: FLOOR_WOOD_SEAM }, gridRows(g));
}

function carpetTile(key: string, base: string, dot: string): PixelSprite {
  const g = makeGrid(T, T, "c");
  // Sparse checker of texture dots.
  for (let y = 2; y < T; y += 4) {
    for (let x = 2; x < T; x += 4) {
      setPx(g, x + ((y / 4) % 2 === 0 ? 0 : 2), y, "d");
    }
  }
  return makeSprite(key, { c: base, d: dot }, gridRows(g));
}

function kitchenTile(): PixelSprite {
  const g = makeGrid(T, T, "a");
  // 8x8 checkerboard quadrants.
  fillRect(g, 8, 0, 8, 8, "b");
  fillRect(g, 0, 8, 8, 8, "b");
  return makeSprite(
    "tile_kitchen_tile",
    { a: KITCHEN_TILE_LIGHT, b: KITCHEN_TILE_DARK },
    gridRows(g),
  );
}

function gymMatTile(): PixelSprite {
  const g = makeGrid(T, T, "m");
  outlineRect(g, 0, 0, T, T, "l");
  return makeSprite("tile_gym_mat", { m: GYM_MAT, l: GYM_MAT_LINE }, gridRows(g));
}

function serverFloorTile(): PixelSprite {
  const g = makeGrid(T, T, "f");
  vLine(g, T - 1, 0, T, "l");
  hLine(g, 0, T - 1, T, "l");
  setPx(g, 7, 7, "l");
  return makeSprite("tile_server_floor", { f: SERVER_FLOOR, l: SERVER_FLOOR_GRID }, gridRows(g));
}

/** Gather-style wall: dark top surface, lighter front face, bright top edge. */
function wallTile(): PixelSprite {
  const g = makeGrid(T, T, "f");
  fillRect(g, 0, 0, T, 6, "t");
  hLine(g, 0, 6, T, "e");
  return makeSprite(
    "tile_wall",
    { t: WALL_TOP, e: WALL_EDGE, f: WALL_FACE },
    gridRows(g),
  );
}

/**
 * Builds one 16x16 sprite per paintable ground tile (all PixelGroundTile
 * values except "void"), plus _alt variants for large-area tiles.
 */
export function buildGroundTileSprites(): PixelSprite[] {
  return [
    grassTile("tile_grass", GRASS_BASE, GRASS_BLADE, false),
    grassTile("tile_grass_alt", GRASS_ALT_BASE, GRASS_BLADE, true),
    grassTile("tile_grass_dark", GRASS_DARK_BASE, GRASS_DARK_BLADE, false),
    pathTile(),
    gridFloorTile("tile_floor_cream", FLOOR_CREAM, FLOOR_CREAM_LINE),
    altFloorTile("tile_floor_cream_alt", FLOOR_CREAM, FLOOR_CREAM_LINE),
    gridFloorTile("tile_floor_white", FLOOR_WHITE, FLOOR_WHITE_LINE),
    woodTile("tile_floor_wood", false),
    woodTile("tile_floor_wood_alt", true),
    carpetTile("tile_carpet_purple", CARPET_PURPLE, CARPET_PURPLE_DOT),
    carpetTile("tile_carpet_blue", CARPET_BLUE, CARPET_BLUE_DOT),
    kitchenTile(),
    gymMatTile(),
    serverFloorTile(),
    wallTile(),
  ];
}
