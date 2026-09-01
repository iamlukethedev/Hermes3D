"use client";

// The Hermes agent kanban board. Columns mirror the Hermes agent lifecycle
// (inbox -> scheduled -> working -> needs attention -> done) and cards carry
// the agent's fingerprints: source platform, model, skills used or learned,
// subagents spawned, and cron schedules.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Filter,
  Inbox,
  Loader2,
  MessageSquare,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  User,
  X,
} from "lucide-react";

import type { AgentState } from "@/features/agents/state/store";
import type { CronJobSummary } from "@/lib/cron/types";
import type { TaskBoardCard, TaskBoardStatus } from "@/features/office/tasks/types";
import {
  isKanbanManagedTaskId,
  type GatewayTaskDetailResult,
} from "@/lib/tasks/gateway";

const STATUS_ORDER: TaskBoardStatus[] = [
  "inbox",
  "scheduled",
  "working",
  "needs_attention",
  "done",
];

const STATUS_META: Record<
  TaskBoardStatus,
  {
    label: string;
    hint: string;
    icon: typeof Inbox;
    headerClass: string;
    countClass: string;
    cardSelectedClass: string;
    cardIdleClass: string;
    columnBorderClass: string;
  }
> = {
  inbox: {
    label: "Inbox",
    hint: "Captured requests",
    icon: Inbox,
    headerClass: "text-sky-300",
    countClass: "bg-sky-500/15 text-sky-200 border-sky-400/20",
    cardSelectedClass: "border-sky-400/50 bg-sky-500/[0.12] ring-1 ring-sky-400/30",
    cardIdleClass: "hover:border-sky-400/30 hover:bg-sky-500/[0.05]",
    columnBorderClass: "border-sky-500/15",
  },
  scheduled: {
    label: "Scheduled",
    hint: "Cron & playbooks",
    icon: AlarmClock,
    headerClass: "text-violet-300",
    countClass: "bg-violet-500/15 text-violet-200 border-violet-400/20",
    cardSelectedClass: "border-violet-400/50 bg-violet-500/[0.12] ring-1 ring-violet-400/30",
    cardIdleClass: "hover:border-violet-400/30 hover:bg-violet-500/[0.05]",
    columnBorderClass: "border-violet-500/15",
  },
  working: {
    label: "Working",
    hint: "Active execution",
    icon: Loader2,
    headerClass: "text-amber-300",
    countClass: "bg-amber-500/15 text-amber-200 border-amber-400/20",
    cardSelectedClass: "border-amber-400/50 bg-amber-500/[0.12] ring-1 ring-amber-400/30",
    cardIdleClass: "hover:border-amber-400/30 hover:bg-amber-500/[0.05]",
    columnBorderClass: "border-amber-500/15",
  },
  needs_attention: {
    label: "Needs Attention",
    hint: "Blocked & decisions",
    icon: ShieldAlert,
    headerClass: "text-rose-300",
    countClass: "bg-rose-500/20 text-rose-200 border-rose-400/30",
    cardSelectedClass: "border-rose-400/60 bg-rose-500/[0.15] ring-1 ring-rose-400/40",
    cardIdleClass: "hover:border-rose-400/40 hover:bg-rose-500/[0.08]",
    columnBorderClass: "border-rose-500/20",
  },
  done: {
    label: "Done",
    hint: "Completed & learned",
    icon: Sparkles,
    headerClass: "text-emerald-300",
    countClass: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20",
    cardSelectedClass: "border-emerald-400/50 bg-emerald-500/[0.12] ring-1 ring-emerald-400/30",
    cardIdleClass: "hover:border-emerald-400/30 hover:bg-emerald-500/[0.05]",
    columnBorderClass: "border-emerald-500/15",
  },
};

const AGENT_THEMES: Record<
  string,
  { label: string; badge: string; dot: string }
