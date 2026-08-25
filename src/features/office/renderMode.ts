// Office renderer preference: immersive 3D scene vs. lightweight 2D pixel scene.
// Persisted in localStorage so the choice survives reloads.

import { detectSoftwareWebGL } from "@/features/retro-office/core/graphicsQuality";

export type OfficeRenderMode = "3d" | "2d";

export const OFFICE_RENDER_MODE_STORAGE_KEY = "hermes-office-render-mode-v1";

export const OFFICE_RENDER_MODE_OPTIONS: Array<{
  id: OfficeRenderMode;
  label: string;
  description: string;
}> = [
  {
    id: "3d",
    label: "3D immersive",
    description: "Full Three.js office with shadows and post-processing.",
  },
  {
    id: "2d",
    label: "2D pixel",
    description: "Gather-style pixel office. Great for low-power machines.",
  },
];

export const isOfficeRenderMode = (value: unknown): value is OfficeRenderMode =>
  value === "3d" || value === "2d";

/** The explicit user choice, or null when the user never picked one. */
export const loadStoredOfficeRenderMode = (): OfficeRenderMode | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(OFFICE_RENDER_MODE_STORAGE_KEY);
    if (isOfficeRenderMode(stored)) return stored;
  } catch {
    // Storage unavailable (private mode, etc.) — fall through to default.
  }
  return null;
};

/**
 * The mode the office should boot with: the user's stored choice, or a
 * hardware-appropriate default. Machines that rasterize WebGL in software
 * cannot drive the 3D pipeline smoothly, so they default to the pixel office.
 */
export const resolveInitialOfficeRenderMode = (): OfficeRenderMode =>
  loadStoredOfficeRenderMode() ?? (detectSoftwareWebGL() ? "2d" : "3d");

export const saveOfficeRenderMode = (mode: OfficeRenderMode) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OFFICE_RENDER_MODE_STORAGE_KEY, mode);
  } catch {
    // Best effort only.
  }
};
