import type { PixelSprite } from "../types";

const TRANSPARENT_CHARS = new Set([".", " "]);

/** Width of a sprite in pixels (longest row wins; short rows are padded). */
export function spriteWidth(sprite: PixelSprite): number {
  let max = 0;
  for (const row of sprite.rows) {
    if (row.length > max) max = row.length;
  }
  return max;
}

/** Height of a sprite in pixels (row count). */
export function spriteHeight(sprite: PixelSprite): number {
  return sprite.rows.length;
}

/**
 * Paints a sprite onto a 2D canvas context at 1 canvas pixel per cell.
 * Adjacent same-color cells in a row are merged into a single fillRect for
 * speed. "." and " " cells are transparent.
 */
export function paintSpriteToContext(
  sprite: PixelSprite,
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
): void {
  const { rows, palette } = sprite;
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (TRANSPARENT_CHARS.has(ch)) {
        x += 1;
        continue;
      }
      const color = palette[ch];
      if (!color) {
        x += 1;
        continue;
      }
      // Extend the run across every following cell that resolves to the same color.
      let end = x + 1;
      while (end < row.length) {
        const nextCh = row[end];
        if (TRANSPARENT_CHARS.has(nextCh) || palette[nextCh] !== color) break;
        end += 1;
      }
      ctx.fillStyle = color;
      ctx.fillRect(dx + x, dy + y, end - x, 1);
      x = end;
    }
  }
}

/**
 * Builds a PixelSprite while validating that every non-transparent char in
 * the rows exists in the palette. Throws with the list of missing chars.
 */
export function makeSprite(
  key: string,
  palette: Record<string, string>,
  rows: string[],
): PixelSprite {
  const missing = new Set<string>();
  for (const row of rows) {
    for (const ch of row) {
      if (TRANSPARENT_CHARS.has(ch)) continue;
      if (!(ch in palette)) missing.add(ch);
    }
  }
  if (missing.size > 0) {
    throw new Error(
      `Sprite "${key}" uses chars missing from its palette: ${[...missing]
        .map((c) => JSON.stringify(c))
        .join(", ")}`,
    );
  }
  return { key, rows, palette };
}
