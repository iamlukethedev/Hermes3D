export type StandupPhase = "scheduled" | "gathering" | "in_progress" | "complete";

export const STANDUP_FALLBACK_TASK =
  "Review current priorities and complete the next safe action.";

export type StandupSourceKind = "github" | "jira" | "manual";

export type StandupTriggerKind = "manual" | "scheduled";

export type StandupAgentSnapshot = {
  agentId: string;
  name: string;
  latestPreview?: string | null;
  lastUserMessage?: string | null;
  kanbanTaskTitle?: string | null;
  kanbanTaskBlocker?: string | null;
};

export type StandupManualEntry = {
  jiraAssignee: string | null;
  currentTask: string;
  blockers: string;
  note: string;
  updatedAt: string | null;
};

export type StandupTicketSummary = {
  id: string;
  key: string;
  title: string;
  status: string;
  url: string | null;
};

export type StandupCommitSummary = {
  id: string;
  title: string;
  subtitle: string | null;
  url: string | null;
};

export type StandupSourceState = {
  kind: StandupSourceKind;
  ready: boolean;
  stale: boolean;
  updatedAt: string | null;
  error: string | null;
};

export type StandupBlockerOption = {
  id: string;
  label: string;
  description?: string;
  isRecommended?: boolean;
  rationale?: string;
};

export type StandupSelectedDecision = {
  optionId?: string;
  text: string;
  decidedAt: string;
};

export type StandupBlockerDecisionGroup = {
  blockerText: string;
  question: string;
  options: StandupBlockerOption[];
  selectedDecision?: StandupSelectedDecision | null;
};

export type StandupSummaryCard = {
  agentId: string;
  agentName: string;
  speech: string;
  currentTask: string;
  blockers: string[];
  blockerDecisions?: StandupBlockerDecisionGroup[];
  recentCommits: StandupCommitSummary[];
  activeTickets: StandupTicketSummary[];
  manualNotes: string[];
  sourceStates: StandupSourceState[];
};

export type StandupTaskDispatchStatus =
  | "pending"
  | "queueing"
  | "dispatched"
  | "failed";

export type StandupTaskDispatchState = {
  status: StandupTaskDispatchStatus;
  queuedAgentIds: string[];
  blockedAgentIds: string[];
  updatedAt: string | null;
  error: string | null;
};

export type StandupMeeting = {
  id: string;
  trigger: StandupTriggerKind;
  phase: StandupPhase;
  scheduledFor: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  currentSpeakerAgentId: string | null;
  speakerStartedAt: string | null;
  speakerDurationMs: number;
  participantOrder: string[];
  arrivedAgentIds: string[];
  cards: StandupSummaryCard[];
  /** Optional for compatibility with standups stored before task dispatch existed. */
  taskDispatch?: StandupTaskDispatchState;
};

export type StandupMeetingStore = {
  activeMeeting: StandupMeeting | null;
  lastMeeting: StandupMeeting | null;
};

export type StandupJiraConfig = {
  enabled: boolean;
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  jql: string;
};

export type StandupScheduleConfig = {
  enabled: boolean;
  cronExpr: string;
  timezone: string;
  speakerSeconds: number;
  autoOpenBoard: boolean;
  lastAutoRunAt: string | null;
};

export type StandupConfig = {
  schedule: StandupScheduleConfig;
  jira: StandupJiraConfig;
  manualByAgentId: Record<string, StandupManualEntry>;
};

export type StandupConfigPayload = {
  gatewayUrl: string;
  config: StandupConfig;
};

export type StandupMeetingPayload = {
  meeting: StandupMeeting | null;
};
