/**
 * pr-create runner — spawns gh CLI to create or detect GitHub PRs.
 * Uses node:child_process.spawn (NOT bun:* / Bun.*) per project rules.
 *
 * Design D1: kind=cli, no LLM involvement.
 * Design D2: OPEN PR → existing-open (idempotent). MERGED/CLOSED → error (escalation).
 * Design D3: base branch is sourced from ParsedRequest.baseBranch.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { spawnCommand as _spawnCommand } from "../../util/spawn.js";

export interface PrCreateInput {
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  cwd?: string;
  /** GitHub token to inject as GITHUB_TOKEN env var for gh CLI subprocess. */
  githubToken?: string;
}

export type PrCreateResult =
  | { status: "created"; url: string; number: number }
  | { status: "existing-open"; url: string; number: number }
  | { status: "error"; reason: "merged"; message: string }
  | { status: "error"; reason: "closed"; message: string }
  | { status: "error"; reason: "gh-failure"; message: string };

interface GhPrListEntry {
  url: string;
  number: number;
  state: string;
}

/**
 * Spawn a command and collect stdout/stderr.
 * Thin wrapper over shared spawnCommand for backward compat within this module.
 */
function spawnCommand(
  cmd: string,
  args: string[],
  cwd: string,
  env?: Record<string, string | undefined>,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return _spawnCommand(cmd, args, { cwd, env });
}

/**
 * Run `gh pr list` to check for existing PRs on this branch.
 * PR absence is determined solely by JSON array length === 0.
 * stderr content is never used for absence detection.
 */
async function listPrs(
  branch: string,
  baseBranch: string,
  cwd: string,
  env?: Record<string, string | undefined>,
): Promise<{ ok: true; entries: GhPrListEntry[] } | { ok: false; stderr: string }> {
  const { exitCode, stdout, stderr } = await spawnCommand(
    "gh",
    [
      "pr", "list",
      "--head", branch,
      "--base", baseBranch,
      "--state", "all",
      "--json", "url,number,state",
    ],
    cwd,
    env,
  );

  if (exitCode !== 0) {
    return { ok: false, stderr };
  }

  try {
    const parsed = JSON.parse(stdout.trim()) as GhPrListEntry[];
    return { ok: true, entries: parsed };
  } catch {
    return { ok: false, stderr: `Failed to parse gh pr list output: ${stdout}` };
  }
}

/**
 * Run `gh pr create` with a body written to a temp file.
 * --body flag is NOT used; body is passed via --body-file.
 * The temp file is deleted after the command completes (success or failure).
 */
async function createPr(
  input: PrCreateInput,
  cwd: string,
  env?: Record<string, string | undefined>,
): Promise<{ ok: true; url: string; number: number } | { ok: false; stderr: string }> {
  const tmpFile = path.join(os.tmpdir(), `specrunner-pr-body-${Date.now()}.md`);
  await fs.writeFile(tmpFile, input.body, "utf-8");

  let result: { exitCode: number | null; stdout: string; stderr: string };
  try {
    result = await spawnCommand(
      "gh",
      [
        "pr", "create",
        "--title", input.title,
        "--body-file", tmpFile,
        "--base", input.baseBranch,
        "--head", input.branch,
      ],
      cwd,
      env,
    );
  } finally {
    // Always delete temp file, regardless of success or failure
    await fs.unlink(tmpFile).catch(() => undefined);
  }

  if (result.exitCode !== 0) {
    return { ok: false, stderr: result.stderr };
  }

  // Extract PR URL from stdout (gh pr create prints the URL on stdout)
  const urlMatch = /https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/.exec(result.stdout.trim());
  if (!urlMatch) {
    return { ok: false, stderr: `gh pr create succeeded but could not extract PR URL from output: ${result.stdout}` };
  }

  return {
    ok: true,
    url: urlMatch[0],
    number: parseInt(urlMatch[1]!, 10),
  };
}

/**
 * Run the pr-create operation:
 * 1. Check for existing PRs on the branch.
 * 2. If OPEN PR exists → return existing-open (idempotent).
 * 3. If MERGED/CLOSED PR exists → return error (escalation required).
 * 4. If no PR exists → create new PR via gh pr create.
 */
export async function runPrCreate(input: PrCreateInput): Promise<PrCreateResult> {
  const cwd = input.cwd ?? process.cwd();
  const ghEnv = input.githubToken ? { GITHUB_TOKEN: input.githubToken } : undefined;

  // Step 1: Check for existing PRs
  const listResult = await listPrs(input.branch, input.baseBranch, cwd, ghEnv);

  if (!listResult.ok) {
    return {
      status: "error",
      reason: "gh-failure",
      message: buildGhFailureMessage(listResult.stderr),
    };
  }

  const entries = listResult.entries;

  // Step 2: PR absent — JSON array length 0 is the only criterion
  if (entries.length === 0) {
    // Create new PR
    const createResult = await createPr(input, cwd, ghEnv);
    if (!createResult.ok) {
      return {
        status: "error",
        reason: "gh-failure",
        message: buildGhFailureMessage(createResult.stderr),
      };
    }
    return {
      status: "created",
      url: createResult.url,
      number: createResult.number,
    };
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
 * Build a user-friendly error message for gh CLI failures.
 * Includes re-authentication hint for common auth failures.
 */
function buildGhFailureMessage(stderr: string): string {
  const hint =
    stderr.toLowerCase().includes("auth") || stderr.toLowerCase().includes("token")
      ? "\n\nRun 'specrunner login' or 'gh auth login' to re-authenticate."
      : "\n\nIf this is an authentication error, run 'specrunner login' or 'gh auth login' to re-authenticate.";
  return `${stderr.trim()}${hint}`;
}
