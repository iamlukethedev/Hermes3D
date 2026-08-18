import { describe, expect, it } from "vitest";

import {
  DEFAULT_ACTIVE_FLOOR_ID,
  getOfficeFloor,
  HERMES_FLOOR,
  listEnabledOfficeFloors,
  OFFICE_FLOORS,
  resolveActiveOfficeFloorId,
} from "@/lib/office/floors";

describe("office floor registry", () => {
  it("defines exactly one floor: Hermes", () => {
    expect(OFFICE_FLOORS.map((floor) => floor.id)).toEqual(["hermes"]);
    expect(DEFAULT_ACTIVE_FLOOR_ID).toBe("hermes");
  });

  it("describes the Hermes floor", () => {
    expect(getOfficeFloor()).toMatchObject({
      id: "hermes",
      label: "Hermes",
      shortLabel: "Hermes",
      provider: "hermes",
      kind: "runtime",
      zone: "building",
      enabled: true,
      runtimeProfileId: "hermes-default",
    });
    expect(getOfficeFloor()).toBe(HERMES_FLOOR);
  });

  it("lists the Hermes floor as the only enabled floor", () => {
    expect(listEnabledOfficeFloors().map((floor) => floor.id)).toEqual(["hermes"]);
  });

  it("coerces any persisted floor id onto the Hermes floor", () => {
    expect(resolveActiveOfficeFloorId("hermes")).toBe("hermes");
    expect(resolveActiveOfficeFloorId("lobby")).toBe("hermes");
    expect(resolveActiveOfficeFloorId("hermes-first")).toBe("hermes");
    expect(resolveActiveOfficeFloorId("training")).toBe("hermes");
    expect(resolveActiveOfficeFloorId(null)).toBe("hermes");
    expect(resolveActiveOfficeFloorId(undefined)).toBe("hermes");
  });
});
