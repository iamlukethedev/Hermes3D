import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { readConfigAgentList } from "@/lib/gateway/agentConfig";
import {
  loadGitHubDashboard,
  type GitHubPullRequestSummary,
} from "@/lib/office/github";
import { validateJiraBaseUrl } from "@/lib/security/urlSafety";
import type {
  StandupAgentSnapshot,
  StandupBlockerDecisionGroup,
  StandupBlockerOption,
  StandupCommitSummary,
  StandupConfig,
  StandupMeeting,
  StandupSourceState,
  StandupSummaryCard,
  StandupTicketSummary,
  StandupTriggerKind,
  StandupTaskDispatchState,
} from "@/lib/office/standup/types";
import { resolveStateDir } from "@/lib/hermes/paths";
import { listSharedTasks, upsertSharedTask } from "@/lib/tasks/shared-store";

type JiraIssueRecord = StandupTicketSummary & {
  assigneeName: string | null;
  assigneeEmail: string | null;
};

const HERMES_CONFIG_FILENAME = "hermes.json";

const coerceText = (value: string | null | undefined): string => {
  return (value ?? "").replace(/\s+/g, " ").trim();
};

const splitBlockers = (value: string): string[] => {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 3);
};

export const shouldApplyKanbanTaskBlocker = (params: {
  manualTask: string | null | undefined;
  kanbanTask: string | null | undefined;
  kanbanBlocker: string | null | undefined;
}): boolean => {
  const kanbanTask = coerceText(params.kanbanTask);
  if (!kanbanTask || !coerceText(params.kanbanBlocker)) return false;
  const manualTask = coerceText(params.manualTask);
  return !manualTask || manualTask.toLocaleLowerCase() === kanbanTask.toLocaleLowerCase();
};

const buildSourceState = (
  kind: StandupSourceState["kind"],
  input: Partial<StandupSourceState>
): StandupSourceState => ({
  kind,
  ready: input.ready ?? false,
  stale: input.stale ?? false,
  updatedAt: input.updatedAt ?? null,
  error: input.error ?? null,
});

const dedupePullRequests = (entries: GitHubPullRequestSummary[]): GitHubPullRequestSummary[] => {
  const seen = new Set<string>();
  const result: GitHubPullRequestSummary[] = [];
  for (const entry of entries) {
    const key = `${entry.repo}#${entry.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
};

const loadGitHubCommitSummaries = (): {
  commits: StandupCommitSummary[];
  hasFailingChecks: boolean;
  sourceState: StandupSourceState;
} => {
  try {
    const dashboard = loadGitHubDashboard();
    if (!dashboard.ready) {
      return {
        commits: [],
        hasFailingChecks: false,
        sourceState: buildSourceState("github", {
          ready: false,
          error: dashboard.message ?? "GitHub is not ready.",
        }),
      };
    }
    const combined = dedupePullRequests([
      ...dashboard.currentRepoPullRequests,
      ...dashboard.reviewRequests,
      ...dashboard.authoredPullRequests,
    ]).slice(0, 6);
    const commits = combined.map((entry) => ({
      id: `${entry.repo}#${entry.number}`,
      title: entry.title,
      subtitle:
        [entry.repo, entry.statusSummary, entry.reviewDecision]
          .filter(Boolean)
          .join(" · ") || null,
      url: entry.url,
    }));
    const hasFailingChecks = combined.some((entry) =>
      (entry.statusSummary ?? "").toLowerCase().includes("failing")
    );
    return {
      commits,
      hasFailingChecks,
      sourceState: buildSourceState("github", {
        ready: true,
        updatedAt: new Date().toISOString(),
      }),
    };
  } catch (error) {
    return {
      commits: [],
      hasFailingChecks: false,
      sourceState: buildSourceState("github", {
        ready: false,
        error: error instanceof Error ? error.message : "Failed to load GitHub activity.",
      }),
    };
  }
};

const buildJiraSearchUrl = (config: StandupConfig["jira"]) => {
  const jql =
    coerceText(config.jql) ||
    (config.projectKey
      ? `project = ${config.projectKey} AND statusCategory != Done ORDER BY updated DESC`
      : "");
  if (!jql) return null;
  const baseUrl = validateJiraBaseUrl(config.baseUrl);
  const url = new URL(`${baseUrl}/rest/api/3/search/jql`);
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("fields", "summary,status,assignee");
  url.searchParams.set("jql", jql);
  return url;
};

