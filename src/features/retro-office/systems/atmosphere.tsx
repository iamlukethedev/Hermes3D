"use client";

// Atmosphere and cinematic rendering systems for the immersive office:
// image-based lighting from a bundled CC0 HDRI sky, a physically-plausible
// sun rig with soft shadows, depth fog, a slow daylight drift, and the
// post-processing chain (ambient occlusion, bloom, vignette, filmic tone
// mapping, SMAA, follow-cam depth of field).

import { Environment } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  N8AO,
  SMAA,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import type { DepthOfFieldEffect } from "postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { GraphicsQualityConfig } from "@/features/retro-office/core/graphicsQuality";
import { WORLD_H, WORLD_W } from "@/features/retro-office/core/constants";

export const OFFICE_ENVIRONMENT_HDR = "/office-assets/env/office_env_1k.hdr";

/** Half-extent of the sun shadow frustum — covers the whole district. */
const SHADOW_EXTENT = Math.max(WORLD_W, WORLD_H) * 0.72;

/** Period of the subtle daylight drift, in seconds. */
const DAYLIGHT_DRIFT_PERIOD = 480;

const SUN_BASE_POSITION = new THREE.Vector3(16, 24, 13);
const SUN_WARM = new THREE.Color("#ffe3bd");
const SUN_NEUTRAL = new THREE.Color("#fff4e4");

/**
 * Slowly drifts the sun between a warm golden tone and neutral daylight so
 * the office feels alive without ever leaving flattering light. Kept subtle
 * on purpose — hard day/night swings fight the fixed HDRI sky.
 */
function DaylightDrift({
  sunRef,
}: {
  sunRef: MutableRefObject<THREE.DirectionalLight | null>;
}) {
  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    const sun = sunRef.current;
    if (!sun) return;
    elapsedRef.current += delta;
    const phase =
      (Math.sin((elapsedRef.current / DAYLIGHT_DRIFT_PERIOD) * Math.PI * 2) + 1) / 2;
    sun.intensity = 2.6 + phase * 0.5;
    sun.color.copy(SUN_WARM).lerp(SUN_NEUTRAL, phase);
    // Sun swings a few degrees across the sky over the drift period.
    const sway = (phase - 0.5) * 6;
    sun.position.set(
      SUN_BASE_POSITION.x + sway,
      SUN_BASE_POSITION.y,
      SUN_BASE_POSITION.z - sway * 0.5,
    );
  });

  return null;
}

export function SceneAtmosphere({ config }: { config: GraphicsQualityConfig }) {
  const sunRef = useRef<THREE.DirectionalLight | null>(null);

  return (
    <>
      {/* Depth fog — pushes the far office into soft haze for scale. */}
      <fog attach="fog" args={["#c3cedb", 58, 165]} />

      {/* Sky + image-based lighting from the bundled CC0 HDRI. */}
      <Suspense fallback={null}>
        <Environment
          files={OFFICE_ENVIRONMENT_HDR}
          background
          backgroundBlurriness={0.04}
          backgroundIntensity={1}
          environmentIntensity={0.62}
          backgroundRotation={[0, Math.PI * 0.85, 0]}
          environmentRotation={[0, Math.PI * 0.85, 0]}
        />
      </Suspense>

      {/* Sky/ground bounce fill. */}
      <hemisphereLight args={["#cfe0f4", "#8a6b4d", 0.5]} />

      {/* Warm key sun with tight, high-resolution soft shadows. */}
      <directionalLight
        ref={sunRef}
        position={SUN_BASE_POSITION.toArray()}
        intensity={2.85}
        color="#ffedd2"
        castShadow
        shadow-mapSize={[config.shadowMapSize, config.shadowMapSize]}
        shadow-bias={-0.00015}
        shadow-normalBias={0.025}
        shadow-radius={4}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />

      {/* Cool sky fill from the opposite side — lifts shadowed faces. */}
      <directionalLight position={[-14, 12, -10]} intensity={0.55} color="#a7c4ef" />

      {/* Vast ground plane so the office sits on land instead of floating in
          the sky — the fog fades it into the horizon. */}
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[420, 48]} />
        <meshStandardMaterial color="#4d5a4a" roughness={1} metalness={0} />
      </mesh>

      <DaylightDrift sunRef={sunRef} />
    </>
  );
}

/**
 * Keeps the depth-of-field focus locked on the followed agent by measuring
 * the camera-to-focus-point distance each frame.
 */
function FollowFocusUpdater({
  dofRef,
  focusPointRef,
}: {
  dofRef: MutableRefObject<DepthOfFieldEffect | null>;
  focusPointRef: MutableRefObject<THREE.Vector3>;
}) {
  useFrame(({ camera }) => {
    const dof = dofRef.current;
    if (!dof) return;
    const distance = camera.position.distanceTo(focusPointRef.current);
    dof.cocMaterial.worldFocusDistance = distance;
  });
  return null;
}

export function ScenePostFx({
  config,
  followActive,
  followFocusPointRef,
}: {
  config: GraphicsQualityConfig;
  followActive: boolean;
  followFocusPointRef: MutableRefObject<THREE.Vector3>;
}) {
  const dofRef = useRef<DepthOfFieldEffect | null>(null);
  const showDof = followActive && config.followDepthOfField;

  if (!config.postProcessing) return null;

  return (
    <>
      {showDof ? (
        <FollowFocusUpdater dofRef={dofRef} focusPointRef={followFocusPointRef} />
      ) : null}
      <EffectComposer multisampling={0}>
        {config.ambientOcclusion ? (
          <N8AO
            halfRes
            depthAwareUpsampling
            quality={config.aoQuality}
            aoRadius={0.5}
            distanceFalloff={0.8}
            intensity={2.4}
          />
        ) : (
          <></>
        )}
        {config.bloom ? (
          <Bloom
            mipmapBlur
            intensity={0.5}
            luminanceThreshold={1.05}
            luminanceSmoothing={0.25}
          />
        ) : (
          <></>
        )}
        {showDof ? (
          <DepthOfField
            ref={dofRef}
            worldFocusDistance={2.2}
            worldFocusRange={1.6}
            bokehScale={4}
            focalLength={0.06}
          />
        ) : (
          <></>
        )}
        <Vignette eskil={false} offset={0.26} darkness={0.55} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        {config.smaa ? <SMAA /> : <></>}
      </EffectComposer>
    </>
  );
}
