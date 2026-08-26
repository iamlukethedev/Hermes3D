// Builds a NavGrid2D (one cell per tile) from a PixelOfficeMap so the shared
// astar2D pathfinder can route agents around walls and furniture.

import type { NavGrid2D } from "@/lib/office/pathfinding";
import {
  BLOCKING_OBJECT_KINDS,
  OBJECT_FOOTPRINT,
  PIXEL_TILE_SIZE,
  type PixelOfficeMap,
} from "@/features/pixel-office/types";

export const tileCenter = (tx: number, ty: number) => ({
  x: tx * PIXEL_TILE_SIZE + PIXEL_TILE_SIZE / 2,
  y: ty * PIXEL_TILE_SIZE + PIXEL_TILE_SIZE / 2,
});

export const buildPixelNavGrid = (map: PixelOfficeMap): NavGrid2D => {
  const { cols, rows } = map;
  const cells = new Uint8Array(cols * rows);

  for (let index = 0; index < map.ground.length; index += 1) {
    const tile = map.ground[index];
    if (tile === "wall" || tile === "wall_window" || tile === "void") {
      cells[index] = 1;
    }
  }

  for (const object of map.objects) {
    const blocking = object.blocking ?? BLOCKING_OBJECT_KINDS.has(object.kind);
    if (!blocking) continue;
    const [fw, fh] = OBJECT_FOOTPRINT[object.kind];
    for (let dy = 0; dy < fh; dy += 1) {
      for (let dx = 0; dx < fw; dx += 1) {
        const tx = object.tx + dx;
        const ty = object.ty + dy;
        if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue;
        cells[ty * cols + tx] = 1;
      }
    }
  }

  // Seats and station tiles must stay reachable even when they sit on top of
  // furniture (sofas, treadmills), so carve them free last.
  for (const deskSlot of map.desks) {
    cells[deskSlot.seatTy * cols + deskSlot.seatTx] = 0;
  }
  for (const stationSlot of map.stations) {
    cells[stationSlot.ty * cols + stationSlot.tx] = 0;
  }
  cells[map.spawn.ty * cols + map.spawn.tx] = 0;

  return { cells, cols, rows, cellSize: PIXEL_TILE_SIZE };
};
