// Behavior tests for the pixel office agent simulation (no Phaser involved).

import { describe, expect, it } from "vitest";

import { buildHermesHqMap } from "@/features/pixel-office/map/hermesHqMap";
import { tileCenter } from "@/features/pixel-office/map/navGrid";
import {
  createPixelSimulation,
  JANITOR_ID,
  type PixelSimulation,
} from "@/features/pixel-office/sim/agentSimulation";
import type { PixelAgentInput, PixelAgentPose } from "@/features/pixel-office/types";

const DT_MS = 50;

const makeInput = (
  id: string,
  overrides: Partial<PixelAgentInput> = {},
): PixelAgentInput => ({
  id,
  name: id,
  status: "working",
  color: "#7c5cff",
  streaming: false,
  thinking: false,
  awaitingApproval: false,
  dancing: false,
  hold: null,
  standup: false,
  ...overrides,
});

type Clock = { nowMs: number };

const makeClock = (): Clock => ({ nowMs: 1_000_000 });

const runTicks = (
  sim: PixelSimulation,
  clock: Clock,
  inputs: PixelAgentInput[],
  ticks: number,
  cleaningActive = false,
): PixelAgentPose[] => {
  let poses: PixelAgentPose[] = [];
  for (let index = 0; index < ticks; index += 1) {
    clock.nowMs += DT_MS;
    poses = sim.tick({ inputs, nowMs: clock.nowMs, dtMs: DT_MS, cleaningActive });
  }
  return poses;
};

const poseById = (poses: PixelAgentPose[], id: string): PixelAgentPose => {
  const pose = poses.find((candidate) => candidate.id === id);
  if (!pose) throw new Error(`missing pose for ${id}`);
  return pose;
};

