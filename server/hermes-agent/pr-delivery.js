/**
 * Credentialed GitHub delivery for repository-backed Hermes Kanban tasks.
 *
 * Kanban workers run in isolated containers. They can edit and commit the
 * task's bind-mounted worktree, but they deliberately do not receive the
 * host's GitHub credentials and the stock image has no `gh` binary. A task
 * explicitly marked for Hermes3D delivery therefore stops in `review`; this
 * host-side bridge validates the worktree, pushes its branch without force,
 * opens (or reuses) a PR through the authenticated host CLI, and writes the URL
 * back into the task body.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const GITHUB_PR_MARKER = "[hermes3d:github-pr]";
const PR_STATUS_START = "<!-- hermes3d-pr-status:start -->";
const PR_STATUS_END = "<!-- hermes3d-pr-status:end -->";
const COMMAND_TIMEOUT_MS = 120_000;

const asTrimmed = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : "";

const redactCommandError = (value) =>
  asTrimmed(value)
    .replace(/https:\/\/[^\s/@]+@github\.com/gi, "https://github.com")
    .replace(/(?:ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/g, "***")
    .slice(0, 500);

const runTextCommand = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: COMMAND_TIMEOUT_MS,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = redactCommandError(result.stderr || result.stdout);
    throw new Error(`${command} ${args[0] ?? ""} failed${detail ? `: ${detail}` : "."}`);
  }
  return asTrimmed(result.stdout);
};

const parseGitHubRepoSlug = (remoteUrl) => {
  const value = asTrimmed(remoteUrl).replace(/\.git$/i, "");
  const scpMatch = value.match(/^git@github\.com:([^/]+\/[^/]+)$/i);
  if (scpMatch) return scpMatch[1];
  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase() !== "github.com") return null;
    const slug = parsed.pathname.replace(/^\/+|\/+$/g, "");
    return /^[^/]+\/[^/]+$/.test(slug) ? slug : null;
  } catch {
    return null;
  }
};

const defaultWorkspaceRoot = () =>
  path.resolve(
    asTrimmed(process.env.HERMES3D_PR_WORKSPACE_ROOT) ||
      path.dirname(process.cwd()),
  );

const mapContainerWorkspacePath = (workspacePath, workspaceRoot = defaultWorkspaceRoot()) => {
  const value = asTrimmed(workspacePath);
  if (!value) return null;
  if (/^\/github(?:\/|$)/i.test(value)) {
    const suffix = value.replace(/^\/github\/?/i, "");
    return path.resolve(workspaceRoot, ...suffix.split("/").filter(Boolean));
  }
  if (path.isAbsolute(value)) return path.resolve(value);
  return null;
};

const isPathInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const setPullRequestDeliveryStatus = (body, statusText) => {
  const current = typeof body === "string" ? body.trimEnd() : "";
  const block = `${PR_STATUS_START}\nGitHub delivery: ${statusText}\n${PR_STATUS_END}`;
  const start = current.indexOf(PR_STATUS_START);
  const end = current.indexOf(PR_STATUS_END);
  if (start >= 0 && end >= start) {
    return `${current.slice(0, start).trimEnd()}\n\n${block}${current
      .slice(end + PR_STATUS_END.length)
      .trimEnd()}`.trimEnd();
  }
  return `${current}\n\n${block}`.trim();
};

const hasPublishedPullRequest = (body) => {
  const value = asTrimmed(body);
  if (!value.includes(PR_STATUS_START)) return false;
  const block = value.slice(value.indexOf(PR_STATUS_START));
  return /GitHub delivery:\s+(?:opened|reused)\s+https:\/\/github\.com\//i.test(block);
};

const isPullRequestDeliveryCandidate = (task) =>
  Boolean(
    task &&
      asTrimmed(task.id) &&
      asTrimmed(task.status) === "review" &&
      asTrimmed(task.body).includes(GITHUB_PR_MARKER) &&
      asTrimmed(task.branch_name) &&
      asTrimmed(task.workspace_path) &&
      !hasPublishedPullRequest(task.body),
  );

const parseJson = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const publishTaskPullRequest = async (
  task,
  {
    workspaceRoot = defaultWorkspaceRoot(),
    command = runTextCommand,
    pathExists = fs.existsSync,
  } = {},
) => {
  if (!isPullRequestDeliveryCandidate(task)) {
    return { status: "skipped", url: null, body: asTrimmed(task?.body) };
  }

  const workspace = mapContainerWorkspacePath(task.workspace_path, workspaceRoot);
  if (!workspace || !isPathInside(workspaceRoot, workspace)) {
    throw new Error("Task worktree is outside the configured GitHub workspace root.");
  }
  if (!pathExists(workspace)) throw new Error("Task worktree does not exist on the host.");

  const topLevel = path.resolve(command("git", ["rev-parse", "--show-toplevel"], workspace));
  if (!isPathInside(workspaceRoot, topLevel)) {
    throw new Error("Resolved git worktree is outside the configured workspace root.");
  }
  const branch = command("git", ["branch", "--show-current"], topLevel);
  const expectedBranch = asTrimmed(task.branch_name);
  if (!branch || branch !== expectedBranch) {
    throw new Error(
      `Task branch mismatch: expected ${expectedBranch || "a named branch"}, found ${branch || "detached HEAD"}.`,
    );
  }
  const dirty = command("git", ["status", "--porcelain"], topLevel);
  if (dirty) {
    throw new Error("Task worktree still has uncommitted changes; commit or clean them before review.");
  }

  const repo = parseGitHubRepoSlug(command("git", ["remote", "get-url", "origin"], topLevel));
  if (!repo) throw new Error("The task worktree origin is not a supported GitHub repository.");

  const repoInfo = parseJson(
    command("gh", ["repo", "view", repo, "--json", "defaultBranchRef"], topLevel),
    null,
  );
  const baseBranch = asTrimmed(repoInfo?.defaultBranchRef?.name);
  if (!baseBranch) throw new Error("GitHub did not return the repository default branch.");
  if (branch === baseBranch) throw new Error("Refusing to publish a PR from the default branch.");

  command("git", ["push", "--set-upstream", "origin", branch], topLevel);

  const existing = parseJson(
    command(
      "gh",
      [
        "pr",
        "list",
        "--repo",
        repo,
        "--head",
        branch,
        "--state",
        "open",
        "--limit",
        "1",
        "--json",
        "url",
      ],
      topLevel,
    ),
    [],
  );
  let url = asTrimmed(existing?.[0]?.url);
  let status = "reused";
  if (!url) {
    const taskId = asTrimmed(task.id);
    const title = asTrimmed(task.title).slice(0, 240) || `Hermes task ${taskId}`;
    const prBody = [
      `Automated delivery for Hermes Kanban task \`${taskId}\`.`,
      "",
      "The implementation was completed and committed in the task's isolated worktree.",
      "Review the Kanban card for the worker summary and verification metadata.",
    ].join("\n");
    url = command(
      "gh",
      [
        "pr",
        "create",
        "--repo",
        repo,
        "--head",
        branch,
        "--base",
        baseBranch,
        "--title",
        title,
        "--body",
        prBody,
      ],
      topLevel,
    );
    status = "opened";
  }
  if (!/^https:\/\/github\.com\//i.test(url)) {
    throw new Error("GitHub CLI did not return a pull request URL.");
  }

  return {
    status,
    url,
    body: setPullRequestDeliveryStatus(task.body, `${status} ${url}`),
    repo,
    branch,
    workspace: topLevel,
  };
};

module.exports = {
  GITHUB_PR_MARKER,
  PR_STATUS_START,
  PR_STATUS_END,
  parseGitHubRepoSlug,
  mapContainerWorkspacePath,
  isPathInside,
  setPullRequestDeliveryStatus,
  hasPublishedPullRequest,
  isPullRequestDeliveryCandidate,
  publishTaskPullRequest,
  redactCommandError,
};
