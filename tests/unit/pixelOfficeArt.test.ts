import { describe, expect, it } from "vitest";
import {
  buildCharacterFrames,
  buildFurnitureSprites,
  buildGroundTileSprites,
  JANITOR_LOOK,
  spriteHeight,
  spriteWidth,
} from "@/features/pixel-office/art";
import {
  CHARACTER_HEIGHT,
  CHARACTER_WIDTH,
  OBJECT_FOOTPRINT,
  PIXEL_TILE_SIZE,
  type CharacterFrameName,
  type PixelGroundTile,
  type PixelObjectKind,
  type PixelSprite,
} from "@/features/pixel-office/types";

const GROUND_TILES: Exclude<PixelGroundTile, "void">[] = [
  "grass",
  "grass_dark",
  "path",
  "floor_cream",
  "floor_white",
  "floor_wood",
  "carpet_purple",
  "carpet_blue",
  "kitchen_tile",
  "gym_mat",
  "server_floor",
  "wall",
  "wall_window",
];

const FRAME_NAMES: CharacterFrameName[] = [
  "idle_down",
  "walk_down_a",
  "walk_down_b",
  "idle_up",
  "walk_up_a",
  "walk_up_b",
  "idle_left",
  "walk_left_a",
  "walk_left_b",
  "idle_right",
  "walk_right_a",
  "walk_right_b",
  "sit_down",
  "sit_up",
  "sit_left",
  "sit_right",
  "dance_a",
  "dance_b",
];

function expectPaletteCovers(sprite: PixelSprite): void {
  for (const row of sprite.rows) {
    for (const ch of row) {
      if (ch === "." || ch === " ") continue;
      expect(sprite.palette[ch], `char "${ch}" in sprite "${sprite.key}"`).toMatch(
        /^#[0-9a-f]{6}([0-9a-f]{2})?$/i,
      );
    }
  }
}

