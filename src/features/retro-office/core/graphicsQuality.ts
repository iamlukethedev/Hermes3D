// Graphics quality presets for the immersive office renderer.
// Persisted in localStorage so the choice survives reloads.

export type GraphicsQuality = "low" | "balanced" | "ultra";

export const GRAPHICS_QUALITY_STORAGE_KEY = "hermes-office-graphics-quality-v1";

export const GRAPHICS_QUALITY_OPTIONS: Array<{
  id: GraphicsQuality;
  label: string;
  description: string;
}> = [
  {
    id: "low",
    label: "Low",
    description: "Fastest. No post-processing, small shadow maps.",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Ambient occlusion, bloom and soft shadows.",
  },
  {
    id: "ultra",
    label: "Ultra",
    description: "Maximum fidelity. Large shadow maps and full effects.",
  },
];

export type GraphicsQualityConfig = {
  /** Shadow map resolution for the key light. */
  shadowMapSize: number;
  /** Upper bound for the adaptive device pixel ratio controller. */
  maxDpr: number;
  /** Whether the EffectComposer post-processing chain is mounted. */
  postProcessing: boolean;
  /** Screen-space ambient occlusion (N8AO). */
  ambientOcclusion: boolean;
  /** AO quality knob passed to N8AO. */
  aoQuality: "performance" | "low" | "medium" | "high";
  /** Bloom on bright emissive surfaces. */
  bloom: boolean;
  /** SMAA anti-aliasing inside the composer. */
  smaa: boolean;
  /** Depth of field while the follow camera is active. */
  followDepthOfField: boolean;
};

const QUALITY_CONFIGS: Record<GraphicsQuality, GraphicsQualityConfig> = {
  low: {
    shadowMapSize: 1024,
    maxDpr: 1.25,
    postProcessing: false,
    ambientOcclusion: false,
    aoQuality: "performance",
    bloom: false,
    smaa: false,
    followDepthOfField: false,
  },
  balanced: {
    shadowMapSize: 2048,
    maxDpr: 1.5,
    postProcessing: true,
    ambientOcclusion: true,
    aoQuality: "low",
    bloom: true,
    smaa: true,
    followDepthOfField: false,
  },
  ultra: {
    shadowMapSize: 4096,
    maxDpr: 2,
    postProcessing: true,
    ambientOcclusion: true,
    aoQuality: "medium",
    bloom: true,
    smaa: true,
    followDepthOfField: true,
  },
};

export const getGraphicsQualityConfig = (
  quality: GraphicsQuality,
): GraphicsQualityConfig => QUALITY_CONFIGS[quality];

export const isGraphicsQuality = (value: unknown): value is GraphicsQuality =>
  value === "low" || value === "balanced" || value === "ultra";

export const loadGraphicsQuality = (): GraphicsQuality => {
  if (typeof window === "undefined") return "balanced";
  try {
    const stored = window.localStorage.getItem(GRAPHICS_QUALITY_STORAGE_KEY);
    if (isGraphicsQuality(stored)) return stored;
  } catch {
    // Storage unavailable (private mode, etc.) — fall through to default.
  }
  return "balanced";
};

export const saveGraphicsQuality = (quality: GraphicsQuality) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GRAPHICS_QUALITY_STORAGE_KEY, quality);
  } catch {
    // Best effort only.
  }
};
