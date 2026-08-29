// Pub/sub bridge between the React wrapper and the Phaser pixel scene,
// mirroring the pattern used by the office builder's OfficeSceneBridge.

import type { PixelAgentInput } from "@/features/pixel-office/types";

export type PixelInteractiveStationKind = "jukebox" | "kanban";

export type PixelBridgeState = {
  agents: PixelAgentInput[];
  /** Streaming text tails shown as speech bubbles, keyed by agent id. */
  bubbleTextByAgentId: Record<string, string>;
  /** True while cleaning cues are active (spawns the janitor NPC). */
  cleaningActive: boolean;
};

export type PixelBridgeCallbacks = {
  onAgentClick?: (agentId: string) => void;
  onAgentContextMenu?: (agentId: string, clientX: number, clientY: number) => void;
  onStationInteract?: (kind: PixelInteractiveStationKind) => void;
};

export type PixelSceneBridge = {
  getState: () => PixelBridgeState;
  setState: (next: Partial<PixelBridgeState>) => void;
  subscribe: (listener: () => void) => () => void;
  /** Mutable callback slot so React can swap handlers without scene rebuilds. */
  callbacks: PixelBridgeCallbacks;
};

export const createPixelSceneBridge = (
  initialState: PixelBridgeState,
): PixelSceneBridge => {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (next) => {
      state = { ...state, ...next };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    callbacks: {},
  };
};
