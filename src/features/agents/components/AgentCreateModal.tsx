"use client";

import { useState } from "react";
import { Shuffle } from "lucide-react";
import type { AgentCreateModalSubmitPayload } from "@/features/agents/creation/types";
import { AgentAvatar } from "@/features/agents/components/AgentAvatar";
import { randomUUID } from "@/lib/uuid";

type AgentCreateModalProps = {
  open: boolean;
  suggestedName: string;
  busy?: boolean;
  submitError?: string | null;
  onClose: () => void;
  onSubmit: (payload: AgentCreateModalSubmitPayload) => Promise<void> | void;
};

const fieldClassName =
  "ui-input w-full rounded-md px-3 py-2 text-xs text-foreground outline-none";
const labelClassName =
  "font-mono text-[11px] font-semibold tracking-[0.05em] text-muted-foreground";

const resolveInitialName = (suggestedName: string): string => {
  const trimmed = suggestedName.trim();
  if (!trimmed) return "Agen Baru";
  return trimmed;
};

const AgentCreateModalContent = ({
  suggestedName,
  busy,
  submitError,
  onClose,
  onSubmit,
}: Omit<AgentCreateModalProps, "open">) => {
  const [name, setName] = useState(() => resolveInitialName(suggestedName));
  const [avatarSeed, setAvatarSeed] = useState(() => randomUUID());

  const canSubmit = name.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit || busy) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;
    void onSubmit({ name: trimmedName, avatarSeed });
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-background/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Buat agen"
      onClick={busy ? undefined : onClose}
    >
      <form
        className="ui-panel w-full max-w-2xl shadow-xs"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        onClick={(event) => event.stopPropagation()}
        data-testid="agent-create-modal"
      >
        <div className="flex items-center justify-between border-b border-border/35 px-6 py-6">
          <div>
            <div className="font-mono text-[11px] font-semibold tracking-[0.06em] text-muted-foreground">
              New agent
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">Launch agent</div>
            <div className="mt-1 text-xs text-muted-foreground">Name it and activate immediately.</div>
          </div>
          <button
            type="button"
            className="ui-btn-ghost px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5">
          <label className={labelClassName}>
            Name
            <input
              aria-label="Agent name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={`mt-1 ${fieldClassName}`}
              placeholder="My agent"
            />
          </label>
          <div className="-mt-2 text-[11px] text-muted-foreground">
            You can rename this agent from the main chat header.
          </div>
          <div className="grid justify-items-center gap-2 border-t border-border/40 pt-3">
            <div className={labelClassName}>Choose avatar</div>
            <AgentAvatar
              seed={avatarSeed}
              name={name.trim() || "Agen Baru"}
              size={64}
              isSelected
            />
            <button
              type="button"
              aria-label="Shuffle avatar selection"
              className="ui-btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
              onClick={() => setAvatarSeed(randomUUID())}
              disabled={busy}
            >
              <Shuffle className="h-3.5 w-3.5" />
              Shuffle
            </button>
          </div>

          {submitError ? (
            <div className="ui-alert-danger rounded-md px-3 py-2 text-xs">
              {submitError}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border/45 px-6 pb-4 pt-5">
          <div className="text-[11px] text-muted-foreground">Authority can be configured after launch.</div>
          <button
            type="submit"
            className="ui-btn-primary px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
            disabled={!canSubmit || busy}
          >
            {busy ? "Launching..." : "Launch agent"}
          </button>
        </div>
      </form>
    </div>
  );
};

export const AgentCreateModal = ({
  open,
  suggestedName,
  busy = false,
  submitError = null,
  onClose,
  onSubmit,
}: AgentCreateModalProps) => {
  if (!open) return null;
  return (
    <AgentCreateModalContent
      suggestedName={suggestedName}
      busy={busy}
      submitError={submitError}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
};
