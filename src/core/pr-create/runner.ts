/**
 * pr-create runner — creates GitHub PRs via REST API.
 *
 * Design D1: kind=cli, no LLM involvement.
 * Design D2: OPEN PR → existing-open (idempotent). MERGED/CLOSED → error (escalation).
 * Design D3: base branch is sourced from ParsedRequest.baseBranch.
 * Design D7: GitHubClient replaces gh CLI subprocess.
 */
import type { GitHubClient } from "../../core/port/github-client.js";

export interface PrCreateInput {
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  cwd?: string;
  /** GitHub REST API client. */
  githubClient: GitHubClient;
  /** Repository owner (e.g. "octocat"). */
  owner: string;
  /** Repository name (e.g. "my-repo"). */
  repo: string;
}

export type PrCreateResult =
  | { status: "created"; url: string; number: number }
  | { status: "existing-open"; url: string; number: number }
  | { status: "error"; reason: "merged"; message: string }
  | { status: "error"; reason: "closed"; message: string }
  | { status: "error"; reason: "gh-failure"; message: string };

/**
 * Run the pr-create operation:
 * 1. Check for existing PRs on the branch.
 * 2. If OPEN PR exists → return existing-open (idempotent).
 * 3. If MERGED/CLOSED PR exists → return error (escalation required).
 * 4. If no PR exists → create new PR via REST API.
 */
export async function runPrCreate(input: PrCreateInput): Promise<PrCreateResult> {
  const { githubClient, owner, repo } = input;

  // Step 1: Check for existing PRs (state=all — all states)
  let entries: Array<{ url: string; number: number; state: string }>;
  try {
    entries = await githubClient.listPullRequests(owner, repo, input.branch, input.baseBranch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      reason: "gh-failure",
      message: buildFailureMessage(message),
    };
  }

  // Step 2: PR absent — JSON array length 0 is the only criterion
  if (entries.length === 0) {
    // Create new PR
    try {
      const created = await githubClient.createPullRequest(
        owner,
        repo,
        input.branch,
        input.baseBranch,
        input.title,
        input.body,
      );
      return {
        status: "created",
        url: created.url,
        number: created.number,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "error",
        reason: "gh-failure",
        message: buildFailureMessage(message),
      };
    }
  }

  // Step 3: Existing PR found — check state
  const existing = entries[0]!;
  const state = existing.state.toUpperCase();

  if (state === "OPEN") {
    return {
      status: "existing-open",
      url: existing.url,
      number: existing.number,
    };
  }

  if (state === "MERGED") {
    return {
      status: "error",
      reason: "merged",
      message: `A PR for branch '${input.branch}' was already merged (PR #${existing.number}: ${existing.url}). Please create a new branch for additional changes.`,
    };
  }

  // CLOSED or any other non-OPEN/non-MERGED state
  return {
    status: "error",
    reason: "closed",
    message: `A PR for branch '${input.branch}' was closed (PR #${existing.number}: ${existing.url}). Please reopen or create a new branch.`,
  };
}

/**
 * Build a user-friendly error message for GitHub API failures.
 * Includes re-authentication hint for auth-related failures.
 */
function buildFailureMessage(detail: string): string {
  const lower = detail.toLowerCase();
  const hint =
    lower.includes("auth") || lower.includes("token") || lower.includes("credentials")
      ? "\n\nRun 'specrunner login' to re-authenticate."
      : "\n\nIf this is an authentication error, run 'specrunner login' to re-authenticate.";
  return `${detail.trim()}${hint}`;
}
