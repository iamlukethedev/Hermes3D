// Procedural PBR texture library for the immersive office.
// Everything is generated at runtime on a 2D canvas — no bundled image assets,
// no licensing exposure. Each generator returns albedo/roughness/normal maps
// and results are cached, so repeated callers share GPU textures.

import * as THREE from "three";

export type PbrTextureSet = {
  map: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  normalMap: THREE.Texture | null;
};

const EMPTY_SET: PbrTextureSet = { map: null, roughnessMap: null, normalMap: null };

const textureCache = new Map<string, PbrTextureSet>();

type CanvasContext = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  size: number;
};

const makeCanvas = (size: number): CanvasContext | null => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return { canvas, ctx, size };
};

const toTexture = (
  canvas: HTMLCanvasElement,
  options: { srgb?: boolean } = {},
): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (options.srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

// Deterministic hash noise so textures look identical across sessions.
const hash2 = (x: number, y: number, seed: number) => {
  let h = seed + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h ^= h >> 16;
  return (h >>> 0) / 4294967295;
};

const smoothNoise = (x: number, y: number, seed: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const n00 = hash2(xi, yi, seed);
  const n10 = hash2(xi + 1, yi, seed);
  const n01 = hash2(xi, yi + 1, seed);
  const n11 = hash2(xi + 1, yi + 1, seed);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
};

const fbm = (x: number, y: number, seed: number, octaves = 4) => {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let index = 0; index < octaves; index += 1) {
    value += smoothNoise(x * frequency, y * frequency, seed + index * 101) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
};

/**
 * Converts a grayscale height canvas into a tangent-space normal map.
 * strength controls how pronounced the relief reads.
 */
const heightToNormal = (
  height: CanvasContext,
  strength: number,
): THREE.CanvasTexture | null => {
  const output = makeCanvas(height.size);
  if (!output) return null;
  const size = height.size;
  const source = height.ctx.getImageData(0, 0, size, size).data;
  const target = output.ctx.createImageData(size, size);
  const heightAt = (x: number, y: number) => {
    const px = ((x + size) % size) + ((y + size) % size) * size;
    return source[px * 4] / 255;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * strength;
      const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * strength;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const index = (x + y * size) * 4;
      target.data[index] = Math.round((-dx * inverseLength * 0.5 + 0.5) * 255);
      target.data[index + 1] = Math.round((-dy * inverseLength * 0.5 + 0.5) * 255);
      target.data[index + 2] = Math.round((inverseLength * 0.5 + 0.5) * 255);
      target.data[index + 3] = 255;
    }
  }
  output.ctx.putImageData(target, 0, 0);
  return toTexture(output.canvas);
};

const cached = (key: string, build: () => PbrTextureSet): PbrTextureSet => {
  const existing = textureCache.get(key);
  if (existing) return existing;
  const built = build();
  textureCache.set(key, built);
  return built;
};

