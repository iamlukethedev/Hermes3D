// Internal mutable char-grid helpers used to compose sprites in code.
// Not part of the public art API (not re-exported from index.ts).

export type Grid = string[][];

/** Creates a w x h grid filled with the given char (transparent by default). */
export function makeGrid(width: number, height: number, fill = "."): Grid {
  const grid: Grid = [];
  for (let y = 0; y < height; y += 1) {
    grid.push(new Array<string>(width).fill(fill));
  }
  return grid;
}

/** Sets one cell; out-of-bounds writes are silently ignored. */
export function setPx(grid: Grid, x: number, y: number, ch: string): void {
  if (y < 0 || y >= grid.length) return;
  const row = grid[y];
  if (x < 0 || x >= row.length) return;
  row[x] = ch;
}

/** Fills a solid rectangle. */
export function fillRect(
  grid: Grid,
  x: number,
  y: number,
  w: number,
  h: number,
  ch: string,
): void {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      setPx(grid, xx, yy, ch);
    }
  }
}

/** Draws only the 1px border of a rectangle. */
export function outlineRect(
  grid: Grid,
  x: number,
  y: number,
  w: number,
  h: number,
  ch: string,
): void {
  hLine(grid, x, y, w, ch);
  hLine(grid, x, y + h - 1, w, ch);
  vLine(grid, x, y, h, ch);
  vLine(grid, x + w - 1, y, h, ch);
}

/** Horizontal line of length len starting at (x, y). */
export function hLine(grid: Grid, x: number, y: number, len: number, ch: string): void {
  for (let xx = x; xx < x + len; xx += 1) setPx(grid, xx, y, ch);
}

/** Vertical line of length len starting at (x, y). */
export function vLine(grid: Grid, x: number, y: number, len: number, ch: string): void {
  for (let yy = y; yy < y + len; yy += 1) setPx(grid, x, yy, ch);
}

/** Joins the grid into sprite rows. */
export function gridRows(grid: Grid): string[] {
  return grid.map((row) => row.join(""));
}