describe("pixel office simulation", () => {
  it("walks a working agent from spawn to its desk seat", () => {
    const map = buildHermesHqMap();
    const sim = createPixelSimulation(map);
    const clock = makeClock();
    const inputs = [makeInput("agent-a")];

    const early = runTicks(sim, clock, inputs, 2);
    expect(early[0].activity).toBe("walking");
    expect(early[0].moving).toBe(true);

    const poses = runTicks(sim, clock, inputs, 1200);
    const pose = poses[0];
    const deskId = sim.getState().deskByAgentId["agent-a"];
    expect(deskId).toBe(map.desks[0].id);
    const desk = map.desks.find((slot) => slot.id === deskId);
    if (!desk) throw new Error("desk not found");
    const seat = tileCenter(desk.seatTx, desk.seatTy);
    expect(pose.activity).toBe("sitting_desk");
    expect(pose.moving).toBe(false);
    expect(pose.x).toBe(seat.x);
    expect(pose.y).toBe(seat.y);
    expect(pose.facing).toBe(desk.facing);
    expect(pose.deskId).toBe(desk.id);
    expect(pose.stationId).toBeNull();
  });

  it("assigns desks deterministically and keeps them sticky across roster reorders", () => {
    const map = buildHermesHqMap();
    const inputs = [makeInput("agent-b"), makeInput("agent-a")];

    const simOne = createPixelSimulation(map);
    const clockOne = makeClock();
    runTicks(simOne, clockOne, inputs, 5);
    const firstRun = { ...simOne.getState().deskByAgentId };

    const simTwo = createPixelSimulation(buildHermesHqMap());
    const clockTwo = makeClock();
    runTicks(simTwo, clockTwo, inputs, 5);
    expect(simTwo.getState().deskByAgentId).toEqual(firstRun);

    // Sorted by id: agent-a takes the first desk even though agent-b is first
    // in the roster array.
    expect(firstRun["agent-a"]).toBe(map.desks[0].id);
    expect(firstRun["agent-b"]).toBe(map.desks[1].id);

    // Reordering the roster must not reshuffle assignments.
    runTicks(simOne, clockOne, [makeInput("agent-a"), makeInput("agent-b")], 5);
    expect(simOne.getState().deskByAgentId).toEqual(firstRun);
  });

  it("routes a gym hold to a gym station and returns to the desk afterwards", () => {
    const map = buildHermesHqMap();
    const sim = createPixelSimulation(map);
    const clock = makeClock();

    const holdPoses = runTicks(sim, clock, [makeInput("agent-a", { hold: "gym" })], 1200);
    const holdPose = holdPoses[0];
    expect(holdPose.activity).toBe("station");
    expect(holdPose.stationId).not.toBeNull();
    const station = map.stations.find((slot) => slot.id === holdPose.stationId);
    expect(station?.kind).toBe("gym");
    const stationCenter = tileCenter(station?.tx ?? 0, station?.ty ?? 0);
    expect(holdPose.x).toBe(stationCenter.x);
    expect(holdPose.y).toBe(stationCenter.y);

    const releasedPoses = runTicks(sim, clock, [makeInput("agent-a")], 1200);
    const releasedPose = releasedPoses[0];
    expect(releasedPose.activity).toBe("sitting_desk");
    const desk = map.desks.find(
      (slot) => slot.id === sim.getState().deskByAgentId["agent-a"],
    );
    if (!desk) throw new Error("desk not found");
    const seat = tileCenter(desk.seatTx, desk.seatTy);
    expect(releasedPose.x).toBe(seat.x);
    expect(releasedPose.y).toBe(seat.y);
  });

  it("sends two phone_booth holds to two different booths", () => {
    const map = buildHermesHqMap();
    const sim = createPixelSimulation(map);
    const clock = makeClock();
    const inputs = [
      makeInput("agent-a", { hold: "phone_booth" }),
      makeInput("agent-b", { hold: "phone_booth" }),
    ];

    const poses = runTicks(sim, clock, inputs, 1200);
    const poseA = poseById(poses, "agent-a");
    const poseB = poseById(poses, "agent-b");
    expect(poseA.activity).toBe("station");
    expect(poseB.activity).toBe("station");
    expect(poseA.stationId).not.toBeNull();
    expect(poseB.stationId).not.toBeNull();
    expect(poseA.stationId).not.toBe(poseB.stationId);
    for (const stationId of [poseA.stationId, poseB.stationId]) {
      const station = map.stations.find((slot) => slot.id === stationId);
      expect(station?.kind).toBe("phone_booth");
    }
  });

  it("dances in place without teleporting", () => {
    const map = buildHermesHqMap();
    const sim = createPixelSimulation(map);
    const clock = makeClock();

    const walking = runTicks(sim, clock, [makeInput("agent-a")], 10);
    expect(walking[0].moving).toBe(true);
    const before = walking[0];

    const dancing = runTicks(sim, clock, [makeInput("agent-a", { dancing: true })], 1);
    expect(dancing[0].activity).toBe("dancing");
    expect(dancing[0].moving).toBe(false);
    expect(dancing[0].x).toBe(before.x);
    expect(dancing[0].y).toBe(before.y);

    const stillDancing = runTicks(
      sim,
      clock,
      [makeInput("agent-a", { dancing: true })],
      20,
    );
    expect(stillDancing[0].activity).toBe("dancing");
    expect(stillDancing[0].x).toBe(before.x);
    expect(stillDancing[0].y).toBe(before.y);
  });

  it("gathers everyone at distinct meeting seats during a standup", () => {
    const map = buildHermesHqMap();
    const sim = createPixelSimulation(map);
    const clock = makeClock();
    const inputs = [
      makeInput("agent-a", { standup: true }),
      makeInput("agent-b", { standup: true }),
      makeInput("agent-c", { standup: true }),
    ];

    const poses = runTicks(sim, clock, inputs, 1600);
    const stationIds = new Set<string>();
    for (const pose of poses) {
      expect(pose.activity).toBe("meeting");
      expect(pose.moving).toBe(false);
      expect(pose.stationId).not.toBeNull();
      const station = map.stations.find((slot) => slot.id === pose.stationId);
      expect(station?.kind).toBe("meeting_seat");
      if (pose.stationId) stationIds.add(pose.stationId);
    }
    expect(stationIds.size).toBe(inputs.length);
  });

  it("makes an idle agent visit a station, pause, then pick a different one", () => {
    const map = buildHermesHqMap();
    const sim = createPixelSimulation(map);
    const clock = makeClock();
    const inputs = [makeInput("agent-idle", { status: "idle" })];

    const visited: string[] = [];
    for (let index = 0; index < 2400 && visited.length < 2; index += 1) {
      const poses = runTicks(sim, clock, inputs, 1);
      const pose = poses[0];
      const settled =
        !pose.moving &&
        pose.stationId !== null &&
        (pose.activity === "station" || pose.activity === "standing");
      if (settled && visited[visited.length - 1] !== pose.stationId) {
        visited.push(pose.stationId as string);
      }
    }
    expect(visited.length).toBeGreaterThanOrEqual(2);
    expect(visited[0]).not.toBe(visited[1]);
  });

  it("spawns the janitor while cleaning and walks it back to spawn afterwards", () => {
    const map = buildHermesHqMap();
    const sim = createPixelSimulation(map);
    const clock = makeClock();

    const active = runTicks(sim, clock, [], 100, true);
    const janitorPose = poseById(active, JANITOR_ID);
    expect(janitorPose).toBeDefined();
    expect(sim.getState().janitor).not.toBeNull();

    let lastSeen = janitorPose;
    let despawned = false;
    for (let index = 0; index < 2000; index += 1) {
      const poses = runTicks(sim, clock, [], 1, false);
      const pose = poses.find((candidate) => candidate.id === JANITOR_ID);
      if (!pose) {
        despawned = true;
        break;
      }
      lastSeen = pose;
    }
    expect(despawned).toBe(true);
    expect(sim.getState().janitor).toBeNull();
    const spawn = tileCenter(map.spawn.tx, map.spawn.ty);
    const distance = Math.hypot(lastSeen.x - spawn.x, lastSeen.y - spawn.y);
    expect(distance).toBeLessThan(16);
  });

  it("frees a removed agent's desk for the next assignee", () => {
    const map = buildHermesHqMap();
    const sim = createPixelSimulation(map);
    const clock = makeClock();

    runTicks(sim, clock, [makeInput("agent-a")], 5);
    expect(sim.getState().deskByAgentId["agent-a"]).toBe(map.desks[0].id);

    runTicks(sim, clock, [makeInput("agent-c")], 5);
    const deskByAgentId = sim.getState().deskByAgentId;
    expect(deskByAgentId["agent-a"]).toBeUndefined();
    expect(deskByAgentId["agent-c"]).toBe(map.desks[0].id);
    expect(sim.getState().agents["agent-a"]).toBeUndefined();
  });
});