/** Warm oak plank floor with per-plank tone shifts, grain and seams. */
export const getWoodFloorTextures = (): PbrTextureSet =>
  cached("wood-floor", () => {
    const albedo = makeCanvas(1024);
    const rough = makeCanvas(1024);
    const heightMap = makeCanvas(1024);
    if (!albedo || !rough || !heightMap) return EMPTY_SET;
    const size = albedo.size;
    const plankHeight = size / 8;
    const plankWidth = size / 2;

    for (let row = 0; row < 8; row += 1) {
      const rowOffset = (row % 2) * plankWidth * 0.5 + hash2(row, 7, 11) * plankWidth * 0.35;
      for (let col = -1; col < 3; col += 1) {
        const px = col * plankWidth + rowOffset;
        const tone = 0.82 + hash2(row, col, 23) * 0.36;
        const baseR = 168 * tone;
        const baseG = 122 * tone;
        const baseB = 82 * tone;
        albedo.ctx.fillStyle = `rgb(${baseR | 0},${baseG | 0},${baseB | 0})`;
        albedo.ctx.fillRect(px, row * plankHeight, plankWidth, plankHeight);
        const roughTone = 120 + hash2(row, col, 51) * 70;
        rough.ctx.fillStyle = `rgb(${roughTone | 0},${roughTone | 0},${roughTone | 0})`;
        rough.ctx.fillRect(px, row * plankHeight, plankWidth, plankHeight);
        heightMap.ctx.fillStyle = "rgb(200,200,200)";
        heightMap.ctx.fillRect(px, row * plankHeight, plankWidth, plankHeight);
        // Plank end seam.
        albedo.ctx.fillStyle = "rgba(40,24,12,0.85)";
        albedo.ctx.fillRect(px, row * plankHeight, 3, plankHeight);
        heightMap.ctx.fillStyle = "rgb(60,60,60)";
        heightMap.ctx.fillRect(px, row * plankHeight, 3, plankHeight);
      }
      // Long seam between rows.
      albedo.ctx.fillStyle = "rgba(40,24,12,0.9)";
      albedo.ctx.fillRect(0, row * plankHeight, size, 3);
      heightMap.ctx.fillStyle = "rgb(50,50,50)";
      heightMap.ctx.fillRect(0, row * plankHeight, size, 3);
    }

    // Wood grain streaks + mottling.
    const albedoData = albedo.ctx.getImageData(0, 0, size, size);
    const roughData = rough.ctx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const grain =
          fbm(x * 0.11, y * 0.009, 5, 4) * 0.7 + fbm(x * 0.02, y * 0.02, 9, 3) * 0.3;
        const shade = 0.86 + grain * 0.28;
        const index = (x + y * size) * 4;
        albedoData.data[index] = Math.min(255, albedoData.data[index] * shade);
        albedoData.data[index + 1] = Math.min(255, albedoData.data[index + 1] * shade);
        albedoData.data[index + 2] = Math.min(255, albedoData.data[index + 2] * shade);
        roughData.data[index] = Math.min(
          255,
          Math.max(70, roughData.data[index] + (grain - 0.5) * 60),
        );
        roughData.data[index + 1] = roughData.data[index];
        roughData.data[index + 2] = roughData.data[index];
      }
    }
    albedo.ctx.putImageData(albedoData, 0, 0);
    rough.ctx.putImageData(roughData, 0, 0);

    return {
      map: toTexture(albedo.canvas, { srgb: true }),
      roughnessMap: toTexture(rough.canvas),
      normalMap: heightToNormal(heightMap, 1.6),
    };
  });

/** Soft mottled plaster for interior walls. */
export const getPlasterTextures = (): PbrTextureSet =>
  cached("plaster", () => {
    const albedo = makeCanvas(512);
    const rough = makeCanvas(512);
    const heightMap = makeCanvas(512);
    if (!albedo || !rough || !heightMap) return EMPTY_SET;
    const size = albedo.size;
    const albedoData = albedo.ctx.createImageData(size, size);
    const roughData = rough.ctx.createImageData(size, size);
    const heightData = heightMap.ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const mottle = fbm(x * 0.014, y * 0.014, 31, 4);
        const fine = fbm(x * 0.16, y * 0.16, 77, 2);
        const shade = 225 + (mottle - 0.5) * 26 + (fine - 0.5) * 10;
        const index = (x + y * size) * 4;
        albedoData.data[index] = shade;
        albedoData.data[index + 1] = shade * 0.985;
        albedoData.data[index + 2] = shade * 0.955;
        albedoData.data[index + 3] = 255;
        const roughness = 220 + (fine - 0.5) * 40;
        roughData.data[index] = roughness;
        roughData.data[index + 1] = roughness;
        roughData.data[index + 2] = roughness;
        roughData.data[index + 3] = 255;
        const heightValue = 128 + (mottle - 0.5) * 70 + (fine - 0.5) * 50;
        heightData.data[index] = heightValue;
        heightData.data[index + 1] = heightValue;
        heightData.data[index + 2] = heightValue;
        heightData.data[index + 3] = 255;
      }
    }
    albedo.ctx.putImageData(albedoData, 0, 0);
    rough.ctx.putImageData(roughData, 0, 0);
    heightMap.ctx.putImageData(heightData, 0, 0);
    return {
      map: toTexture(albedo.canvas, { srgb: true }),
      roughnessMap: toTexture(rough.canvas),
      normalMap: heightToNormal(heightMap, 0.8),
    };
  });

