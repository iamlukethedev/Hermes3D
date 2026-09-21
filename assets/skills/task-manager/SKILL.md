---
name: task-manager
description: Capture actionable requests in the native Hermes Kanban, route them to profiles, and keep the task lifecycle, worktree delivery, review, and GitHub handoff accurate. Use when a user asks to create, assign, run, block, review, complete, or inspect work on the Hermes3D board.
metadata: {"hermes":{"skillKey":"task-manager"}}
---

# Native Hermes Task Manager

Use the Hermes Kanban tools as the only task source of truth. Hermes3D reads the
same SQLite-backed board through the gateway. Never create or maintain a
parallel `tasks.json`, TODO file, browser-only card, or filesystem task store.

## Detect the execution mode first

- If `HERMES_KANBAN_TASK_ID` is set, you are a dispatched Kanban worker. Work on
  that task and use the injected lifecycle tools. Do not create a duplicate card
  for the request that spawned you.
- Otherwise, you are handling an interactive request. Use `kanban_list` to check
  for a matching active task and `kanban_create` to capture new work.

## Interactive capture and routing

1. Read the current board with `kanban_list` before mutating it.
2. Match by a known task id or idempotency key first. Otherwise match the
   normalized title, assignee, and active status. Do not duplicate active work.
3. For a new actionable request, call `kanban_create` with:
   - a concise title;
   - the full objective, context, acceptance criteria, and delivery contract in
     `body`;
   - the profile that should execute it in `assignee`;
   - a stable `idempotency_key` when the source has a stable event/thread id;
   - `goal_mode: true` for implementation work that is unlikely to finish in a
     single turn;
   - a bounded `goal_max_turns` and `max_runtime_seconds` appropriate to the job;
   - `project` for repository work. A project-bound board may supply this
     automatically.
4. Assigned tasks are promoted and claimed by the Hermes dispatcher. Do not
   manually pretend that a worker is running.
5. Briefly confirm the real task id, assignee, and board state returned by the
   tool.

For repository-backed implementation tasks, include this exact marker in the
body so Hermes3D can perform the credentialed host-side GitHub handoff:

`[hermes3d:github-pr]`

Only add the marker when a code or repository change may be required.

## Worker lifecycle

1. Start by calling `kanban_show` for the current task. Read the full body,
   parents, comments, previous attempts, workspace, and branch.
2. Work only in the workspace assigned to the task. For project tasks this is a
   dedicated git worktree and branch. Do not edit the user's root checkout or a
   different worktree.
3. Inspect existing changes before editing and preserve unrelated work.
4. Implement the requested outcome, self-review the diff, and run targeted
   verification. Use `kanban_heartbeat` during long operations.
5. If repository files changed:
   - leave the worktree clean;
   - create a focused commit on the assigned branch;
   - do not expose or invent credentials and do not attempt to install GitHub
     CLI inside the sandbox;
   - call `kanban_request_review`, not `kanban_complete`, with a summary and
     metadata containing `changed_files`, `tests`, `branch`, and `commit`.
     Hermes3D sees the review transition, pushes the branch from the trusted
     host, opens or reuses the GitHub PR, and writes the PR URL back to the card.
6. If no repository change was necessary, call `kanban_complete` with a concrete
   result and structured metadata. A plan, status sentence, or "next safe
   action" by itself is not completion.
7. If human input, credentials, unavailable capability, or an external decision
   blocks the work, call `kanban_block` with the correct typed reason. Do not
   mark blocked work done.

## Definition of done

A repository task is ready for review only when all of these are true:

- requested behavior is implemented;
- relevant tests/checks were run and their outcomes are recorded;
- the assigned worktree has no uncommitted changes;
- a focused commit exists on the assigned task branch;
- `kanban_request_review` contains the branch, commit, tests, and changed files;
- Hermes3D has written a GitHub PR URL back to the task card.

A non-repository task is done only when its concrete result or artifact is
recorded in `kanban_complete`.

## Status semantics

- `triage` / `todo`: captured but not runnable yet.
- `ready`: assigned and waiting for the dispatcher.
- `running`: claimed by a live worker; only Hermes owns this transition.
- `blocked`: needs human attention or a missing capability.
- `review`: implementation is finished and the GitHub/reviewer handoff is in
  progress. This is not a blocker.
- `done`: accepted final result. Do not use for code awaiting a PR or review.

## Response rules

- Report tool-confirmed task ids and states, never inferred ones.
- Mention the PR URL when Hermes3D has written it to the task.
- If capture or lifecycle mutation fails, report the failure and leave the task
  in its real state. Never claim synchronization succeeded when it did not.
