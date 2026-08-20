import { describe, expect, it } from "vitest";

import { AGENT_RADIUS } from "@/features/retro-office/core/constants";
import { getItemBounds } from "@/features/retro-office/core/geometry";
import {
  buildNavGrid,
  isNavAreaFree,
  isNavPointFree,
} from "@/features/retro-office/core/navigation";
import type { FurnitureItem } from "@/features/retro-office/core/types";

// desk_cubicle is one of the types that blocks navigation, so it produces the
// blocked cells this clearance check exists for.
const desk: FurnitureItem = {
  _uid: "test_desk",
  type: "desk_cubicle",
  x: 400,
  y: 400,
};

const bounds = getItemBounds(desk);
const deskCenterY = bounds.y + bounds.h / 2;

/** Distance to the right of the desk where a predicate first reports free. */
const firstFreeOffset = (predicate: (x: number, y: number) => boolean) => {
  for (let offset = 0; offset <= 600; offset += 1) {
    if (predicate(bounds.x + offset, deskCenterY)) return offset;
  }
  return Number.POSITIVE_INFINITY;
};

describe("isNavAreaFree", () => {
  const grid = buildNavGrid([desk]);

  it("rejects the band where a body still overlaps the furniture", () => {
    // The point check clears the desk the moment the centre leaves the blocked
    // cell, which parks an agent with half a torso inside it. Demanding room
    // for the whole body has to push the first acceptable spot further out.
    const pointOffset = firstFreeOffset((x, y) => isNavPointFree(grid, x, y));
    const areaOffset = firstFreeOffset((x, y) => isNavAreaFree(grid, x, y));
    expect(Number.isFinite(pointOffset)).toBe(true);
    expect(Number.isFinite(areaOffset)).toBe(true);
    expect(areaOffset).toBeGreaterThan(pointOffset);
  });

  it("agrees with the point check out on open floor", () => {
    expect(isNavPointFree(grid, 900, 900)).toBe(true);
    expect(isNavAreaFree(grid, 900, 900)).toBe(true);
  });

  it("treats a larger body as needing more room", () => {
    const justClear = bounds.x + firstFreeOffset((x, y) => isNavAreaFree(grid, x, y));
    expect(isNavAreaFree(grid, justClear, deskCenterY, AGENT_RADIUS)).toBe(true);
    expect(isNavAreaFree(grid, justClear, deskCenterY, AGENT_RADIUS * 4)).toBe(
      false,
    );
  });

  it("rejects points outside the grid", () => {
    expect(isNavAreaFree(grid, -50, 400)).toBe(false);
    expect(isNavAreaFree(grid, 400, -50)).toBe(false);
  });
});
