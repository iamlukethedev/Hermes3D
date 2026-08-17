"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { ShapeKind } from "@/components/Hermes3DScene";

// The scene relies on WebGL, so it only renders on the client.
const Hermes3DScene = dynamic(() => import("@/components/Hermes3DScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-white/50">
      Loading 3D scene…
    </div>
  ),
});

const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: "icosahedron", label: "Icosahedron" },
  { id: "torusKnot", label: "Torus Knot" },
  { id: "dodecahedron", label: "Dodecahedron" },
];

const COLORS = ["#5865f2", "#ec4899", "#22d3ee", "#f59e0b", "#a3e635"];

export default function Home() {
  const [shape, setShape] = useState<ShapeKind>("icosahedron");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);

  return (
    <main className="hermes-backdrop relative h-dvh w-full overflow-hidden">
      <div className="absolute inset-0" data-testid="scene-canvas">
        <Hermes3DScene
          shape={shape}
          color={color}
          wireframe={wireframe}
          autoRotate={autoRotate}
        />
      </div>

      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 16px ${color}` }}
          />
          <span className="font-mono text-lg font-semibold tracking-tight">
            Hermes<span className="text-white/50">3D</span>
          </span>
        </div>
        <span className="hidden font-mono text-xs text-white/40 sm:block">
          Next.js · React Three Fiber · WebGL
        </span>
      </header>

      {/* Title block */}
      <div className="pointer-events-none absolute inset-x-0 top-24 flex flex-col items-center px-6 text-center sm:top-28">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Interactive 3D, right in the browser
        </h1>
        <p className="mt-4 max-w-md text-sm text-white/60 sm:text-base">
          Drag to orbit · scroll to zoom · use the panel to reshape the scene.
        </p>
      </div>

      {/* Control panel */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-4 sm:p-6">
        <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          {/* Shape selector */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-widest text-white/40">
              Geometry
            </span>
            <div className="flex flex-wrap gap-2">
              {SHAPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setShape(s.id)}
                  aria-pressed={shape === s.id}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    shape === s.id
                      ? "bg-white text-black"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color selector */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-widest text-white/40">
              Color
            </span>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Set color ${c}`}
                  aria-pressed={color === c}
                  className={`h-7 w-7 rounded-full ring-2 transition-transform hover:scale-110 ${
                    color === c ? "ring-white" : "ring-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-widest text-white/40">
              Options
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setWireframe((v) => !v)}
                aria-pressed={wireframe}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  wireframe
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                Wireframe
              </button>
              <button
                type="button"
                onClick={() => setAutoRotate((v) => !v)}
                aria-pressed={autoRotate}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  autoRotate
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                Auto-rotate
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