describe("pixel office art", () => {
  it("provides a tile-sized sprite for every paintable ground tile plus alt variants", () => {
    const sprites = buildGroundTileSprites();
    const byKey = new Map(sprites.map((s) => [s.key, s]));

    for (const tile of GROUND_TILES) {
      const sprite = byKey.get(`tile_${tile}`);
      expect(sprite, `missing tile sprite for "${tile}"`).toBeDefined();
      expect(spriteWidth(sprite!)).toBe(PIXEL_TILE_SIZE);
      expect(spriteHeight(sprite!)).toBe(PIXEL_TILE_SIZE);
    }

    for (const altKey of ["tile_grass_alt", "tile_floor_cream_alt", "tile_floor_wood_alt"]) {
      const sprite = byKey.get(altKey);
      expect(sprite, `missing alt tile sprite "${altKey}"`).toBeDefined();
      expect(spriteWidth(sprite!)).toBe(PIXEL_TILE_SIZE);
      expect(spriteHeight(sprite!)).toBe(PIXEL_TILE_SIZE);
    }

    for (const sprite of sprites) expectPaletteCovers(sprite);
  });

  it("alt tile variants differ from their base tiles", () => {
    const byKey = new Map(buildGroundTileSprites().map((s) => [s.key, s]));
    for (const base of ["tile_grass", "tile_floor_cream", "tile_floor_wood"]) {
      expect(byKey.get(`${base}_alt`)!.rows).not.toEqual(byKey.get(base)!.rows);
    }
  });

  it("provides a sprite per object kind matching the footprint contract", () => {
    const sprites = buildFurnitureSprites();
    const byKey = new Map(sprites.map((s) => [s.key, s]));
    const kinds = Object.keys(OBJECT_FOOTPRINT) as PixelObjectKind[];

    for (const kind of kinds) {
      const sprite = byKey.get(`furn_${kind}`);
      expect(sprite, `missing furniture sprite for "${kind}"`).toBeDefined();
      const [fw, fh] = OBJECT_FOOTPRINT[kind];
      expect(spriteWidth(sprite!), `width of furn_${kind}`).toBe(fw * PIXEL_TILE_SIZE);
      expect(spriteHeight(sprite!), `height of furn_${kind}`).toBeGreaterThanOrEqual(
        fh * PIXEL_TILE_SIZE,
      );
      expectPaletteCovers(sprite!);
    }
    expect(sprites).toHaveLength(kinds.length);
  });

  it("builds all character frames at the exact character dimensions with covered palettes", () => {
    const frames = buildCharacterFrames({ seed: "agent-alpha", accentColor: "#e06c50" });
    for (const name of FRAME_NAMES) {
      const sprite = frames[name];
      expect(sprite, `missing frame "${name}"`).toBeDefined();
      expect(sprite.key).toBe(`char_agent-alpha_${name}`);
      expect(spriteWidth(sprite), `width of ${name}`).toBe(CHARACTER_WIDTH);
      expect(spriteHeight(sprite), `height of ${name}`).toBe(CHARACTER_HEIGHT);
      expectPaletteCovers(sprite);
    }
  });

  it("derives different hair/skin appearances from different seeds", () => {
    const seeds = ["agent-a", "agent-b", "agent-c", "agent-d", "agent-e", "agent-f"];
    const combos = new Set(
      seeds.map((seed) => {
        const frames = buildCharacterFrames({ seed, accentColor: "#4a90d9" });
        const palette = frames.idle_down.palette;
        return `${palette.h}|${palette.s}`;
      }),
    );
    expect(combos.size).toBeGreaterThan(1);
  });

  it("mirrors right-facing frames from left-facing ones", () => {
    const frames = buildCharacterFrames({ seed: "agent-alpha", accentColor: "#e06c50" });
    expect(frames.idle_right.rows).not.toEqual(frames.idle_left.rows);
    const mirroredBack = frames.idle_right.rows.map((row) =>
      row.split("").reverse().join(""),
    );
    expect(mirroredBack).toEqual(
      frames.idle_left.rows.map((row) => row.padEnd(CHARACTER_WIDTH, ".")),
    );
  });

  it("makes sitting frames read shorter than standing frames", () => {
    const frames = buildCharacterFrames({ seed: "agent-alpha", accentColor: "#e06c50" });
    const firstInkRow = (sprite: PixelSprite) =>
      sprite.rows.findIndex((row) => [...row].some((ch) => ch !== "." && ch !== " "));
    expect(firstInkRow(frames.sit_down)).toBeGreaterThan(firstInkRow(frames.idle_down));
    expect(spriteHeight(frames.sit_down)).toBe(CHARACTER_HEIGHT);
  });

  it("gives the janitor a stable look with a yellow cap", () => {
    expect(JANITOR_LOOK.seed).toBe("npc-janitor");
    expect(JANITOR_LOOK.accentColor).toBe("#8a8f98");
    const first = buildCharacterFrames(JANITOR_LOOK);
    const second = buildCharacterFrames(JANITOR_LOOK);
    for (const name of FRAME_NAMES) {
      expect(second[name].rows).toEqual(first[name].rows);
      expect(second[name].palette).toEqual(first[name].palette);
    }
    // The cap band uses the "y" palette char somewhere on the head.
    expect(first.idle_down.rows.some((row) => row.includes("y"))).toBe(true);
    // Any other npc-janitor-prefixed seed shares the fixed appearance.
    const variant = buildCharacterFrames({ seed: "npc-janitor-2", accentColor: "#8a8f98" });
    expect(variant.idle_down.rows).toEqual(first.idle_down.rows);
  });

  it("falls back to the default shirt color on invalid accent hex", () => {
    const frames = buildCharacterFrames({ seed: "agent-alpha", accentColor: "not-a-color" });
    expect(frames.idle_down.palette.t).toBe("#4a90d9");
  });
});
