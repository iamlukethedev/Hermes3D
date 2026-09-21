"use client";

import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";

import type { AgentState } from "@/features/agents/state/store";
import { TaskBoardView } from "@/features/office/tasks/TaskBoardView";
import type { TaskBoardCard, TaskBoardStatus } from "@/features/office/tasks/types";
import type { CronJobSummary } from "@/lib/cron/types";

export function KanbanImmersiveScreen({
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
  onClose,
}: {
  agents: AgentState[];
  cardsByStatus: Record<TaskBoardStatus, TaskBoardCard[]>;
  selectedCard: TaskBoardCard | null;
  activeRuns: Array<{ runId: string; agentId: string; label: string }>;
  cronJobs: CronJobSummary[];
  cronLoading: boolean;
  cronError: string | null;
  taskCaptureDebug?: ComponentProps<typeof TaskBoardView>["taskCaptureDebug"];
  onCreateCard: () => void;
  onMoveCard: (cardId: string, status: TaskBoardStatus) => void;
  onSelectCard: (cardId: string | null) => void;
  onUpdateCard: (cardId: string, patch: Partial<TaskBoardCard>) => void;
  onDeleteCard: (cardId: string) => void;
  onLoadTaskDetail?: ComponentProps<typeof TaskBoardView>["onLoadTaskDetail"];
  onAddTaskComment?: ComponentProps<typeof TaskBoardView>["onAddTaskComment"];
  onReplyAndResumeTask?: ComponentProps<
    typeof TaskBoardView
  >["onReplyAndResumeTask"];
  onRefreshCronJobs: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (isMaximized) {
          setIsMaximized(false);
        } else {
          onClose();
        }
      }
    },
    [isMaximized, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog.focus();

    const trapFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) {
        event.stopPropagation();
        dialog.focus();
      }
    };

    document.addEventListener("focusin", trapFocus);
    return () => {
      document.removeEventListener("focusin", trapFocus);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kanban Board"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all"
      onWheel={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative">
        <div className="absolute -top-4 right-2 z-20 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsMaximized((prev) => !prev)}
            aria-label={isMaximized ? "Restore size" : "Maximize view"}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-400/25 bg-[#0e0b07]/90 text-amber-200/80 shadow-lg backdrop-blur-md transition hover:border-amber-400/50 hover:bg-[#19140c] hover:text-white"
          >
            {isMaximized ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Kanban Board"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-400/25 bg-[#0e0b07]/90 text-amber-200/80 shadow-lg backdrop-blur-md transition hover:border-rose-400/50 hover:bg-rose-950/40 hover:text-rose-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          ref={dialogRef}
          tabIndex={-1}
          className={`flex flex-col overflow-hidden rounded-2xl border border-amber-500/20 bg-[#0a0d0b]/92 shadow-2xl outline-none backdrop-blur-xl transition-all duration-200 ${
            isMaximized
              ? "h-[95vh] w-[98vw]"
              : "h-[min(88vh,920px)] w-[min(94vw,1560px)]"
          }`}
        >
          <div className="min-h-0 flex-1">
            <TaskBoardView
              title="Hermes Task Board"
              subtitle="Inbox, schedules, live runs, approvals, and learned skills."
              agents={agents}
              cardsByStatus={cardsByStatus}
              selectedCard={selectedCard}
              activeRuns={activeRuns}
              cronJobs={cronJobs}
              cronLoading={cronLoading}
              cronError={cronError}
              taskCaptureDebug={taskCaptureDebug}
              onCreateCard={onCreateCard}
              onMoveCard={onMoveCard}
              onSelectCard={onSelectCard}
              onUpdateCard={onUpdateCard}
              onDeleteCard={onDeleteCard}
              onLoadTaskDetail={onLoadTaskDetail}
              onAddTaskComment={onAddTaskComment}
              onReplyAndResumeTask={onReplyAndResumeTask}
              onRefreshCronJobs={onRefreshCronJobs}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
