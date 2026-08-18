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

/** The explicit user choice, or null when the user never picked one. */
export const loadStoredGraphicsQuality = (): GraphicsQuality | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(GRAPHICS_QUALITY_STORAGE_KEY);
    if (isGraphicsQuality(stored)) return stored;
  } catch {
    // Storage unavailable (private mode, etc.) — fall through to default.
  }
  return null;
};

export const loadGraphicsQuality = (): GraphicsQuality =>
  loadStoredGraphicsQuality() ?? "balanced";

/**
 * True when WebGL runs on a CPU rasterizer (SwiftShader, llvmpipe, …).
 * Software renderers cannot keep up with the full pipeline and may lose
 * the GL context, so callers should drop to the "low" preset.
 */
export const isSoftwareWebGLRenderer = (
  context: WebGLRenderingContext | WebGL2RenderingContext,
): boolean => {
  try {
    const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(
      debugInfo
        ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : context.getParameter(context.RENDERER),
    );
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
};

let softwareWebGLProbe: boolean | null = null;

/**
 * Probes a throwaway WebGL context to learn whether the machine rasterizes
 * in software, BEFORE the main canvas mounts. This lets the initial quality
 * state start at "low" on such machines instead of downgrading after the
 * heavy pipeline has already overloaded (and possibly lost) the context.
 */
export const detectSoftwareWebGL = (): boolean => {
  if (typeof document === "undefined") return false;
  if (softwareWebGLProbe !== null) return softwareWebGLProbe;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context =
      canvas.getContext("webgl2") ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null);
    if (!context) {
      softwareWebGLProbe = true;
      return true;
    }
    softwareWebGLProbe = isSoftwareWebGLRenderer(context);
    context.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    softwareWebGLProbe = false;
  }
  return softwareWebGLProbe ?? false;
};

/**
 * The quality the office should boot with: the user's stored choice, or a
 * hardware-appropriate default.
 */
export const resolveInitialGraphicsQuality = (): GraphicsQuality =>
  loadStoredGraphicsQuality() ?? (detectSoftwareWebGL() ? "low" : "balanced");

export const saveGraphicsQuality = (quality: GraphicsQuality) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GRAPHICS_QUALITY_STORAGE_KEY, quality);
  } catch {
    // Best effort only.
  }
};
