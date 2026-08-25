"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { fleetSessionHeaders } from "@/lib/fleet/requestAuth";

/**
 * Custom GLB bodies for agents.
 *
 * Agents are procedural box people by default (see `agents.tsx`). When an agent
 * resolves to a model URL here, that GLB renders instead — inside the same group
 * the movement/facing logic drives, so a custom body still walks, turns, fades
 * out when away and carries its nameplate and speech bubble.
 */

export type ManagedAgentModelSpec = {
  url: string;
  motion: "standing" | "floating";
  fitNode?: string;
  height?: number;
  hover?: number;
};

let managedAvatarMapPromise: Promise<Map<string, ManagedAgentModelSpec>> | null = null;

const loadManagedAvatarMap = () => {
  managedAvatarMapPromise ??= fetch("/api/fleet", {
    cache: "no-store",
    headers: fleetSessionHeaders,
  })
    .then(async (response) => {
      if (!response.ok) return new Map<string, ManagedAgentModelSpec>();
      const payload = (await response.json()) as {
        agents?: Array<{
          id?: string;
          hermes3d?: {
            avatar_asset?: string;
            avatar_motion?: "standing" | "floating";
            avatar_fit_node?: string;
            avatar_height?: number;
            avatar_hover?: number;
          };
        }>;
      };
      const entries = (payload.agents ?? []).flatMap((agent) => {
        const agentId = agent.id?.trim();
        const asset = agent.hermes3d?.avatar_asset?.trim();
        if (!agentId || !asset) return [];
        return [
          [
            agentId,
            {
              url: `/api/fleet/assets/${encodeURIComponent(asset)}`,
              motion: agent.hermes3d?.avatar_motion ?? "standing",
              fitNode: agent.hermes3d?.avatar_fit_node,
              height: agent.hermes3d?.avatar_height,
              hover: agent.hermes3d?.avatar_hover,
            },
          ] as const,
        ];
      });
      return new Map(entries);
    })
    .catch(() => new Map<string, ManagedAgentModelSpec>());
  return managedAvatarMapPromise;
};

export const useManagedAgentModelSpec = (agentId: string) => {
  const [spec, setSpec] = useState<ManagedAgentModelSpec | null>(null);
  useEffect(() => {
    let active = true;
    void loadManagedAvatarMap().then((models) => {
      if (active) setSpec(models.get(agentId) ?? null);
    });
    return () => {
      active = false;
    };
  }, [agentId]);
  return spec;
};

/** Feet to top of hair on the procedural agent, in local units. */
const AGENT_BODY_HEIGHT = 0.62;

const phaseFromSeed = (seed: string) =>
  (seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 628) /
  100;

type AgentGlbBodyProps = {
  /** Agent id — keeps two ghosts from bobbing in lockstep. */
  seed?: string;
  spec: ManagedAgentModelSpec;
};

export function AgentGlbBody({ seed = "", spec }: AgentGlbBodyProps) {
  const { url } = spec;
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);
  const float =
    spec.motion === "floating"
      ? { bob: 0.022, height: spec.height ?? 0.56, hover: spec.hover ?? 0.07, sway: 0.035 }
      : null;
  const phase = useMemo(() => phaseFromSeed(seed), [seed]);

  const model = useMemo(() => {
    // Static model, so a deep clone is enough. A *rigged* GLB would need
    // SkeletonUtils.clone here or the skeleton binding breaks.
    const root = scene.clone(true);

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // AgentModel's away-fade traverse writes material.opacity every frame and
      // clone() shares materials, so give each instance its own copies.
      const processMaterial = (mat: THREE.Material) => {
        const cloned = mat.clone();
        if (cloned instanceof THREE.MeshStandardMaterial) {
          if (cloned.map) {
            cloned.map.colorSpace = THREE.SRGBColorSpace;
            cloned.map.needsUpdate = true;
          }
          cloned.roughness = Math.min(cloned.roughness, 0.65);
          cloned.metalness = Math.max(cloned.metalness, 0.1);
        }
        cloned.needsUpdate = true;
        return cloned;
      };

      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(processMaterial)
        : processMaterial(mesh.material);
    });

    // Fit whatever the exporter produced to agent scale: measure the body,
    // scale to the target height, then drop the origin to the floor (or to the
    // hover height, for models that float).
    root.updateMatrixWorld(true);
    const fitNodeName = spec.fitNode;
    const fitNode =
      (fitNodeName ? root.getObjectByName(fitNodeName) : null) ?? root;
    const box = new THREE.Box3().setFromObject(fitNode);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const fit = (float?.height ?? AGENT_BODY_HEIGHT) / (size.y || 1);

    root.scale.setScalar(fit);
    root.position.set(
      -centre.x * fit,
      -box.min.y * fit + (float?.hover ?? 0),
      -centre.z * fit,
    );
    return root;
  }, [float, scene, spec.fitNode]);

  useFrame(({ clock }) => {
    if (!float || !groupRef.current) return;
    // A ghost has no legs, so it gets its own idle drift instead of the walk
    // cycle the procedural body runs.
    const t = clock.elapsedTime + phase;
    groupRef.current.position.y = Math.sin(t * 1.6) * float.bob;
    groupRef.current.rotation.z = Math.sin(t * 0.9) * float.sway;
  });

  return (
    <group ref={groupRef}>
      <primitive object={model} />
    </group>
  );
}

