"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import {
  DISTRICT_CAMERA_POSITION,
  DISTRICT_CAMERA_TARGET,
  DISTRICT_CAMERA_ZOOM,
} from "@/features/retro-office/core/district";
import { toWorld } from "@/features/retro-office/core/geometry";
import type { RenderAgent } from "@/features/retro-office/core/types";

/** Vertical field of view for the cinematic overview camera. */
export const SCENE_CAMERA_FOV = 40;

/** Field of view for the third-person follow camera. */
export const FOLLOW_CAMERA_FOV = 58;

/**
 * Reference viewport height used when converting legacy orthographic zoom
 * values into perspective camera distances before the real size is known.
 */
const REFERENCE_VIEWPORT_HEIGHT = 900;

/**
 * Camera presets still carry the legacy orthographic `zoom` (pixels per world
 * unit). For the perspective camera we convert it into a distance that frames
 * the same world-space height at the preset target, so every existing fly-to
 * preset keeps its intended framing.
 */
export const orthoZoomToDistance = (
  zoom: number,
  viewportHeight: number = REFERENCE_VIEWPORT_HEIGHT,
  fovDegrees: number = SCENE_CAMERA_FOV,
) => {
  const visibleHeight = viewportHeight / zoom;
  return visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDegrees / 2)));
};

const DEFAULT_VIEW_DIRECTION = new THREE.Vector3(
  DISTRICT_CAMERA_POSITION[0] - DISTRICT_CAMERA_TARGET[0],
  DISTRICT_CAMERA_POSITION[1] - DISTRICT_CAMERA_TARGET[1],
  DISTRICT_CAMERA_POSITION[2] - DISTRICT_CAMERA_TARGET[2],
).normalize();

/**
 * Computes the overview camera position for a target point and a legacy
 * orthographic zoom, along the canonical isometric view direction.
 */
export const computeOverviewCameraPosition = (
  target: [number, number, number],
  zoom: number,
): [number, number, number] => {
  const distance = orthoZoomToDistance(zoom);
  return [
    target[0] + DEFAULT_VIEW_DIRECTION.x * distance,
    target[1] + DEFAULT_VIEW_DIRECTION.y * distance,
    target[2] + DEFAULT_VIEW_DIRECTION.z * distance,
  ];
};

export type CameraPreset = {
  pos: [number, number, number];
  target: [number, number, number];
  zoom?: number;
};

export const CAMERA_PRESETS = {
  overview: {
    pos: DISTRICT_CAMERA_POSITION,
    target: DISTRICT_CAMERA_TARGET,
    zoom: DISTRICT_CAMERA_ZOOM,
  },
  frontDesk: {
    pos: [-2, 8, 4],
    target: [-3, 0, -2],
    zoom: 70,
  },
  lounge: {
    pos: [7, 7, -5],
    target: [5, 0, -3],
    zoom: 62,
  },
} satisfies Record<string, CameraPreset>;

type OrbitControllerLike = {
  target: THREE.Vector3;
  update: () => void;
};

export function CameraAnimator({
  presetRef,
  orbitRef,
}: {
  presetRef: MutableRefObject<CameraPreset | null>;
  orbitRef: RefObject<OrbitControllerLike | null>;
}) {
  const { camera, size } = useThree();
  const targetPositionRef = useRef(new THREE.Vector3());
  const targetLookAtRef = useRef(new THREE.Vector3());
  const directionRef = useRef(new THREE.Vector3());

  useFrame(() => {
    const preset = presetRef.current;
    const orbit = orbitRef.current;
    if (!preset || !orbit) return;

    targetLookAtRef.current.set(...preset.target);
    targetPositionRef.current.set(...preset.pos);

    if (typeof preset.zoom === "number" && preset.zoom > 0) {
      // Re-project the preset position so the perspective camera frames the
      // same world height the old orthographic zoom described.
      directionRef.current
        .copy(targetPositionRef.current)
        .sub(targetLookAtRef.current);
      if (directionRef.current.lengthSq() < 1e-6) {
        directionRef.current.copy(DEFAULT_VIEW_DIRECTION);
      } else {
        directionRef.current.normalize();
      }
      const fov =
        camera instanceof THREE.PerspectiveCamera ? camera.fov : SCENE_CAMERA_FOV;
      const distance = orthoZoomToDistance(preset.zoom, size.height, fov);
      targetPositionRef.current
        .copy(targetLookAtRef.current)
        .addScaledVector(directionRef.current, distance);
    }

    camera.position.lerp(targetPositionRef.current, 0.06);
    orbit.target.lerp(targetLookAtRef.current, 0.06);
    orbit.update();

    if (camera.position.distanceTo(targetPositionRef.current) < 0.05) {
      presetRef.current = null;
    }
  });

  return null;
}

