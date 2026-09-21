import { describe, expect, it, vi } from "vitest";

const {
  DOCKER_LIST_FORMAT,
  buildReadableHermesContainerName,
  parseHermesContainerRows,
  syncReadableHermesContainerNames,
} = await import("../../server/hermes-agent/docker-names");

describe("Hermes Docker container names", () => {
  it("combines the profile, task, and legacy unique suffix", () => {
    expect(
      buildReadableHermesContainerName({
        currentName: "hermes-d1da10dc",
        profile: "growth-agent",
        taskId: "default",
      }),
    ).toBe("hermes-growth-agent-default-d1da10dc");

    expect(
      buildReadableHermesContainerName({
        currentName: "hermes-4ea1a3c2",
        profile: "Build Agent",
        taskId: "prompt-backend-probe",
      }),
    ).toBe("hermes-build-agent-probe-4ea1a3c2");
  });

  it("leaves already-readable or unrelated containers alone", () => {
    expect(
      buildReadableHermesContainerName({
        currentName: "hermes-qa-agent-default-da9fc7f7",
        profile: "qa-agent",
        taskId: "default",
      }),
    ).toBeNull();
    expect(
      buildReadableHermesContainerName({
        currentName: "postgres",
        profile: "qa-agent",
        taskId: "default",
      }),
    ).toBeNull();
  });

  it("parses Docker label rows without treating labels as shell input", () => {
    expect(
      parseHermesContainerRows(
        "hermes-abcd1234\tlead-agent\tsession_20260825_050032_719fa7\r\n",
      ),
    ).toEqual([
      {
        currentName: "hermes-abcd1234",
        profile: "lead-agent",
        taskId: "session_20260825_050032_719fa7",
      },
    ]);
  });

  it("renames only legacy Hermes containers through argument arrays", async () => {
    const docker = vi.fn(async (args: string[]) => {
      if (args[0] === "ps") {
        expect(args).toEqual([
          "ps",
          "-a",
          "--filter",
          "label=hermes-agent=1",
          "--format",
          DOCKER_LIST_FORMAT,
        ]);
        return [
          "hermes-d1da10dc\tgrowth-agent\tdefault",
          "hermes-qa-agent-default-da9fc7f7\tqa-agent\tdefault",
        ].join("\n");
      }
      return "";
    });

    await expect(syncReadableHermesContainerNames({ docker })).resolves.toEqual([
      {
        from: "hermes-d1da10dc",
        to: "hermes-growth-agent-default-d1da10dc",
      },
    ]);
    expect(docker).toHaveBeenCalledTimes(2);
    expect(docker).toHaveBeenLastCalledWith([
      "rename",
      "hermes-d1da10dc",
      "hermes-growth-agent-default-d1da10dc",
    ]);
  });
});
