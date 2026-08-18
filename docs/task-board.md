# Hermes Task Board

The office kanban mirrors the Hermes agent task lifecycle. Task management is
built into the Hermes agent — there is no skill to install. The board is always
available from the office HUD, the kanban desk in the 3D scene, and the HQ
sidebar.

## Lifecycle

| Status | Meaning |
| --- | --- |
| `inbox` | Request captured from any platform (Telegram, Discord, Slack, WhatsApp, Signal, email, CLI), not started yet. |
| `scheduled` | Queued for a later run by the cron scheduler or a playbook. `scheduledFor` holds the due time. |
| `working` | The agent is actively executing tools, terminals, or subagents. |
| `needs_attention` | Blocked on a human: a command approval, a question, missing credentials, or an error. |
| `done` | Finished. `learnedSkill` is `true` when the learning loop distilled the task into a new skill. |

Legacy statuses from the previous board (`todo`, `in_progress`, `blocked`,
`review`) are accepted everywhere and normalized to `inbox`, `working`,
`needs_attention`, and `needs_attention` respectively.

Cards move automatically as the agent works: a run starting moves the linked
card to `working`, a run error or an approval wait moves it to
`needs_attention`, and a completed run moves it to `done`. Cron playbooks
surface in `scheduled`.

## Shared task store

The authoritative task file is:

- `${HERMES_STATE_DIR}/hermes3d/task-manager/tasks.json` when `HERMES_STATE_DIR` is set.
- `~/.hermes/hermes3d/task-manager/tasks.json` otherwise.

Studio reads and writes it through `/api/task-store` (GET / PUT / DELETE —
DELETE archives instead of deleting). Any external writer (including the
Hermes agent itself) can edit the file directly; Studio polls it and merges.

## Task fields

Each task carries: `id`, `title`, `description`, `status`, `source`,
`sourceEventId`, `assignedAgentId`, `createdAt`, `updatedAt`, `playbookJobId`,
`runId`, `channel`, `externalThreadId`, `lastActivityAt`, `notes`,
`isArchived`, `isInferred`, `history`, and the Hermes metadata fields:

- `model` — the LLM used for the task (for example `hermes-4-405b`), or `null`.
- `skills` — names of skills used or created while working the task.
- `subagentCount` — number of isolated subagents spawned for parallel work.
- `scheduledFor` — ISO timestamp when a `scheduled` task is due, or `null`.
- `learnedSkill` — `true` when the task produced a new skill.

## Example

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-03-30T00:10:00.000Z",
  "tasks": [
    {
      "id": "research-mtulsa-com",
      "title": "Research mtulsa.com",
      "description": "Review mtulsa.com and summarize improvement opportunities.",
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
