"use client";

import { useState } from "react";
import { CURATED_ELEVENLABS_VOICES } from "@/lib/voiceReply/catalog";
import type { StudioGatewayAdapterType } from "@/lib/studio/settings";
import {
  GRAPHICS_QUALITY_OPTIONS,
  type GraphicsQuality,
} from "@/features/retro-office/core/graphicsQuality";
import {
  OFFICE_RENDER_MODE_OPTIONS,
  type OfficeRenderMode,
} from "@/features/office/renderMode";

type SettingsPanelProps = {
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
  officeTitle: string;
  officeTitleLoaded: boolean;
  onOfficeTitleChange: (title: string) => void;
  remoteOfficeEnabled: boolean;
  remoteOfficeSourceKind: "presence_endpoint" | "hermes_gateway";
  remoteOfficeLabel: string;
  remoteOfficePresenceUrl: string;
  remoteOfficeGatewayUrl: string;
  remoteOfficeTokenConfigured: boolean;
  onRemoteOfficeEnabledChange: (enabled: boolean) => void;
  onRemoteOfficeSourceKindChange: (kind: "presence_endpoint" | "hermes_gateway") => void;
  onRemoteOfficeLabelChange: (label: string) => void;
  onRemoteOfficePresenceUrlChange: (url: string) => void;
  onRemoteOfficeGatewayUrlChange: (url: string) => void;
  onRemoteOfficeTokenChange: (token: string) => void;
  voiceRepliesEnabled: boolean;
  voiceRepliesVoiceId: string | null;
  voiceRepliesSpeed: number;
  voiceRepliesLoaded: boolean;
  onVoiceRepliesToggle: (enabled: boolean) => void;
  onVoiceRepliesVoiceChange: (voiceId: string | null) => void;
  onVoiceRepliesSpeedChange: (speed: number) => void;
  onVoiceRepliesPreview: (voiceId: string | null, voiceName: string) => void;
  graphicsQuality?: GraphicsQuality;
  onGraphicsQualityChange?: (quality: GraphicsQuality) => void;
  renderMode?: OfficeRenderMode;
  onRenderModeChange?: (mode: OfficeRenderMode) => void;
};