export function FollowCamController({
  followRef,
  agentsRef,
  agentLookupRef,
  focusPointRef,
}: {
  followRef: MutableRefObject<string | null>;
  agentsRef: RefObject<RenderAgent[]>;
  agentLookupRef?: RefObject<Map<string, RenderAgent>>;
  /** Optional out-param: receives the followed agent's world-space focus point. */
  focusPointRef?: MutableRefObject<THREE.Vector3>;
}) {
  const { camera, set, size, gl } = useThree();
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const originalCameraRef = useRef<THREE.PerspectiveCamera | null>(
    camera instanceof THREE.PerspectiveCamera ? camera : null,
  );
  const wasFollowingRef = useRef(false);
  const lastAgentIdRef = useRef<string | null>(null);
  const thetaRef = useRef(0);
  const phiRef = useRef(Math.PI / 6);
  const radiusRef = useRef(2.0);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const cameraPositionRef = useRef(new THREE.Vector3());
  const lookAtRef = useRef(new THREE.Vector3());

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera && !wasFollowingRef.current) {
      originalCameraRef.current = camera;
    }
  }, [camera]);

  useEffect(() => {
    const element = gl.domElement;

    const handleMouseDown = (event: MouseEvent) => {
      if (!followRef.current || event.button !== 0) return;
      isDraggingRef.current = true;
      lastMouseRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = event.clientX - lastMouseRef.current.x;
      const dy = event.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: event.clientX, y: event.clientY };
      thetaRef.current -= dx * 0.006;
      phiRef.current = Math.max(
        0.05,
        Math.min(Math.PI / 2.2, phiRef.current + dy * 0.006),
      );
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (event: WheelEvent) => {
      if (!followRef.current) return;
      radiusRef.current = Math.max(
        0.8,
        Math.min(10, radiusRef.current + event.deltaY * 0.005),
      );
    };

    element.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    element.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      element.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      element.removeEventListener("wheel", handleWheel);
    };
  }, [gl, followRef]);

  useFrame(() => {
    const agentId = followRef.current;
    const isFollowing = agentId !== null;

    if (isFollowing && !wasFollowingRef.current) {
      const agent =
        (agentId ? agentLookupRef?.current?.get(agentId) : undefined) ??
        agentsRef.current?.find((candidate) => candidate.id === agentId);
      if (!agent) return;

      if (!perspectiveCameraRef.current) {
        perspectiveCameraRef.current = new THREE.PerspectiveCamera(
          FOLLOW_CAMERA_FOV,
          size.width / size.height,
          0.1,
          300,
        );
      }

      thetaRef.current = agent.facing + Math.PI;
      lastAgentIdRef.current = agentId;
      set({ camera: perspectiveCameraRef.current });
      wasFollowingRef.current = true;
    }

    if (!isFollowing && wasFollowingRef.current) {
      if (originalCameraRef.current) {
        set({ camera: originalCameraRef.current });
      }
      wasFollowingRef.current = false;
      return;
    }

    if (!isFollowing || !perspectiveCameraRef.current) return;

    const agent =
      (agentId ? agentLookupRef?.current?.get(agentId) : undefined) ??
      agentsRef.current?.find((candidate) => candidate.id === agentId);
    if (!agent) return;

    if (agentId !== lastAgentIdRef.current) {
      thetaRef.current = agent.facing + Math.PI;
      lastAgentIdRef.current = agentId;
    }

    const [wx, , wz] = toWorld(agent.x, agent.y);
    const radius = radiusRef.current;
    const theta = thetaRef.current;
    const phi = phiRef.current;

    cameraPositionRef.current.set(
      wx + radius * Math.sin(phi) * Math.sin(theta),
      0.4 + radius * Math.cos(phi),
      wz + radius * Math.sin(phi) * Math.cos(theta),
    );
    perspectiveCameraRef.current.position.copy(cameraPositionRef.current);

    lookAtRef.current.set(wx, 0.5, wz);
    if (focusPointRef) focusPointRef.current.copy(lookAtRef.current);
    perspectiveCameraRef.current.lookAt(lookAtRef.current);
    perspectiveCameraRef.current.aspect = size.width / size.height;
    perspectiveCameraRef.current.updateProjectionMatrix();
  });

  return null;
}