> = {
  "crush-lead": {
    label: "Crush-Lead",
    badge: "border-amber-400/30 bg-amber-500/15 text-amber-200",
    dot: "bg-amber-400",
  },
  "crush-engineer": {
    label: "Crush-Engineer",
    badge: "border-cyan-400/30 bg-cyan-500/15 text-cyan-200",
    dot: "bg-cyan-400",
  },
  "crush-qa": {
    label: "Crush-QA",
    badge: "border-purple-400/30 bg-purple-500/15 text-purple-200",
    dot: "bg-purple-400",
  },
  "crush-growth": {
    label: "Crush-Growth",
    badge: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
    dot: "bg-emerald-400",
  },
  wesley: {
    label: "Wesley",
    badge: "border-sky-400/30 bg-sky-500/15 text-sky-200",
    dot: "bg-sky-400",
  },
  smoochy: {
    label: "Smoochy",
    badge: "border-pink-400/30 bg-pink-500/15 text-pink-200",
    dot: "bg-pink-400",
  },
  duckycoder: {
    label: "DuckyCoder",
    badge: "border-yellow-400/30 bg-yellow-500/15 text-yellow-200",
    dot: "bg-yellow-400",
  },
};

const PLATFORM_LABELS: Record<string, string> = {
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  whatsapp: "WhatsApp",
  signal: "Signal",
  email: "Email",
  cli: "CLI",
  web: "Web",
};

const BLOCK_KIND_LABELS: Record<string, string> = {
  needs_input: "Input required",
  capability: "Missing capability",
  dependency: "Blocked on dependency",
  transient: "Transient error",
};

const formatNativeStatus = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return "Hermes task";
  if (normalized === "review") return "Waiting for review";
  if (normalized === "blocked") return "Blocked";
  return normalized.replaceAll("_", " ");
};

const formatBlockKind = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  return BLOCK_KIND_LABELS[normalized] ?? normalized.replaceAll("_", " ");
};

const formatPlatform = (channel: string | null) => {
  if (!channel) return null;
  const key = channel.trim().toLowerCase();
  return PLATFORM_LABELS[key] ?? channel.trim();
};

const formatRelativeTime = (value: string | null) => {
  if (!value) return "No activity";
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return "No activity";
  const delta = Math.max(0, Date.now() - at);
  if (delta < 60_000) return "Just now";
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.max(1, Math.floor(delta / 3_600_000))}h ago`;
  return `${Math.max(1, Math.floor(delta / 86_400_000))}d ago`;
};

const formatScheduledFor = (value: string | null) => {
  if (!value) return null;
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return value;
  const delta = at - Date.now();
  if (delta <= 0) return "Due now";
  if (delta < 3_600_000) return `In ${Math.max(1, Math.round(delta / 60_000))}m`;
  if (delta < 86_400_000) return `In ${Math.round(delta / 3_600_000)}h`;
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const stopAndGetCardId = (event: DragEvent<HTMLElement>) => {
  event.preventDefault();
  event.stopPropagation();
  return event.dataTransfer.getData("text/task-card-id").trim();
};

function CardChip({
  icon: Icon,
  children,
  className = "border-white/10 text-white/60 bg-white/[0.04]",
}: {
  icon?: typeof Inbox;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] ${className}`}
    >
      {Icon ? <Icon className="h-2.5 w-2.5 shrink-0" /> : null}
      <span className="truncate max-w-[140px]">{children}</span>
    </span>
  );
}

function AgentBadge({ agentId }: { agentId: string | null }) {
  if (!agentId) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/45">
        <User className="h-2.5 w-2.5 opacity-60" />
        Unassigned
      </span>
    );
  }
  const theme = AGENT_THEMES[agentId] || {
    label: agentId,
    badge: "border-white/20 bg-white/10 text-white/80",
    dot: "bg-white/60",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider ${theme.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
      {theme.label}
    </span>
  );
}

