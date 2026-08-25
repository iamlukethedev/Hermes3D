import { beforeEach, describe, expect, it } from "vitest";

import {
  isOfficeRenderMode,
  loadStoredOfficeRenderMode,
  OFFICE_RENDER_MODE_STORAGE_KEY,
  resolveInitialOfficeRenderMode,
  saveOfficeRenderMode,
} from "@/features/office/renderMode";

describe("officeRenderMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("validates render mode values", () => {
    expect(isOfficeRenderMode("3d")).toBe(true);
    expect(isOfficeRenderMode("2d")).toBe(true);
    expect(isOfficeRenderMode("vr")).toBe(false);
    expect(isOfficeRenderMode(null)).toBe(false);
  });

  it("returns null when nothing was stored", () => {
    expect(loadStoredOfficeRenderMode()).toBeNull();
  });

  it("round-trips the stored preference", () => {
    saveOfficeRenderMode("2d");
    expect(window.localStorage.getItem(OFFICE_RENDER_MODE_STORAGE_KEY)).toBe("2d");
    expect(loadStoredOfficeRenderMode()).toBe("2d");
    saveOfficeRenderMode("3d");
    expect(loadStoredOfficeRenderMode()).toBe("3d");
  });

  it("ignores corrupt stored values", () => {
    window.localStorage.setItem(OFFICE_RENDER_MODE_STORAGE_KEY, "banana");
    expect(loadStoredOfficeRenderMode()).toBeNull();
  });

  it("prefers the explicit user choice over hardware detection", () => {
    saveOfficeRenderMode("3d");
    expect(resolveInitialOfficeRenderMode()).toBe("3d");
    saveOfficeRenderMode("2d");
    expect(resolveInitialOfficeRenderMode()).toBe("2d");
  });

  it("falls back to 2d when WebGL is unavailable (jsdom has no WebGL)", () => {
    // In jsdom canvas.getContext returns null, which the detector treats as
    // a software/no-GL environment — exactly the machines the pixel office
    // is designed for.
    expect(resolveInitialOfficeRenderMode()).toBe("2d");
  });
});
