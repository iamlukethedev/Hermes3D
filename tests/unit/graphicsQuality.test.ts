import { describe, expect, it } from "vitest";
import {
  GRAPHICS_QUALITY_STORAGE_KEY,
  loadStoredGraphicsQuality,
  resolveAutomaticGraphicsQuality,
  resolveRenderDpr,
  shouldRunAnimationFrame,
} from "@/features/retro-office/core/graphicsQuality";

describe("graphics quality selection", () => {
  it("keeps unconstrained desktop hardware balanced", () => {
    expect(resolveAutomaticGraphicsQuality({
      viewportWidth: 1440, coarsePointer: false, deviceMemory: 8,
      reducedMotion: false, softwareRenderer: false,
    })).toBe("balanced");
  });

  it("starts constrained mobile and reduced-motion devices low", () => {
    expect(resolveAutomaticGraphicsQuality({
      viewportWidth: 412, coarsePointer: true, deviceMemory: 4,
      reducedMotion: false, softwareRenderer: false,
    })).toBe("low");
    expect(resolveAutomaticGraphicsQuality({
      viewportWidth: 1440, coarsePointer: false, deviceMemory: 8,
      reducedMotion: true, softwareRenderer: false,
    })).toBe("low");
  });

  it("preserves an explicit user override", () => {
    window.localStorage.setItem(GRAPHICS_QUALITY_STORAGE_KEY, "ultra");
    expect(loadStoredGraphicsQuality()).toBe("ultra");
    window.localStorage.removeItem(GRAPHICS_QUALITY_STORAGE_KEY);
  });

  it("caps DPR and rejects unusably small values", () => {
    expect(resolveRenderDpr(3, 1)).toBe(1);
    expect(resolveRenderDpr(0.5, 2)).toBe(0.75);
  });

  it("pauses scene simulation while the document is hidden", () => {
    expect(shouldRunAnimationFrame("visible")).toBe(true);
    expect(shouldRunAnimationFrame("hidden")).toBe(false);
  });
});