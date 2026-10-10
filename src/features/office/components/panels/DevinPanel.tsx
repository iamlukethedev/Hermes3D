"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Send, Square } from "lucide-react";

import type { AgentState } from "@/features/agents/state/store";
import type { GatewayClient, GatewayStatus } from "@/lib/gateway/GatewayClient";

export type DevinSessionState =
  | "idle"
  | "starting"
  | "running"
  | "waiting_input"
  | "waiting_approval"
  | "suspended"
  | "completed"
  | "failed"
  | "cancelled"
  | "unreachable";

type DevinSessionSummary = {
  sessionKey: string;
  agentId: string;
  devinSessionId: string;
  url: string | null;
  title: string | null;
  state: DevinSessionState;
  status: string | null;
  statusDetail: string | null;
  pullRequests: Array<{ pr_url: string; pr_state: string | null }>;
  acusConsumed: number | null;
  createdAt: number | null;
  lastSyncAt: number | null;
  lastError: string | null;
};

type DevinHealthPayload = {
  configured: boolean;
  orgId: string | null;
  syncIntervalMs: number;
  allowedRepos: string[];
  health: {
    ok: boolean;
    checkedAt: number;
    error?: string;
    message?: string;
    principalType?: string | null;
    serviceUserName?: string | null;
  };
};

const STATE_LABELS: Record<DevinSessionState, string> = {
  idle: "Idle",
  starting: "Starting",
  running: "Running",
  waiting_input: "Needs input",
  waiting_approval: "Needs approval",
  suspended: "Suspended",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  unreachable: "Unreachable",
};

const STATE_DOT_CLASS: Record<DevinSessionState, string> = {
  idle: "bg-white/30",
  starting: "bg-sky-400",
  running: "bg-emerald-400",
  waiting_input: "bg-amber-400",
  waiting_approval: "bg-amber-400",
  suspended: "bg-white/40",
  completed: "bg-cyan-400",
  failed: "bg-rose-400",
  cancelled: "bg-white/40",
  unreachable: "bg-rose-400/70",
};

