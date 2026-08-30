"use client";

import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  type AgentAvatarProfile,
  createDefaultAgentAvatarProfile,
} from "@/lib/avatars/profile";
import { RunningAvatarLoader } from "@/features/agents/components/RunningAvatarLoader";

const PreviewFigure = ({
  profile,
  onFirstFrame,
}: {
  profile: AgentAvatarProfile;
  onFirstFrame: () => void;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const reportedReadyRef = useRef(false);

  useEffect(() => {
    reportedReadyRef.current = false;
  }, [profile]);

  useFrame((state) => {
    if (!reportedReadyRef.current) {
      reportedReadyRef.current = true;
      onFirstFrame();
    }
    if (!groupRef.current) return;
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.35 + 0.25;
  });

  const skin = profile.body.skinTone;
  const topColor = profile.clothing.topColor;
  const bottomColor = profile.clothing.bottomColor;
  const shoeColor = profile.clothing.shoesColor;
  const hairColor = profile.hair.color;
  const accessoryColor = topColor;
  const topStyle = profile.clothing.topStyle;
  const bottomStyle = profile.clothing.bottomStyle;
  const isLongDress = topStyle === "long-dress";
  const isShortDress = topStyle === "short-dress";
  const isDress = isLongDress || isShortDress;
  const sleeveColor = topStyle === "jacket" ? "#dbe4ff" : topColor;
  const cuffColor = topStyle === "hoodie" ? "#d1d5db" : sleeveColor;

  return (
    <group ref={groupRef} position={[0, -0.72, 0]} scale={[1.45, 1.45, 1.45]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.22, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.16} />
      </mesh>

      {profile.accessories.backpack ? (
        <group position={[0, 0.31, -0.08]}>
          <mesh>
            <boxGeometry args={[0.16, 0.2, 0.06]} />
            <meshLambertMaterial color={accessoryColor} />
          </mesh>
        </group>
      ) : null}

      {[-0.05, 0.05].map((x) => (
        <group key={x} position={[x, 0.12, 0]}>
          {isDress || bottomStyle === "long-skirt" || bottomStyle === "mini-skirt" ? (
            <mesh>
              <boxGeometry args={[0.05, 0.14, 0.05]} />
              <meshLambertMaterial color={skin} />
            </mesh>
          ) : bottomStyle === "shorts" ? (
            <>
              <mesh position={[0, 0.03, 0]}>
                <boxGeometry args={[0.07, 0.08, 0.08]} />
                <meshLambertMaterial color={bottomColor} />
              </mesh>
              <mesh position={[0, -0.045, 0]}>
                <boxGeometry args={[0.05, 0.06, 0.05]} />
                <meshLambertMaterial color={skin} />
              </mesh>
            </>
          ) : bottomStyle === "hot-pants" ? (
            <>
              <mesh position={[0, 0.052, 0]}>
                <boxGeometry args={[0.07, 0.04, 0.08]} />
                <meshLambertMaterial color={bottomColor} />
              </mesh>
              <mesh position={[0, -0.025, 0]}>
                <boxGeometry args={[0.05, 0.1, 0.05]} />
                <meshLambertMaterial color={skin} />
              </mesh>
            </>
          ) : (
            <mesh>
              <boxGeometry args={[0.07, 0.14, 0.08]} />
              <meshLambertMaterial color={bottomColor} />
            </mesh>
          )}
          <mesh position={[0, -0.09, 0]}>
            <boxGeometry args={[0.07, 0.05, 0.12]} />
            <meshLambertMaterial color={shoeColor} />
          </mesh>
        </group>
      ))}

      {!isDress && bottomStyle === "long-skirt" ? (
        <mesh position={[0, 0.14, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.085, 0.145, 0.25, 4]} />
          <meshLambertMaterial color={bottomColor} />
        </mesh>
      ) : null}
      {!isDress && bottomStyle === "mini-skirt" ? (
        <mesh position={[0, 0.215, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.09, 0.13, 0.09, 4]} />
          <meshLambertMaterial color={bottomColor} />
        </mesh>
      ) : null}

      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.2, 0.22, 0.1]} />
        <meshLambertMaterial color={topColor} />
      </mesh>
      {isLongDress ? (
        <mesh position={[0, 0.16, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.095, 0.15, 0.28, 4]} />
          <meshLambertMaterial color={topColor} />
        </mesh>
      ) : null}
      {isShortDress ? (
        <mesh position={[0, 0.205, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.095, 0.14, 0.14, 4]} />
          <meshLambertMaterial color={topColor} />
        </mesh>
      ) : null}
      {topStyle === "hoodie" ? (
        <>
          <mesh position={[0, 0.37, -0.045]}>
            <boxGeometry args={[0.18, 0.1, 0.03]} />
            <meshLambertMaterial color={topColor} />
          </mesh>
          <mesh position={[0, 0.23, 0.056]}>
            <boxGeometry args={[0.11, 0.03, 0.012]} />
            <meshLambertMaterial color={cuffColor} />
          </mesh>
        </>
      ) : null}
      {topStyle === "jacket" ? (
        <>
          <mesh position={[0, 0.3, 0.056]}>
            <boxGeometry args={[0.202, 0.23, 0.012]} />
            <meshLambertMaterial color="#1f2937" />
          </mesh>
          <mesh position={[0, 0.3, 0.063]}>
            <boxGeometry args={[0.038, 0.21, 0.01]} />
            <meshLambertMaterial color="#f8fafc" />
          </mesh>
        </>
      ) : null}
      {topStyle === "sweater" ? (
        <>
          <mesh position={[0, 0.395, 0.056]}>
            <boxGeometry args={[0.095, 0.025, 0.012]} />
            <meshLambertMaterial color="#e5e7eb" />
          </mesh>
          <mesh position={[0, 0.205, 0.056]}>
            <boxGeometry args={[0.19, 0.025, 0.012]} />
            <meshLambertMaterial color="#e5e7eb" />
          </mesh>
        </>
      ) : null}
      {topStyle === "shirt" ? (
        <>
          <mesh position={[0, 0.3, 0.057]}>
            <boxGeometry args={[0.018, 0.2, 0.012]} />
            <meshLambertMaterial color="#cbd5e1" />
          </mesh>
          <mesh position={[-0.035, 0.39, 0.058]} rotation={[0, 0, -0.4]}>
            <boxGeometry args={[0.075, 0.025, 0.012]} />
            <meshLambertMaterial color="#f8fafc" />
          </mesh>
          <mesh position={[0.035, 0.39, 0.058]} rotation={[0, 0, 0.4]}>
            <boxGeometry args={[0.075, 0.025, 0.012]} />
            <meshLambertMaterial color="#f8fafc" />
          </mesh>
        </>
      ) : null}

      <group position={[-0.13, 0.3, 0]}>
        <mesh position={[0, -0.08, 0]}>
          <boxGeometry args={[0.06, 0.16, 0.06]} />
          <meshLambertMaterial color={sleeveColor} />
        </mesh>
        {topStyle === "hoodie" || topStyle === "sweater" ? (
          <mesh position={[0, -0.145, 0]}>
            <boxGeometry args={[0.064, 0.03, 0.064]} />
            <meshLambertMaterial color={cuffColor} />
          </mesh>
        ) : null}
        <mesh position={[0, -0.17, 0]}>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshLambertMaterial color={skin} />
        </mesh>
      </group>
      <group position={[0.13, 0.3, 0]}>
        <mesh position={[0, -0.08, 0]}>
          <boxGeometry args={[0.06, 0.16, 0.06]} />
          <meshLambertMaterial color={sleeveColor} />
        </mesh>
        {topStyle === "hoodie" || topStyle === "sweater" ? (
          <mesh position={[0, -0.145, 0]}>
            <boxGeometry args={[0.064, 0.03, 0.064]} />
            <meshLambertMaterial color={cuffColor} />
          </mesh>
        ) : null}
        <mesh position={[0, -0.17, 0]}>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshLambertMaterial color={skin} />
        </mesh>
      </group>

      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.07, 0.05, 0.07]} />
        <meshLambertMaterial color={skin} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.17, 0.17, 0.15]} />
        <meshLambertMaterial color={skin} />
      </mesh>

      {profile.hair.style === "short" ? (
        <mesh position={[0, 0.59, 0]}>
          <boxGeometry args={[0.18, 0.05, 0.15]} />
          <meshLambertMaterial color={hairColor} />
        </mesh>
      ) : null}
      {profile.hair.style === "parted" ? (
        <>
          <mesh position={[0, 0.585, 0]}>
            <boxGeometry args={[0.18, 0.045, 0.15]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          <mesh position={[-0.03, 0.62, 0.01]} rotation={[0.1, 0, -0.2]}>
            <boxGeometry args={[0.12, 0.03, 0.08]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
        </>
      ) : null}
      {profile.hair.style === "spiky" ? (
        <>
          <mesh position={[0, 0.58, 0]}>
            <boxGeometry args={[0.17, 0.035, 0.14]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          <mesh position={[-0.05, 0.62, 0]} rotation={[0, 0, -0.2]}>
            <boxGeometry args={[0.04, 0.06, 0.04]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          <mesh position={[0, 0.635, 0]}>
            <boxGeometry args={[0.04, 0.08, 0.04]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          <mesh position={[0.05, 0.62, 0]} rotation={[0, 0, 0.2]}>
            <boxGeometry args={[0.04, 0.06, 0.04]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
        </>
      ) : null}
      {profile.hair.style === "bun" ? (
        <>
          <mesh position={[0, 0.58, 0]}>
            <boxGeometry args={[0.18, 0.04, 0.15]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          <mesh position={[0, 0.63, -0.03]}>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
        </>
      ) : null}
      {profile.hair.style === "long" ? (
        <>
          <mesh position={[0, 0.58, -0.025]}>
            <boxGeometry args={[0.18, 0.05, 0.16]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          <mesh position={[0, 0.46, -0.075]}>
            <boxGeometry args={[0.17, 0.25, 0.045]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          {[-0.09, 0.09].map((x) => (
            <mesh key={x} position={[x, 0.47, 0.005]}>
              <boxGeometry args={[0.035, 0.22, 0.07]} />
              <meshLambertMaterial color={hairColor} />
            </mesh>
          ))}
        </>
      ) : null}
      {profile.hair.style === "bob" ? (
        <>
          <mesh position={[0, 0.58, 0]}>
            <boxGeometry args={[0.18, 0.05, 0.15]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          {[-0.095, 0.095].map((x) => (
            <mesh key={x} position={[x, 0.515, 0]}>
              <boxGeometry args={[0.035, 0.13, 0.15]} />
              <meshLambertMaterial color={hairColor} />
            </mesh>
          ))}
        </>
      ) : null}
      {profile.hair.style === "twin-tails" ? (
        <>
          <mesh position={[0, 0.58, 0]}>
            <boxGeometry args={[0.18, 0.05, 0.15]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          {[-0.125, 0.125].map((x) => (
            <group key={x} position={[x, 0.51, -0.01]}>
              <mesh position={[0, 0.06, 0]}>
                <sphereGeometry args={[0.04, 12, 12]} />
                <meshLambertMaterial color={hairColor} />
              </mesh>
              <mesh position={[0, -0.045, 0]}>
                <boxGeometry args={[0.055, 0.18, 0.06]} />
                <meshLambertMaterial color={hairColor} />
              </mesh>
            </group>
          ))}
        </>
      ) : null}
      {profile.hair.style === "ponytail" ? (
        <>
          <mesh position={[0, 0.58, 0]}>
            <boxGeometry args={[0.18, 0.05, 0.15]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          <mesh position={[0, 0.565, -0.105]}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          <mesh position={[0, 0.46, -0.12]} rotation={[0.15, 0, 0]}>
            <boxGeometry args={[0.06, 0.2, 0.06]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
        </>
      ) : null}
      {profile.hair.style === "long-wave" ? (
        <>
          <mesh position={[0, 0.58, -0.02]}>
            <boxGeometry args={[0.18, 0.05, 0.16]} />
            <meshLambertMaterial color={hairColor} />
          </mesh>
          {[-0.095, 0.095].flatMap((x) =>
            [0.52, 0.44, 0.36].map((y, index) => (
              <mesh
                key={`${x}-${y}`}
                position={[x + (index % 2 === 0 ? -0.008 : 0.008) * Math.sign(x), y, -0.015]}
                rotation={[0, 0, (index % 2 === 0 ? 0.12 : -0.12) * Math.sign(x)]}
              >
                <boxGeometry args={[0.045, 0.1, 0.07]} />
                <meshLambertMaterial color={hairColor} />
              </mesh>
            )),
          )}
        </>
      ) : null}

      {profile.accessories.hatStyle === "cap" ? (
        <>
          <mesh position={[0, 0.63, 0]}>
            <boxGeometry args={[0.18, 0.03, 0.16]} />
            <meshLambertMaterial color={accessoryColor} />
          </mesh>
          <mesh position={[0, 0.615, 0.07]}>
            <boxGeometry args={[0.09, 0.012, 0.05]} />
            <meshLambertMaterial color={accessoryColor} />
          </mesh>
        </>
      ) : null}
      {profile.accessories.hatStyle === "beanie" ? (
        <mesh position={[0, 0.63, 0]}>
          <boxGeometry args={[0.19, 0.06, 0.17]} />
          <meshLambertMaterial color={accessoryColor} />
        </mesh>
      ) : null}

      {profile.accessories.headset ? (
        <>
          <mesh position={[0, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.095, 0.008, 8, 24, Math.PI]} />
            <meshLambertMaterial color="#94a3b8" />
          </mesh>
          <mesh position={[-0.105, 0.51, 0]}>
            <boxGeometry args={[0.018, 0.05, 0.028]} />
            <meshLambertMaterial color="#475569" />
          </mesh>
          <mesh position={[0.105, 0.51, 0]}>
            <boxGeometry args={[0.018, 0.05, 0.028]} />
            <meshLambertMaterial color="#475569" />
          </mesh>
        </>
      ) : null}

      <mesh position={[-0.04, 0.505, 0.078]}>
        <boxGeometry args={[0.03, 0.03, 0.01]} />
        <meshBasicMaterial color="#111827" />
      </mesh>
      <mesh position={[0.04, 0.505, 0.078]}>
        <boxGeometry args={[0.03, 0.03, 0.01]} />
        <meshBasicMaterial color="#111827" />
      </mesh>
      {profile.accessories.glasses ? (
        <>
          <mesh position={[-0.04, 0.505, 0.084]}>
            <boxGeometry args={[0.05, 0.05, 0.01]} />
            <meshBasicMaterial color="#111827" wireframe />
          </mesh>
          <mesh position={[0.04, 0.505, 0.084]}>
            <boxGeometry args={[0.05, 0.05, 0.01]} />
            <meshBasicMaterial color="#111827" wireframe />
          </mesh>
          <mesh position={[0, 0.505, 0.084]}>
            <boxGeometry args={[0.02, 0.008, 0.01]} />
            <meshBasicMaterial color="#111827" />
          </mesh>
        </>
      ) : null}
      <mesh position={[0, 0.46, 0.079]}>
        <boxGeometry args={[0.05, 0.014, 0.01]} />
        <meshBasicMaterial color="#9c4a4a" />
      </mesh>
    </group>
  );
};

export const AgentAvatarPreview3D = ({
  profile,
  className = "",
}: {
  profile: AgentAvatarProfile | null | undefined;
  className?: string;
}) => {
  const resolvedProfile = useMemo(
    () => profile ?? createDefaultAgentAvatarProfile("preview"),
    [profile]
  );
  const profileKey = useMemo(() => JSON.stringify(resolvedProfile), [resolvedProfile]);
  const [readyProfileKey, setReadyProfileKey] = useState<string | null>(null);
  const isReady = readyProfileKey === profileKey;

  return (
    <div className={`relative ${className}`}>
      {!isReady ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#070b16] text-white/70">
          <RunningAvatarLoader size={26} trackWidth={72} label="Loading avatar..." />
        </div>
      ) : null}
      <Canvas key={profileKey} camera={{ position: [0, 0.7, 2.5], fov: 34 }}>
        <color attach="background" args={["#070b16"]} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[3, 4, 5]} intensity={2.4} />
        <directionalLight position={[-4, 2, 3]} intensity={0.9} color="#89a6ff" />
        <PreviewFigure
          profile={resolvedProfile}
          onFirstFrame={() => {
            setReadyProfileKey(profileKey);
          }}
        />
        <Environment preset="city" />
        <OrbitControls enablePan={false} enableZoom={false} maxPolarAngle={1.8} minPolarAngle={1.1} />
      </Canvas>
    </div>
  );
};