const loadJiraIssues = async (
  config: StandupConfig["jira"]
): Promise<{ issues: JiraIssueRecord[]; sourceState: StandupSourceState }> => {
  if (!config.enabled) {
    return {
      issues: [],
      sourceState: buildSourceState("jira", {
        ready: false,
        stale: true,
        error: "Jira is disabled.",
      }),
    };
  }
  if (!config.baseUrl || !config.email || !config.apiToken) {
    return {
      issues: [],
      sourceState: buildSourceState("jira", {
        ready: false,
        stale: true,
        error: "Jira credentials are incomplete.",
      }),
    };
  }
  let jiraBaseUrl: string;
  try {
    jiraBaseUrl = validateJiraBaseUrl(config.baseUrl);
  } catch (error) {
    return {
      issues: [],
      sourceState: buildSourceState("jira", {
        ready: false,
        stale: true,
        error: error instanceof Error ? error.message : "Jira base URL is invalid.",
      }),
    };
  }
  const searchUrl = buildJiraSearchUrl(config);
  if (!searchUrl) {
    return {
      issues: [],
      sourceState: buildSourceState("jira", {
        ready: false,
        stale: true,
        error: "Add a Jira project key or JQL query.",
      }),
    };
  }
  try {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
    const response = await fetch(searchUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          issues?: Array<{
            id?: string;
            key?: string;
            self?: string;
            fields?: {
              summary?: string;
              status?: { name?: string | null } | null;
              assignee?: {
                displayName?: string | null;
                emailAddress?: string | null;
              } | null;
            } | null;
          }>;
          errorMessages?: string[];
        }
      | null;
    if (!response.ok) {
      throw new Error(
        payload?.errorMessages?.join(" ") || "Failed to load Jira issues."
      );
    }
    const issues: JiraIssueRecord[] = (payload?.issues ?? []).map((issue) => ({
      id: issue.id ?? issue.key ?? randomUUID(),
      key: issue.key ?? "JIRA",
      title: coerceText(issue.fields?.summary) || "Untitled issue",
      status: coerceText(issue.fields?.status?.name) || "Unknown",
      url: issue.key ? `${jiraBaseUrl}/browse/${issue.key}` : null,
      assigneeName: coerceText(issue.fields?.assignee?.displayName) || null,
      assigneeEmail: coerceText(issue.fields?.assignee?.emailAddress) || null,
    }));
    return {
      issues,
      sourceState: buildSourceState("jira", {
        ready: true,
        updatedAt: new Date().toISOString(),
      }),
    };
  } catch (error) {
    return {
      issues: [],
      sourceState: buildSourceState("jira", {
        ready: false,
        stale: true,
        error: error instanceof Error ? error.message : "Failed to load Jira issues.",
      }),
    };
  }
};

const normalizeAgentSnapshots = (agents: StandupAgentSnapshot[]): StandupAgentSnapshot[] => {
  const valid = agents
    .map((agent) => ({
      agentId: coerceText(agent.agentId),
      name: coerceText(agent.name) || coerceText(agent.agentId),
      latestPreview: coerceText(agent.latestPreview) || null,
      lastUserMessage: coerceText(agent.lastUserMessage) || null,
      kanbanTaskTitle: coerceText(agent.kanbanTaskTitle) || null,
      kanbanTaskBlocker: coerceText(agent.kanbanTaskBlocker) || null,
    }))
    .filter((agent) => agent.agentId);
  if (valid.length > 0) return valid;
  const configPath = path.join(resolveStateDir(), HERMES_CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) return [];
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const config =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  return readConfigAgentList(config).map((entry) => ({
    agentId: entry.id.trim(),
    name:
      (typeof entry.name === "string" ? entry.name.trim() : "") || entry.id.trim(),
    latestPreview: null,
    lastUserMessage: null,
    kanbanTaskTitle: null,
    kanbanTaskBlocker: null,
  }));
};

const selectAgentIssues = (
  agent: StandupAgentSnapshot,
  manualAssignee: string | null,
  issues: JiraIssueRecord[]
): StandupTicketSummary[] => {
  const nameHint = coerceText(manualAssignee) || coerceText(agent.name) || agent.agentId;
  const normalizedHint = nameHint.toLowerCase();
  const matched = issues.filter((issue) => {
    const displayName = issue.assigneeName?.toLowerCase() ?? "";
    const email = issue.assigneeEmail?.toLowerCase() ?? "";
    return (
      displayName.includes(normalizedHint) ||
      normalizedHint.includes(displayName) ||
      email.includes(normalizedHint)
    );
  });
  return (matched.length > 0 ? matched : issues).slice(0, 3).map((issue) => ({
    id: issue.id,
    key: issue.key,
    title: issue.title,
    status: issue.status,
    url: issue.url,
  }));
};

