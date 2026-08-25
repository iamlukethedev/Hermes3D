import { describe, expect, it } from "vitest";

import { STANDUP_TABLE_ID } from "@/features/retro-office/core/constants";
import {
  ensureOfficeStandupTableIdentifier,
  materializeDefaults,
} from "@/features/retro-office/core/furnitureDefaults";
import {
  findStandupMeetingTable,
  getMeetingSeatLocations,
} from "@/features/retro-office/core/navigation";
import type { FurnitureItem } from "@/features/retro-office/core/types";

describe("stand-up meeting table", () => {
  it("materializes the office conference table with a stable identifier", () => {
    const table = findStandupMeetingTable(materializeDefaults("office"));

    expect(table).toMatchObject({
      type: "round_table",
      id: STANDUP_TABLE_ID,
      x: 340,
      y: 160,
    });
  });

  it("tags the existing cached conference table without changing its position", () => {
    const items: FurnitureItem[] = [
      { _uid: "legacy_table", type: "round_table", x: 340, y: 160, r: 65 },
      { _uid: "desk", type: "desk_cubicle", x: 120, y: 220 },
    ];

    const migrated = ensureOfficeStandupTableIdentifier(items, "office");

    expect(migrated[0]).toEqual({
      ...items[0],
      id: STANDUP_TABLE_ID,
    });
    expect(migrated[1]).toBe(items[1]);
  });

  it("recognizes a legacy cached table before its identifier is persisted", () => {
    const legacyTable: FurnitureItem = {
      _uid: "legacy_table",
      type: "round_table",
      x: 340,
      y: 160,
      r: 65,
    };

    expect(findStandupMeetingTable([legacyTable])).toBe(legacyTable);
  });

  it("does not turn a lobby table into a stand-up table", () => {
    const lobby = materializeDefaults("lobby");

    expect(ensureOfficeStandupTableIdentifier(lobby, "lobby")).toBe(lobby);
    expect(lobby.some((item) => item.id === STANDUP_TABLE_ID)).toBe(false);
  });

  it("derives seats from the identified table instead of its coordinates", () => {
    const items: FurnitureItem[] = [
      {
        _uid: "standup",
        type: "round_table",
        id: STANDUP_TABLE_ID,
        x: 900,
        y: 500,
        r: 65,
      },
    ];

    const seats = getMeetingSeatLocations(items);

    expect(seats).toHaveLength(4);
    expect(seats[0]?.x).toBeGreaterThan(900);
    expect(seats[0]?.y).toBeGreaterThan(500);
  });
});