/** Weathered concrete / pavement for the district ground. */
export const getConcreteTextures = (): PbrTextureSet =>
  cached("concrete", () => {
    const albedo = makeCanvas(512);
    const rough = makeCanvas(512);
    const heightMap = makeCanvas(512);
    if (!albedo || !rough || !heightMap) return EMPTY_SET;
    const size = albedo.size;
    const albedoData = albedo.ctx.createImageData(size, size);
    const roughData = rough.ctx.createImageData(size, size);
    const heightData = heightMap.ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const large = fbm(x * 0.008, y * 0.008, 13, 4);
        const speckle = hash2(x, y, 91);
        const stain = fbm(x * 0.02, y * 0.02, 47, 3);
        let shade = 96 + (large - 0.5) * 34 + (stain - 0.5) * 22;
        if (speckle > 0.965) shade += 26;
        if (speckle < 0.03) shade -= 22;
        const index = (x + y * size) * 4;
        albedoData.data[index] = shade;
        albedoData.data[index + 1] = shade * 1.01;
        albedoData.data[index + 2] = shade * 1.04;
        albedoData.data[index + 3] = 255;
        const roughness = 215 + (stain - 0.5) * 50;
        roughData.data[index] = roughness;
        roughData.data[index + 1] = roughness;
        roughData.data[index + 2] = roughness;
        roughData.data[index + 3] = 255;
        const heightValue = 128 + (large - 0.5) * 60 + (speckle - 0.5) * 24;
        heightData.data[index] = heightValue;
        heightData.data[index + 1] = heightValue;
        heightData.data[index + 2] = heightValue;
        heightData.data[index + 3] = 255;
      }
    }
    albedo.ctx.putImageData(albedoData, 0, 0);
    rough.ctx.putImageData(roughData, 0, 0);
    heightMap.ctx.putImageData(heightData, 0, 0);
    return {
      map: toTexture(albedo.canvas, { srgb: true }),
      roughnessMap: toTexture(rough.canvas),
      normalMap: heightToNormal(heightMap, 1.0),
    };
  });

/** Short-pile carpet with fibre noise (gym / QA lab floors, rugs). */
export const getCarpetTextures = (): PbrTextureSet =>
  cached("carpet", () => {
    const albedo = makeCanvas(512);
    const rough = makeCanvas(512);
    const heightMap = makeCanvas(512);
    if (!albedo || !rough || !heightMap) return EMPTY_SET;
    const size = albedo.size;
    const albedoData = albedo.ctx.createImageData(size, size);
    const roughData = rough.ctx.createImageData(size, size);
    const heightData = heightMap.ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const fibre = hash2(x, y, 3);
        const tuft = fbm(x * 0.09, y * 0.09, 17, 3);
        const shade = 205 + (fibre - 0.5) * 46 + (tuft - 0.5) * 30;
        const index = (x + y * size) * 4;
        albedoData.data[index] = shade;
        albedoData.data[index + 1] = shade;
        albedoData.data[index + 2] = shade;
        albedoData.data[index + 3] = 255;
        roughData.data[index] = 245;
        roughData.data[index + 1] = 245;
        roughData.data[index + 2] = 245;
        roughData.data[index + 3] = 255;
        const heightValue = 128 + (fibre - 0.5) * 90;
        heightData.data[index] = heightValue;
        heightData.data[index + 1] = heightValue;
        heightData.data[index + 2] = heightValue;
        heightData.data[index + 3] = 255;
      }
    }
    albedo.ctx.putImageData(albedoData, 0, 0);
    rough.ctx.putImageData(roughData, 0, 0);
    heightMap.ctx.putImageData(heightData, 0, 0);
    return {
      map: toTexture(albedo.canvas, { srgb: true }),
      roughnessMap: toTexture(rough.canvas),
      normalMap: heightToNormal(heightMap, 0.7),
    };
  });

/** Brushed metal with directional micro-streaks (appliances, legs, racks). */
export const getBrushedMetalTextures = (): PbrTextureSet =>
  cached("brushed-metal", () => {
    const albedo = makeCanvas(512);
    const rough = makeCanvas(512);
    if (!albedo || !rough) return EMPTY_SET;
    const size = albedo.size;
    const albedoData = albedo.ctx.createImageData(size, size);
    const roughData = rough.ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      const line = hash2(0, y, 7);
      for (let x = 0; x < size; x += 1) {
        const streak = fbm(x * 0.004, y * 0.6, 29, 3);
        const shade = 196 + (line - 0.5) * 16 + (streak - 0.5) * 22;
        const index = (x + y * size) * 4;
        albedoData.data[index] = shade;
        albedoData.data[index + 1] = shade * 1.005;
        albedoData.data[index + 2] = shade * 1.015;
        albedoData.data[index + 3] = 255;
        const roughness = 92 + (streak - 0.5) * 60 + (line - 0.5) * 28;
        roughData.data[index] = roughness;
        roughData.data[index + 1] = roughness;
        roughData.data[index + 2] = roughness;
        roughData.data[index + 3] = 255;
      }
    }
    albedo.ctx.putImageData(albedoData, 0, 0);
    rough.ctx.putImageData(roughData, 0, 0);
    return {
      map: toTexture(albedo.canvas, { srgb: true }),
      roughnessMap: toTexture(rough.canvas),
      normalMap: null,
    };
  });

