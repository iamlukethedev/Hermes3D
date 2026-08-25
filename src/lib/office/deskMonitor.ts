import {
  buildAgentChatItems,
  type AgentChatItem,
} from "@/features/agents/components/chatItems";
import type { AgentState } from "@/features/agents/state/store";
import { parseToolMarkdown } from "@/lib/text/message-extract";

export type OfficeDeskMonitorMode =
  | "coding"
  | "browser"
  | "waiting"
  | "idle"
  | "error";

export type OfficeDeskMonitorEntry = {
  kind: "user" | "assistant" | "thinking" | "tool";
  text: string;
  live?: boolean;
};

export type OfficeDeskMonitor = {
  agentId: string;
  agentName: string;
  mode: OfficeDeskMonitorMode;
  title: string;
  subtitle: string;
  browserUrl: string | null;
  updatedAt: number | null;
  live: boolean;
  entries: OfficeDeskMonitorEntry[];
  task: {
    id: string;
    title: string;
    status: string;
    runId: string | null;
  } | null;
  editor: {
    fileName: string;
    language: string;
    lines: string[];
    terminalLines: string[];
    cursorLine: number;
    cursorColumn: number;
  } | null;
};

export type OfficeDeskMonitorKanbanActivity = {
  taskId: string;
  taskTitle: string;
  taskStatus?: string;
  runId?: string | null;
  logContent: string;
  updatedAt: number | null;
};

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const DOMAIN_RE =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"'`]*)?\b/gi;
const PATH_RE =
  /(?:^|[\s("'`])((?:src|app|components|pages|lib|tests|server|scripts)\/[^\s)"'`]+?\.(?:ts|tsx|js|jsx|html|css|json|md))/g;
const CODE_FENCE_RE = /```([a-z0-9_+-]+)?\n([\s\S]*?)```/i;
const BROWSER_KEYWORD_RE =
  /\b(browser|navigate|snapshot|screenshot|tab|click|console|cookies|storage|page|url)\b/i;
const BROWSER_INTENT_RE =
  /\b(browse|inspect|visit|navigate|open|go to|website|site|page)\b/i;
const MONITOR_HISTORY_LINE_LIMIT = 160;
const MONITOR_BROWSER_SCAN_ENTRY_LIMIT = 18;
const KANBAN_ACTIVITY_ENTRY_LIMIT = 80;
const TERMINAL_ESCAPE = String.fromCharCode(27);
const TERMINAL_ESCAPE_RE = new RegExp(
  `${TERMINAL_ESCAPE}\\[[0-?]*[ -/]*[@-~]`,
  "g",
);

const buildKanbanActivityEntries = (
  activity: OfficeDeskMonitorKanbanActivity,
): OfficeDeskMonitorEntry[] => {
  const isLive =
    !activity.taskStatus?.trim() || activity.taskStatus.trim() === "working";
  const entries = activity.logContent
    .replace(TERMINAL_ESCAPE_RE, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        Boolean(line) &&
        !/^[-─┌┐└┘│#\s]+$/.test(line) &&
        !/^\++$/.test(line) &&
        !/^┌─\s*Reasoning\s*─/i.test(line),
    )
    .map<OfficeDeskMonitorEntry>((line) => {
      if (/^Query:\s*/i.test(line)) {
        return {
          kind: "user",
          text: line.replace(/^Query:\s*/i, "").trim(),
        };
      }
      if (line.startsWith("**") && line.endsWith("**")) {
        return {
          kind: "thinking",
          text: line.slice(2, -2).trim(),
          live: isLive,
        };
      }
      if (line.startsWith("┊") || /^[$⚡📚💻🔎📖🐍]\s/u.test(line)) {
        return {
          kind: "tool",
          text: line.replace(/^┊\s*/, ""),
          live: isLive,
        };
      }
      return { kind: "assistant", text: line, live: isLive };
    });
  if (entries.length > 0) return entries.slice(-KANBAN_ACTIVITY_ENTRY_LIMIT);
  return [
    {
      kind: "user",
      text: activity.taskTitle,
      live: isLive,
    },
  ];
};

const extractUrls = (value: string): string[] => {
  const matches = value.match(URL_RE);
  return matches ? matches.map((entry) => entry.trim()) : [];
};

const normalizeBrowserUrl = (value: string): string | null => {
  const trimmed = value.trim().replace(/[.,;!?]+$/g, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!trimmed.includes(".") || /\s/.test(trimmed)) return null;
  return `https://${trimmed}`;
};

const extractDomains = (value: string): string[] => {
  const matches = value.match(DOMAIN_RE);
  return matches ? matches.map((entry) => entry.trim()) : [];
};

const extractPath = (value: string): string | null => {
  const match = value.match(PATH_RE);
  if (!match || match.length === 0) return null;
  const last = match[match.length - 1];
  if (!last) return null;
  return last.trim().replace(/^[\s("'`]+/, "");
};

const normalizeEntryText = (text: string): string => {
  return text.replace(/\s+/g, " ").trim();
};

const flattenMonitorEntry = (item: AgentChatItem): OfficeDeskMonitorEntry | null => {
  const text =
    item.kind === "tool"
      ? (() => {
          const parsed = parseToolMarkdown(item.text);
          const body = parsed.body.trim();
          return normalizeEntryText(body ? `${parsed.label}: ${body}` : parsed.label);
        })()
      : normalizeEntryText(item.text);
  if (!text) return null;
  return {
    kind: item.kind,
    text,
    ...("live" in item && item.live ? { live: true } : {}),
  };
};

const toCommentLine = (value: string): string => `  // ${value}`;

const derivePseudoEditor = (task: string): { fileName: string; language: string; lines: string[] } => {
  const normalized = task.trim().toLowerCase();
  if (normalized.includes("contact form")) {
    return {
      fileName: "ContactForm.tsx",
      language: "tsx",
      lines: [
        'export default function ContactForm() {',
        '  return (',
        '    <main className="mx-auto max-w-xl p-8">', 
        '      <h1 className="text-3xl font-semibold">Contact us</h1>',
        '      <form className="mt-6 space-y-4 rounded-2xl border p-6 shadow-sm">', 
        '        <input className="w-full rounded-lg border px-4 py-3" placeholder="Name" />',
        '        <input className="w-full rounded-lg border px-4 py-3" placeholder="Email" />',
        '        <textarea className="min-h-40 w-full rounded-lg border px-4 py-3" placeholder="Message" />',
        '        <button className="rounded-lg bg-black px-5 py-3 text-white">Send message</button>',
        '      </form>',
        '    </main>',
        '  );',
        '}',
      ],
    };
  }
  if (normalized.includes("hello world")) {
    return {
      fileName: "page.tsx",
      language: "tsx",
      lines: [
        'export default function Page() {',
        '  return (',
        '    <main className="flex min-h-screen items-center justify-center">', 
        '      <h1 className="text-5xl font-bold">Hello world</h1>',
        '    </main>',
        '  );',
        '}',
      ],
    };
  }
  if (normalized.includes("html")) {
    return {
      fileName: "index.html",
      language: "html",
      lines: [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="UTF-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '  <title>Working Draft</title>',
        '</head>',
        '<body>',
        `  <!-- ${task.trim()} -->`,
        '</body>',
        '</html>',
      ],
    };
  }
  return {
    fileName: "workbench.tsx",
    language: "tsx",
    lines: [
      'export function Workbench() {',
      toCommentLine(task.trim() || "Working on the requested task."),
      '  return (',
      '    <section>',
      '      <div>Implementing monitor preview...</div>',
      '    </section>',
      '  );',
      '}',
    ],
  };
};

const deriveEditorDocument = (params: {
  agent: AgentState;
  entries: OfficeDeskMonitorEntry[];
}): OfficeDeskMonitor["editor"] => {
  const codeSource = [...params.entries]
    .reverse()
    .find((entry) => entry.kind === "assistant" || entry.kind === "tool" || entry.kind === "thinking");
  const sourceText = codeSource?.text ?? "";
  const codeFence = sourceText.match(CODE_FENCE_RE);
  let fileName =
    extractPath(sourceText) ??
    extractPath(params.agent.lastUserMessage ?? "") ??
    null;
  let language = codeFence?.[1]?.trim() || "";
  let lines: string[] = [];

  if (codeFence?.[2]) {
    lines = codeFence[2].replace(/\r/g, "").split("\n");
  } else {
    const task =
      params.agent.lastUserMessage ??
      [...params.entries].reverse().find((entry) => entry.kind === "user")?.text ??
      "Working on the current request.";
    const pseudo = derivePseudoEditor(task);
    if (!fileName) fileName = pseudo.fileName;
    if (!language) language = pseudo.language;
    lines = pseudo.lines;
  }

  const resolvedFileName = fileName?.split("/").pop()?.trim() || "workbench.tsx";
  const resolvedLanguage =
    language ||
    resolvedFileName.split(".").pop()?.trim() ||
    "tsx";
  const terminalLines = params.entries
    .slice(-4)
    .map((entry) => `${entry.kind === "tool" ? "$ " : entry.kind === "user" ? "> " : ""}${entry.text}`);
  const cursorLine = Math.max(1, lines.length);
  const cursorColumn = Math.max(1, (lines[lines.length - 1]?.length ?? 0) + 1);

  return {
    fileName: resolvedFileName,
    language: resolvedLanguage,
    lines,
    terminalLines,
    cursorLine,
    cursorColumn,
  };
};

const summarizeMode = (params: {
  agent: AgentState;
  entries: OfficeDeskMonitorEntry[];
  browserUrl: string | null;
}): { mode: OfficeDeskMonitorMode; title: string; subtitle: string } => {
  const { agent, entries, browserUrl } = params;
  if (agent.status === "error") {
    return {
      mode: "error",
      title: "Run error",
      subtitle: agent.latestPreview ?? "The agent hit an error.",
    };
  }
  if (browserUrl) {
    let hostname = browserUrl;
    try {
      hostname = new URL(browserUrl).host || browserUrl;
    } catch {
      // Keep the raw URL when parsing fails.
    }
    return {
      mode: "browser",
      title: "Browsing",
      subtitle: hostname,
    };
  }
  if (agent.awaitingUserInput) {
    return {
      mode: "waiting",
      title: "Waiting",
      subtitle: agent.latestPreview ?? "Waiting for the next instruction.",
    };
  }
  if (
    agent.status === "running" ||
    agent.streamText ||
    agent.thinkingTrace ||
    entries.some((entry) => entry.live)
  ) {
    return {
      mode: "coding",
      title: "Working",
      subtitle: agent.latestPreview ?? "Live agent activity.",
    };
  }
  return {
    mode: "idle",
    title: "Idle",
    subtitle: agent.latestPreview ?? "No recent live activity.",
  };
};

export const buildOfficeDeskMonitor = (
  agent: AgentState,
  kanbanActivity: OfficeDeskMonitorKanbanActivity | null = null,
): OfficeDeskMonitor => {
  const monitorOutputLines = agent.outputLines.slice(-MONITOR_HISTORY_LINE_LIMIT);
  const chatItems = buildAgentChatItems({
    outputLines: monitorOutputLines,
    streamText: agent.streamText,
    liveThinkingTrace: agent.thinkingTrace ?? "",
    showThinkingTraces: agent.showThinkingTraces,
    toolCallingEnabled: agent.toolCallingEnabled,
  });
  const flatEntries = chatItems
    .map(flattenMonitorEntry)
    .filter((entry): entry is OfficeDeskMonitorEntry => Boolean(entry));
  const activityEntries = kanbanActivity
    ? buildKanbanActivityEntries(kanbanActivity)
    : [];
  const kanbanTaskStatus = kanbanActivity?.taskStatus?.trim() || "working";
  const effectiveAgent: AgentState = kanbanActivity
    ? {
        ...agent,
        status: kanbanTaskStatus === "working" ? "running" : "idle",
        runId: agent.runId ?? kanbanActivity.taskId,
        latestPreview: `Kanban: ${kanbanActivity.taskTitle}`,
        lastUserMessage: kanbanActivity.taskTitle,
      }
    : agent;
  const latestEntries = (kanbanActivity ? activityEntries : flatEntries).slice(-6);
  const visibleEntries = kanbanActivity ? activityEntries : latestEntries;
  const browserScanEntries = flatEntries.slice(-MONITOR_BROWSER_SCAN_ENTRY_LIMIT);
  const browserUrl = kanbanActivity
    ? null
    :
    [
      agent.lastUserMessage ?? "",
      agent.latestPreview ?? "",
      ...latestEntries.map((entry) => entry.text),
      ...browserScanEntries.map((entry) => entry.text),
    ]
      .flatMap((text) => [
        ...extractUrls(text),
        ...extractDomains(text)
          .filter(() => BROWSER_KEYWORD_RE.test(text) || BROWSER_INTENT_RE.test(text)),
      ])
      .map((value) => normalizeBrowserUrl(value))
      .find((value): value is string => Boolean(value)) ??
    null;
  const modeSummary = summarizeMode({
    agent: effectiveAgent,
    entries: latestEntries,
    browserUrl,
  });
  return {
    agentId: effectiveAgent.agentId,
    agentName: effectiveAgent.name,
    mode: modeSummary.mode,
    title: modeSummary.title,
    subtitle: modeSummary.subtitle,
    browserUrl,
    updatedAt:
      kanbanActivity?.updatedAt ??
      effectiveAgent.lastActivityAt ??
      effectiveAgent.lastAssistantMessageAt ??
      null,
    live:
      effectiveAgent.status === "running" ||
      Boolean(effectiveAgent.streamText) ||
      Boolean(effectiveAgent.thinkingTrace) ||
      latestEntries.some((entry) => entry.live),
    entries: visibleEntries,
    task: kanbanActivity
      ? {
          id: kanbanActivity.taskId,
          title: kanbanActivity.taskTitle,
          status: kanbanTaskStatus,
          runId: kanbanActivity.runId?.trim() || null,
        }
      : null,
    editor:
      !kanbanActivity && modeSummary.mode === "coding"
        ? deriveEditorDocument({
            agent: effectiveAgent,
            entries: kanbanActivity ? activityEntries : flatEntries,
          })
        : null,
  };
};
