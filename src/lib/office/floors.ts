// The office has exactly one floor: Hermes. The multi-floor directory was
// removed — the gateway adapter (demo vs hermes) is chosen in settings, not
// by walking between floors. The floor model is kept as a thin type so
// persisted settings and the roster cache keep a stable shape.

export type FloorProvider =
  | "hermes"
  | "custom"
  | "demo"
  | "local"
  | "hermes3d";
export type FloorZone = "building";

export type FloorId = "hermes";

export type FloorKind = "runtime";

export type FloorDefinition = {
  id: FloorId;
  label: string;
  shortLabel: string;
  provider: FloorProvider;
  kind: FloorKind;
  zone: FloorZone;
  enabled: boolean;
  sortOrder: number;
  runtimeProfileId: string | null;
};

export const HERMES_FLOOR: FloorDefinition = {
  id: "hermes",
  label: "Hermes",
  shortLabel: "Hermes",
  provider: "hermes",
  kind: "runtime",
  zone: "building",
  enabled: true,
  sortOrder: 0,
  runtimeProfileId: "hermes-default",
};

export const OFFICE_FLOORS: readonly FloorDefinition[] = [HERMES_FLOOR];

export const DEFAULT_ACTIVE_FLOOR_ID: FloorId = "hermes";

export const getOfficeFloor = (): FloorDefinition => HERMES_FLOOR;

export const listEnabledOfficeFloors = (): FloorDefinition[] => [HERMES_FLOOR];

/**
 * Coerces any persisted floor id (including ids from the removed multi-floor
 * era such as "lobby" or "hermes-first") onto the single Hermes floor.
 */
export const resolveActiveOfficeFloorId = (floorId?: string | null): FloorId =>
  floorId === DEFAULT_ACTIVE_FLOOR_ID ? floorId : DEFAULT_ACTIVE_FLOOR_ID;
