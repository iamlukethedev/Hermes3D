"use client";

// React wrapper for the Gather-style 2D pixel office. Mounts the Phaser
// scene, pushes live Hermes state through the bridge, and hosts the HUD,
// settings modal, and agent context menu.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Settings2, UserPlus, X } from "lucide-react";

import { SettingsPanel } from "@/features/office/components/panels/SettingsPanel";
import type { OfficeRenderMode } from "@/features/office/renderMode";
import type { OfficeAgent } from "@/features/retro-office/core/types";
import type { OfficeAnimationState } from "@/lib/office/eventTriggers";
import type { StudioGatewayAdapterType } from "@/lib/studio/settings";
import {
  buildPixelAgentInputs,
  isCleaningActive,
} from "@/features/pixel-office/buildPixelInputs";
import { buildHermesHqMap } from "@/features/pixel-office/map/hermesHqMap";
import {
  createPixelSceneBridge,
  type PixelSceneBridge,
} from "@/features/pixel-office/PixelSceneBridge";

type ContextMenuState = {
  agentId: string;
  x: number;
  y: number;
};

export type PixelOffice2DProps = {
  agents: OfficeAgent[];
  animationState?: OfficeAnimationState | null;
  streamingTextByAgentId?: Record<string, string | null>;
  renderMode: OfficeRenderMode;
  onRenderModeChange: (mode: OfficeRenderMode) => void;
  onAgentChatSelect?: (agentId: string) => void;
  onAddAgent?: () => void;
  onAgentEdit?: (agentId: string) => void;
  onAgentDelete?: (agentId: string) => void;
  onJukeboxInteract?: () => void;
  onKanbanInteract?: () => void;
  officeTitle: string;
  officeTitleLoaded: boolean;
  onOfficeTitleChange?: (title: string) => void;
  gatewayStatus?: string;
  gatewayUrl?: string;
  gatewayToken?: string;
  selectedAdapterType?: StudioGatewayAdapterType;
  activeAdapterType?: StudioGatewayAdapterType;
  onGatewayDisconnect?: () => void;
  onGatewayConnect?: () => void;
  onGatewayUrlChange?: (value: string) => void;
  onGatewayTokenChange?: (value: string) => void;
  onGatewayAdapterTypeChange?: (value: StudioGatewayAdapterType) => void;
  onOpenOnboarding?: () => void;
  remoteOfficeEnabled: boolean;
  remoteOfficeSourceKind: "presence_endpoint" | "hermes_gateway";
  remoteOfficeLabel: string;
  remoteOfficePresenceUrl: string;
  remoteOfficeGatewayUrl: string;
  remoteOfficeTokenConfigured: boolean;
  onRemoteOfficeEnabledChange?: (enabled: boolean) => void;
  onRemoteOfficeSourceKindChange?: (
    kind: "presence_endpoint" | "hermes_gateway",
  ) => void;
  onRemoteOfficeLabelChange?: (label: string) => void;
  onRemoteOfficePresenceUrlChange?: (url: string) => void;
  onRemoteOfficeGatewayUrlChange?: (url: string) => void;
  onRemoteOfficeTokenChange?: (token: string) => void;
  voiceRepliesEnabled: boolean;
  voiceRepliesVoiceId: string | null;
  voiceRepliesSpeed: number;
  voiceRepliesLoaded: boolean;
  onVoiceRepliesToggle?: (enabled: boolean) => void;
  onVoiceRepliesVoiceChange?: (voiceId: string | null) => void;
  onVoiceRepliesSpeedChange?: (speed: number) => void;
  onVoiceRepliesPreview?: (voiceId: string | null, voiceName: string) => void;
};