export function TaskBoardView({
  title,
  subtitle,
  agents,
  cardsByStatus,
  selectedCard,
  activeRuns,
  cronJobs,
  cronLoading,
  cronError,
  taskCaptureDebug,
  onCreateCard,
  onMoveCard,
  onSelectCard,
  onUpdateCard,
  onDeleteCard,
  onLoadTaskDetail,
  onAddTaskComment,
  onReplyAndResumeTask,
  onRefreshCronJobs,
}: {
  title: string;
  subtitle: string;
  agents: AgentState[];
  cardsByStatus: Record<TaskBoardStatus, TaskBoardCard[]>;
  selectedCard: TaskBoardCard | null;
  activeRuns: Array<{ runId: string; agentId: string; label: string }>;
  cronJobs: CronJobSummary[];
  cronLoading: boolean;
  cronError: string | null;
  taskCaptureDebug?: {
    lastStatus: "idle" | "detected" | "persisted" | "failed" | "unsupported";
    lastUpdatedAt: string | null;
    lastTitle: string | null;
    lastTaskId: string | null;
    lastSessionKey: string | null;
    lastMessage: string | null;
    detectedCount: number;
    visibleCardCount: number;
    totalCardCount: number;
    sharedTasksSupported: boolean;
    sharedTasksLoading: boolean;
    sharedTasksError: string | null;
  };
  onCreateCard: () => void;
  onMoveCard: (cardId: string, status: TaskBoardStatus) => void;
  onSelectCard: (cardId: string | null) => void;
  onUpdateCard: (cardId: string, patch: Partial<TaskBoardCard>) => void;
  onDeleteCard: (cardId: string) => void;
  onLoadTaskDetail?: (cardId: string) => Promise<GatewayTaskDetailResult>;
  onAddTaskComment?: (
    cardId: string,
    body: string,
  ) => Promise<GatewayTaskDetailResult>;
  onReplyAndResumeTask?: (
    cardId: string,
    reply: string,
  ) => Promise<GatewayTaskDetailResult>;
  onRefreshCronJobs: () => void;
}) {
  // State for filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string | null>(null);
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [isDoneCollapsed, setIsDoneCollapsed] = useState(false);

  // Inspector & detail state
  const selectedCardId = selectedCard?.id ?? null;
  const selectedKanbanTask = Boolean(
    selectedCardId && isKanbanManagedTaskId(selectedCardId),
  );
  const [taskDetail, setTaskDetail] = useState<GatewayTaskDetailResult | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [taskActionBusy, setTaskActionBusy] = useState(false);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [taskActionMessage, setTaskActionMessage] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  // Counts & metrics
  const totalCardsAcrossBoard = useMemo(
    () => STATUS_ORDER.reduce((acc, status) => acc + cardsByStatus[status].length, 0),
    [cardsByStatus],
  );

  const activeWorkerCount = useMemo(
    () =>
      cardsByStatus.working.filter((card) => isKanbanManagedTaskId(card.id)).length,
    [cardsByStatus.working],
  );

  const attentionCount = cardsByStatus.needs_attention.length;
  const learnedCount = useMemo(
    () =>
      STATUS_ORDER.reduce(
        (total, status) =>
          total + cardsByStatus[status].filter((card) => card.learnedSkill).length,
        0,
      ),
    [cardsByStatus],
  );

  // Filtered Cards Calculation
  const filteredCardsByStatus = useMemo(() => {
    const result: Record<TaskBoardStatus, TaskBoardCard[]> = {
      inbox: [],
      scheduled: [],
      working: [],
      needs_attention: [],
      done: [],
    };
    const query = searchQuery.trim().toLowerCase();

    for (const status of STATUS_ORDER) {
      result[status] = cardsByStatus[status].filter((card) => {
        if (selectedAgentFilter) {
          if (selectedAgentFilter === "unassigned") {
            if (card.assignedAgentId) return false;
          } else if (card.assignedAgentId !== selectedAgentFilter) {
            return false;
          }
        }
        if (blockedOnly) {
          const isBlocked =
            card.status === "needs_attention" ||
            card.nativeStatus === "blocked" ||
            Boolean(card.blockKind);
          if (!isBlocked) return false;
        }
        if (query) {
          const inTitle = card.title.toLowerCase().includes(query);
          const inDesc = card.description?.toLowerCase().includes(query);
          const inId = card.id.toLowerCase().includes(query);
          const inNotes = card.notes?.some((n) => n.toLowerCase().includes(query));
          const inAgent = card.assignedAgentId?.toLowerCase().includes(query);
          if (!inTitle && !inDesc && !inId && !inNotes && !inAgent) return false;
        }
        return true;
      });
    }
    return result;
  }, [cardsByStatus, searchQuery, selectedAgentFilter, blockedOnly]);

  const visibleCardCount = useMemo(
    () =>
      STATUS_ORDER.reduce(
        (acc, status) => acc + filteredCardsByStatus[status].length,
        0,
      ),
    [filteredCardsByStatus],
  );

  // Load task details when a card is selected
  useEffect(() => {
    let cancelled = false;
    setTaskDetail(null);
    setTaskActionError(null);
    setTaskActionMessage(null);
    setReplyText("");
    if (!selectedCardId || !selectedKanbanTask || !onLoadTaskDetail) {
      setTaskDetailLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setTaskDetailLoading(true);
    void onLoadTaskDetail(selectedCardId)
      .then((detail) => {
        if (!cancelled) setTaskDetail(detail);
      })
      .catch((error) => {
        if (!cancelled) {
          setTaskActionError(
            error instanceof Error
              ? error.message
              : "Failed to load Hermes task details.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTaskDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onLoadTaskDetail, selectedCardId, selectedKanbanTask]);

  const submitTaskComment = async (resume: boolean) => {
    if (!selectedCard || !replyText.trim() || taskActionBusy) return;
    const handler = resume ? onReplyAndResumeTask : onAddTaskComment;
    if (!handler) return;
    setTaskActionBusy(true);
    setTaskActionError(null);
    setTaskActionMessage(null);
    try {
      const detail = await handler(selectedCard.id, replyText.trim());
      setTaskDetail(detail);
      setReplyText("");
      setTaskActionMessage(
        resume
          ? detail.dispatchWarning ||
              "Reply sent. The task is ready for a Hermes worker."
          : "Comment added to the Hermes task.",
      );
    } catch (error) {
      setTaskActionError(
        error instanceof Error
          ? error.message
          : "The Hermes task could not be updated.",
      );
    } finally {
      setTaskActionBusy(false);
    }
  };

  const selectedNativeStatus =
    taskDetail?.nativeStatus ?? selectedCard?.nativeStatus ?? null;
  const selectedBlockKind =
    taskDetail?.blockKind ?? selectedCard?.blockKind ?? null;
  const selectedBlockerReason =
    taskDetail?.blockerReason ?? selectedCard?.blockerReason ?? null;
  const selectedTaskIsBlocked = selectedNativeStatus === "blocked";

  // Distinct agent counts for filter pills
  const agentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const status of STATUS_ORDER) {
      for (const card of cardsByStatus[status]) {
        const key = card.assignedAgentId || "unassigned";
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    return counts;
  }, [cardsByStatus]);

  return (
    <section className="relative flex h-full min-h-0 flex-col bg-transparent text-white">
      {/* Top Header & Metrics Bar */}
      <div className="border-b border-emerald-500/15 bg-[#070b09]/60 px-4 py-2.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 font-mono text-[12px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              <span aria-hidden className="text-[14px] leading-none text-emerald-400">
                ☤
              </span>
              {title}
            </div>
            <div className="hidden items-center gap-2 font-mono text-[11px] text-white/40 md:flex">
              <span className="text-white/20">|</span>
              <span className="text-amber-200/80">
                {activeWorkerCount} {activeWorkerCount === 1 ? "worker" : "workers"} active
              </span>
              {attentionCount > 0 ? (
                <>
                  <span className="text-white/20">•</span>
                  <span className="font-semibold text-rose-300">
                    {attentionCount} need attention
                  </span>
                </>
              ) : null}
              {learnedCount > 0 ? (
                <>
                  <span className="text-white/20">•</span>
                  <span className="text-emerald-300/80">{learnedCount} skills learned</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefreshCronJobs}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
            >
              {cronLoading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>Sync</span>
            </button>
            <button
              type="button"
              onClick={onCreateCard}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-500/30 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Task</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar: Search Bar + Agent Selector Pills + Blocker Toggle */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-white/8 pt-2.5">
          {/* Live Search */}
          <div className="relative min-w-[200px] flex-1 max-w-[320px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, ID, notes…"
              className="w-full rounded-lg border border-white/10 bg-black/40 py-1.5 pl-8 pr-7 font-mono text-[11px] text-white placeholder:text-white/30 focus:border-emerald-400/50 focus:bg-black/60 focus:outline-none"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Agent Filter Selector Pills */}
          <div className="flex flex-wrap items-center gap-1 overflow-x-auto py-0.5">
            <button
              type="button"
              onClick={() => setSelectedAgentFilter(null)}
              className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
                selectedAgentFilter === null
                  ? "border border-emerald-400/50 bg-emerald-500/25 font-semibold text-emerald-100 shadow-sm"
                  : "border border-white/8 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/80"
              }`}
            >
              All ({totalCardsAcrossBoard})
            </button>

            {agents.map((agent) => {
              const count = agentCounts[agent.agentId] || 0;
              const isSelected = selectedAgentFilter === agent.agentId;
              const theme = AGENT_THEMES[agent.agentId] || {
                label: agent.name || agent.agentId,
                badge: "border-white/20 bg-white/10 text-white/80",
                dot: "bg-white/60",
              };
              return (
                <button
                  key={agent.agentId}
                  type="button"
                  onClick={() =>
                    setSelectedAgentFilter(isSelected ? null : agent.agentId)
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
                    isSelected
                      ? `${theme.badge} ring-1 ring-white/30 font-semibold shadow-sm`
                      : "border-white/8 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/80"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
                  <span>{theme.label}</span>
                  {count > 0 ? (
                    <span className="text-[9px] opacity-70">({count})</span>
                  ) : null}
                </button>
              );
            })}

            {agentCounts["unassigned"] ? (
              <button
                type="button"
                onClick={() =>
                  setSelectedAgentFilter(
                    selectedAgentFilter === "unassigned" ? null : "unassigned",
                  )
                }
                className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
                  selectedAgentFilter === "unassigned"
                    ? "border border-amber-400/50 bg-amber-500/25 font-semibold text-amber-100"
                    : "border border-white/8 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/80"
                }`}
              >
                Unassigned ({agentCounts["unassigned"]})
              </button>
            ) : null}
          </div>

          {/* Quick Blocker Toggle Filter */}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBlockedOnly((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${
                blockedOnly
                  ? "border-rose-400/60 bg-rose-500/25 font-bold text-rose-100 shadow-sm"
                  : "border-white/10 bg-white/[0.04] text-white/60 hover:border-rose-400/30 hover:text-rose-200"
              }`}
            >
              <AlertTriangle className="h-3 w-3 text-rose-400" />
              <span>Blocked Only</span>
              {attentionCount > 0 ? (
                <span className="rounded bg-rose-500/40 px-1 py-0.2 text-[9px] text-rose-100">
                  {attentionCount}
                </span>
              ) : null}
            </button>

            {/* Toggle Done Column Collapse */}
            <button
              type="button"
              onClick={() => setIsDoneCollapsed((prev) => !prev)}
              title={isDoneCollapsed ? "Expand Done column" : "Collapse Done column"}
              className="rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/50 hover:border-white/20 hover:text-white"
            >
              {isDoneCollapsed ? "Show Done" : "Hide Done"}
            </button>
          </div>
        </div>

        {cronError ? (
          <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-[11px] text-rose-100">
            {cronError}
          </div>
        ) : null}
      </div>

      {/* Main Board Columns Area */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onWheel={(e) => e.stopPropagation()}
      >
        <div
          className="h-full min-h-0 overflow-x-auto overflow-y-hidden p-4"
          onWheel={(e) => {
            e.stopPropagation();
            // Allow horizontal scroll on board when scrolling over headers or board background
            const target = e.target as HTMLElement;
            const isInsideCardList = target.closest(".kanban-card-scroll-area");
            if (!isInsideCardList && e.deltaY !== 0 && !e.shiftKey) {
              e.currentTarget.scrollLeft += e.deltaY * 0.8;
            }
          }}
        >
          <div
            className={`grid h-full min-h-0 gap-3 transition-all ${
              isDoneCollapsed
                ? "min-w-[850px] grid-cols-[repeat(4,minmax(0,1fr))_54px]"
                : "min-w-[960px] grid-cols-5"
            }`}
          >
            {STATUS_ORDER.map((status) => {
              const meta = STATUS_META[status];
              const cards = filteredCardsByStatus[status];
              const totalInColumn = cardsByStatus[status].length;
              const ColumnIcon = meta.icon;
              const isCollapsed = status === "done" && isDoneCollapsed;

              if (isCollapsed) {
                return (
                  <div
                    key={status}
                    onClick={() => setIsDoneCollapsed(false)}
                    className="flex h-full min-h-0 cursor-pointer flex-col items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-950/20 py-4 transition hover:border-emerald-400/40 hover:bg-emerald-950/35"
                    title="Click to expand Done column"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-300" />
                      <span className="font-mono text-[11px] font-bold text-emerald-200 [writing-mode:vertical-rl]">
                        DONE ({totalInColumn})
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-emerald-300/60" />
                  </div>
                );
              }

              return (
                <div
                  key={status}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    const cardId = stopAndGetCardId(event);
                    if (!cardId) return;
                    onMoveCard(cardId, status);
                  }}
                  className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border ${meta.columnBorderClass} bg-[#0b0e0c]/70 shadow-lg backdrop-blur-sm`}
                >
                  {/* Column Header */}
                  <div className="shrink-0 border-b border-white/8 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${meta.headerClass}`}
                      >
                        <ColumnIcon
                          className={`h-3.5 w-3.5 ${
                            status === "working" && cards.length > 0
                              ? "animate-spin [animation-duration:3s]"
                              : ""
                          }`}
                        />
                        {meta.label}
                      </div>
                      <div className="flex items-center gap-1">
                        <div
                          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${meta.countClass}`}
                        >
                          {cards.length}
                          {cards.length !== totalInColumn ? (
                            <span className="font-normal opacity-60">
                              /{totalInColumn}
                            </span>
                          ) : null}
                        </div>
                        {status === "done" ? (
                          <button
                            type="button"
                            onClick={() => setIsDoneCollapsed(true)}
                            title="Collapse Done column"
                            className="text-white/30 hover:text-white"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/35">
                      {meta.hint}
                    </div>
                  </div>

                  {/* Column Cards Container */}
                  <div
                    onWheel={(e) => e.stopPropagation()}
                    className="kanban-card-scroll-area flex-1 min-h-0 space-y-2.5 overflow-y-auto overscroll-contain p-3"
                  >
                    {cards.length === 0 ? (
                      <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 px-3 text-center font-mono text-[10px] uppercase tracking-wider text-white/25">
                        <span>No cards</span>
                        {totalInColumn > 0 ? (
                          <span className="mt-1 text-[9px] text-white/15">
                            ({totalInColumn} hidden by filter)
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      cards.map((card) => {
                        const platform = formatPlatform(card.channel);
                        const scheduled = formatScheduledFor(card.scheduledFor);
                        const isBlocked =
                          card.status === "needs_attention" ||
                          card.nativeStatus === "blocked" ||
                          Boolean(card.blockKind);
                        const blockerText =
                          card.blockerReason ||
                          card.notes?.[0] ||
                          (card.blockKind
                            ? formatBlockKind(card.blockKind)
                            : "Action required to proceed");

                        return (
                          <div
                            key={card.id}
                            draggable
                            aria-label={`${card.title} — ${meta.label}`}
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/task-card-id", card.id);
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onClick={() =>
                              onSelectCard(selectedCard?.id === card.id ? null : card.id)
                            }
                            onKeyDown={(event: ReactKeyboardEvent) => {
                              const currentIdx = STATUS_ORDER.indexOf(card.status);
                              if (
                                event.key === "ArrowRight" &&
                                currentIdx < STATUS_ORDER.length - 1
                              ) {
                                event.preventDefault();
                                onMoveCard(card.id, STATUS_ORDER[currentIdx + 1]!);
                              } else if (event.key === "ArrowLeft" && currentIdx > 0) {
                                event.preventDefault();
                                onMoveCard(card.id, STATUS_ORDER[currentIdx - 1]!);
                              }
                            }}
                            className={`group relative flex w-full cursor-pointer flex-col rounded-xl border p-3 text-left transition-all duration-150 ${
                              selectedCard?.id === card.id
                                ? meta.cardSelectedClass
                                : `border-white/10 bg-[#0d120f]/90 ${meta.cardIdleClass}`
                            }`}
                          >
                            {/* Card Top: Agent Badge + Relative Time */}
                            <div className="flex items-center justify-between gap-2">
                              <AgentBadge agentId={card.assignedAgentId} />
                              <span className="font-mono text-[9px] text-white/40">
                                {formatRelativeTime(
                                  card.lastActivityAt ?? card.updatedAt,
                                )}
                              </span>
                            </div>

                            {/* Card Title */}
                            <div className="mt-2 text-[13px] font-semibold leading-snug text-white/90 group-hover:text-white">
                              {card.title}
                            </div>

                            {/* Card Description */}
                            {card.description ? (
                              <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/50">
                                {card.description}
                              </div>
                            ) : null}

                            {/* High-Visibility Blocker Box */}
                            {isBlocked ? (
                              <div className="mt-2.5 rounded-lg border border-rose-500/40 bg-rose-950/40 p-2 text-rose-200 shadow-sm">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-rose-300">
                                    <AlertTriangle className="h-3 w-3 shrink-0 text-rose-400" />
                                    <span>
                                      {formatBlockKind(card.blockKind) || "Blocked"}
                                    </span>
                                  </div>
                                  <span className="font-mono text-[9px] text-rose-300/80 group-hover:underline">
                                    Inspect &rarr;
                                  </span>
                                </div>
                                <div className="mt-1 line-clamp-2 text-[11px] font-medium leading-tight text-rose-100/90">
                                  {blockerText}
                                </div>
                              </div>
                            ) : null}

                            {/* Streamlined Card Bottom Chips */}
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                              {card.nativeStatus === "review" ? (
                                <CardChip className="border-cyan-400/40 bg-cyan-500/20 text-cyan-200 font-semibold">
                                  Review required
                                </CardChip>
                              ) : null}

                              {platform ? <CardChip>{platform}</CardChip> : null}

                              {scheduled ? (
                                <CardChip
                                  icon={AlarmClock}
                                  className="border-violet-400/30 bg-violet-500/15 text-violet-200"
                                >
                                  {scheduled}
                                </CardChip>
                              ) : null}

                              {card.runId ? (
                                <CardChip className="border-amber-400/30 bg-amber-500/15 text-amber-200">
                                  Run active
                                </CardChip>
                              ) : null}

                              {card.learnedSkill ? (
                                <span
                                  title="This task taught the agent a new skill."
                                  className="inline-flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-200"
                                >
                                  <Sparkles className="h-2.5 w-2.5" /> skill
                                </span>
                              ) : null}

                              {card.subagentCount > 0 ? (
                                <CardChip
                                  icon={SplitSquareHorizontal}
                                  className="border-violet-400/20 text-violet-200/70"
                                >
                                  {card.subagentCount} subagents
                                </CardChip>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Slide-Over Overlay Inspector Sheet (Does NOT squash board columns) */}
        {selectedCard ? (
          <>
            {/* Subtle Backdrop to click outside and close */}
            <div
              onClick={() => onSelectCard(null)}
              className="absolute inset-0 z-30 bg-black/40 backdrop-blur-[2px] transition-opacity"
            />

            {/* Slide-over Drawer Panel */}
            <aside className="absolute bottom-0 right-0 top-0 z-40 flex w-[440px] max-w-[90vw] flex-col border-l border-emerald-500/25 bg-[#0b0f0c] shadow-2xl backdrop-blur-2xl">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-white/10 bg-[#060807] px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <AgentBadge agentId={selectedCard.assignedAgentId} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                    ID: {selectedCard.id}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectCard(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-white/50 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Drawer Scrollable Content */}
              <div
                onWheel={(e) => e.stopPropagation()}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
              >
                {/* Hermes Status & Blocker Resolution Section */}
                {selectedKanbanTask ? (
                  <section className="space-y-3 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.07] p-3.5 shadow-sm">
                    <div className="flex items-start gap-2.5">
                      {selectedTaskIsBlocked ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                      ) : (
                        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-cyan-200/70">
                          Hermes Status
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-white">
                          {formatNativeStatus(selectedNativeStatus)}
                        </div>
                        {selectedBlockKind ? (
                          <div className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-rose-300">
                            {formatBlockKind(selectedBlockKind)}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {selectedBlockerReason ? (
                      <div className="rounded-lg border border-rose-400/30 bg-rose-500/15 p-3 text-[12px] leading-relaxed text-rose-100">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-rose-300">
                          Blocker details:
                        </div>
                        <div className="mt-1 whitespace-pre-wrap">
                          {selectedBlockerReason}
                        </div>
                      </div>
                    ) : null}

                    {taskDetailLoading ? (
                      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-white/50">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                        Loading task details…
                      </div>
                    ) : null}

                    {taskDetail?.comments.length ? (
                      <div className="space-y-2">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-white/45">
                          Task Conversation &amp; Logs
                        </div>
                        <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                          {taskDetail.comments.slice(-8).map((comment) => (
                            <div
                              key={comment.id}
                              className="rounded-lg border border-white/10 bg-black/40 p-2.5"
                            >
                              <div className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-wider text-white/40">
                                <span className="font-semibold text-cyan-300">
                                  {comment.author}
                                </span>
                                <span>
                                  {comment.createdAt
                                    ? new Date(comment.createdAt).toLocaleTimeString()
                                    : ""}
                                </span>
                              </div>
                              <div className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-white/80">
                                {comment.body}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {onAddTaskComment || onReplyAndResumeTask ? (
                      <div className="space-y-2.5 pt-1">
                        <label className="flex flex-col gap-1">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-white/50">
                            Reply to Agent
                          </span>
                          <textarea
                            rows={3}
                            value={replyText}
                            onChange={(event) => setReplyText(event.target.value)}
                            placeholder={
                              selectedTaskIsBlocked
                                ? "Provide decision or unblock instructions…"
                                : "Add context for the worker run…"
                            }
                            className="rounded-lg border border-white/15 bg-black/50 p-2.5 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:outline-none"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {onAddTaskComment ? (
                            <button
                              type="button"
                              disabled={!replyText.trim() || taskActionBusy}
                              onClick={() => void submitTaskComment(false)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-white/80 transition hover:border-white/30 hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              Add Comment
                            </button>
                          ) : null}
                          {selectedTaskIsBlocked && onReplyAndResumeTask ? (
                            <button
                              type="button"
                              disabled={!replyText.trim() || taskActionBusy}
                              onClick={() => void submitTaskComment(true)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/25 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              {taskActionBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <PlayCircle className="h-3.5 w-3.5" />
                              )}
                              Reply &amp; Resume
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {taskActionError ? (
                      <div className="rounded-lg border border-rose-400/30 bg-rose-500/20 p-2.5 text-[11px] text-rose-100">
                        {taskActionError}
                      </div>
                    ) : null}
                    {taskActionMessage ? (
                      <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/20 p-2.5 text-[11px] text-emerald-100">
                        {taskActionMessage}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {/* Edit Task Fields */}
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                    Title
                  </span>
                  <input
                    value={selectedCard.title}
                    onChange={(event) =>
                      onUpdateCard(selectedCard.id, { title: event.target.value })
                    }
                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400/40 focus:outline-none"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                    Description
                  </span>
                  <textarea
                    rows={4}
                    value={selectedCard.description}
                    onChange={(event) =>
                      onUpdateCard(selectedCard.id, {
                        description: event.target.value,
                      })
                    }
                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400/40 focus:outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                      Status
                    </span>
                    <select
                      value={selectedCard.status}
                      onChange={(event) =>
                        onMoveCard(
                          selectedCard.id,
                          event.target.value as TaskBoardStatus,
                        )
                      }
                      className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400/40 focus:outline-none"
                    >
                      {STATUS_ORDER.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_META[status].label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                      Assigned Agent
                    </span>
                    <select
                      value={selectedCard.assignedAgentId ?? ""}
                      onChange={(event) =>
                        onUpdateCard(selectedCard.id, {
                          assignedAgentId: event.target.value || null,
                        })
                      }
                      className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400/40 focus:outline-none"
                    >
                      <option value="">Unassigned</option>
                      {agents.map((agent) => (
                        <option key={agent.agentId} value={agent.agentId}>
                          {agent.name || agent.agentId}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                    Notes
                  </span>
                  <textarea
                    rows={3}
                    value={selectedCard.notes?.join("\n") || ""}
                    onChange={(event) =>
                      onUpdateCard(selectedCard.id, {
                        notes: event.target.value
                          .split("\n")
                          .map((entry) => entry.trim())
                          .filter(Boolean),
                      })
                    }
                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400/40 focus:outline-none"
                  />
                </label>

                {/* Metadata Summary Box */}
                <div className="space-y-1.5 rounded-lg border border-white/8 bg-white/[0.02] p-3 font-mono text-[10px] uppercase tracking-wider text-white/40">
                  <div>Source: {selectedCard.source.replaceAll("_", " ")}</div>
                  {selectedCard.model ? <div>Model: {selectedCard.model}</div> : null}
                  {selectedCard.channel ? (
                    <div>Platform: {selectedCard.channel}</div>
                  ) : null}
                  {selectedCard.subagentCount > 0 ? (
                    <div>Subagents: {selectedCard.subagentCount}</div>
                  ) : null}
                  {selectedCard.scheduledFor ? (
                    <div>
                      Scheduled:{" "}
                      {new Date(selectedCard.scheduledFor).toLocaleString()}
                    </div>
                  ) : null}
                  <div>
                    Updated: {new Date(selectedCard.updatedAt).toLocaleString()}
                  </div>
                </div>

                {/* Delete Button */}
                <button
                  type="button"
                  onClick={() => onDeleteCard(selectedCard.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/20 hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Task
                </button>
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </section>
  );
}
