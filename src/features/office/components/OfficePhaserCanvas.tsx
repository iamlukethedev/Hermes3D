"use client";

import { useEffect, useRef } from "react";

import {
  createOfficeSceneBridge,
  type OfficeDebugSettings,
  type OfficeRuntimeSettings,
} from "@/features/office/phaser/OfficeSceneBridge";
import { createOfficeBuilderScene } from "@/features/office/phaser/OfficeBuilderScene";
import { createOfficeViewerScene } from "@/features/office/phaser/OfficeViewerScene";
import type { OfficeAgentPresence } from "@/lib/office/presence";
import type { OfficeMap } from "@/lib/office/schema";

type OfficePhaserCanvasProps = {
  mode: "viewer" | "builder";
  map: OfficeMap;
  presence: OfficeAgentPresence[];
  debug: OfficeDebugSettings;
  runtime: OfficeRuntimeSettings;
  onObjectMoved?: (id: string, x: number, y: number) => void;
  onSelectionChange?: (ids: string[]) => void;
};

export function OfficePhaserCanvas(props: OfficePhaserCanvasProps) {
  const { debug, map, mode, onObjectMoved, onSelectionChange, presence, runtime } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);
  const bridgeRef = useRef<ReturnType<typeof createOfficeSceneBridge> | null>(null);
  if (!bridgeRef.current) {
    bridgeRef.current = createOfficeSceneBridge({
      map,
      presence,
      debug,
      runtime,
    });
  }
  const bridge = bridgeRef.current;

  useEffect(() => {
    bridge.setState({
      map,
      presence,
      debug,
      runtime,
    });
  }, [bridge, debug, map, presence, runtime]);

  useEffect(() => {
    let canceled = false;
    const setup = async () => {
      if (!rootRef.current) return;
      const PhaserLib = await import("phaser");
      if (canceled || !rootRef.current) return;
      const scene =
        mode === "builder"
          ? createOfficeBuilderScene({
              PhaserLib,
              bridge,
              onObjectMoved,
              onSelectionChange,
            })
          : createOfficeViewerScene({ PhaserLib, bridge });
      const game = new PhaserLib.Game({
        type: PhaserLib.CANVAS,
        parent: rootRef.current,
        backgroundColor: "transparent",
        width: map.canvas.width || 960,
        height: map.canvas.height || 640,
        scene: [scene],
        render: {
          antialias: true,
          pixelArt: true,
          transparent: true,
        },
        scale: {
          mode: PhaserLib.Scale.FIT,
          autoCenter: PhaserLib.Scale.CENTER_BOTH,
          width: map.canvas.width || 960,
          height: map.canvas.height || 640,
        },
      });
      gameRef.current = game;
    };
    void setup();
    return () => {
      canceled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [bridge, map.canvas.height, map.canvas.width, mode, onObjectMoved, onSelectionChange]);

  return <div className="h-full w-full overflow-hidden rounded-lg" ref={rootRef} />;
}
