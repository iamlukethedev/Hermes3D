// Integrity checks for the Hermes HQ pixel map: bounds, walkability, and
// reachability of every desk seat and station tile from the spawn point.

import { describe, expect, it } from "vitest";

import { buildHermesHqMap } from "@/features/pixel-office/map/hermesHqMap";
import { buildPixelNavGrid, tileCenter } from "@/features/pixel-office/map/navGrid";
import { astar2D } from "@/lib/office/pathfinding";

describe("hermes hq pixel map integrity", () => {
  const map = buildHermesHqMap();
  const grid = buildPixelNavGrid(map);
  const spawnCenter = tileCenter(map.spawn.tx, map.spawn.ty);

  const inBounds = (tx: number, ty: number): boolean =>
    tx >= 0 && ty >= 0 && tx < map.cols && ty < map.rows;

  const reachableFromSpawn = (tx: number, ty: number): boolean => {
    if (tx === map.spawn.tx && ty === map.spawn.ty) return true;
    const center = tileCenter(tx, ty);
    return astar2D(spawnCenter.x, spawnCenter.y, center.x, center.y, grid).length > 0;
  };

  it("keeps every desk tile and seat inside bounds", () => {
    for (const desk of map.desks) {
      expect(inBounds(desk.deskTx, desk.deskTy), `desk ${desk.id} tile`).toBe(true);
      expect(inBounds(desk.seatTx, desk.seatTy), `desk ${desk.id} seat`).toBe(true);
    }
  });

  it("keeps every station tile inside bounds", () => {
    for (const station of map.stations) {
      expect(inBounds(station.tx, station.ty), `station ${station.id}`).toBe(true);
    }
  });

  it("makes every desk seat walkable and reachable from spawn", () => {
    for (const desk of map.desks) {
      expect(
        grid.cells[desk.seatTy * grid.cols + desk.seatTx],
        `desk ${desk.id} seat (${desk.seatTx}, ${desk.seatTy}) blocked`,
      ).toBe(0);
      expect(
        reachableFromSpawn(desk.seatTx, desk.seatTy),
        `desk ${desk.id} seat (${desk.seatTx}, ${desk.seatTy}) unreachable`,
      ).toBe(true);
    }
  });

  it("makes every station tile walkable and reachable from spawn", () => {
    for (const station of map.stations) {
      expect(
        grid.cells[station.ty * grid.cols + station.tx],
        `station ${station.id} (${station.tx}, ${station.ty}) blocked`,
      ).toBe(0);
      expect(
        reachableFromSpawn(station.tx, station.ty),
        `station ${station.id} (${station.tx}, ${station.ty}) unreachable`,
      ).toBe(true);
    }
  });

  it("gives every desk a unique seat tile", () => {
    const seats = new Set(map.desks.map((desk) => `${desk.seatTx},${desk.seatTy}`));
    expect(seats.size).toBe(map.desks.length);
  });

  it("keeps all zones within map bounds", () => {
    for (const zone of map.zones) {
      expect(zone.tx, `zone ${zone.id} tx`).toBeGreaterThanOrEqual(0);
      expect(zone.ty, `zone ${zone.id} ty`).toBeGreaterThanOrEqual(0);
      expect(zone.tw, `zone ${zone.id} tw`).toBeGreaterThan(0);
      expect(zone.th, `zone ${zone.id} th`).toBeGreaterThan(0);
      expect(zone.tx + zone.tw, `zone ${zone.id} right edge`).toBeLessThanOrEqual(
        map.cols,
      );
      expect(zone.ty + zone.th, `zone ${zone.id} bottom edge`).toBeLessThanOrEqual(
        map.rows,
      );
    }
  });

  it("places spawn on a non-wall walkable tile", () => {
    expect(inBounds(map.spawn.tx, map.spawn.ty)).toBe(true);
    expect(map.ground[map.spawn.ty * map.cols + map.spawn.tx]).not.toBe("wall");
    expect(grid.cells[map.spawn.ty * grid.cols + map.spawn.tx]).toBe(0);
  });
});