const buildSpeech = (agentName: string, currentTask: string, blockers: string[]) => {
  const headline = `${agentName}: ${currentTask}`.trim();
  if (headline.length <= 110 && blockers.length === 0) return headline;
  if (blockers.length > 0) {
    const blockerText = `Blocked by ${blockers[0]}.`;
    const combined = `${headline}. ${blockerText}`.trim();
    if (combined.length <= 120) return combined;
  }
  return `${headline.slice(0, 117).trimEnd()}...`;
};

export const synthesizeStandupBlockerDecisions = (params: {
  agentId: string;
  agentName: string;
  currentTask: string;
  blockerText: string;
}): StandupBlockerDecisionGroup => {
  const text = params.blockerText.toLowerCase();
  const options: StandupBlockerOption[] = [];
  let question = `How should we unblock ${params.agentName}?`;

  if (
    text.includes("az login") ||
    text.includes("azure cli") ||
    text.includes("az account") ||
    text.includes("az: command not found") ||
    text.includes("subscription")
  ) {
    question = `How should we unblock ${params.agentName} on Azure access?`;
    options.push({
      id: "opt-host-azure",
      label: "Run via host Azure operator session",
      description:
        "Execute the command/task using the authenticated host terminal session instead of the container.",
      isRecommended: true,
      rationale:
        "Worker sandbox lacks Azure credentials; the host environment is authenticated.",
    });
    options.push({
      id: "opt-dry-run",
      label: "Proceed with local dry-run / Bicep static verification",
      description:
        "Skip live subscription API verification and rely on audited templates.",
      isRecommended: false,
    });
    options.push({
      id: "opt-pause-login",
      label: "Pause until manual 'az login' completes",
      description:
        "Keep task in triage until human operator logs into Azure CLI.",
      isRecommended: false,
    });
  } else if (
    text.includes("git repo") ||
    text.includes("worktree") ||
    text.includes("workspace") ||
    text.includes("backend is not mounted")
  ) {
    question = `How should we resolve the workspace mount for ${params.agentName}?`;
    options.push({
      id: "opt-mount-host",
      label: "Relaunch worker in host Windows worktree",
      description:
        "Switch task execution from the unmounted Docker sandbox to the local host worktree.",
      isRecommended: true,
      rationale:
        "Docker container lacks the Git repository; host worktree is already cloned and clean.",
    });
    options.push({
      id: "opt-clone-sandbox",
      label: "Clone git repository directly in container sandbox",
      description:
        "Perform an ephemeral clone into /workspace to allow sandbox execution.",
      isRecommended: false,
    });
    options.push({
      id: "opt-reassign-lead",
      label: "Reassign task to the lead agent for decomposition",
      description: "Have the configured lead agent review and prepare standalone patches.",
      isRecommended: false,
    });
  } else if (
    text.includes("check") ||
    text.includes("failing") ||
    text.includes("test")
  ) {
    question = `How should we resolve the failing test/check blocker?`;
    options.push({
      id: "opt-targeted-fix",
      label: "Run targeted test suite against recent diffs",
      description:
        "Focus on the specific failing test cases to patch regressions before merging.",
      isRecommended: true,
      rationale:
        "Directly isolates the regression without slowing down unrelated branches.",
    });
    options.push({
      id: "opt-revert-commit",
      label: "Revert offending commit and re-trigger CI",
      description: "Roll back the failing change to restore a green baseline.",
      isRecommended: false,
    });
    options.push({
      id: "opt-acknowledge-legacy",
      label: "Acknowledge as known legacy issue and proceed",
      description:
        "Document the failure as pre-existing and unblock release.",
      isRecommended: false,
    });
  } else {
    question = `How should we unblock ${params.agentName} on ${params.currentTask}?`;
    options.push({
      id: "opt-unblock-safe",
      label: "Apply recommended safe default and resume",
      description: `Unblock ${params.agentName} to proceed with the verified next action.`,
      isRecommended: true,
      rationale:
        "Clears the blocker gate and allows the worker to advance the objective safely.",
    });
    options.push({
      id: "opt-reassign-lead",
      label: "Reassign task to the lead agent for review",
      description: "Escalate to the lead agent to re-scope requirements.",
      isRecommended: false,
    });
    options.push({
      id: "opt-defer",
      label: "Defer task to next sprint/standup",
      description:
        "Park this item in backlog while waiting for external dependencies.",
      isRecommended: false,
    });
  }

  return {
    blockerText: params.blockerText,
    question,
    options,
    selectedDecision: null,
  };
};

