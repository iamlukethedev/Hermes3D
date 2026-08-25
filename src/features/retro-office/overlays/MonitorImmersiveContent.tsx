"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { shouldPreferBrowserScreenshot } from "@/lib/office/browserPreview";
import type {
  OfficeDeskMonitor,
  OfficeDeskMonitorEntry,
} from "@/lib/office/deskMonitor";

type BrowserPreviewSnapshot = {
  mediaUrl: string | null;
  browserUrl: string | null;
  error: string | null;
  loading: boolean;
  capturedAt: number | null;
};

const BROWSER_EMBED_FALLBACK_MS = 2500;

const getAgentInitials = (name: string): string => {
  const parts = name.trim().split(/[^a-z0-9]+/i).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

const getEntryLabel = (kind: OfficeDeskMonitorEntry["kind"]): string => {
  if (kind === "thinking") return "Progress";
  if (kind === "tool") return "Command / tool";
  if (kind === "user") return "Objective";
  return "Worker output";
};

const formatTerminalEntry = (entry: OfficeDeskMonitorEntry): string => {
  if (entry.kind === "tool") return `$ ${entry.text}`;
  if (entry.kind === "thinking") return `# ${entry.text}`;
  if (entry.kind === "user") return `> ${entry.text}`;
  return entry.text;
};

function MonitorAgentRail({
  activeAgentId,
  monitors,
  onAgentSelect,
}: {
  activeAgentId: string;
  monitors: OfficeDeskMonitor[];
  onAgentSelect?: (agentId: string) => void;
}) {
  const options = monitors.length > 0 ? monitors : [];
  return (
    <div className="flex w-[76px] shrink-0 flex-col items-center gap-3 border-r border-white/6 bg-[#18191d] py-4">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/30">
        Agents
      </div>
      {options.map((option) => {
        const active = option.agentId === activeAgentId;
        return (
          <button
            key={option.agentId}
            type="button"
            title={`Open ${option.agentName} monitor`}
            aria-label={`Open ${option.agentName} monitor`}
            aria-pressed={active}
            onClick={() => onAgentSelect?.(option.agentId)}
            className={`relative flex h-11 w-11 items-center justify-center rounded-xl border font-mono text-[11px] font-semibold transition-colors ${
              active
                ? "border-emerald-300/45 bg-emerald-300/14 text-emerald-100"
                : "border-white/8 bg-[#2b2d31] text-white/48 hover:border-white/20 hover:text-white/80"
            }`}
          >
            {getAgentInitials(option.agentName)}
            <span
              className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#18191d] ${
                option.live ? "bg-emerald-400" : "bg-white/25"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function KanbanTaskMonitor({
  monitor,
  monitors,
  onAgentSelect,
}: {
  monitor: OfficeDeskMonitor;
  monitors: OfficeDeskMonitor[];
  onAgentSelect?: (agentId: string) => void;
}) {
  const [view, setView] = useState<"activity" | "terminal">("activity");
  const task = monitor.task;
  const currentEntry = [...monitor.entries]
    .reverse()
    .find((entry) => entry.kind !== "user");

  if (!task) return null;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#111317] text-[#d4d4d4]">
      <div className="flex h-full flex-col">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/8 bg-[#202228] px-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/42">
              Live task workspace
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                monitor.live ? "animate-pulse bg-emerald-400" : "bg-white/30"
              }`}
            />
            <span
              className={`font-mono text-[11px] uppercase tracking-[0.18em] ${
                monitor.live ? "text-emerald-200/90" : "text-white/50"
              }`}
            >
              {task.status}
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <MonitorAgentRail
            activeAgentId={monitor.agentId}
            monitors={monitors}
            onAgentSelect={onAgentSelect}
          />

          <main className="flex min-w-0 flex-1 flex-col">
            <section className="shrink-0 border-b border-white/8 bg-[#181b20] px-7 py-5">
              <div className="flex items-start justify-between gap-8">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-emerald-300/65">
                    Current objective
                  </div>
                  <h1 className="mt-2 max-w-5xl text-[22px] font-semibold leading-8 text-white/94">
                    {task.title}
                  </h1>
                  <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-white/48">
                    <span className="rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-1">
                      {monitor.agentName}
                    </span>
                    <span className="rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-1">
                      {task.id}
                    </span>
                    {task.runId ? (
                      <span className="rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-1">
                        Run {task.runId}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="w-[320px] shrink-0 rounded-xl border border-emerald-300/12 bg-emerald-300/[0.045] px-4 py-3">
                  <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-emerald-200/55">
                    Current step
                  </div>
                  <div className="mt-2 line-clamp-3 font-mono text-[12px] leading-5 text-emerald-50/78">
                    {currentEntry?.text || "Worker started. Waiting for the first activity update."}
                  </div>
                </div>
              </div>
            </section>

            <div className="flex shrink-0 items-center justify-between border-b border-white/8 bg-[#15171b] px-7 py-3">
              <div className="flex items-center gap-2">
                {(["activity", "terminal"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    className={`rounded-lg border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors ${
                      view === option
                        ? "border-sky-300/30 bg-sky-300/10 text-sky-100"
                        : "border-white/8 text-white/42 hover:border-white/18 hover:text-white/72"
                    }`}
                  >
                    {option === "activity" ? "Live activity" : "Full terminal"}
                  </button>
                ))}
              </div>
              <div className="font-mono text-[10px] text-white/30">
                {monitor.entries.length} visible updates · refreshes automatically
              </div>
            </div>

            {view === "activity" ? (
              <div className="min-h-0 flex-1 overflow-auto px-7 py-5">
                {monitor.entries.length > 0 ? (
                  <div className="mx-auto max-w-6xl space-y-3">
                    {monitor.entries.map((entry, index) => (
                      <article
                        key={`${monitor.agentId}-${task.id}-${entry.kind}-${index}`}
                        className={`grid grid-cols-[135px_minmax(0,1fr)] gap-4 rounded-xl border px-4 py-3 ${
                          entry.kind === "tool"
                            ? "border-sky-400/12 bg-sky-400/[0.045]"
                            : entry.kind === "thinking"
                              ? "border-fuchsia-400/12 bg-fuchsia-400/[0.045]"
                              : entry.kind === "user"
                                ? "border-amber-400/12 bg-amber-400/[0.045]"
                                : "border-white/8 bg-white/[0.025]"
                        }`}
                      >
                        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/34">
                          {getEntryLabel(entry.kind)}
                          {entry.live ? (
                            <div className="mt-1 text-emerald-300/55">Live</div>
                          ) : null}
                        </div>
                        <div className="whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-white/78">
                          {entry.text}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center font-mono text-[13px] text-white/38">
                    Waiting for worker activity…
                  </div>
                )}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto bg-[#090d10] px-7 py-6 font-mono text-[14px] leading-7 text-[#9cdcfe]">
                {monitor.entries.length > 0 ? (
                  monitor.entries.map((entry, index) => (
                    <div
                      key={`${monitor.agentId}-${task.id}-terminal-${index}`}
                      className="whitespace-pre-wrap break-words border-b border-white/[0.035] py-1.5"
                    >
                      {formatTerminalEntry(entry)}
                    </div>
                  ))
                ) : (
                  <div className="text-white/35">Waiting for terminal output…</div>
                )}
              </div>
            )}

            <footer className="flex shrink-0 items-center justify-between border-t border-white/8 bg-[#0e639c] px-5 py-2 font-mono text-[10px] text-white/90">
              <span>{monitor.agentName} · Hermes Kanban worker</span>
              <span>
                {monitor.updatedAt
                  ? `Updated ${new Date(monitor.updatedAt).toLocaleTimeString()}`
                  : "Waiting for activity timestamp"}
              </span>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}

function useBrowserPreviewScreenshot(params: {
  browserUrl: string | null;
  enabled: boolean;
  live: boolean;
}) {
  const { browserUrl, enabled, live } = params;
  const [snapshot, setSnapshot] = useState<BrowserPreviewSnapshot>({
    mediaUrl: null,
    browserUrl: browserUrl ?? null,
    error: null,
    loading: false,
    capturedAt: null,
  });
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !browserUrl) {
      requestIdRef.current += 1;
      setSnapshot({
        mediaUrl: null,
        browserUrl: browserUrl ?? null,
        error: null,
        loading: false,
        capturedAt: null,
      });
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setSnapshot((current) => ({
      ...current,
      browserUrl,
      error: null,
      loading: true,
    }));

    try {
      const params = new URLSearchParams({
        url: browserUrl,
        ts: String(Date.now()),
      });
      const response = await fetch(`/api/office/browser-preview?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        error?: string;
        mediaUrl?: string;
        browserUrl?: string;
        capturedAt?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error?.trim() || "Unable to capture browser preview.");
      }
      if (requestIdRef.current !== requestId) return;

      setSnapshot({
        mediaUrl: payload.mediaUrl?.trim() || null,
        browserUrl: payload.browserUrl?.trim() || browserUrl,
        error: null,
        loading: false,
        capturedAt:
          typeof payload.capturedAt === "number" ? payload.capturedAt : Date.now(),
      });
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setSnapshot((current) => ({
        ...current,
        browserUrl,
        error:
          error instanceof Error ? error.message : "Unable to capture browser preview.",
        loading: false,
      }));
    }
  }, [browserUrl, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !browserUrl) return;
    const intervalMs = live ? 7_000 : 12_000;
    const intervalId = window.setInterval(() => {
      void refresh();
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [browserUrl, enabled, live, refresh]);

  return {
    ...snapshot,
    refresh,
  };
}

function MonitorBrowserContent({
  monitor,
  browserUrl,
  prefersScreenshot,
}: {
  monitor: OfficeDeskMonitor;
  browserUrl: string;
  prefersScreenshot: boolean;
}) {
  const [browserView, setBrowserView] = useState<"embed" | "screenshot">(
    prefersScreenshot ? "screenshot" : "embed",
  );
  const [allowAutoFallback, setAllowAutoFallback] = useState(!prefersScreenshot);
  const [embedLoaded, setEmbedLoaded] = useState(false);
  const embedFrameRef = useRef<HTMLIFrameElement | null>(null);
  const browserPreview = useBrowserPreviewScreenshot({
    browserUrl,
    enabled: true,
    live: monitor.live,
  });

  useEffect(() => {
    if (
      prefersScreenshot ||
      browserView !== "embed" ||
      embedLoaded ||
      !allowAutoFallback
    ) {
      return;
    }
    if (browserPreview.error || (!browserPreview.loading && !browserPreview.mediaUrl)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAllowAutoFallback(false);
      setBrowserView((current) => (current === "embed" ? "screenshot" : current));
    }, BROWSER_EMBED_FALLBACK_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    allowAutoFallback,
    browserPreview.error,
    browserPreview.loading,
    browserPreview.mediaUrl,
    browserView,
    embedLoaded,
    prefersScreenshot,
  ]);

  const handleEmbedLoad = useCallback(() => {
    const frame = embedFrameRef.current;
    if (!frame) {
      setEmbedLoaded(true);
      return;
    }

    try {
      const loadedUrl = frame.contentWindow?.location?.href?.trim() ?? "";
      const loadedText = frame.contentDocument?.body?.innerText?.trim() ?? "";
      if (loadedUrl === "about:blank" && !loadedText) {
        setAllowAutoFallback(false);
        setBrowserView("screenshot");
        return;
      }
    } catch {
      // Cross-origin iframe content is expected for successful embeds.
    }

    setEmbedLoaded(true);
  }, []);

  return (
    <div className="absolute inset-0 bg-[#050809]">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-white/10 bg-[#0d1117] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="min-w-0 flex-1 truncate rounded-full border border-white/10 bg-black/30 px-4 py-2 font-mono text-[14px] text-white/70">
            {browserPreview.browserUrl ?? monitor.browserUrl}
          </div>
          <button
            type="button"
            onClick={() => {
              setAllowAutoFallback(false);
              setEmbedLoaded(false);
              setBrowserView((current) =>
                current === "embed" ? "screenshot" : "embed",
              );
            }}
            className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/72 transition-colors hover:bg-white/10"
          >
            {browserView === "screenshot" ? "Live Embed" : "Screenshot"}
          </button>
          {browserView === "screenshot" ? (
            <button
              type="button"
              onClick={() => void browserPreview.refresh()}
              className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-emerald-200 transition-colors hover:bg-emerald-400/20"
            >
              Refresh Shot
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              window.open(monitor.browserUrl ?? "", "_blank", "noopener,noreferrer")
            }
            className="rounded-full border border-sky-400/25 bg-sky-400/10 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-sky-200 transition-colors hover:bg-sky-400/20"
          >
            Open Browser
          </button>
        </div>
        <div className="relative flex-1 bg-[#f4f7fb]">
          {browserView === "screenshot" ? (
            <div className="relative flex h-full items-center justify-center overflow-hidden bg-[#0a0f12]">
              {browserPreview.mediaUrl ? (
                <Image
                  alt={`${monitor.agentName} browser screenshot`}
                  src={browserPreview.mediaUrl}
                  fill
                  unoptimized
                  sizes="100vw"
                  className="object-contain"
                />
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-center font-mono text-[14px] text-white/68">
                  {browserPreview.loading
                    ? "Capturing browser screenshot..."
                    : browserPreview.error || "Waiting for browser screenshot."}
                </div>
              )}
              <div className="pointer-events-none absolute right-4 top-4 rounded-full border border-white/10 bg-black/45 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white/70">
                {browserPreview.loading
                  ? "Refreshing"
                  : browserPreview.capturedAt
                    ? `Screenshot ${new Date(browserPreview.capturedAt).toLocaleTimeString()}`
                    : "Screenshot fallback"}
              </div>
            </div>
          ) : (
            <iframe
              ref={embedFrameRef}
              title={`${monitor.agentName} browser preview`}
              src={monitor.browserUrl ?? undefined}
              className="h-full w-full"
              onLoad={handleEmbedLoad}
              onError={() => {
                setAllowAutoFallback(false);
                setBrowserView("screenshot");
                setEmbedLoaded(false);
              }}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-black/10 bg-gradient-to-t from-black/50 to-transparent px-6 py-4 font-mono text-[13px] text-white/80">
            {monitor.entries.length > 0
              ? monitor.entries[monitor.entries.length - 1]?.text
              : "Waiting for browser activity."}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MonitorImmersiveContent({
  monitor,
  monitors = [],
  onAgentSelect,
}: {
  monitor: OfficeDeskMonitor;
  monitors?: OfficeDeskMonitor[];
  onAgentSelect?: (agentId: string) => void;
}) {
  const browserUrl = monitor.mode === "browser" ? monitor.browserUrl : null;
  const prefersScreenshot = shouldPreferBrowserScreenshot(browserUrl);

  if (monitor.task) {
    return (
      <KanbanTaskMonitor
        key={`${monitor.agentId}:${monitor.task.id}`}
        monitor={monitor}
        monitors={monitors}
        onAgentSelect={onAgentSelect}
      />
    );
  }

  if (monitor.mode === "browser" && browserUrl) {
    return (
      <MonitorBrowserContent
        key={browserUrl}
        monitor={monitor}
        browserUrl={browserUrl}
        prefersScreenshot={prefersScreenshot}
      />
    );
  }

  const editor = monitor.editor;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#1e1f22] text-[#d4d4d4]">
      <div className="flex h-full flex-col">
        <div className="flex h-10 items-center justify-between border-b border-white/6 bg-[#2a2b2f] px-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="text-[12px] font-medium text-white/65">
            hermes-control-center
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/40">
            <span>[v]</span>
            <span>[^]</span>
            <span>[]</span>
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <MonitorAgentRail
            activeAgentId={monitor.agentId}
            monitors={monitors}
            onAgentSelect={onAgentSelect}
          />
          <div className="flex w-[240px] flex-col border-r border-white/6 bg-[#1f2024]">
            <div className="border-b border-white/6 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
              Hermes-Control-Center
            </div>
            <div className="flex-1 space-y-1 px-3 py-3 font-mono text-[12px]">
              <div className="px-2 pb-1 text-white/35">src</div>
              <div className="rounded-md bg-white/6 px-3 py-2 text-white/85">app</div>
              <div className="rounded-md px-3 py-2 text-white/45">components</div>
              <div className="rounded-md px-3 py-2 text-white/45">features</div>
              <div className="ml-3 mt-1 space-y-1 border-l border-white/6 pl-3">
                <div className="rounded-md px-2 py-1 text-white/45">retro-office</div>
                <div className="rounded-md bg-[#2a2d33] px-2 py-1 text-[#d7dae0]">
                  {editor?.fileName ?? "workbench.tsx"}
                </div>
              </div>
              <div className="mt-5 px-2 text-[11px] uppercase tracking-[0.2em] text-white/28">
                Agent
              </div>
              <div className="rounded-md border border-white/6 bg-black/20 px-3 py-2 text-white/82">
                {monitor.agentName}
              </div>
              <div className="rounded-md px-3 py-2 text-[11px] leading-5 text-white/42">
                {monitor.title} · {monitor.subtitle}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col bg-[#1e1f22]">
            <div className="flex items-center justify-between border-b border-white/6 bg-[#25262b] px-3">
              <div className="flex items-end gap-1">
                <div className="border-x border-t border-white/6 bg-[#1f2024] px-4 py-2 font-mono text-[12px] text-white/85">
                  RetroOffice3D.tsx
                </div>
                <div className="px-3 py-2 font-mono text-[12px] text-white/35">
                  {editor?.fileName ?? "workbench.tsx"}
                </div>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-200/90">
                {monitor.live ? "Live" : "Idle"}
              </div>
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="grid min-h-0 flex-1 grid-cols-[56px_minmax(0,1fr)] bg-[#1e1f22] font-mono">
                  <div className="border-r border-white/6 bg-[#18191d] py-4 text-right text-[13px] leading-8 text-white/20">
                    {(editor?.lines ?? []).map((_, index) => (
                      <div key={`line-no-${index}`} className="pr-3">
                        {index + 994}
                      </div>
                    ))}
                  </div>
                  <div className="relative overflow-auto py-4 pr-6 text-[17px] leading-8 text-[#d4d4d4]">
                    {(editor?.lines ?? []).map((line, index) => (
                      <div key={`editor-line-${index}`} className="whitespace-pre pl-5">
                        {line}
                      </div>
                    ))}
                    {editor ? (
                      <div
                        className="pointer-events-none absolute h-7 w-[2px] bg-[#c5c8d0]"
                        style={{
                          top: `${16 + (editor.cursorLine - 1) * 32}px`,
                          left: `${20 + Math.max(0, editor.cursorColumn - 1) * 9.8}px`,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="h-[28%] border-t border-white/6 bg-[#18191d]">
                  <div className="border-b border-white/6 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white/32">
                    Terminal
                  </div>
                  <div className="space-y-2 overflow-auto px-4 py-3 font-mono text-[13px] text-[#9cdcfe]">
                    {(
                      editor?.terminalLines ?? monitor.entries.map((entry) => entry.text)
                    ).map((line, index) => (
                      <div
                        key={`terminal-${index}`}
                        className="whitespace-pre-wrap break-words"
                      >
                        {line}
                      </div>
                    ))}
                    {(editor?.terminalLines ?? []).length === 0 ? (
                      <div className="text-white/35">No terminal output yet.</div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex w-[290px] flex-col border-l border-white/6 bg-[#1f2024]">
                <div className="border-b border-white/6 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
                  Agent Movement And Behavior
                </div>
                <div className="flex-1 space-y-3 overflow-auto px-4 py-4">
                  {monitor.entries.length > 0 ? (
                    monitor.entries.map((entry, index) => (
                      <div
                        key={`${monitor.agentId}-panel-${entry.kind}-${index}`}
                        className={`rounded-lg border px-3 py-3 ${
                          entry.kind === "user"
                            ? "border-amber-400/10 bg-amber-400/8"
                            : entry.kind === "tool"
                              ? "border-sky-400/10 bg-sky-400/8"
                              : entry.kind === "thinking"
                                ? "border-fuchsia-400/10 bg-fuchsia-400/8"
                                : "border-white/8 bg-white/[0.04]"
                        }`}
                      >
                        <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-white/28">
                          {entry.kind}
                          {entry.live ? " · live" : ""}
                        </div>
                        <div className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-white/76">
                          {entry.text}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-4 text-[12px] text-white/40">
                      No live activity yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-white/6 bg-[#0e639c] px-4 py-2 font-mono text-[11px] text-white">
              <div className="flex items-center gap-4">
                <span>{editor?.language ?? "tsx"}</span>
                <span>UTF-8</span>
                <span>Spaces: 2</span>
              </div>
              <div className="flex items-center gap-4 text-white/85">
                <span>Ln {editor?.cursorLine ?? 1}</span>
                <span>Col {editor?.cursorColumn ?? 1}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