export function SettingsPanel({
  gatewayStatus,
  gatewayUrl,
  gatewayToken,
  selectedAdapterType = "hermes",
  activeAdapterType = "hermes",
  onGatewayDisconnect,
  onGatewayConnect,
  onGatewayUrlChange,
  onGatewayTokenChange,
  onGatewayAdapterTypeChange,
  onOpenOnboarding,
  officeTitle,
  officeTitleLoaded,
  onOfficeTitleChange,
  remoteOfficeEnabled,
  remoteOfficeSourceKind,
  remoteOfficeLabel,
  remoteOfficePresenceUrl,
  remoteOfficeGatewayUrl,
  remoteOfficeTokenConfigured,
  onRemoteOfficeEnabledChange,
  onRemoteOfficeSourceKindChange,
  onRemoteOfficeLabelChange,
  onRemoteOfficePresenceUrlChange,
  onRemoteOfficeGatewayUrlChange,
  onRemoteOfficeTokenChange,
  voiceRepliesEnabled,
  voiceRepliesVoiceId,
  voiceRepliesSpeed,
  voiceRepliesLoaded,
  onVoiceRepliesToggle,
  onVoiceRepliesVoiceChange,
  onVoiceRepliesSpeedChange,
  onVoiceRepliesPreview,
  graphicsQuality,
  onGraphicsQualityChange,
  renderMode,
  onRenderModeChange,
}: SettingsPanelProps) {
  const normalizedGatewayUrl = gatewayUrl?.trim() ?? "";
  const normalizedGatewayToken = gatewayToken ?? "";
  const gatewayStateLabel = gatewayStatus
    ? gatewayStatus.charAt(0).toUpperCase() + gatewayStatus.slice(1)
    : "Tidak diketahui";
  const isGatewayConnected = gatewayStatus === "connected";
  const gatewayDisconnectDisabled = !isGatewayConnected;
  const gatewayConnectDisabled = normalizedGatewayUrl.length === 0;
  const tokenOptional =
    selectedAdapterType === "hermes" ||
    selectedAdapterType === "demo" ||
    selectedAdapterType === "local" ||
    selectedAdapterType === "hermes3d" ||
    selectedAdapterType === "custom";
  const [remoteOfficeTokenDraft, setRemoteOfficeTokenDraft] = useState("");

  return (
    <div className="nex-pop-settings px-3 py-3 sm:px-4 sm:py-4">
      <div className="mb-3 rounded-xl border-2 border-black bg-[#fff8e7] px-3 py-3 text-black shadow-[-4px_4px_0_#000] sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-white">Judul studio</div>
            <div className="mt-1 text-[10px] text-white/75">
              Atur tulisan yang ditampilkan di bagian atas kantor.
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
            {officeTitleLoaded ? "Siap" : "Memuat"}
          </span>
        </div>
        <input
          type="text"
          value={officeTitle}
          maxLength={48}
          disabled={!officeTitleLoaded}
          onChange={(event) => onOfficeTitleChange(event.target.value)}
          placeholder="Kantor Pusat NEX-MEX"
          className="mt-3 w-full rounded-md border border-cyan-500/10 bg-black/25 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-cyan-100 outline-none transition-colors placeholder:text-cyan-100/30 focus:border-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="mt-2 text-[10px] text-white/50">
          Digunakan pada bagian atas tampilan kantor.
        </div>
      </div>
      <div className="mt-3 rounded-xl border-2 border-black bg-[#fff8e7] px-3 py-3 text-black shadow-[-4px_4px_0_#000] sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-white">Gateway</div>
            <div className="mt-1 text-[10px] text-white/75">
              Ganti backend aktif dan perbarui alamat koneksinya.
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
            {gatewayStateLabel}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["demo", "Demo"],
              ["hermes", "Hermes"],
              ["local", "Local"],
              ["hermes3d", "Hermes3D"],
              ["custom", "Custom"],
            ] as const
          ).map(([adapterType, label]) => {
            const selected = selectedAdapterType === adapterType;
            return (
              <button
                key={adapterType}
                type="button"
                onClick={() => onGatewayAdapterTypeChange?.(adapterType)}
                className={`min-h-9 rounded-md border-2 border-black px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-black shadow-[2px_2px_0_#000] transition-colors ${
                  selected
                    ? "bg-[#ffe600]"
                    : "bg-white hover:bg-[#00f5ff]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid gap-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
              URL Gateway
            </div>
            <input
              type="text"
              value={gatewayUrl ?? ""}
              onChange={(event) => onGatewayUrlChange?.(event.target.value)}
              placeholder={
                selectedAdapterType === "custom" ||
                selectedAdapterType === "local"
                  ? "http://localhost:7770"
                  : selectedAdapterType === "hermes3d"
                    ? "http://localhost:3000/api/runtime/custom"
                  : "ws://localhost:18789"
              }
              className="w-full rounded-md border-2 border-black bg-white px-3 py-2 font-mono text-[11px] text-black outline-none placeholder:text-black/40 focus:ring-2 focus:ring-[#00f5ff]"
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
              {tokenOptional ? "Token gateway (opsional)" : "Token gateway"}
            </div>
            <input
              type="password"
              value={normalizedGatewayToken}
              onChange={(event) => onGatewayTokenChange?.(event.target.value)}
              placeholder={tokenOptional ? "token opsional" : "token gateway"}
              className="w-full rounded-md border-2 border-black bg-white px-3 py-2 text-[11px] text-black outline-none placeholder:text-black/40 focus:ring-2 focus:ring-[#00f5ff]"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-white/60">
          <span className="font-mono">
            Backend terpilih: {selectedAdapterType}
          </span>
          <span className="font-mono">
            Backend aktif: {activeAdapterType}
          </span>
          <span>Setiap backend menyimpan URL dan tokennya sendiri.</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[10px] text-white/60">
            Hubungkan untuk menerapkan backend pilihan, atau putuskan koneksi untuk kembali ke layar koneksi.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onGatewayConnect?.()}
              disabled={gatewayConnectDisabled}
              className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-cyan-50 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {gatewayStatus === "connecting" ? "Menghubungkan..." : "Hubungkan"}
            </button>
            <button
              type="button"
              onClick={() => onGatewayDisconnect?.()}
              disabled={gatewayDisconnectDisabled}
              className="rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-rose-100 transition-colors hover:border-rose-400/40 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Putuskan koneksi gateway
            </button>
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-xl border-2 border-black bg-[#fff8e7] px-3 py-3 text-black shadow-[-4px_4px_0_#000] sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-white">Kantor jarak jauh</div>
            <div className="mt-1 text-[10px] text-white/75">
              Hubungkan kantor kedua dalam mode hanya-baca dari Hermes3D lain atau gateway Hermes jarak jauh.
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
            {remoteOfficeEnabled ? "Aktif" : "Nonaktif"}
          </span>
        </div>
        <div className="ui-settings-row mt-3 flex min-h-[72px] items-center justify-between gap-6 rounded-lg border border-cyan-500/10 bg-black/15 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-label="Kantor jarak jauh"
              aria-checked={remoteOfficeEnabled}
              className={`ui-switch self-center ${remoteOfficeEnabled ? "ui-switch--on" : ""}`}
              onClick={() => onRemoteOfficeEnabledChange(!remoteOfficeEnabled)}
            >
              <span className="ui-switch-thumb" />
            </button>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-white">Tampilkan kantor kedua</span>
              <span className="text-[10px] text-white/80">
                Agen jarak jauh tetap terlihat, tetapi tidak dapat dikendalikan.
              </span>
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
            {remoteOfficeTokenConfigured ? "Token tersedia" : "No token"}
          </span>
        </div>
        <div className="mt-3 grid gap-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
              Source type
            </div>
            <select
              value={remoteOfficeSourceKind}
              onChange={(event) =>
                onRemoteOfficeSourceKindChange(
                  event.target.value as "presence_endpoint" | "hermes_gateway"
                )
              }
              className="w-full rounded-md border border-cyan-500/10 bg-black/25 px-3 py-2 text-[11px] text-cyan-100 outline-none transition-colors focus:border-cyan-400/30"
            >
              <option value="presence_endpoint">Remote Hermes3D presence endpoint</option>
              <option value="hermes_gateway">Remote Hermes gateway</option>
            </select>
            <div className="mt-1 text-[10px] text-white/50">
              Use a presence endpoint when the other machine runs Hermes3D. Use gateway mode when the other machine only runs Hermes.
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
              Label
            </div>
            <input
              type="text"
              value={remoteOfficeLabel}
              maxLength={48}
              onChange={(event) => onRemoteOfficeLabelChange(event.target.value)}
              placeholder="Remote Office"
              className="w-full rounded-md border border-cyan-500/10 bg-black/25 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-cyan-100 outline-none transition-colors placeholder:text-cyan-100/30 focus:border-cyan-400/30"
            />
          </div>
          {remoteOfficeSourceKind === "presence_endpoint" ? (
            <>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
                  Presence URL
                </div>
                <input
                  type="url"
                  value={remoteOfficePresenceUrl}
                  onChange={(event) => onRemoteOfficePresenceUrlChange(event.target.value)}
                  placeholder="https://other-office.example.com/api/office/presence"
                  className="w-full rounded-md border-2 border-black bg-white px-3 py-2 text-[11px] text-black outline-none placeholder:text-black/40 focus:ring-2 focus:ring-[#00f5ff]"
                />
                <div className="mt-1 text-[10px] text-white/50">
                  Studio polls this endpoint server-side when the other machine is also running Hermes3D.
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
                  Optional token
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={remoteOfficeTokenDraft}
                    onChange={(event) => setRemoteOfficeTokenDraft(event.target.value)}
                    placeholder={remoteOfficeTokenConfigured ? "Token configured. Enter a new one to replace it." : "Enter token"}
                    className="min-w-0 flex-1 rounded-md border border-cyan-500/10 bg-black/25 px-3 py-2 text-[11px] text-cyan-100 outline-none transition-colors placeholder:text-cyan-100/30 focus:border-cyan-400/30"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onRemoteOfficeTokenChange(remoteOfficeTokenDraft);
                      setRemoteOfficeTokenDraft("");
                    }}
                    className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/15"
                  >
                    Simpan
                  </button>
                  {remoteOfficeTokenConfigured ? (
                    <button
                      type="button"
                      onClick={() => {
                        onRemoteOfficeTokenChange("");
                        setRemoteOfficeTokenDraft("");
                      }}
                      className="rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-rose-100 transition-colors hover:border-rose-400/40 hover:bg-rose-500/15"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
                  Gateway URL
                </div>
                <input
                  type="text"
                  value={remoteOfficeGatewayUrl}
                  onChange={(event) => onRemoteOfficeGatewayUrlChange(event.target.value)}
                  placeholder="wss://remote-gateway.example.com"
                  className="w-full rounded-md border-2 border-black bg-white px-3 py-2 text-[11px] text-black outline-none placeholder:text-black/40 focus:ring-2 focus:ring-[#00f5ff]"
                />
                <div className="mt-1 text-[10px] text-white/50">
                  Hermes3D connects from the browser directly to the remote Hermes gateway and derives a read-only presence snapshot.
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/65">
                  Shared gateway token
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={remoteOfficeTokenDraft}
                    onChange={(event) => setRemoteOfficeTokenDraft(event.target.value)}
                    placeholder={remoteOfficeTokenConfigured ? "Token configured. Enter a new one to replace it." : "Enter token"}
                    className="min-w-0 flex-1 rounded-md border border-cyan-500/10 bg-black/25 px-3 py-2 text-[11px] text-cyan-100 outline-none transition-colors placeholder:text-cyan-100/30 focus:border-cyan-400/30"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onRemoteOfficeTokenChange(remoteOfficeTokenDraft);
                      setRemoteOfficeTokenDraft("");
                    }}
                    className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/15"
                  >
                    Simpan
                  </button>
                  {remoteOfficeTokenConfigured ? (
                    <button
                      type="button"
                      onClick={() => {
                        onRemoteOfficeTokenChange("");
                        setRemoteOfficeTokenDraft("");
                      }}
                      className="rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-rose-100 transition-colors hover:border-rose-400/40 hover:bg-rose-500/15"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="mt-1 text-[10px] text-white/50">
                  Optional. Browser-based remote presence and messaging can work without it when the remote gateway already allows your Control UI origin.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 rounded-xl border-2 border-black bg-[#fff8e7] px-3 py-3 text-black shadow-[-4px_4px_0_#000] sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-white">Onboarding</div>
            <div className="mt-1 text-[10px] text-white/75">
              Re-open the onboarding wizard to test the new-user flow.
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenOnboarding?.()}
            className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-100 transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/15"
          >
            Launch wizard
          </button>
        </div>
      </div>
      {renderMode && onRenderModeChange ? (
        <div className="mt-3 rounded-xl border-2 border-black bg-[#fff8e7] px-3 py-3 text-black shadow-[-4px_4px_0_#000] sm:px-4">
          <div className="text-[11px] font-medium text-white">Office renderer</div>
          <div className="mt-1 text-[10px] text-white/75">
            Pick the immersive 3D office or the lightweight 2D pixel office.
          </div>
          <div className="mt-3 grid gap-2">
            {OFFICE_RENDER_MODE_OPTIONS.map((option) => {
              const selected = option.id === renderMode;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onRenderModeChange(option.id)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    selected
                      ? "border-cyan-400/40 bg-cyan-500/12 text-white"
                      : "border-cyan-500/10 bg-black/15 text-white/80 hover:border-cyan-400/20 hover:bg-cyan-500/6"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium">{option.label}</span>
                    {selected ? (
                      <span className="rounded-full border border-cyan-400/35 bg-cyan-500/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-cyan-100">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[10px] text-white/65">{option.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {graphicsQuality && onGraphicsQualityChange ? (
        <div className="mt-3 rounded-xl border-2 border-black bg-[#fff8e7] px-3 py-3 text-black shadow-[-4px_4px_0_#000] sm:px-4">
          <div className="text-[11px] font-medium text-white">Kualitas grafis</div>
          <div className="mt-1 text-[10px] text-white/75">
            Seimbangkan kualitas visual dan performa kantor 3D.
          </div>
          <div className="mt-3 grid gap-2">
            {GRAPHICS_QUALITY_OPTIONS.map((option) => {
              const selected = option.id === graphicsQuality;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onGraphicsQualityChange(option.id)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    selected
                      ? "border-cyan-400/40 bg-cyan-500/12 text-white"
                      : "border-cyan-500/10 bg-black/15 text-white/80 hover:border-cyan-400/20 hover:bg-cyan-500/6"
                  }`}
                >
                  <div className="text-[11px] font-medium">{option.label}</div>
                  <div className="mt-1 text-[10px] text-white/65">
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="ui-settings-row mt-3 flex min-h-[72px] items-center justify-between gap-6 rounded-lg border border-cyan-500/10 bg-black/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-label="Voice replies"
            aria-checked={voiceRepliesEnabled}
            className={`ui-switch self-center ${voiceRepliesEnabled ? "ui-switch--on" : ""}`}
            onClick={() => onVoiceRepliesToggle(!voiceRepliesEnabled)}
            disabled={!voiceRepliesLoaded}
          >
            <span className="ui-switch-thumb" />
          </button>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-white">Voice replies</span>
            <span className="text-[10px] text-white/80">
              Play finalized assistant replies with a natural voice.
            </span>
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
          {voiceRepliesLoaded ? (voiceRepliesEnabled ? "On" : "Off") : "Loading"}
        </span>
      </div>
      <div className="mt-3 rounded-xl border-2 border-black bg-[#fff8e7] px-3 py-3 text-black shadow-[-4px_4px_0_#000] sm:px-4">
        <div className="text-[11px] font-medium text-white">Voice</div>
        <div className="mt-1 text-[10px] text-white/75">
          Choose the voice used for spoken agent replies.
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {CURATED_ELEVENLABS_VOICES.map((voice) => {
            const selected = voice.id === voiceRepliesVoiceId;
            return (
              <button
                key={voice.id ?? "default"}
                type="button"
                onClick={() => {
                  onVoiceRepliesVoiceChange(voice.id);
                  onVoiceRepliesPreview(voice.id, voice.label);
                }}
                disabled={!voiceRepliesLoaded}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  selected
                    ? "border-cyan-400/40 bg-cyan-500/12 text-white"
                    : "border-cyan-500/10 bg-black/15 text-white/80 hover:border-cyan-400/20 hover:bg-cyan-500/6"
                }`}
              >
                <div className="text-[11px] font-medium">{voice.label}</div>
                <div className="mt-1 text-[10px] text-white/65">{voice.description}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 rounded-xl border-2 border-black bg-[#fff8e7] px-3 py-3 text-black shadow-[-4px_4px_0_#000] sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-white">Speed</div>
            <div className="mt-1 text-[10px] text-white/75">
              Adjust how fast the selected voice speaks.
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
            {voiceRepliesSpeed.toFixed(2)}x
          </span>
        </div>
        <input
          type="range"
          min="0.7"
          max="1.2"
          step="0.05"
          value={voiceRepliesSpeed}
          disabled={!voiceRepliesLoaded}
          onChange={(event) =>
            onVoiceRepliesSpeedChange(Number.parseFloat(event.target.value))
          }
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-cyan-500/15 accent-cyan-400"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-white/45">
          <span>Slower</span>
          <span>Faster</span>
        </div>
      </div>
    </div>
  );
}
