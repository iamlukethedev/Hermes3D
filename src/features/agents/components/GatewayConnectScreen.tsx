import { useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import { isLocalGatewayUrl } from "@/lib/gateway/local-gateway";
import { inspectUpstreamGatewayUrl } from "@/lib/gateway/upstreamUrlDiagnostics";
import type { StudioGatewayAdapterType, StudioGatewaySettings } from "@/lib/studio/settings";
import {
  OFFICE_RENDER_MODE_OPTIONS,
  type OfficeRenderMode,
} from "@/features/office/renderMode";
import { RunningAvatarLoader } from "@/features/agents/components/RunningAvatarLoader";

type GatewayConnectScreenProps = {
  gatewayUrl: string;
  token: string;
  selectedAdapterType: StudioGatewayAdapterType;
  activeAdapterType: StudioGatewayAdapterType;
  localGatewayDefaults: StudioGatewaySettings | null;
  status: GatewayStatus;
  error: string | null;
  onGatewayUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onAdapterTypeChange: (value: StudioGatewayAdapterType) => void;
  onUseLocalDefaults: () => void;
  onConnect: () => void;
  /** When provided, shows the 3D/2D office renderer choice before connecting. */
  renderMode?: OfficeRenderMode;
  onRenderModeChange?: (mode: OfficeRenderMode) => void;
};

const resolveLocalGatewayPort = (gatewayUrl: string): number => {
  try {
    const parsed = new URL(gatewayUrl);
    const port = Number(parsed.port);
    if (Number.isFinite(port) && port > 0) return port;
  } catch {}
  return 18789;
};

export const GatewayConnectScreen = ({
  gatewayUrl,
  token,
  selectedAdapterType,
  activeAdapterType,
  localGatewayDefaults,
  status,
  error,
  onGatewayUrlChange,
  onTokenChange,
  onAdapterTypeChange,
  onUseLocalDefaults,
  onConnect,
  renderMode,
  onRenderModeChange,
}: GatewayConnectScreenProps) => {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [showToken, setShowToken] = useState(false);
  const tokenOptional =
    selectedAdapterType === "hermes" ||
    selectedAdapterType === "demo" ||
    selectedAdapterType === "local" ||
    selectedAdapterType === "hermes3d" ||
    selectedAdapterType === "custom";
  const isLocal = useMemo(() => isLocalGatewayUrl(gatewayUrl), [gatewayUrl]);
  const urlFindings = useMemo(
    () => inspectUpstreamGatewayUrl(gatewayUrl, selectedAdapterType),
    [gatewayUrl, selectedAdapterType]
  );
  const localPort = useMemo(() => resolveLocalGatewayPort(gatewayUrl), [gatewayUrl]);
  const localGatewayCommand = useMemo(
    () => `HERMES_ADAPTER_PORT=${localPort} npm run hermes-adapter`,
    [localPort]
  );
  const localGatewayCommandPnpm = useMemo(
    () => `HERMES_ADAPTER_PORT=${localPort} pnpm hermes-adapter`,
    [localPort]
  );
  const localDemoCommand = useMemo(
    () => `npm run demo-gateway`,
    []
  );
  const useDemoPreset = () => {
    onAdapterTypeChange("demo");
  };
  const useHermesPreset = () => {
    onAdapterTypeChange("hermes");
  };
  const useHermesAgentPreset = () => {
    onAdapterTypeChange("hermes-agent");
  };
  const useCustomPreset = () => {
    onAdapterTypeChange("custom");
  };
  const useLocalPreset = () => {
    onAdapterTypeChange("local");
  };
  const useHermes3dPreset = () => {
    onAdapterTypeChange("hermes3d");
  };
  const statusCopy = useMemo(() => {
    if (status === "connecting" && isLocal) {
      return `Gateway lokal terdeteksi pada port ${localPort}. Menghubungkan…`;
    }
    if (status === "connecting") {
      return "Menghubungkan ke gateway jarak jauh…";
    }
    if (isLocal) {
      return "Gateway lokal tidak ditemukan.";
    }
    return "Belum terhubung ke gateway.";
  }, [isLocal, localPort, status]);
  const selectedAdapterHint = useMemo(() => {
    switch (selectedAdapterType) {
      case "hermes":
        return "Hermes adalah jalur runtime agen dengan alur penyedia/akun tersendiri di balik gateway.";
      case "hermes-agent":
        return "Hermes Agent terhubung langsung ke gateway JSON-RPC hermes-agent tanpa proses adapter. Arahkan ke alamat utama server (Studio menambahkan /api/ws) dan gunakan token sesi, bukan login dasbor.";
      case "demo":
        return "Mode demo dapat memakai agen utama contoh secara lokal atau terhubung ke gateway tiruan untuk balasan langsung.";
      case "local":
        return "Runtime lokal memerlukan koneksi HTTP langsung ke runtime/orchestrator, bukan katalog penyedia.";
      case "hermes3d":
        return "Runtime Hermes3D mempertahankan format percakapan Hermes3D melalui koneksi runtime langsung.";
      case "custom":
      default:
        return "Kustom adalah koneksi runtime langsung yang umum. Gunakan untuk orkestrator yang kompatibel, bukan alur autentikasi khusus penyedia.";
    }
  }, [selectedAdapterType]);
  const connectDisabled = status === "connecting";
  const connectLabel = connectDisabled ? "Menghubungkan…" : "Hubungkan";
  const statusDotClass =
    status === "connected"
      ? "ui-dot-status-connected"
      : status === "connecting"
        ? "ui-dot-status-connecting"
        : "ui-dot-status-disconnected";

  const copyLocalCommand = async () => {
    try {
      await navigator.clipboard.writeText(localGatewayCommand);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1200);
    } catch {
      setCopyStatus("failed");
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    }
  };

  const commandField = (
    <div className="space-y-1.5">
      <div className="ui-command-surface flex items-center gap-2 rounded-md px-3 py-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-[var(--command-fg)]">
          {localGatewayCommand}
        </code>
        <button
          type="button"
          className="ui-btn-icon ui-command-copy h-7 w-7 shrink-0"
          onClick={copyLocalCommand}
          aria-label="Salin perintah gateway lokal"
          title="Salin perintah"
        >
          {copyStatus === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      {copyStatus === "copied" ? (
        <p className="text-xs text-muted-foreground">Berhasil disalin</p>
      ) : copyStatus === "failed" ? (
        <p className="ui-text-danger text-xs">Perintah gagal disalin.</p>
      ) : (
        <p className="text-xs leading-snug text-muted-foreground">
          Jika menjalankan dari kode sumber, gunakan <span className="font-mono text-foreground">{localGatewayCommandPnpm}</span>.
        </p>
      )}
    </div>
  );

  const remoteForm = (
    <div className="mt-2.5 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[11px] font-medium text-foreground/90">
        URL Gateway
        <input
          className="h-11 w-full rounded-md border-2 border-black bg-white px-3 font-sans text-sm text-black outline-none focus:ring-2 focus:ring-[#00f5ff]"
          type="text"
          value={gatewayUrl}
          onChange={(event) => onGatewayUrlChange(event.target.value)}
          placeholder="wss://your-gateway.example.com"
          spellCheck={false}
        />
      </label>

      {urlFindings.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Peringatan URL gateway">
          {urlFindings.map((finding) => (
            <li
              key={finding.code}
              data-testid={`gateway-url-finding-${finding.code}`}
              className={`rounded-md px-3 py-2 text-xs leading-snug ${
                finding.severity === "error" ? "ui-alert-danger" : "ui-alert-caution"
              }`}
            >
              <p className="font-medium">{finding.message}</p>
              <p className="mt-1 opacity-80">{finding.fix}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Menggunakan Tailscale?</p>
        <p>
          URL: <span className="font-mono">wss://&lt;your-tailnet-host&gt;</span>
        </p>
      </div>

      <label className="flex flex-col gap-1 text-[11px] font-medium text-foreground/90">
        {tokenOptional ? "Token gateway (opsional)" : "Token gateway"}
        <div className="relative">
          <input
            className="h-11 w-full rounded-md border-2 border-black bg-white px-3 pr-10 font-sans text-sm text-black outline-none focus:ring-2 focus:ring-[#00f5ff]"
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder={tokenOptional ? "token opsional" : "token gateway"}
            spellCheck={false}
          />
          <button
            type="button"
            className="ui-btn-icon absolute inset-y-0 right-1 my-auto h-8 w-8 border-transparent bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
            aria-label={showToken ? "Sembunyikan token" : "Tampilkan token"}
            onClick={() => setShowToken((prev) => !prev)}
          >
            {showToken ? (
              <EyeOff className="h-4 w-4 transition-transform duration-150" />
            ) : (
              <Eye className="h-4 w-4 transition-transform duration-150" />
            )}
          </button>
        </div>
      </label>

      <button
        type="button"
        className="mt-1 h-12 w-full rounded-md border-2 border-black bg-[#00f5ff] px-4 text-xs font-black tracking-[0.05em] text-black shadow-[4px_4px_0_#000] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onConnect}
        disabled={connectDisabled || !gatewayUrl.trim()}
      >
        {connectLabel}
      </button>

      {status === "connecting" ? (
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <RunningAvatarLoader size={16} trackWidth={32} inline />
          Menghubungkan…
        </div>
      ) : null}
      {error ? <p className="ui-text-danger text-xs leading-snug">{error}</p> : null}
    </div>
  );

  return (
    <div className="nex-pop-connect mx-auto flex min-h-0 w-full max-w-[820px] flex-1 flex-col gap-4 px-2 pb-6 sm:gap-5 sm:px-0">
      <div className="ui-card rounded-xl border-2 border-black bg-[#00f5ff] px-3 py-3 text-black shadow-[5px_5px_0_#000] sm:px-4">
        <div className="flex items-center gap-2">
          {status === "connecting" ? (
            <RunningAvatarLoader size={18} trackWidth={36} inline />
          ) : (
            <span
              className={`h-2.5 w-2.5 ${statusDotClass}`}
            />
          )}
          <p className="text-sm font-semibold text-foreground">{statusCopy}</p>
        </div>
      </div>

      {renderMode && onRenderModeChange ? (
        <div className="ui-card rounded-xl border-2 border-black bg-[#fff8e7] px-3 py-4 text-black shadow-[-5px_5px_0_#000] sm:px-6">
          <p className="font-mono text-[10px] font-medium tracking-[0.06em] text-muted-foreground">
            Tampilan kantor
          </p>
          <p className="mt-2 text-sm text-foreground/90">
            Pilih sebelum menghubungkan — proses berat belum dimuat sebelum pilihan dibuat.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {OFFICE_RENDER_MODE_OPTIONS.map((option) => {
              const selected = renderMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  data-testid={`connect-render-mode-${option.id}`}
                  className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? "border-2 border-black bg-[#ffe600] shadow-[3px_3px_0_#000]"
                      : "border-2 border-black bg-white hover:bg-[#00f5ff]"
                  }`}
                  onClick={() => onRenderModeChange(option.id)}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    {option.label}
                    {selected ? <Check className="h-3.5 w-3.5 text-amber-400" /> : null}
                  </span>
                  <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="ui-card rounded-xl border-2 border-black bg-[#fff8e7] px-3 py-4 text-black shadow-[-5px_5px_0_#000] sm:px-6 sm:py-5">
        <div>
          <p className="font-mono text-[10px] font-medium tracking-[0.06em] text-muted-foreground">
            Gateway jarak jauh (disarankan)
          </p>
          <p className="mt-2 text-sm text-foreground/90">
            Pilih backend, lalu hubungkan ke URL gateway-nya.
          </p>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            Backend terpilih: {selectedAdapterType} | Backend aktif: {activeAdapterType}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Setiap backend menyimpan URL dan tokennya masing-masing.
          </p>
          <p className="mt-2 text-xs leading-snug text-muted-foreground">
            {selectedAdapterHint}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-10 rounded-md border-2 border-black bg-[#ff4fd8] px-3 py-2 text-[11px] font-black tracking-[0.03em] text-black shadow-[3px_3px_0_#000]"
              onClick={useDemoPreset}
            >
              Backend demo
            </button>
            <button
              type="button"
              className="min-h-10 rounded-md border-2 border-black bg-[#ff4fd8] px-3 py-2 text-[11px] font-black tracking-[0.03em] text-black shadow-[3px_3px_0_#000]"
              onClick={useHermesPreset}
            >
              Backend Hermes
            </button>
            <button
              type="button"
              className="min-h-10 rounded-md border-2 border-black bg-[#ff4fd8] px-3 py-2 text-[11px] font-black tracking-[0.03em] text-black shadow-[3px_3px_0_#000]"
              onClick={useHermesAgentPreset}
            >
              Hermes Agent (langsung)
            </button>
            <button
              type="button"
              className="min-h-10 rounded-md border-2 border-black bg-[#ff4fd8] px-3 py-2 text-[11px] font-black tracking-[0.03em] text-black shadow-[3px_3px_0_#000]"
              onClick={useLocalPreset}
            >
              Runtime lokal
            </button>
            <button
              type="button"
              className="min-h-10 rounded-md border-2 border-black bg-[#ff4fd8] px-3 py-2 text-[11px] font-black tracking-[0.03em] text-black shadow-[3px_3px_0_#000]"
              onClick={useHermes3dPreset}
            >
              Runtime Hermes3D
            </button>
            <button
              type="button"
              className="min-h-10 rounded-md border-2 border-black bg-[#ff4fd8] px-3 py-2 text-[11px] font-black tracking-[0.03em] text-black shadow-[3px_3px_0_#000]"
              onClick={useCustomPreset}
            >
              Backend kustom
            </button>
          </div>
        </div>
        {remoteForm}
      </div>

      <div className="ui-card rounded-xl border-2 border-black bg-[#fff8e7] px-3 py-4 text-black shadow-[-5px_5px_0_#000] sm:px-6 sm:py-5">
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] font-semibold tracking-[0.06em] text-muted-foreground">
            Jalankan secara lokal (opsional)
          </p>
          <p className="text-sm text-foreground/90">
            Jalankan proses gateway lokal di perangkat ini, lalu hubungkan.
          </p>
        </div>
        <div className="mt-3 space-y-3">
          {commandField}
          <div className="rounded-md border border-border bg-muted/30 px-3 py-3">
            <p className="text-xs font-medium text-foreground">Hanya ingin melihat kantor?</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              Jalankan <span className="font-mono text-foreground">{localDemoCommand}</span> untuk menjalankan gateway tiruan bawaan dengan agen demo.
              Then choose <span className="font-mono text-foreground">Backend demo</span> and connect.
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-3">
            <p className="text-xs font-medium text-foreground">Menggunakan Hermes secara lokal?</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              Jalankan <span className="font-mono text-foreground">npm run hermes-adapter</span>, then choose
              <span className="font-mono text-foreground"> Backend Hermes</span>. The default local URL is
              <span className="font-mono text-foreground"> ws://localhost:18789</span>.
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-3">
            <p className="text-xs font-medium text-foreground">Menggunakan runtime lokal atau kustom?</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              Choose <span className="font-mono text-foreground">Runtime lokal</span>,
              <span className="font-mono text-foreground"> Runtime Hermes3D</span>, or
              <span className="font-mono text-foreground"> Backend kustom</span> and point the URL at
              your orchestrator or runtime boundary. These profiles already preserve separate saved URLs
              and tokens, but transport-specific chat handoff still needs a follow-up slice.
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-3">
            <p className="text-xs font-medium text-foreground">Membuka Hermes3D dari perangkat lain?</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              Start Studio with <span className="font-mono text-foreground">HOST=0.0.0.0</span> (or a
              specific LAN/Tailscale host) and set
              <span className="font-mono text-foreground"> STUDIO_ACCESS_TOKEN</span> before exposing it
              beyond localhost. Gateway settings are stored on the Studio host, but device approval
              remains per browser/device.
            </p>
          </div>
          {localGatewayDefaults ? (
            <div className="ui-input rounded-md px-3 py-3">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Gunakan token dari <span className="font-mono">~/.hermes/hermes.json</span>.
                </p>
                <p className="font-mono text-[11px] text-foreground">
                  {localGatewayDefaults.url}
                </p>
                <button
                  type="button"
                  className="ui-btn-secondary h-9 w-full px-3 text-xs font-semibold tracking-[0.05em]"
                  onClick={onUseLocalDefaults}
                >
                  Gunakan pengaturan lokal bawaan
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
