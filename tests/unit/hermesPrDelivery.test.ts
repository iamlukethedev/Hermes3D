// @vitest-environment node
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const {
  GITHUB_PR_MARKER,
  hasPublishedPullRequest,
  isPullRequestDeliveryCandidate,
  mapContainerWorkspacePath,
  parseGitHubRepoSlug,
  publishTaskPullRequest,
  setPullRequestDeliveryStatus,
} = await import("../../server/hermes-agent/pr-delivery");

describe("Hermes Kanban GitHub PR delivery", () => {
  it("recognizes supported GitHub remote forms", () => {
    expect(parseGitHubRepoSlug("https://github.com/acme/widget.git")).toBe(
      "acme/widget",
    );
    expect(parseGitHubRepoSlug("git@github.com:acme/widget.git")).toBe(
      "acme/widget",
    );
    expect(parseGitHubRepoSlug("https://gitlab.com/acme/widget.git")).toBeNull();
  });

  it("maps the container /github mount into the approved host root", () => {
    const root = path.resolve("C:\\GitHub");
    expect(mapContainerWorkspacePath("/github/repo/.worktrees/t_1", root)).toBe(
      path.resolve(root, "repo", ".worktrees", "t_1"),
    );
  });

  it("publishes a clean reviewed task branch and records the PR URL", async () => {
    const root = path.resolve("C:\\GitHub");
    const workspace = path.resolve(root, "repo", ".worktrees", "t_1");
    const calls: string[] = [];
    const command = vi.fn((executable: string, args: string[]) => {
      calls.push(`${executable} ${args.join(" ")}`);
      if (executable === "git" && args[0] === "rev-parse") return workspace;
      if (executable === "git" && args[0] === "branch") return "crush-lu/t_1";
      if (executable === "git" && args[0] === "status") return "";
      if (executable === "git" && args[0] === "remote") {
        return "https://github.com/example-org/example-repo.git";
      }
      if (executable === "git" && args[0] === "push") return "";
      if (executable === "gh" && args[0] === "repo") {
        return JSON.stringify({ defaultBranchRef: { name: "main" } });
      }
      if (executable === "gh" && args[0] === "pr" && args[1] === "list") {
        return "[]";
      }
      if (executable === "gh" && args[0] === "pr" && args[1] === "create") {
        return "https://github.com/example-org/example-repo/pull/999";
      }
      throw new Error(`Unexpected command: ${executable} ${args.join(" ")}`);
    });

    const result = await publishTaskPullRequest(
      {
        id: "t_1",
        title: "Fix checkout",
        status: "review",
        body: `${GITHUB_PR_MARKER}\nImplement the fix.`,
        workspace_path: workspace,
        branch_name: "crush-lu/t_1",
      },
      { workspaceRoot: root, command, pathExists: () => true },
    );

    expect(result.status).toBe("opened");
    expect(result.url).toContain("/pull/999");
    expect(hasPublishedPullRequest(result.body)).toBe(true);
    expect(calls).toContain("git push --set-upstream origin crush-lu/t_1");
    expect(calls.some((call) => call.startsWith("gh pr create"))).toBe(true);
  });

  it("refuses review delivery while the worker left uncommitted changes", async () => {
    const root = path.resolve("C:\\GitHub");
    const workspace = path.resolve(root, "repo", ".worktrees", "t_2");
    const command = (executable: string, args: string[]) => {
      if (executable === "git" && args[0] === "rev-parse") return workspace;
      if (executable === "git" && args[0] === "branch") return "crush-lu/t_2";
      if (executable === "git" && args[0] === "status") return " M app.py";
      throw new Error("Unexpected command");
    };

    await expect(
      publishTaskPullRequest(
        {
          id: "t_2",
          title: "Fix checkout",
          status: "review",
          body: GITHUB_PR_MARKER,
          workspace_path: workspace,
          branch_name: "crush-lu/t_2",
        },
        { workspaceRoot: root, command, pathExists: () => true },
      ),
    ).rejects.toThrow("uncommitted changes");
  });

  it("requires both the explicit marker and review lifecycle state", () => {
    const base = {
      id: "t_3",
      title: "Fix checkout",
      body: GITHUB_PR_MARKER,
      workspace_path: "C:\\GitHub\\repo\\.worktrees\\t_3",
      branch_name: "crush-lu/t_3",
    };
    expect(isPullRequestDeliveryCandidate({ ...base, status: "review" })).toBe(true);
    expect(isPullRequestDeliveryCandidate({ ...base, status: "running" })).toBe(false);
    expect(
      isPullRequestDeliveryCandidate({ ...base, status: "review", body: "No marker" }),
    ).toBe(false);
    expect(
      hasPublishedPullRequest(
        setPullRequestDeliveryStatus(
          GITHUB_PR_MARKER,
          "opened https://github.com/acme/widget/pull/1",
        ),
      ),
    ).toBe(true);
  });
});
