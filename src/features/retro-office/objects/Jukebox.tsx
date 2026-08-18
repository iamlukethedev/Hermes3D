"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { SCALE } from "@/features/retro-office/core/constants";
import {
  getItemBaseSize,
  getItemRotationRadians,
  toWorld,
} from "@/features/retro-office/core/geometry";
import { getBrushedMetalTextures } from "@/features/retro-office/core/proceduralTextures";
import type { InteractiveFurnitureModelProps } from "@/features/retro-office/objects/types";

export type JukeboxModelProps = InteractiveFurnitureModelProps & {
  active?: boolean;
  /** False when the soundhermes skill is not installed. */
  enabled?: boolean;
};

const C = {
  cabinet: "#10a897",
  cabinetDark: "#12867b",
  metal: "#e9edf3",
  metalDark: "#a0aec0",
  neon: "#FF1493",
  neonActive: "#00FF00",
  display: "#042f2e",
  displayText: "#00FF00",
  record: "#1a1a1a",
  recordLabel: "#FF1493",
};

const BUTTON_COLORS = ["#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#FF00FF"];

export function JukeboxModel({
  item,
  isSelected,
  isHovered,
  active = false,
  enabled = true,
  onPointerDown,
  onPointerOver,
  onPointerOut,
  onClick,
}: JukeboxModelProps) {
  const [localHovered, setLocalHovered] = useState(false);
  const recordRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  const metal = useMemo(() => getBrushedMetalTextures(), []);

  const [wx, , wz] = toWorld(item.x, item.y);
  const { width, height } = getItemBaseSize(item);
  const rotY = getItemRotationRadians(item);

  // Scale the model so it fills the furniture footprint.
  const scaleX = (width * SCALE) / 0.9;
  const scaleZ = (height * SCALE) / 0.7;

  const highlighted = isSelected || isHovered;
  const playing = active && enabled;

  // When the skill isn't installed, desaturate everything to grey.
  const tint = (enabledColor: string, disabledColor: string) =>
    enabled ? enabledColor : disabledColor;

  useFrame((_state, delta) => {
    if (recordRef.current) {
      recordRef.current.rotation.y += playing ? delta * 2 : delta * 0.3;
    }
    if (glowRef.current && playing) {
      const pulse = Math.sin(_state.clock.elapsedTime * 4) * 0.3 + 0.7;
      glowRef.current.intensity = pulse * 2;
    }
  });

  return (
    <group
      position={[wx, 0, wz]}
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(item._uid); }}
      onPointerOver={(e) => { e.stopPropagation(); setLocalHovered(true); onPointerOver(item._uid); document.body.style.cursor = "pointer"; }}
      onPointerOut={(e) => { e.stopPropagation(); setLocalHovered(false); onPointerOut(); document.body.style.cursor = ""; }}
      onClick={(e) => { e.stopPropagation(); onClick?.(item._uid); }}
    >
      <group rotation={[0, rotY, 0]} scale={[scaleX, 1, scaleZ]}>

        {/* Main cabinet body — glossy lacquered finish. */}
        <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 1.2, 0.6]} />
          <meshPhysicalMaterial
            color={tint(highlighted ? "#12ab9e" : C.cabinet, highlighted ? "#5f5f5f" : "#4d4d4d")}
            roughness={0.35}
            metalness={0.1}
            clearcoat={0.6}
            clearcoatRoughness={0.15}
          />
        </mesh>

        {/* Cabinet top dome (tapered cylinder). */}
        <mesh position={[0, 1.4, 0]} castShadow>
          <cylinderGeometry args={[0.45, 0.5, 0.2, 32]} />
          <meshPhysicalMaterial
            color={tint(C.cabinetDark, "#3a3a3a")}
            roughness={0.35}
            metalness={0.15}
            clearcoat={0.6}
            clearcoatRoughness={0.15}
          />
        </mesh>

        {/* Chrome dome cap. */}
        <mesh position={[0, 1.55, 0]} castShadow>
          <sphereGeometry args={[0.15, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={tint(C.metal, "#707070")} roughness={0.08} metalness={0.95} />
        </mesh>

        {/* Neon trim: vertical side strips plus a header strip framing the front. */}
        {[-0.37, 0.37].map((x) => (
          <mesh key={x} position={[x, 0.75, 0.302]}>
            <boxGeometry args={[0.02, 1.15, 0.005]} />
            <meshStandardMaterial
              color={tint(playing ? C.neonActive : C.neon, "#3a3a3a")}
              emissive={enabled ? (playing ? C.neonActive : C.neon) : "#333"}
              emissiveIntensity={enabled ? (playing ? 3.0 : 1.4) : 0.05}
            />
          </mesh>
        ))}
        <mesh position={[0, 1.32, 0.302]}>
          <boxGeometry args={[0.72, 0.02, 0.005]} />
          <meshStandardMaterial
            color={tint(playing ? C.neonActive : C.neon, "#3a3a3a")}
            emissive={enabled ? (playing ? C.neonActive : C.neon) : "#333"}
            emissiveIntensity={enabled ? (playing ? 3.0 : 1.4) : 0.05}
          />
        </mesh>

        {/* Display screen. */}
        <mesh position={[0, 1.1, 0.31]}>
          <planeGeometry args={[0.6, 0.35]} />
          <meshStandardMaterial
            color={tint(C.display, "#1a1a1a")}
            emissive={enabled ? (playing ? C.neonActive : C.neon) : "#333"}
            emissiveIntensity={
              enabled ? (playing ? 2.2 : localHovered || isHovered ? 2.0 : 1.6) : 0.08
            }
          />
        </mesh>

        {/* Subtle glass overlay in front of the display. */}
        <mesh position={[0, 1.1, 0.313]}>
          <planeGeometry args={[0.62, 0.37]} />
          <meshPhysicalMaterial
            color="#ffffff"
            transparent
            opacity={0.15}
            roughness={0.05}
            metalness={0}
          />
        </mesh>

        {/* Track status / disabled text on display. */}
        <Billboard position={[0, 1.1, 0.32]} follow={false}>
          <Text
            fontSize={0.07}
            color={enabled ? C.displayText : "#666"}
            anchorX="center"
            anchorY="middle"
            maxWidth={0.55}
            textAlign="center"
          >
            {enabled ? (playing ? "♪  NOW PLAYING" : "SOUNDHERMES") : "NOT INSTALLED"}
          </Text>
        </Billboard>

        {/* Speaker grill (replaces record slot). */}
        <mesh position={[0, 0.7, 0.31]}>
          <planeGeometry args={[0.52, 0.38]} />
          <meshStandardMaterial color="#042f2e" roughness={0.9} metalness={0.1} />
        </mesh>
        {/* Horizontal grill lines — chrome. */}
        {[-0.14, -0.07, 0, 0.07, 0.14].map((y) => (
          <mesh key={y} position={[0, 0.7 + y, 0.315]}>
            <boxGeometry args={[0.48, 0.01, 0.005]} />
            <meshStandardMaterial color={C.metal} metalness={0.95} roughness={0.08} />
          </mesh>
        ))}

        {/* Spinning vinyl disc (small, subtle). */}
        <mesh
          ref={recordRef}
          position={[0, 0.75, 0.315]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.1, 0.1, 0.008, 32]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Record label. */}
        <mesh position={[0, 0.75, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.04, 32]} />
          <meshStandardMaterial color={C.recordLabel} emissive={C.neon} emissiveIntensity={playing ? 2.4 : 0.6} />
        </mesh>

        {/* Coloured selection buttons (grey when disabled). */}
        <group position={[0, 0.5, 0.31]}>
          {BUTTON_COLORS.map((color, i) => (
            <mesh key={i} position={[-0.15 + i * 0.075, 0, 0.01]}>
              <cylinderGeometry args={[0.025, 0.025, 0.02, 16]} />
              <meshStandardMaterial
                color={enabled ? color : "#555"}
                emissive={enabled ? color : "#222"}
                emissiveIntensity={enabled ? 1.8 : 0.05}
              />
            </mesh>
          ))}
        </group>

        {/* Side grilles (brushed metal, translucent). */}
        <mesh position={[-0.35, 0.75, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.8, 0.6]} />
          <meshStandardMaterial
            color={tint(C.metalDark, "#3a3a3a")}
            map={metal.map}
            roughnessMap={metal.roughnessMap}
            metalness={0.7}
            transparent
            opacity={0.8}
          />
        </mesh>
        <mesh position={[0.35, 0.75, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.8, 0.6]} />
          <meshStandardMaterial
            color={tint(C.metalDark, "#3a3a3a")}
            map={metal.map}
            roughnessMap={metal.roughnessMap}
            metalness={0.7}
            transparent
            opacity={0.8}
          />
        </mesh>

        {/* Base plinth — lacquered to match the cabinet. */}
        <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.9, 0.1, 0.7]} />
          <meshPhysicalMaterial
            color={tint(C.cabinetDark, "#2f2f2f")}
            roughness={0.4}
            metalness={0.1}
            clearcoat={0.6}
            clearcoatRoughness={0.2}
          />
        </mesh>

        {/* Floating "Install skill" hint above the machine when disabled and hovered. */}
        {!enabled && (localHovered || isHovered) && (
          <Billboard position={[0, 2.0, 0]} follow={false}>
            <Text fontSize={0.07} color="#facc15" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000">
              Click to install SOUNDHERMES
            </Text>
          </Billboard>
        )}

        {/* Green point light when a song is playing. */}
        {playing && (
          <pointLight
            ref={glowRef}
            position={[0, 1.2, 0.5]}
            color={C.neonActive}
            intensity={1}
            distance={3}
          />
        )}

        {/* Green hover indicator dot above the machine. */}
        {(localHovered || isHovered) && (
          <mesh position={[0, 1.68, 0]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshStandardMaterial color="#00FF00" emissive="#00FF00" emissiveIntensity={2} />
          </mesh>
        )}

        {/* Selection highlight ring when selected. */}
        {isSelected && (
          <mesh position={[0, 0.75, 0]}>
            <torusGeometry args={[0.52, 0.03, 12, 48]} />
            <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={1} />
          </mesh>
        )}
      </group>
    </group>
  );
}
