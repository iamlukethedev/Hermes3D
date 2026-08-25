type PackagedSkillFile = {
  relativePath: string;
  content: string;
};

// Keep this string synchronized with assets/skills/todo-board/SKILL.md.
const TODO_BOARD_SKILL_MD = `---
name: todo
description: Maintain a shared workspace TODO list with blocked tasks.
metadata: {"hermes":{"skillKey":"todo-board"}}
---

# TODO Board

Use this skill when the user wants to manage a shared task list for the current workspace.

## Trigger

\`\`\`json
{
  "activation": {
    "anyPhrases": [
      "todo",
      "todo list",
      "blocked task",
      "blocked tasks",
      "add to my todo",
      "show my todo"
    ]
  },
  "movement": {
    "target": "desk",
    "skipIfAlreadyThere": true
  }
}
\`\`\`

When this skill is activated, the agent should return to its assigned desk before handling the request.

- If the user asks from Telegram or any other external surface to add, block, unblock, remove, or read TODO items, treat that as a trigger for this skill.
- The physical behavior for this skill is: go sit at the assigned desk, then perform the TODO board workflow.
- If the agent is already at the desk, continue without adding extra movement narration.

## Storage location

The authoritative task file is \`todo-skill/todo-list.json\` in the workspace root.

- Always treat that file as the source of truth.
- Never rely on chat memory alone for the latest task state.
- Create the \`todo-skill\` directory and \`todo-list.json\` file if they do not exist.

## Required workflow

1. Read \`todo-skill/todo-list.json\` before answering any task-management request.
2. If the file does not exist, create it with the schema in this document before continuing.
3. After every add, remove, block, or unblock action, write the full updated JSON back to disk.
4. If the file exists but is invalid JSON or does not match the schema, repair it into a valid structure, preserve any recoverable items, and mention that repair in your response.
5. If the user request is ambiguous, ask a clarifying question instead of guessing.

## Supported actions

- Add a task.
  Create a new item unless an equivalent active item already exists.
- Block a task.
  Change the matching item to \`status: "blocked"\`. If the task does not exist and the request is clear, create it directly as blocked.
- Unblock a task.
  Change the matching item back to \`status: "todo"\` and clear \`blockReason\`.
- Remove a task.
  Delete only the matching item. If multiple items could match, ask for clarification.
- Read the list.
  Summarize tasks grouped into \`TODO\` and \`BLOCKED\`.

## File format

Use this JSON shape:

\`\`\`json
{
  "version": 1,
  "updatedAt": "2026-03-22T00:00:00.000Z",
  "items": [
    {
      "id": "task-1",
      "title": "Example task",
      "status": "todo",
      "createdAt": "2026-03-22T00:00:00.000Z",
      "updatedAt": "2026-03-22T00:00:00.000Z",
      "blockReason": null
    }
  ]
}
\`\`\`

## Field rules

- Keep \`version\` at \`1\`.
- Generate stable, human-readable IDs such as \`prepare-demo\` or \`task-2\`.
- Keep titles concise and preserve the user's intent.
- Use only \`todo\` or \`blocked\` for \`status\`.
- Use ISO timestamps for \`createdAt\`, item \`updatedAt\`, and top-level \`updatedAt\`.
- Keep \`blockReason\` as \`null\` unless the user gave a reason or a short precise reason is clearly implied.

## Mutation rules

- Avoid duplicate active items that describe the same work.
- Preserve existing IDs and \`createdAt\` values for unchanged items.
- Update the touched item's \`updatedAt\` whenever you modify it.
- Update the top-level \`updatedAt\` on every write.
- Keep untouched items in their original order unless there is a strong reason to reorder them.

## Response style

- After each mutation, say what changed.
- When showing the list, group tasks into \`TODO\` and \`BLOCKED\`.
- Include each blocked task's reason when one exists.
`;

// Keep this string synchronized with assets/skills/todo-board/todo-list.example.json.
const TODO_BOARD_EXAMPLE_JSON = `{
  "version": 1,
  "updatedAt": "2026-03-22T00:00:00.000Z",
  "items": [
    {
      "id": "draft-roadmap",
      "title": "Draft the TODO skill roadmap",
      "status": "todo",
      "createdAt": "2026-03-22T00:00:00.000Z",
      "updatedAt": "2026-03-22T00:00:00.000Z",
      "blockReason": null
    },
    {
      "id": "gateway-access",
      "title": "Confirm gateway install access",
      "status": "blocked",
      "createdAt": "2026-03-22T00:00:00.000Z",
      "updatedAt": "2026-03-22T00:00:00.000Z",
      "blockReason": "Waiting for gateway credentials"
    }
  ]
}
`;