const formatClockTime = (timestampMs: number | null) =>
  timestampMs
    ? new Date(timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

export function DevinPanel({
  client,
  status,
  providerId,
  agents,
  onSelectAgent,
}: {
  client: GatewayClient;
  status: GatewayStatus;
  providerId: string;
  agents: AgentState[];
  onSelectAgent: (agentId: string) => void;
}) {
  const isDevin = providerId === "devin";
  const isConnected = status === "connected" && isDevin;

  const [health, setHealth] = useState<DevinHealthPayload | null>(null);
  const [sessions, setSessions] = useState<DevinSessionSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [taskAgentId, setTaskAgentId] = useState("");
  const [taskText, setTaskText] = useState("");
  const [taskRepo, setTaskRepo] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  const [confirmTerminateId, setConfirmTerminateId] = useState<string | null>(null);
  const healthRef = useRef<DevinHealthPayload | null>(null);
  healthRef.current = health;

  const refresh = useCallback(async () => {
    if (!isConnected) return;
    setRefreshing(true);
    try {
      const [healthRes, sessionsRes] = await Promise.all([
        client.call<DevinHealthPayload>("devin.health", {}),
        client.call<{ sessions: DevinSessionSummary[] }>("devin.sessions.list", {}),
      ]);
      setHealth(healthRes);
      setSessions(sessionsRes.sessions ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to reach the Devin gateway.");
    } finally {
      setRefreshing(false);
    }
  }, [client, isConnected]);

  useEffect(() => {
    void refresh();
    if (!isConnected) return;
    const interval = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(interval);
  }, [refresh, isConnected]);

  // Live refresh when the gateway pushes `devin` events.
  useEffect(() => {
    if (!isConnected) return;
    return client.onEvent((frame) => {
      if (frame.event === "devin" || frame.event === "presence") {
        void refresh();
      }
    });
  }, [client, isConnected, refresh]);

  const agentName = useCallback(
    (agentId: string) =>
      agents.find((agent) => agent.agentId === agentId)?.name || agentId,
    [agents]
  );

  const allowedRepos = health?.allowedRepos ?? [];

  const handleSendTask = useCallback(async () => {
    const text = taskText.trim();
    if (!text || sending) return;
    const targetAgent = taskAgentId || agents[0]?.agentId || "";
    if (!targetAgent) return;
    setSending(true);
    setSendFeedback(null);
    try {
      const res = await client.call<{ status: string; runId: string }>("chat.send", {
        sessionKey: `agent:${targetAgent}:main`,
        message: text,
        repos: taskRepo ? [taskRepo] : [],
      });
      setTaskText("");
      setSendFeedback(`Task dispatched to ${agentName(targetAgent)} (run ${res.runId}).`);
      await refresh();
    } catch (err) {
      setSendFeedback(err instanceof Error ? err.message : "Failed to dispatch task.");
    } finally {
      setSending(false);
    }
  }, [agentName, agents, client, refresh, sending, taskAgentId, taskRepo, taskText]);

  const handleTerminate = useCallback(
    async (session: DevinSessionSummary) => {
      try {
        await client.call("devin.session.terminate", {
          sessionKey: session.sessionKey,
          devinSessionId: session.devinSessionId,
        });
        setConfirmTerminateId(null);
        await refresh();
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to terminate session.");
      }
    },
    [client, refresh]
  );

  const counts = useMemo(() => {
    const tally = { active: 0, attention: 0, completed: 0, failed: 0 };
    for (const session of sessions) {
      if (session.state === "running" || session.state === "starting") tally.active += 1;
      else if (session.state === "waiting_input" || session.state === "waiting_approval")
        tally.attention += 1;
      else if (session.state === "completed") tally.completed += 1;
      else if (session.state === "failed" || session.state === "unreachable") tally.failed += 1;
    }
    return tally;
  }, [sessions]);

  if (!isDevin) {
    return (
      <section className="flex h-full min-h-0 flex-col">
        <div className="border-b border-cyan-500/10 px-4 py-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/70">
            Devin Sessions
          </div>
        </div>
        <div className="px-4 py-6 font-mono text-[11px] leading-relaxed text-white/40">
          Connect to the <span className="text-cyan-200">Devin backend</span> to see real Devin
          sessions here. Run <span className="text-white/70">npm run devin-gateway</span> with
          DEVIN_API_KEY and DEVIN_ORG_ID set, then pick the Devin backend in Settings.
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="border-b border-cyan-500/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/70">
              Devin Sessions
            </div>
            <div className="mt-1 font-mono text-[11px] text-white/40">
              {health?.configured === false
                ? "Gateway running without Devin credentials."
                : health?.health.ok
                  ? `Connected${health.health.serviceUserName ? ` as ${health.health.serviceUserName}` : ""}.`
                  : "Checking Devin API…"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="rounded border border-cyan-500/20 bg-cyan-500/10 p-1.5 text-cyan-200 transition-colors hover:border-cyan-400/40 disabled:opacity-40"
            aria-label="Refresh Devin sessions"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        {health?.configured === false ? (
          <div className="mt-2 rounded border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-100/90">
            Set DEVIN_API_KEY and DEVIN_ORG_ID in the gateway environment and restart{" "}
            <span className="font-mono">npm run devin-gateway</span>.
          </div>
        ) : null}
        {health && !health.health.ok && health.configured ? (
          <div className="mt-2 rounded border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] leading-snug text-rose-100/90">
            Devin API: {health.health.message || health.health.error || "unreachable"}
          </div>
        ) : null}
        {loadError ? (
          <div className="mt-2 rounded border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] leading-snug text-rose-100/90">
            {loadError}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-4 gap-1.5 border-b border-cyan-500/10 px-4 py-2.5">
        {(
          [
            ["Active", counts.active],
            ["Attention", counts.attention],
            ["Done", counts.completed],
            ["Failed", counts.failed],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded border border-white/8 bg-white/[0.03] px-2 py-2">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
              {label}
            </div>
            <div className="mt-1 font-mono text-[15px] font-semibold text-white/90">{value}</div>
          </div>
        ))}
      </div>

      <div className="border-b border-cyan-500/10 px-4 py-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
          New task
        </div>
        <div className="mt-2 grid gap-2">
          <select
            value={taskAgentId}
            onChange={(event) => setTaskAgentId(event.target.value)}
            className="rounded border border-white/10 bg-black/50 px-2 py-2 font-mono text-[11px] text-white/80 outline-none"
          >
            {agents.length === 0 ? <option value="">No agents</option> : null}
            {agents.map((agent) => (
              <option key={agent.agentId} value={agent.agentId}>
                {agent.name || agent.agentId}
              </option>
            ))}
          </select>
          {allowedRepos.length > 0 ? (
            <select
              value={taskRepo}
              onChange={(event) => setTaskRepo(event.target.value)}
              className="rounded border border-white/10 bg-black/50 px-2 py-2 font-mono text-[11px] text-white/80 outline-none"
            >
              <option value="">No repository</option>
              {allowedRepos.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          ) : null}
          <textarea
            value={taskText}
            onChange={(event) => setTaskText(event.target.value)}
            placeholder="Describe the task for Devin…"
            rows={3}
            className="w-full resize-none rounded border border-white/10 bg-black/50 px-2 py-2 font-mono text-[11px] text-white/80 outline-none placeholder:text-white/25"
          />
          <button
            type="button"
            onClick={() => void handleSendTask()}
            disabled={sending || !taskText.trim() || agents.length === 0 || health?.configured === false}
            className="inline-flex items-center justify-center gap-1.5 rounded border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-100 transition-colors hover:border-cyan-400/45 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
            {sending ? "Dispatching…" : "Dispatch to Devin"}
          </button>
          {sendFeedback ? (
            <div className="font-mono text-[10px] leading-snug text-white/50">{sendFeedback}</div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {sessions.length === 0 ? (
          <div className="px-2 py-6 font-mono text-[11px] text-white/35">
            No Devin sessions tracked yet. Dispatch a task to create one.
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.sessionKey}
              className="mb-2 rounded border border-white/8 bg-white/[0.03] px-3 py-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT_CLASS[session.state] ?? "bg-white/30"}`}
                />
                <button
                  type="button"
                  onClick={() => onSelectAgent(session.agentId)}
                  className="min-w-0 flex-1 truncate text-left font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85 hover:text-cyan-100"
                >
                  {agentName(session.agentId)}
                </button>
                <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-200">
                  {STATE_LABELS[session.state] ?? session.state}
                </span>
              </div>
              {session.title ? (
                <div className="mt-2 truncate font-mono text-[11px] text-white/60">
                  {session.title}
                </div>
              ) : null}
              <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/38">
                <div>
                  <div>Session</div>
                  <div className="mt-1 truncate text-[10px] normal-case tracking-normal text-white/75">
                    {session.devinSessionId}
                  </div>
                </div>
                <div>
                  <div>Synced</div>
                  <div className="mt-1 text-[11px] text-white/75">
                    {formatClockTime(session.lastSyncAt)}
                  </div>
                </div>
                <div>
                  <div>ACUs</div>
                  <div className="mt-1 text-[11px] text-white/75">
                    {session.acusConsumed ?? "—"}
                  </div>
                </div>
              </div>
              {session.pullRequests.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {session.pullRequests.map((pr) => (
                    <a
                      key={pr.pr_url}
                      href={pr.pr_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 truncate font-mono text-[10px] text-cyan-300/90 hover:text-cyan-100"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {pr.pr_url}
                      {pr.pr_state ? (
                        <span className="text-white/40">({pr.pr_state})</span>
                      ) : null}
                    </a>
                  ))}
                </div>
              ) : null}
              {session.lastError ? (
                <div className="mt-2 font-mono text-[10px] leading-snug text-rose-300/80">
                  {session.lastError}
                </div>
              ) : null}
              <div className="mt-3 flex items-center gap-2">
                {session.url ? (
                  <a
                    href={session.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-cyan-400/30 hover:text-cyan-100"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in Devin
                  </a>
                ) : null}
                {session.state !== "completed" &&
                session.state !== "failed" &&
                session.state !== "cancelled" &&
                session.state !== "unreachable" ? (
                  confirmTerminateId === session.devinSessionId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleTerminate(session)}
                        className="inline-flex items-center gap-1 rounded border border-rose-400/40 bg-rose-500/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-rose-100"
                      >
                        <Square className="h-3 w-3" />
                        Confirm terminate
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmTerminateId(null)}
                        className="rounded border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/50 hover:text-white/80"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmTerminateId(session.devinSessionId)}
                      className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-rose-400/40 hover:text-rose-100"
                    >
                      <Square className="h-3 w-3" />
                      Terminate
                    </button>
                  )
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