export const buildStandupMeeting = async (params: {
  config: StandupConfig;
  agents: StandupAgentSnapshot[];
  trigger: StandupTriggerKind;
  scheduledFor?: string | null;
}): Promise<StandupMeeting> => {
  const agents = normalizeAgentSnapshots(params.agents);
  const [jiraResult] = await Promise.all([loadJiraIssues(params.config.jira)]);
  const githubResult = loadGitHubCommitSummaries();
  const cards: StandupSummaryCard[] = agents.map((agent) => {
    const manual = params.config.manualByAgentId[agent.agentId] ?? {
      jiraAssignee: null,
      currentTask: "",
      blockers: "",
      note: "",
      updatedAt: null,
    };
    const activeTickets = selectAgentIssues(
      agent,
      manual.jiraAssignee,
      jiraResult.issues
    );
    const manualTask = coerceText(manual.currentTask);
    const kanbanTask = coerceText(agent.kanbanTaskTitle);
    const currentTask =
      manualTask ||
      kanbanTask ||
      activeTickets[0]?.title ||
      agent.latestPreview ||
      agent.lastUserMessage ||
      githubResult.commits[0]?.title ||
      "Reviewing current work.";
    const blockers = splitBlockers(manual.blockers);
    const kanbanBlocker = coerceText(agent.kanbanTaskBlocker);
    if (
      shouldApplyKanbanTaskBlocker({
        manualTask,
        kanbanTask,
        kanbanBlocker,
      }) &&
      !blockers.includes(kanbanBlocker)
    ) {
      blockers.push(kanbanBlocker);
    }
    if (blockers.length === 0 && githubResult.hasFailingChecks) {
      blockers.push("GitHub checks are failing.");
    }
    const manualNotes = [manual.note].map(coerceText).filter(Boolean);
    const blockerDecisions: StandupBlockerDecisionGroup[] = blockers.map((blocker) =>
      synthesizeStandupBlockerDecisions({
        agentId: agent.agentId,
        agentName: agent.name,
        currentTask,
        blockerText: blocker,
      })
    );
    return {
      agentId: agent.agentId,
      agentName: agent.name,
      speech: buildSpeech(agent.name, currentTask, blockers),
      currentTask,
      blockers,
      blockerDecisions,
      recentCommits: githubResult.commits.slice(0, 3),
      activeTickets,
      manualNotes,
      sourceStates: [
        githubResult.sourceState,
        jiraResult.sourceState,
        buildSourceState("manual", {
          ready: true,
          updatedAt: manual.updatedAt,
        }),
      ],
    };
  });
  const startedAt = new Date().toISOString();
  return {
    id: randomUUID(),
    trigger: params.trigger,
    phase: "gathering",
    scheduledFor: params.scheduledFor ?? null,
    startedAt,
    updatedAt: startedAt,
    completedAt: null,
    currentSpeakerAgentId: null,
    speakerStartedAt: null,
    speakerDurationMs: params.config.schedule.speakerSeconds * 1000,
    participantOrder: cards.map((card) => card.agentId),
    arrivedAgentIds: [],
    cards,
    taskDispatch: {
      status: "pending",
      queuedAgentIds: [],
      blockedAgentIds: [],
      updatedAt: null,
      error: null,
    },
  };
};

export const startStandupSpeaker = (
  meeting: StandupMeeting,
  speakerAgentId: string | null
): StandupMeeting => {
  const now = new Date().toISOString();
  return {
    ...meeting,
    phase: speakerAgentId ? "in_progress" : "complete",
    currentSpeakerAgentId: speakerAgentId,
    speakerStartedAt: speakerAgentId ? now : null,
    updatedAt: now,
    completedAt: speakerAgentId ? null : now,
  };
};

export const advanceStandupMeeting = (meeting: StandupMeeting): StandupMeeting => {
  const currentIndex = meeting.currentSpeakerAgentId
    ? meeting.participantOrder.indexOf(meeting.currentSpeakerAgentId)
    : -1;
  const nextAgentId = meeting.participantOrder[currentIndex + 1] ?? null;
  return startStandupSpeaker(meeting, nextAgentId);
};

export const updateStandupArrivals = (
  meeting: StandupMeeting,
  arrivedAgentIds: string[]
): StandupMeeting => {
  const nextArrivals = Array.from(
    new Set(arrivedAgentIds.map((entry) => coerceText(entry)).filter(Boolean))
  );
  return {
    ...meeting,
    arrivedAgentIds: nextArrivals,
    updatedAt: new Date().toISOString(),
  };
};

export const meetingHasEveryoneArrived = (meeting: StandupMeeting): boolean => {
  return meeting.participantOrder.every((agentId) =>
    meeting.arrivedAgentIds.includes(agentId)
  );
};

