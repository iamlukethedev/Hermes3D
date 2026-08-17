"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float,
  OrbitControls,
  Stars,
  MeshDistortMaterial,
} from "@react-three/drei";
import type { Group, Mesh } from "three";

export type ShapeKind = "icosahedron" | "torusKnot" | "dodecahedron";

type SceneProps = {
  shape: ShapeKind;
  color: string;
  wireframe: boolean;
  autoRotate: boolean;
};

// Renders the geometry currently selected by the user.
function ShapeGeometry({ shape }: { shape: ShapeKind }) {
  switch (shape) {
    case "torusKnot":
      return <torusKnotGeometry args={[0.9, 0.3, 220, 32]} />;
    case "dodecahedron":
      return <dodecahedronGeometry args={[1.4, 0]} />;
    case "icosahedron":
    default:
      return <icosahedronGeometry args={[1.5, 4]} />;
  }
}

function HeroShape({ shape, color, wireframe, autoRotate }: SceneProps) {
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (autoRotate && meshRef.current) {
      meshRef.current.rotation.y += delta * 0.35;
      meshRef.current.rotation.x += delta * 0.12;
    }
  });

  return (
    <Float speed={1.4} rotationIntensity={0.6} floatIntensity={0.8}>
      <mesh ref={meshRef} castShadow>
        <ShapeGeometry shape={shape} />
        <MeshDistortMaterial
          color={color}
          roughness={0.15}
          metalness={0.6}
          distort={wireframe ? 0 : 0.32}
          speed={2}
          wireframe={wireframe}
        />
      </mesh>
    </Float>
  );
}

// A ring of small satellites orbiting the hero shape.
function Satellites({ color }: { color: string }) {
  const groupRef = useRef<Group>(null);

  const satellites = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 3.2;
        return {
          key: i,
          position: [
            Math.cos(angle) * radius,
            Math.sin(angle * 1.5) * 0.6,
            Math.sin(angle) * radius,
          ] as const,
        };
      }),
    [],
  );

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y -= delta * 0.15;
    }
  });

  return (
    <group ref={groupRef}>
      {satellites.map((s) => (
        <mesh key={s.key} position={s.position}>
          <octahedronGeometry args={[0.18, 0]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
            roughness={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function Hermes3DScene(props: SceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 0, 6], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#05060a"]} />
      <fog attach="fog" args={["#05060a", 8, 18]} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.6} castShadow />
      <pointLight position={[-6, -3, -4]} intensity={40} color="#ec4899" />
      <pointLight position={[6, 4, 2]} intensity={30} color="#5865f2" />

      <HeroShape {...props} />
      <Satellites color={props.color} />

      <Stars radius={60} depth={40} count={2500} factor={4} fade speed={1} />

      <OrbitControls
        enablePan={false}
        minDistance={3.5}
        maxDistance={12}
        autoRotate={props.autoRotate}
        autoRotateSpeed={0.6}
      />
    </Canvas>
  );
}
