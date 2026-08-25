"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { AgentState } from "@/features/agents/state/store";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import { AgentIdentityFields } from "@/features/agents/components/AgentIdentityFields";
import {
  AGENT_FILE_META,
  PERSONALITY_FILE_NAMES,
  type AgentFileName,
} from "@/lib/agents/agentFiles";
import {
  createEmptyPersonalityDraft,
  parsePersonalityFiles,
  serializePersonalityFiles,
} from "@/lib/agents/personalityBuilder";
import { useAgentFilesEditor } from "@/features/agents/hooks/useAgentFilesEditor";
import { useManagedFleetProfile } from "@/features/agents/hooks/useManagedFleetProfile";

export type AgentBrainPanelProps = {
  client: GatewayClient;
  agents: AgentState[];
  selectedAgentId: string | null;
  activeSection?: AgentFileName;
  onCancel?: () => void;
  onUnsavedChangesChange?: (dirty: boolean) => void;
  onRename?: (agentId: string, name: string) => Promise<boolean>;
};

const AgentBrainPanelSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="space-y-3 border-t border-border/55 pt-8 first:border-t-0 first:pt-0">
    <h3 className="text-sm font-medium text-foreground">{title}</h3>
    {children}
  </section>
);

const AgentFileProvenance = ({
  path,
  workspace,
}: {
  path: string | null;
  workspace: string | null;
}) => {
  if (!path && !workspace) return null;
  return (
    <div className="rounded-md border border-border/50 bg-black/20 px-3 py-2 text-[11px] text-muted-foreground">
      {workspace ? (
        <div>
          Workspace: <span className="font-mono text-foreground">{workspace}</span>
        </div>
      ) : null}
      {path ? (
        <div>
          File: <span className="font-mono text-foreground">{path}</span>
        </div>
      ) : null}
    </div>
  );
};

