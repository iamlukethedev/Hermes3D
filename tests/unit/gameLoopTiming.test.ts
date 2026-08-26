import { describe, expect, it } from "vitest";

import { consumeGameLoopSteps } from "@/features/retro-office/systems/sceneRuntime";

describe("GameLoop timing", () => {
  it("keeps simulation speed consistent when rendered at 15 FPS", () => {
    let accumulator = 0;
    let steps = 0;

    for (let render = 0; render < 15; render += 1) {
      const next = consumeGameLoopSteps(accumulator, 1 / 15);
      accumulator = next.remainder;
      steps += next.steps;
    }

    expect(steps).toBe(60);
  });
});
