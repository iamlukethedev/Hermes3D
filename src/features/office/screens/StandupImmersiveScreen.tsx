"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Check,
  Edit3,
  ExternalLink,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import type { StandupMeeting } from "@/lib/office/standup/types";

const sourceTone = (ready: boolean, stale: boolean) => {
  if (!ready)
    return stale
      ? "text-amber-200 border-amber-400/25"
      : "text-rose-200 border-rose-400/25";
  return "text-emerald-200 border-emerald-400/25";
};

export function StandupImmersiveScreen({
  meeting: initialMeeting,
  onClose,
}: {
  meeting: StandupMeeting;
  onClose: () => void;
}) {
  const [meeting, setMeeting] = useState<StandupMeeting>(initialMeeting);
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [editingBlockers, setEditingBlockers] = useState<Set<string>>(
    new Set()
  );
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  useEffect(() => {
    setMeeting(initialMeeting);
  }, [initialMeeting]);

  const taskDispatch = meeting.taskDispatch;
  const showTaskDispatch =
    meeting.phase === "complete" || taskDispatch?.status === "queueing";
  const runnableTaskCount = Math.max(
    0,
    (taskDispatch?.queuedAgentIds.length ?? 0) -
      (taskDispatch?.blockedAgentIds.length ?? 0)
  );

  const handleResolveBlocker = async (
    agentId: string,
    blockerIndex: number,
    decisionText: string,
    optionId?: string
  ) => {
    const key = `${agentId}-${blockerIndex}`;
    setSubmittingKey(key);
    try {
      const response = await fetch("/api/office/standup/meeting", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve_blocker",
          agentId,
          blockerIndex,
          optionId,
          decisionText,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as {
          meeting: StandupMeeting | null;
        };
        if (data.meeting) {
          setMeeting(data.meeting);
        }
        setEditingBlockers((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setCustomInputs((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    } catch {
      // Non-fatal UI error
    } finally {
      setSubmittingKey(null);
    }
  };

  const toggleEditBlocker = (key: string) => {
    setEditingBlockers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#05070b]/96 text-white backdrop-blur-md">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-cyan-500/15 px-6 py-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-200/85">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              Standup Board & Alignment
            </div>
            <div className="mt-1 font-mono text-[12px] text-white/50">
              {meeting.phase === "gathering"
                ? "Everyone is walking to the meeting room."
                : meeting.phase === "in_progress"
                ? "Team updates are being presented. Resolve blockers directly below to unblock Kanban workers."
                : "Standup complete. Review alignment decisions and task dispatch status."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {meeting.phase !== "complete" ? (
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/office/standup/meeting", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "complete" }),
                  });
                  onClose();
                }}
                className="inline-flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-rose-200 transition-colors hover:bg-rose-500/20 hover:text-white"
              >
                End Standup
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white/70 transition-colors hover:border-white/20 hover:text-white"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          </div>
        </div>

        <div className="grid gap-4 border-b border-cyan-500/10 px-6 py-4 font-mono text-[11px] text-white/60 md:grid-cols-3">
          <div>Phase: {meeting.phase}</div>
          <div>Speaker: {meeting.currentSpeakerAgentId ?? "Waiting"}</div>
          <div>
            Progress: {meeting.arrivedAgentIds.length}/
            {meeting.participantOrder.length} arrived
          </div>
        </div>

        {showTaskDispatch ? (
          <div
            className={`border-b px-6 py-3 font-mono text-[11px] ${
              taskDispatch?.status === "failed"
                ? "border-rose-500/20 bg-rose-500/[0.07] text-rose-100"
                : taskDispatch?.status === "dispatched"
                ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-100"
                : "border-cyan-500/20 bg-cyan-500/[0.07] text-cyan-100"
            }`}
          >
            {taskDispatch?.status === "dispatched" ? (
              <span>
                Kanban handoff complete: {taskDispatch.queuedAgentIds.length}{" "}
                assigned, {runnableTaskCount} queued for Hermes workers
                {taskDispatch.blockedAgentIds.length > 0
                  ? `, ${taskDispatch.blockedAgentIds.length} blocked for attention`
                  : ""}
                .
              </span>
            ) : taskDispatch?.status === "failed" ? (
              <span>
                Kanban handoff failed after{" "}
                {taskDispatch.queuedAgentIds.length} assignment(s):{" "}
                {taskDispatch.error ?? "Unknown error."}
              </span>
            ) : taskDispatch?.status === "queueing" ? (
              <span>
                Creating assigned Kanban tasks and starting Hermes workers…
              </span>
            ) : (
              <span>Preparing the standup follow-up tasks for Kanban…</span>
            )}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
            {meeting.cards.map((card) => {
              const isSpeaking = card.agentId === meeting.currentSpeakerAgentId;
              return (
                <section
                  key={card.agentId}
                  className={`flex flex-col justify-between rounded-2xl border px-5 py-5 transition-all ${
                    isSpeaking
                      ? "border-cyan-400/50 bg-cyan-500/[0.08] shadow-[0_0_20px_rgba(6,182,212,0.12)]"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">
                          Participant
                        </div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {card.agentName}
                        </div>
                      </div>
                      {isSpeaking ? (
                        <div className="rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-100">
                          Speaking
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
                          Current task
                        </div>
                        <div className="mt-1 text-sm leading-6 text-white/85">
                          {card.currentTask}
                        </div>
                      </div>

                      {/* Blocker & Alignment Resolution Section */}
                      <div>
                        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
                          <span>Blockers & Alignment Decisions</span>
                          {card.blockers.length > 0 ? (
                            <span className="text-amber-300">
                              {card.blockers.length} reported
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 space-y-3">
                          {card.blockers.length === 0 ? (
                            <div className="flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 font-mono text-[11px] text-emerald-200/80">
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                              No blockers reported — ready for execution.
                            </div>
                          ) : (
                            card.blockers.map((blocker, index) => {
                              const decisionGroup =
                                card.blockerDecisions?.[index];
                              const key = `${card.agentId}-${index}`;
                              const isEditing = editingBlockers.has(key);
                              const isSubmitting = submittingKey === key;
                              const isResolved =
                                Boolean(decisionGroup?.selectedDecision) &&
                                !isEditing;

                              if (isResolved && decisionGroup?.selectedDecision) {
                                return (
                                  <div
                                    key={key}
                                    className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm transition-all"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-start gap-2">
                                        <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-[#05070b]">
                                          <Check className="h-3 w-3 stroke-[3]" />
                                        </div>
                                        <div>
                                          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300">
                                            Resolved Decision
                                          </div>
                                          <div className="mt-1 font-medium text-emerald-100">
                                            {decisionGroup.selectedDecision.text}
                                          </div>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => toggleEditBlocker(key)}
                                        className="inline-flex items-center gap-1 rounded border border-emerald-400/30 px-2 py-1 font-mono text-[10px] text-emerald-300 hover:bg-emerald-400/15"
                                      >
                                        <Edit3 className="h-3 w-3" />
                                        Change
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={key}
                                  className="rounded-xl border border-rose-400/30 bg-rose-500/[0.07] p-3 text-sm"
                                >
                                  {/* Blocker alert text */}
                                  <div className="flex items-start gap-2 text-rose-100/90">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                                    <span className="text-xs font-mono leading-5">
                                      {blocker}
                                    </span>
                                  </div>

                                  {/* Alignment Question & Clickable Options */}
                                  {decisionGroup ? (
                                    <div className="mt-3 space-y-2.5 border-t border-white/10 pt-3">
                                      <div className="font-mono text-[11px] font-semibold text-cyan-200/90">
                                        {decisionGroup.question}
                                      </div>

                                      <div className="grid gap-2">
                                        {decisionGroup.options.map((opt) => (
                                          <button
                                            key={opt.id}
                                            type="button"
                                            disabled={isSubmitting}
                                            onClick={() =>
                                              handleResolveBlocker(
                                                card.agentId,
                                                index,
                                                opt.label,
                                                opt.id
                                              )
                                            }
                                            className={`group relative flex flex-col rounded-lg border p-2.5 text-left transition-all ${
                                              opt.isRecommended
                                                ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-50 shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:border-cyan-300 hover:bg-cyan-500/25"
                                                : "border-white/10 bg-black/30 text-white/85 hover:border-white/25 hover:bg-white/[0.08]"
                                            }`}
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-xs font-semibold">
                                                {opt.label}
                                              </span>
                                              {opt.isRecommended ? (
                                                <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan-200">
                                                  Recommended
                                                </span>
                                              ) : null}
                                            </div>

                                            {opt.description ? (
                                              <p className="mt-1 text-[11px] text-white/60">
                                                {opt.description}
                                              </p>
                                            ) : null}

                                            {opt.rationale ? (
                                              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-cyan-200/75">
                                                <span>💡</span>
                                                <span>{opt.rationale}</span>
                                              </div>
                                            ) : null}
                                          </button>
                                        ))}
                                      </div>

                                      {/* Custom write-in override */}
                                      <div className="mt-2 flex items-center gap-2">
                                        <input
                                          type="text"
                                          placeholder="+ Custom decision / override..."
                                          value={customInputs[key] ?? ""}
                                          onChange={(e) =>
                                            setCustomInputs((prev) => ({
                                              ...prev,
                                              [key]: e.target.value,
                                            }))
                                          }
                                          onKeyDown={(e) => {
                                            if (
                                              e.key === "Enter" &&
                                              customInputs[key]?.trim()
                                            ) {
                                              handleResolveBlocker(
                                                card.agentId,
                                                index,
                                                customInputs[key]!.trim()
                                              );
                                            }
                                          }}
                                          className="min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-2.5 py-1.5 font-mono text-[11px] text-white placeholder-white/30 focus:border-cyan-400 focus:outline-none"
                                        />
                                        <button
                                          type="button"
                                          disabled={
                                            !customInputs[key]?.trim() ||
                                            isSubmitting
                                          }
                                          onClick={() => {
                                            if (customInputs[key]?.trim()) {
                                              handleResolveBlocker(
                                                card.agentId,
                                                index,
                                                customInputs[key]!.trim()
                                              );
                                            }
                                          }}
                                          className="inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/20 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
                                        >
                                          <Send className="h-3 w-3" />
                                          Apply
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Recent commits */}
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
                          Recent commits
                        </div>
                        <div className="mt-2 space-y-2">
                          {card.recentCommits.length === 0 ? (
                            <div className="font-mono text-[11px] text-white/35">
                              No recent GitHub activity.
                            </div>
                          ) : (
                            card.recentCommits.map((commit) => (
                              <div
                                key={commit.id}
                                className="rounded border border-white/8 bg-black/20 px-3 py-2"
                              >
                                <div className="text-sm text-white/82">
                                  {commit.title}
                                </div>
                                {commit.subtitle ? (
                                  <div className="mt-1 font-mono text-[10px] text-white/40">
                                    {commit.subtitle}
                                  </div>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Active tickets */}
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
                          Active tickets
                        </div>
                        <div className="mt-2 space-y-2">
                          {card.activeTickets.length === 0 ? (
                            <div className="font-mono text-[11px] text-white/35">
                              No active Jira tickets.
                            </div>
                          ) : (
                            card.activeTickets.map((ticket) => (
                              <div
                                key={ticket.id}
                                className="rounded border border-white/8 bg-black/20 px-3 py-2"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/80">
                                      {ticket.key}
                                    </div>
                                    <div className="mt-1 text-sm text-white/82">
                                      {ticket.title}
                                    </div>
                                    <div className="mt-1 font-mono text-[10px] text-white/40">
                                      {ticket.status}
                                    </div>
                                  </div>
                                  {ticket.url ? (
                                    <a
                                      href={ticket.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-white/45 transition-colors hover:text-white"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {card.manualNotes.length > 0 ? (
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
                            Manual notes
                          </div>
                          <div className="mt-2 space-y-2">
                            {card.manualNotes.map((note, index) => (
                              <div
                                key={`${card.agentId}-note-${index}`}
                                className="rounded border border-white/8 bg-black/20 px-3 py-2 text-sm text-white/75"
                              >
                                {note}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
                          Sources
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {card.sourceStates.map((source) => (
                            <div
                              key={`${card.agentId}-${source.kind}`}
                              className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${sourceTone(
                                source.ready,
                                source.stale
                              )}`}
                            >
                              {source.kind}
                              {source.error
                                ? ` · ${source.error}`
                                : source.stale
                                ? " · stale"
                                : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