/** Woven fabric weave for seats, couches and clothing accents. */
export const getFabricTextures = (): PbrTextureSet =>
  cached("fabric", () => {
    const albedo = makeCanvas(512);
    const rough = makeCanvas(512);
    const heightMap = makeCanvas(512);
    if (!albedo || !rough || !heightMap) return EMPTY_SET;
    const size = albedo.size;
    const albedoData = albedo.ctx.createImageData(size, size);
    const roughData = rough.ctx.createImageData(size, size);
    const heightData = heightMap.ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const weave =
          (Math.sin(x * 0.9) * 0.5 + 0.5) * 0.5 + (Math.sin(y * 0.9) * 0.5 + 0.5) * 0.5;
        const noise = hash2(x, y, 63);
        const shade = 208 + (weave - 0.5) * 34 + (noise - 0.5) * 18;
        const index = (x + y * size) * 4;
        albedoData.data[index] = shade;
        albedoData.data[index + 1] = shade;
        albedoData.data[index + 2] = shade;
        albedoData.data[index + 3] = 255;
        roughData.data[index] = 235;
        roughData.data[index + 1] = 235;
        roughData.data[index + 2] = 235;
        roughData.data[index + 3] = 255;
        const heightValue = 128 + (weave - 0.5) * 80;
        heightData.data[index] = heightValue;
        heightData.data[index + 1] = heightValue;
        heightData.data[index + 2] = heightValue;
        heightData.data[index + 3] = 255;
      }
    }
    albedo.ctx.putImageData(albedoData, 0, 0);
    rough.ctx.putImageData(roughData, 0, 0);
    heightMap.ctx.putImageData(heightData, 0, 0);
    return {
      map: toTexture(albedo.canvas, { srgb: true }),
      roughnessMap: toTexture(rough.canvas),
      normalMap: heightToNormal(heightMap, 0.6),
    };
  });

/** Cut lawn / hedge foliage for the garden strip between offices. */
export const getGrassTextures = (): PbrTextureSet =>
  cached("grass", () => {
    const albedo = makeCanvas(512);
    const rough = makeCanvas(512);
    const heightMap = makeCanvas(512);
    if (!albedo || !rough || !heightMap) return EMPTY_SET;
    const size = albedo.size;
    const albedoData = albedo.ctx.createImageData(size, size);
    const roughData = rough.ctx.createImageData(size, size);
    const heightData = heightMap.ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const patch = fbm(x * 0.012, y * 0.012, 19, 4);
        const blade = hash2(x, y, 41);
        const green = 118 + (patch - 0.5) * 44 + (blade - 0.5) * 46;
        const index = (x + y * size) * 4;
        albedoData.data[index] = green * 0.52;
        albedoData.data[index + 1] = green;
        albedoData.data[index + 2] = green * 0.38;
        albedoData.data[index + 3] = 255;
        roughData.data[index] = 240;
        roughData.data[index + 1] = 240;
        roughData.data[index + 2] = 240;
        roughData.data[index + 3] = 255;
        const heightValue = 128 + (blade - 0.5) * 70 + (patch - 0.5) * 40;
        heightData.data[index] = heightValue;
        heightData.data[index + 1] = heightValue;
        heightData.data[index + 2] = heightValue;
        heightData.data[index + 3] = 255;
      }
    }
    albedo.ctx.putImageData(albedoData, 0, 0);
    rough.ctx.putImageData(roughData, 0, 0);
    heightMap.ctx.putImageData(heightData, 0, 0);
    return {
      map: toTexture(albedo.canvas, { srgb: true }),
      roughnessMap: toTexture(rough.canvas),
      normalMap: heightToNormal(heightMap, 0.9),
    };
  });

/**
 * Returns a copy of the set with repeat applied. Textures are cloned (images
 * are shared, so this is cheap) letting different meshes tile independently.
 */
export const withRepeat = (
  set: PbrTextureSet,
  repeatX: number,
  repeatY: number,
): PbrTextureSet => {
  const clone = (texture: THREE.Texture | null) => {
    if (!texture) return null;
    const copy = texture.clone();
    copy.repeat.set(repeatX, repeatY);
    copy.needsUpdate = true;
    return copy;
  };
  return {
    map: clone(set.map),
    roughnessMap: clone(set.roughnessMap),
    normalMap: clone(set.normalMap),
  };
};