// Keep this string synchronized with assets/skills/task-manager/SKILL.md.
const TASK_MANAGER_SKILL_MD = `---
name: task-manager
description: Capture actionable requests in the native Hermes Kanban, route them to profiles, and keep the task lifecycle, worktree delivery, review, and GitHub handoff accurate. Use when a user asks to create, assign, run, block, review, complete, or inspect work on the Hermes3D board.
metadata: {"hermes":{"skillKey":"task-manager"}}
---

# Native Hermes Task Manager

Use the Hermes Kanban tools as the only task source of truth. Hermes3D reads the
same SQLite-backed board through the gateway. Never create or maintain a
parallel \`tasks.json\`, TODO file, browser-only card, or filesystem task store.

## Detect the execution mode first

- If \`HERMES_KANBAN_TASK_ID\` is set, you are a dispatched Kanban worker. Work on
  that task and use the injected lifecycle tools. Do not create a duplicate card
  for the request that spawned you.
- Otherwise, you are handling an interactive request. Use \`kanban_list\` to check
  for a matching active task and \`kanban_create\` to capture new work.

## Interactive capture and routing

1. Read the current board with \`kanban_list\` before mutating it.
2. Match by a known task id or idempotency key first. Otherwise match the
   normalized title, assignee, and active status. Do not duplicate active work.
3. For a new actionable request, call \`kanban_create\` with:
   - a concise title;
   - the full objective, context, acceptance criteria, and delivery contract in
     \`body\`;
   - the profile that should execute it in \`assignee\`;
   - a stable \`idempotency_key\` when the source has a stable event/thread id;
   - \`goal_mode: true\` for implementation work that is unlikely to finish in a
     single turn;
   - a bounded \`goal_max_turns\` and \`max_runtime_seconds\` appropriate to the job;
   - \`project\` for repository work. A project-bound board may supply this
     automatically.
4. Assigned tasks are promoted and claimed by the Hermes dispatcher. Do not
   manually pretend that a worker is running.
5. Briefly confirm the real task id, assignee, and board state returned by the
   tool.

For repository-backed implementation tasks, include this exact marker in the
body so Hermes3D can perform the credentialed host-side GitHub handoff:

\`[hermes3d:github-pr]\`

Only add the marker when a code or repository change may be required.

## Worker lifecycle

1. Start by calling \`kanban_show\` for the current task. Read the full body,
   parents, comments, previous attempts, workspace, and branch.
2. Work only in the workspace assigned to the task. For project tasks this is a
   dedicated git worktree and branch. Do not edit the user's root checkout or a
   different worktree.
3. Inspect existing changes before editing and preserve unrelated work.
4. Implement the requested outcome, self-review the diff, and run targeted
   verification. Use \`kanban_heartbeat\` during long operations.
5. If repository files changed:
   - leave the worktree clean;
   - create a focused commit on the assigned branch;
   - do not expose or invent credentials and do not attempt to install GitHub
     CLI inside the sandbox;
   - call \`kanban_request_review\`, not \`kanban_complete\`, with a summary and
     metadata containing \`changed_files\`, \`tests\`, \`branch\`, and \`commit\`.
     Hermes3D sees the review transition, pushes the branch from the trusted
     host, opens or reuses the GitHub PR, and writes the PR URL back to the card.
6. If no repository change was necessary, call \`kanban_complete\` with a concrete
   result and structured metadata. A plan, status sentence, or "next safe
   action" by itself is not completion.
7. If human input, credentials, unavailable capability, or an external decision
   blocks the work, call \`kanban_block\` with the correct typed reason. Do not
   mark blocked work done.

## Definition of done

A repository task is ready for review only when all of these are true:

- requested behavior is implemented;
- relevant tests/checks were run and their outcomes are recorded;
- the assigned worktree has no uncommitted changes;
- a focused commit exists on the assigned task branch;
- \`kanban_request_review\` contains the branch, commit, tests, and changed files;
- Hermes3D has written a GitHub PR URL back to the task card.

A non-repository task is done only when its concrete result or artifact is
recorded in \`kanban_complete\`.

## Status semantics

- \`triage\` / \`todo\`: captured but not runnable yet.
- \`ready\`: assigned and waiting for the dispatcher.
- \`running\`: claimed by a live worker; only Hermes owns this transition.
- \`blocked\`: needs human attention or a missing capability.
- \`review\`: implementation is finished and the GitHub/reviewer handoff is in
  progress. This is not a blocker.
- \`done\`: accepted final result. Do not use for code awaiting a PR or review.

## Response rules

- Report tool-confirmed task ids and states, never inferred ones.
- Mention the PR URL when Hermes3D has written it to the task.
- If capture or lifecycle mutation fails, report the failure and leave the task
  in its real state. Never claim synchronization succeeded when it did not.
`;