export const AgentBrainPanel = ({
  client,
  agents,
  selectedAgentId,
  activeSection,
  onCancel,
  onUnsavedChangesChange,
  onRename,
}: AgentBrainPanelProps) => {
  const selectedAgent = useMemo(
    () =>
      selectedAgentId
        ? agents.find((entry) => entry.agentId === selectedAgentId) ?? null
        : null,
    [agents, selectedAgentId]
  );

  const {
    agentFiles,
    agentFilesLoading,
    agentFilesSaving,
    agentFilesDirty,
    agentFilesError,
    setAgentFileContent,
    saveAgentFiles,
    initializeAgentFiles,
  } = useAgentFilesEditor({ client, agentId: selectedAgent?.agentId ?? null });
  const managedFleet = useManagedFleetProfile(selectedAgent?.agentId ?? null);
  const managedProfile = managedFleet.profile;
  const isManagedProfile = Boolean(managedProfile);
  const draft = useMemo(() => parsePersonalityFiles(agentFiles), [agentFiles]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const missingPersonalityFiles = useMemo(
    () => PERSONALITY_FILE_NAMES.filter((name) => !agentFiles[name].exists),
    [agentFiles]
  );

  const setIdentityField = useCallback(
    (field: "name" | "creature" | "vibe" | "emoji" | "avatar", value: string) => {
      if (isManagedProfile) return;
      const nextDraft = parsePersonalityFiles(agentFiles);
      nextDraft.identity[field] = value;
      const serialized = serializePersonalityFiles(nextDraft);
      setAgentFileContent("IDENTITY.md", serialized["IDENTITY.md"]);
    },
    [agentFiles, isManagedProfile, setAgentFileContent]
  );

  const handleSave = useCallback(async () => {
    if (isManagedProfile || agentFilesLoading || agentFilesSaving || !agentFilesDirty) return;
    setSaveError(null);
    const saved = await saveAgentFiles();
    if (!saved || !selectedAgent || !onRename) {
      return;
    }
    const nextName = draft.identity.name.trim();
    const currentName = selectedAgent.name.trim();
    if (!nextName || nextName === currentName) {
      return;
    }
    const renamed = await onRename(selectedAgent.agentId, nextName);
    if (!renamed) {
      setSaveError("Saved IDENTITY.md, but could not rename the live agent.");
    }
  }, [
    agentFilesDirty,
    agentFilesLoading,
    agentFilesSaving,
    draft.identity.name,
    isManagedProfile,
    onRename,
    saveAgentFiles,
    selectedAgent,
  ]);

  const handleInitializeMissingFiles = useCallback(async () => {
    if (!selectedAgent || isManagedProfile) return;
    setSaveError(null);
    const nextDraft = createEmptyPersonalityDraft();
    nextDraft.identity.name = selectedAgent.name.trim();
    nextDraft.identity.creature = selectedAgent.role?.trim() ?? "";
    const serialized = serializePersonalityFiles(nextDraft);
    const missingEntries = Object.fromEntries(
      missingPersonalityFiles.map((name) => [name, serialized[name]])
    ) as Partial<Record<AgentFileName, string>>;
    await initializeAgentFiles(missingEntries);
  }, [initializeAgentFiles, isManagedProfile, missingPersonalityFiles, selectedAgent]);

  useEffect(() => {
    onUnsavedChangesChange?.(isManagedProfile ? false : agentFilesDirty);
  }, [agentFilesDirty, isManagedProfile, onUnsavedChangesChange]);

  useEffect(() => {
    return () => {
      onUnsavedChangesChange?.(false);
    };
  }, [onUnsavedChangesChange]);

  const renderMarkdownEditor = useCallback(
    (name: Exclude<AgentFileName, "IDENTITY.md">) => {
      const file = agentFiles[name];
      const trimmedContent = file.content.trim();
      const statusCopy = !file.exists
        ? `This agent does not have a custom ${name} yet. Saving here will create the real workspace file.`
        : !trimmedContent
          ? `This agent's ${name} exists, but it is currently empty.`
          : null;
      return (
        <AgentBrainPanelSection title={AGENT_FILE_META[name].title}>
          <div className="text-xs text-muted-foreground">{AGENT_FILE_META[name].hint}</div>
          {statusCopy ? (
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {statusCopy}
            </div>
          ) : null}
          <AgentFileProvenance path={file.path} workspace={file.workspace} />
          <textarea
            aria-label={AGENT_FILE_META[name].title}
            className="h-[min(56vh,480px)] w-full resize-y rounded-md border border-border/80 bg-background px-4 py-3 font-mono text-sm leading-6 text-foreground outline-none"
            value={file.content}
            placeholder={!file.exists ? `No ${name} yet.` : ""}
            disabled={isManagedProfile || agentFilesLoading || agentFilesSaving}
            onChange={(event) => {
              setAgentFileContent(name, event.target.value);
            }}
          />
        </AgentBrainPanelSection>
      );
    },
    [agentFiles, agentFilesLoading, agentFilesSaving, isManagedProfile, setAgentFileContent],
  );

  const renderIdentityEditor = useCallback(
    () => (
      <section className="space-y-3 border-t border-border/55 pt-8 first:border-t-0 first:pt-0">
        <h3 className="text-sm font-medium text-foreground">{AGENT_FILE_META["IDENTITY.md"].title}</h3>
        <div className="text-xs text-muted-foreground">
          {AGENT_FILE_META["IDENTITY.md"].hint}
        </div>
        <div className="text-xs text-muted-foreground">
          Changing <span className="font-medium text-foreground">Name</span> here also renames the live agent
          when you save.
        </div>
        <AgentFileProvenance
          path={agentFiles["IDENTITY.md"].path}
          workspace={agentFiles["IDENTITY.md"].workspace}
        />
        <AgentIdentityFields
          values={draft.identity}
          disabled={isManagedProfile || agentFilesLoading || agentFilesSaving}
          onChange={(field, value) => {
            setIdentityField(field, value);
          }}
        />
      </section>
    ),
    [agentFiles, agentFilesLoading, agentFilesSaving, draft.identity, isManagedProfile, setIdentityField],
  );

  const renderedSections = useMemo(() => {
    if (activeSection === "IDENTITY.md") {
      return [renderIdentityEditor()];
    }
    if (activeSection) {
      return [renderMarkdownEditor(activeSection as Exclude<AgentFileName, "IDENTITY.md">)];
    }
    return [
      renderMarkdownEditor("SOUL.md"),
      renderMarkdownEditor("AGENTS.md"),
      renderMarkdownEditor("USER.md"),
      renderIdentityEditor(),
    ];
  }, [activeSection, renderIdentityEditor, renderMarkdownEditor]);

  return (
    <div
      className="agent-inspect-panel flex min-h-0 flex-col overflow-hidden"
      data-testid="agent-personality-panel"
      style={{ position: "relative", left: "auto", top: "auto", width: "100%", height: "100%" }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
        <section
          className="mx-auto flex min-h-0 w-full max-w-[920px] flex-col"
          data-testid="agent-personality-files"
        >
          {managedProfile ? (
            <div className="mb-5 space-y-3 rounded-lg border border-sky-500/35 bg-sky-500/10 p-4 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">Managed by {managedFleet.fleetId}</div>
                  <div className="mt-1 text-muted-foreground">
                    Edit the canonical profile in HermesProjects, then validate, preview, and apply the
                    complete projection. Direct live-file saves are disabled.
                  </div>
                </div>
                <span className="rounded-full border border-border/70 px-2 py-1 font-mono text-[10px] uppercase text-foreground">
                  {managedProfile.health.status}
                </span>
              </div>
              <div className="grid gap-2 text-muted-foreground md:grid-cols-2">
                <div>
                  Source: <span className="font-mono text-foreground">{managedFleet.sourceHash?.slice(0, 12)}</span>
                </div>
                <div>
                  Deployed: <span className="font-mono text-foreground">{managedProfile.health.deployedHash?.slice(0, 12) ?? "none"}</span>
                </div>
                <div>Workspace: <span className="text-foreground">{managedProfile.workspace.mode}</span></div>
                <div>Heartbeat: <span className="text-foreground">{managedProfile.heartbeat.responsibility}</span></div>
                <div className="md:col-span-2">
                  Memory: curated role invariants; learned local context is unverified; shared vaults are {managedProfile.memory.shared_vaults}.
                </div>
                <div className="md:col-span-2">
                  Skills: <span className="text-foreground">{managedProfile.skills.join(", ")}</span>
                </div>
                {managedProfile.health.missingFiles.length ? (
                  <div className="md:col-span-2 text-amber-300">
                    Missing: {managedProfile.health.missingFiles.join(", ")}
                  </div>
                ) : null}
                {managedProfile.health.changedFiles.length ? (
                  <div className="md:col-span-2 text-amber-300">
                    Drift: {managedProfile.health.changedFiles.join(", ")}
                  </div>
                ) : null}
              </div>
              {managedFleet.error ? <div className="text-red-300">{managedFleet.error}</div> : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="ui-btn-secondary px-3 py-2 text-xs"
                  disabled={managedFleet.busy}
                  onClick={() => void managedFleet.runAction("validate")}
                >
                  Validate
                </button>
                <button
                  type="button"
                  className="ui-btn-secondary px-3 py-2 text-xs"
                  disabled={managedFleet.busy || managedFleet.validatedHash !== managedFleet.sourceHash}
                  onClick={() => void managedFleet.runAction("diff")}
                >
                  Preview diff
                </button>
                <button
                  type="button"
                  className="ui-btn-primary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    managedFleet.busy ||
                    !managedFleet.mutationsEnabled ||
                    managedFleet.previewedHash !== managedFleet.sourceHash
                  }
                  onClick={() => void managedFleet.runAction("apply")}
                >
                  Apply fleet
                </button>
                <button
                  type="button"
                  className="ui-btn-ghost px-3 py-2 text-xs"
                  disabled={managedFleet.busy || !managedFleet.mutationsEnabled}
                  onClick={() => void managedFleet.runAction("rollback")}
                >
                  Roll back latest
                </button>
              </div>
              {managedFleet.output ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-black/30 p-3 font-mono text-[10px] text-muted-foreground">
                  {managedFleet.output}
                </pre>
              ) : null}
            </div>
          ) : null}
          {agentFilesError ? (
            <div className="ui-alert-danger mb-4 rounded-md px-3 py-2 text-xs">
              {agentFilesError}
            </div>
          ) : null}
          {saveError ? (
            <div className="ui-alert-danger mb-4 rounded-md px-3 py-2 text-xs">
              {saveError}
            </div>
          ) : null}

          <div className="mb-6 flex items-center justify-end gap-2 border-b border-border/40 pb-4">
            {!isManagedProfile && missingPersonalityFiles.length > 0 ? (
              <button
                type="button"
                className="ui-btn-secondary px-3 py-2 text-xs"
                disabled={agentFilesLoading || agentFilesSaving}
                onClick={() => {
                  void handleInitializeMissingFiles();
                }}
              >
                Initialize missing files
              </button>
            ) : null}
            <button
              type="button"
              className="ui-btn-ghost px-3 py-2 text-xs"
              disabled={agentFilesLoading || agentFilesSaving}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ui-btn-primary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              disabled={isManagedProfile || agentFilesLoading || agentFilesSaving || !agentFilesDirty}
              onClick={() => {
                void handleSave();
              }}
            >
              Save
            </button>
          </div>

          <div className="space-y-8 pb-8">
            {renderedSections.map((section, index) => (
              <div key={`${activeSection ?? "all"}-${index}`}>{section}</div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