export function PixelOffice2D(props: PixelOffice2DProps) {
  const {
    agents,
    animationState = null,
    streamingTextByAgentId = {},
    renderMode,
    onRenderModeChange,
    onAgentChatSelect,
    onAddAgent,
    onAgentEdit,
    onAgentDelete,
    onJukeboxInteract,
    onKanbanInteract,
    officeTitle,
    officeTitleLoaded,
    gatewayStatus = "disconnected",
    activeAdapterType = "hermes",
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);
  const bridgeRef = useRef<PixelSceneBridge | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const map = useMemo(() => buildHermesHqMap(), []);

  if (!bridgeRef.current) {
    bridgeRef.current = createPixelSceneBridge({
      agents: [],
      bubbleTextByAgentId: {},
      cleaningActive: false,
    });
  }
  const bridge = bridgeRef.current;

  const pushBridgeState = useCallback(() => {
    const nowMs = Date.now();
    const inputs = buildPixelAgentInputs({ agents, animationState, nowMs });
    const bubbleTextByAgentId: Record<string, string> = {};
    for (const input of inputs) {
      // Streamed text shows while the stream flag is up or the run is still
      // active, so short demo replies stay readable.
      if (!input.streaming && input.status !== "working") continue;
      const text = streamingTextByAgentId[input.id] ?? "";
      if (text.trim().length > 0) {
        bubbleTextByAgentId[input.id] = text;
      }
    }
    bridge.setState({
      agents: inputs,
      bubbleTextByAgentId,
      cleaningActive: isCleaningActive(animationState),
    });
  }, [agents, animationState, bridge, streamingTextByAgentId]);

  useEffect(() => {
    pushBridgeState();
    // Timed holds (dance, manual gym) expire without prop changes, so keep
    // the derived inputs fresh with a low-frequency refresh.
    const interval = window.setInterval(pushBridgeState, 1_000);
    return () => window.clearInterval(interval);
  }, [pushBridgeState]);

  useEffect(() => {
    bridge.callbacks.onAgentClick = (agentId) => {
      setContextMenu(null);
      onAgentChatSelect?.(agentId);
    };
    bridge.callbacks.onAgentContextMenu = (agentId, clientX, clientY) => {
      setContextMenu({ agentId, x: clientX, y: clientY });
    };
    bridge.callbacks.onStationInteract = (kind) => {
      setContextMenu(null);
      if (kind === "jukebox") onJukeboxInteract?.();
      if (kind === "kanban") onKanbanInteract?.();
    };
  }, [bridge, onAgentChatSelect, onJukeboxInteract, onKanbanInteract]);

  useEffect(() => {
    let canceled = false;
    const setup = async () => {
      if (!rootRef.current) return;
      const PhaserLib = await import("phaser");
      const { createPixelOfficeScene } = await import(
        "@/features/pixel-office/scene/PixelOfficeScene"
      );
      if (canceled || !rootRef.current) return;
      const scene = createPixelOfficeScene({ PhaserLib, bridge, map });
      const game = new PhaserLib.Game({
        type: PhaserLib.AUTO,
        parent: rootRef.current,
        backgroundColor: "#6fb544",
        scene: [scene],
        render: {
          antialias: false,
          pixelArt: true,
          roundPixels: true,
        },
        scale: {
          mode: PhaserLib.Scale.RESIZE,
          autoCenter: PhaserLib.Scale.CENTER_BOTH,
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
  }, [bridge, map]);

  const contextAgent = contextMenu
    ? (agents.find((agent) => agent.id === contextMenu.agentId) ?? null)
    : null;

  const workingCount = agents.filter((agent) => agent.status === "working").length;
  const idleCount = agents.filter((agent) => agent.status === "idle").length;
  const errorCount = agents.filter((agent) => agent.status === "error").length;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#6fb544]">
      <div className="absolute inset-0" ref={rootRef} />

      {/* Office title — top left. */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 select-none">
        <div className="rounded-md border border-black/25 bg-[#11131c]/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 backdrop-blur-sm">
          {officeTitleLoaded ? officeTitle : ""}
        </div>
        <div className="rounded-md border border-black/25 bg-[#11131c]/70 px-2 py-1.5 text-[10px] font-mono text-white/70 backdrop-blur-sm">
          2D PIXEL
        </div>
        <div className="flex items-center gap-2 rounded-md border border-black/25 bg-[#11131c]/70 px-2 py-1.5 text-[10px] font-mono backdrop-blur-sm">
          <span className="text-emerald-300/85">{workingCount} working</span>
          <span className="text-white/25">·</span>
          <span className="text-amber-300/85">{idleCount} idle</span>
          {errorCount > 0 ? (
            <>
              <span className="text-white/25">·</span>
              <span className="text-rose-300/85">{errorCount} error</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Toolbar — top right. */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {onAddAgent ? (
          <button
            onClick={onAddAgent}
            title="Add agent"
            className="flex h-7 items-center justify-center gap-1 rounded-md border border-cyan-500/35 bg-[#071018]/92 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200 transition-all backdrop-blur-sm hover:border-cyan-400/55 hover:text-white"
          >
            <UserPlus size={12} />
            <span>Add</span>
          </button>
        ) : null}
        <div
          className={`flex h-7 items-center rounded-md border px-2 text-[10px] font-mono uppercase tracking-[0.12em] ${
            gatewayStatus === "connected"
              ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
              : gatewayStatus === "connecting"
                ? "border-amber-400/25 bg-amber-500/10 text-amber-100"
                : "border-rose-400/25 bg-rose-500/10 text-rose-100"
          }`}
          title={`Runtime: ${activeAdapterType} (${gatewayStatus})`}
        >
          {activeAdapterType} • {gatewayStatus}
        </div>
        <button
          onClick={() => onRenderModeChange("3d")}
          title="Switch to the 3D office"
          className="flex h-7 items-center justify-center gap-1 rounded-md border border-white/15 bg-[#11131c]/85 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75 transition-all backdrop-blur-sm hover:border-cyan-400/45 hover:text-cyan-100"
        >
          <Boxes size={12} />
          <span>3D</span>
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          title="Studio settings"
          className={`flex h-7 w-7 items-center justify-center rounded-md border transition-all backdrop-blur-sm ${
            settingsOpen
              ? "border-amber-500/50 bg-amber-500/30 text-amber-300"
              : "border-white/15 bg-[#11131c]/85 text-white/60 hover:text-amber-300"
          }`}
        >
          <Settings2 size={12} />
        </button>
      </div>

      {/* Controls hint — bottom center (event console and chat own the corners). */}
      <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 pointer-events-none select-none">
        <div className="rounded-full bg-black/50 px-3 py-1 text-[10px] font-mono text-white/55 backdrop-blur-sm">
          drag to pan · scroll to zoom · click an agent to chat
        </div>
      </div>

      {/* Agent context menu. */}
      {contextMenu && contextAgent ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className="fixed z-50 min-w-[140px] overflow-hidden rounded-lg border border-white/12 bg-[#0b0e16]/95 shadow-2xl backdrop-blur-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="border-b border-white/8 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
              {contextAgent.name}
            </div>
            <button
              className="block w-full px-3 py-2 text-left text-[11px] text-white/85 transition-colors hover:bg-cyan-500/15"
              onClick={() => {
                setContextMenu(null);
                onAgentChatSelect?.(contextMenu.agentId);
              }}
            >
              Open chat
            </button>
            {onAgentEdit ? (
              <button
                className="block w-full px-3 py-2 text-left text-[11px] text-white/85 transition-colors hover:bg-cyan-500/15"
                onClick={() => {
                  setContextMenu(null);
                  onAgentEdit(contextMenu.agentId);
                }}
              >
                Edit agent
              </button>
            ) : null}
            {onAgentDelete ? (
              <button
                className="block w-full px-3 py-2 text-left text-[11px] text-rose-300/90 transition-colors hover:bg-rose-500/15"
                onClick={() => {
                  setContextMenu(null);
                  onAgentDelete(contextMenu.agentId);
                }}
              >
                Delete agent
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {/* Studio settings modal (same panel the 3D office uses). */}
      {settingsOpen ? (
        <div className="absolute inset-0 z-30 flex items-start justify-end overflow-y-auto bg-black/35 p-4 backdrop-blur-[1px]">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-cyan-500/20 bg-[#05090d]/95 shadow-2xl">
            <div className="flex items-start justify-between border-b border-cyan-500/10 px-4 py-3">
              <div>
                <div className="font-mono text-[10px] font-semibold tracking-[0.28em] text-cyan-300/75">
                  STUDIO SETTINGS
                </div>
                <div className="mt-1 text-[11px] text-white/45">
                  Customize the office banner and spoken replies across the app.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-500/10 bg-black/20 text-cyan-100/70 transition-colors hover:border-cyan-400/30 hover:text-cyan-100"
                aria-label="Close studio settings"
              >
                <X size={12} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SettingsPanel
                renderMode={renderMode}
                onRenderModeChange={onRenderModeChange}
                gatewayStatus={props.gatewayStatus}
                gatewayUrl={props.gatewayUrl}
                gatewayToken={props.gatewayToken}
                selectedAdapterType={props.selectedAdapterType}
                activeAdapterType={props.activeAdapterType}
                onGatewayDisconnect={() => {
                  props.onGatewayDisconnect?.();
                  setSettingsOpen(false);
                }}
                onGatewayConnect={() => {
                  props.onGatewayConnect?.();
                }}
                onGatewayUrlChange={(value) => props.onGatewayUrlChange?.(value)}
                onGatewayTokenChange={(value) => props.onGatewayTokenChange?.(value)}
                onGatewayAdapterTypeChange={(value) =>
                  props.onGatewayAdapterTypeChange?.(value)
                }
                onOpenOnboarding={() => {
                  props.onOpenOnboarding?.();
                  setSettingsOpen(false);
                }}
                officeTitle={officeTitle}
                officeTitleLoaded={officeTitleLoaded}
                onOfficeTitleChange={(title) => props.onOfficeTitleChange?.(title)}
                remoteOfficeEnabled={props.remoteOfficeEnabled}
                remoteOfficeSourceKind={props.remoteOfficeSourceKind}
                remoteOfficeLabel={props.remoteOfficeLabel}
                remoteOfficePresenceUrl={props.remoteOfficePresenceUrl}
                remoteOfficeGatewayUrl={props.remoteOfficeGatewayUrl}
                remoteOfficeTokenConfigured={props.remoteOfficeTokenConfigured}
                onRemoteOfficeEnabledChange={(enabled) =>
                  props.onRemoteOfficeEnabledChange?.(enabled)
                }
                onRemoteOfficeSourceKindChange={(kind) =>
                  props.onRemoteOfficeSourceKindChange?.(kind)
                }
                onRemoteOfficeLabelChange={(label) =>
                  props.onRemoteOfficeLabelChange?.(label)
                }
                onRemoteOfficePresenceUrlChange={(url) =>
                  props.onRemoteOfficePresenceUrlChange?.(url)
                }
                onRemoteOfficeGatewayUrlChange={(url) =>
                  props.onRemoteOfficeGatewayUrlChange?.(url)
                }
                onRemoteOfficeTokenChange={(token) =>
                  props.onRemoteOfficeTokenChange?.(token)
                }
                voiceRepliesEnabled={props.voiceRepliesEnabled}
                voiceRepliesVoiceId={props.voiceRepliesVoiceId}
                voiceRepliesSpeed={props.voiceRepliesSpeed}
                voiceRepliesLoaded={props.voiceRepliesLoaded}
                onVoiceRepliesToggle={(enabled) => props.onVoiceRepliesToggle?.(enabled)}
                onVoiceRepliesVoiceChange={(voiceId) =>
                  props.onVoiceRepliesVoiceChange?.(voiceId)
                }
                onVoiceRepliesSpeedChange={(speed) =>
                  props.onVoiceRepliesSpeedChange?.(speed)
                }
                onVoiceRepliesPreview={(voiceId, voiceName) =>
                  props.onVoiceRepliesPreview?.(voiceId, voiceName)
                }
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