// Keep this string synchronized with assets/skills/soundhermes/SKILL.md.
const SOUNDHERMES_SKILL_MD = `---
name: soundhermes
description: Control Spotify playback, search music, and return shareable music links.
metadata: {"hermes":{"skillKey":"soundhermes"}}
---

# SOUNDHERMES

Use this skill when the user wants an agent to search for music, play a song or playlist, control Spotify playback, or send back a shareable Spotify link on the same channel the request came from.

## Trigger

\`\`\`json
{
  "activation": {
    "anyPhrases": [
      "spotify",
      "play a song",
      "play this song",
      "play music",
      "play a playlist",
      "find a song",
      "queue this song",
      "music link"
    ]
  },
  "movement": {
    "target": "jukebox",
    "skipIfAlreadyThere": true
  }
}
\`\`\`

When this skill is activated, the agent should walk to the office jukebox before handling the request.

- Treat requests from Telegram or any other external surface as valid triggers when they ask for Spotify playback, search, queueing, or music-link sharing.
- The physical behavior for this skill is: go to the jukebox, perform the music-selection workflow, then report the result.
- If the agent is already at the jukebox, continue without adding extra movement narration.

## Channel behavior

- Reply on the same active channel or session that received the request.
- If playback cannot start but a matching track, album, or playlist is found, send back the best Spotify link instead of failing silently.
- If multiple matches are plausible, ask a clarifying question instead of guessing.

---

## Gateway Skill Contract

> This section is for developers implementing the backend skill handler.
> The Hermes3D UI handles authentication via Spotify PKCE OAuth in the browser.
> The gateway skill handles agent-driven requests via the \`soundhermes.*\` RPC namespace.

### Authentication model

The user authenticates directly in the browser (PKCE, no secret required).
The access token is stored in browser \`localStorage\` under the key \`soundhermes_token\`.

For **agent-driven** playback (e.g. "play Jazz for me"), the gateway skill should either:
- Use a server-side Spotify app token (Client Credentials) for search-only actions, or
- Instruct the agent to tell the user to use the jukebox panel for actual playback

### RPC methods the gateway skill should expose

\`\`\`ts
// Search for tracks. Returns a list of { name, artist, album, uri, spotifyUrl }.
soundhermes.search({ query: string }): SpotifySearchResult[]

// Get a shareable Spotify link for a query (for Telegram/chat replies).
soundhermes.getLink({ query: string }): { url: string; title: string }

// Report current playback state (reads from Spotify API).
soundhermes.playerStatus(): PlayerStatus | null

// Request playback of a URI (requires user to be authenticated in browser).
soundhermes.play({ uri: string }): { ok: boolean; message?: string }

// Pause / resume / skip.
soundhermes.pause(): void
soundhermes.resume(): void
soundhermes.next(): void
soundhermes.previous(): void
\`\`\`

### Agent workflow

1. Agent receives a music request ("play some jazz", "find this song", etc.)
2. Agent walks to the jukebox (\`movement.target: "jukebox"\`)
3. Agent calls \`soundhermes.search\` to find the best match
4. If the request came from a chat channel (Telegram, etc.): call \`soundhermes.getLink\` and reply with the link
5. If the request came from the office UI: call \`soundhermes.play\` to start playback
6. Agent reports back what was played or linked
`;

const PACKAGED_SKILL_FILES: Record<string, PackagedSkillFile[]> = {
  "todo-board": [
    {
      relativePath: "SKILL.md",
      content: TODO_BOARD_SKILL_MD,
    },
    {
      relativePath: "todo-list.example.json",
      content: TODO_BOARD_EXAMPLE_JSON,
    },
  ],
  "task-manager": [
    {
      relativePath: "SKILL.md",
      content: TASK_MANAGER_SKILL_MD,
    },
  ],
  soundhermes: [
    {
      relativePath: "SKILL.md",
      content: SOUNDHERMES_SKILL_MD,
    },
  ],
};

export const readPackagedSkillFiles = (
  packageId: string,
): PackagedSkillFile[] => {
  const files = PACKAGED_SKILL_FILES[packageId];
  if (!files || files.length === 0) {
    throw new Error(`Packaged skill assets are missing: ${packageId}`);
  }
  if (!files.some((file) => file.relativePath === "SKILL.md")) {
    throw new Error(`Packaged skill is missing SKILL.md: ${packageId}`);
  }
  return files.map((file) => ({ ...file }));
};
