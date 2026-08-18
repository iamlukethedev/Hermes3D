---
name: task-manager
description: Capture actionable user requests as persistent tasks, update task status as work progresses, and keep a shared task store in sync. Use when a user asks an agent to do work, check progress, block a task, complete a task, or manage the Kanban board.
metadata: {"hermes":{"skillKey":"task-manager"}}
---

# Task Manager

Use this skill for task capture and task lifecycle updates.

## Trigger

```json
{
  "activation": {
    "anyPhrases": [
      "add a task",
      "create a task",
      "track this task",
      "task status",
      "mark this done",
      "block this task",
      "what tasks do we have"
    ]
  },
  "movement": {
    "target": "desk",
    "skipIfAlreadyThere": true
  }
}
```

Also use this skill even when those exact phrases are absent if the latest user message is an actionable work request. If the user asks the agent to do something, that request must become a task before the agent proceeds.

## Storage location

The authoritative task file is:

- `${HERMES_STATE_DIR}/hermes3d/task-manager/tasks.json` when `HERMES_STATE_DIR` is set.
- `~/.hermes/hermes3d/task-manager/tasks.json` otherwise.

Always treat that file as the shared source of truth for the Kanban board.

## Required workflow

1. Read the task file before handling an actionable request.
2. If the file does not exist, create it with the schema in this document.
3. If the latest user message is actionable and no matching active task exists, create one immediately.
4. Before starting execution, move the task from `inbox` to `working`.
5. If work is blocked on a human (command approval, missing input, credentials, or an error), set the task to `needs_attention` and record a short reason in `notes`.
6. When work is finished, set the task to `done`.
7. When a task is queued by the cron scheduler or a playbook for a later run, keep it in `scheduled` and set `scheduledFor`.
8. After every mutation, write the full updated JSON back to disk.

## Matching rules

- Match first by `externalThreadId` when the request comes from a stable thread or conversation.
- Otherwise match by a concise normalized title that preserves user intent.
- Avoid creating duplicate active tasks for the same request.

## Task fields

Each task must include:

- `id`
- `title`
- `description`
- `status`
- `source`
- `sourceEventId`
- `assignedAgentId`
- `createdAt`
- `updatedAt`
- `playbookJobId`
- `runId`
- `channel`
- `externalThreadId`
- `lastActivityAt`
- `notes`
- `isArchived`
- `isInferred`
- `model`
- `skills`
- `subagentCount`
- `scheduledFor`
- `learnedSkill`
- `history`

Hermes metadata fields:

- `model` — the LLM used for the task (for example `hermes-4-405b`), or `null`.
- `skills` — names of skills used or created while working the task.
- `subagentCount` — number of isolated subagents spawned for parallel work.
- `scheduledFor` — ISO timestamp when a `scheduled` task is due, or `null`.
- `learnedSkill` — `true` when the learning loop distilled this task into a new skill.

## Status rules

The board mirrors the Hermes agent lifecycle:

- `inbox` — new actionable requests captured from any platform (Telegram, Discord, Slack, WhatsApp, Signal, email, CLI). Record the platform in `channel`.
- `scheduled` — queued for a later run by the cron scheduler or a playbook. Set `scheduledFor`.
- `working` — the agent is actively executing tools, terminals, or subagents.
- `needs_attention` — blocked on a human: a command approval, a question, missing credentials, or an error that needs review.
- `done` — the requested work is complete. Set `learnedSkill` to `true` if a new skill was created from this task.

Legacy statuses (`todo`, `in_progress`, `blocked`, `review`) are still accepted and map to `inbox`, `working`, `needs_attention`, and `needs_attention` respectively.

## File format

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-03-30T00:00:00.000Z",
  "tasks": [
    {
      "id": "research-mtulsa-com",
      "title": "Research mtulsa.com",
      "description": "Review mtulsa.com and summarize the site, positioning, and improvement opportunities.",
      "status": "working",
      "source": "hermes3d_manual",
      "sourceEventId": null,
      "assignedAgentId": "main",
      "createdAt": "2026-03-30T00:00:00.000Z",
      "updatedAt": "2026-03-30T00:10:00.000Z",
      "playbookJobId": null,
      "runId": null,
      "channel": "telegram",
      "externalThreadId": "telegram:direct:6866695577",
      "lastActivityAt": "2026-03-30T00:10:00.000Z",
      "notes": [],
      "isArchived": false,
      "isInferred": false,
      "model": "hermes-4-405b",
      "skills": ["web-research"],
      "subagentCount": 0,
      "scheduledFor": null,
      "learnedSkill": false,
      "history": [
        {
          "at": "2026-03-30T00:00:00.000Z",
          "type": "created",
          "note": "Task created.",
          "fromStatus": null,
          "toStatus": "inbox"
        },
        {
          "at": "2026-03-30T00:10:00.000Z",
          "type": "status_changed",
          "note": null,
          "fromStatus": "inbox",
          "toStatus": "working"
        }
      ]
    }
  ]
}
```

## Response rules

- Briefly confirm which task was created or updated.
- If the request is ambiguous, ask a clarifying question instead of guessing.
- Do not claim work is complete without updating the task status.