export const resolveStandupBlocker = (
  meeting: StandupMeeting,
  params: {
    agentId: string;
    blockerIndex?: number;
    optionId?: string;
    decisionText: string;
  }
): StandupMeeting => {
  const nowIso = new Date().toISOString();
  const decisionText = coerceText(params.decisionText);
  if (!decisionText) return meeting;

  const targetCardIndex = meeting.cards.findIndex(
    (card) => card.agentId === params.agentId
  );
  if (targetCardIndex < 0) return meeting;

  const card = meeting.cards[targetCardIndex]!;
  const updatedDecisions = (card.blockerDecisions ?? []).map((group, idx) => {
    if (
      params.blockerIndex === undefined ||
      params.blockerIndex === idx ||
      ((card.blockerDecisions?.length ?? 0) === 1 && params.blockerIndex === 0)
    ) {
      return {
        ...group,
        selectedDecision: {
          optionId: params.optionId,
          text: decisionText,
          decidedAt: nowIso,
        },
      };
    }
    return group;
  });

  const nextCards = [...meeting.cards];
  nextCards[targetCardIndex] = {
    ...card,
    blockerDecisions: updatedDecisions,
  };

  // Also update matching Kanban task in shared-store directly on disk!
  try {
    const allTasks = listSharedTasks();
    const matchingTask = allTasks.find(
      (task) =>
        !task.isArchived &&
        task.assignedAgentId === params.agentId &&
        (task.status === "needs_attention" || task.title === card.currentTask)
    );
    if (matchingTask) {
      const decisionTag = `\n\n[HUMAN DECISION (${nowIso})]: ${decisionText}`;
      const updatedDescription = matchingTask.description.includes(decisionText)
        ? matchingTask.description
        : `${matchingTask.description}${decisionTag}`.trim();
      upsertSharedTask({
        ...matchingTask,
        description: updatedDescription,
        status: "working",
        updatedAt: nowIso,
      });
    }
  } catch {
    // Non-fatal if shared store is unavailable
  }

  return {
    ...meeting,
    cards: nextCards,
    updatedAt: nowIso,
  };
};

const expandRange = (segment: string): number[] => {
  if (segment.includes("-")) {
    const [startRaw, endRaw] = segment.split("-");
    const start = Number(startRaw);
    const end = Number(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const values: number[] = [];
    for (let value = start; value <= end; value += 1) values.push(value);
    return values;
  }
  const numeric = Number(segment);
  return Number.isFinite(numeric) ? [numeric] : [];
};

const matchesCronPart = (part: string, value: number): boolean => {
  const trimmed = part.trim();
  if (trimmed === "*") return true;
  return trimmed.split(",").some((segment) => expandRange(segment).includes(value));
};

const getZonedDateParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    minute: "numeric",
    hour: "numeric",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    minute: Number(lookup("minute")),
    hour: Number(lookup("hour")),
    day: Number(lookup("day")),
    month: Number(lookup("month")),
    weekday: weekdayMap[lookup("weekday")] ?? -1,
  };
};

export const shouldRunStandupNow = (
  config: StandupConfig,
  now: Date = new Date()
): boolean => {
  if (!config.schedule.enabled) return false;
  const parts = config.schedule.cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const zoned = getZonedDateParts(now, config.schedule.timezone || "UTC");
  return (
    matchesCronPart(parts[0] ?? "*", zoned.minute) &&
    matchesCronPart(parts[1] ?? "*", zoned.hour) &&
    matchesCronPart(parts[2] ?? "*", zoned.day) &&
    matchesCronPart(parts[3] ?? "*", zoned.month) &&
    matchesCronPart(parts[4] ?? "*", zoned.weekday)
  );
};

export const isSameScheduleMinute = (
  leftIso: string | null,
  right: Date,
  timeZone: string
): boolean => {
  if (!leftIso) return false;
  const left = new Date(leftIso);
  if (Number.isNaN(left.getTime())) return false;
  const leftParts = getZonedDateParts(left, timeZone);
  const rightParts = getZonedDateParts(right, timeZone);
  return (
    leftParts.minute === rightParts.minute &&
    leftParts.hour === rightParts.hour &&
    leftParts.day === rightParts.day &&
    leftParts.month === rightParts.month
  );
};

export const updateStandupTaskDispatch = (
  meeting: StandupMeeting,
  taskDispatch: StandupTaskDispatchState
): StandupMeeting => ({
  ...meeting,
  taskDispatch,
  updatedAt: new Date().toISOString(),
});
