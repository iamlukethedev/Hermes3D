import { NextResponse } from "next/server";

import {
  advanceStandupMeeting,
  resolveStandupBlocker,
  startStandupSpeaker,
  updateStandupTaskDispatch,
  updateStandupArrivals,
} from "@/lib/office/standup/service";
import {
  loadActiveStandupMeeting,
  updateStandupMeeting,
} from "@/lib/office/standup/store";
import type {
  StandupTaskDispatchState,
  StandupTaskDispatchStatus,
} from "@/lib/office/standup/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(
      { meeting: loadActiveStandupMeeting() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load standup meeting.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      action?:
        | "arrivals"
        | "start"
        | "advance"
        | "complete"
        | "task_dispatch"
        | "resolve_blocker";
      arrivedAgentIds?: string[];
      speakerAgentId?: string | null;
      taskDispatch?: Partial<StandupTaskDispatchState>;
      agentId?: string;
      blockerIndex?: number;
      optionId?: string;
      decisionText?: string;
    };
    const action = typeof body.action === "string" ? body.action : "";
    if (!action) {
      return NextResponse.json({ error: "action is required." }, { status: 400 });
    }
    const store = updateStandupMeeting((meeting) => {
      if (!meeting) return null;
      if (action === "arrivals") {
        return updateStandupArrivals(meeting, body.arrivedAgentIds ?? []);
      }
      if (action === "start") {
        const speakerAgentId =
          typeof body.speakerAgentId === "string" ? body.speakerAgentId.trim() : null;
        return startStandupSpeaker(meeting, speakerAgentId);
      }
      if (action === "advance") {
        return advanceStandupMeeting(meeting);
      }
      if (action === "complete") {
        return startStandupSpeaker(meeting, null);
      }
      if (action === "resolve_blocker") {
        const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
        const decisionText =
          typeof body.decisionText === "string" ? body.decisionText.trim() : "";
        if (!agentId || !decisionText) return meeting;
        return resolveStandupBlocker(meeting, {
          agentId,
          blockerIndex: typeof body.blockerIndex === "number" ? body.blockerIndex : undefined,
          optionId: typeof body.optionId === "string" ? body.optionId.trim() : undefined,
          decisionText,
        });
      }
      if (action === "task_dispatch") {
        const allowedStatuses: StandupTaskDispatchStatus[] = [
          "pending",
          "queueing",
          "dispatched",
          "failed",
        ];
        const status = allowedStatuses.includes(
          body.taskDispatch?.status as StandupTaskDispatchStatus,
        )
          ? (body.taskDispatch?.status as StandupTaskDispatchStatus)
          : "failed";
        const normalizeAgentIds = (value: unknown) =>
          Array.isArray(value)
            ? Array.from(
                new Set(
                  value
                    .filter((entry): entry is string => typeof entry === "string")
                    .map((entry) => entry.trim())
                    .filter(Boolean),
                ),
              )
            : [];
        return updateStandupTaskDispatch(meeting, {
          status,
          queuedAgentIds: normalizeAgentIds(body.taskDispatch?.queuedAgentIds),
          blockedAgentIds: normalizeAgentIds(body.taskDispatch?.blockedAgentIds),
          updatedAt: new Date().toISOString(),
          error:
            typeof body.taskDispatch?.error === "string"
              ? body.taskDispatch.error.trim().slice(0, 600) || null
              : null,
        });
      }
      return meeting;
    });
    return NextResponse.json(
      { meeting: store.activeMeeting },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update standup meeting.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
