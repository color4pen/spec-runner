/**
 * DynamicContext: collects per-run repository context for injection into agent prompts.
 *
 * Provides git log, diff stat, specs list, and changes list so agents do not
 * need to discover this information themselves each run.
 *
 * Design constraint: do NOT import from src/adapter/ — this is a core utility.
 * All git subprocess calls are routed through the git-exec.ts strip seam
 * (stripSecrets applied automatically; no direct node:child_process import).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { changesDirRel } from "../util/paths.js";
import { gitExec, defaultSpawnFn } from "../util/git-exec.js";

/**
 * Dynamic context collected at the start of each pipeline run.
 * All fields are optional-by-fallback: git failures return empty strings/arrays.
 */
export interface DynamicContext {
  /** Commits on current branch not yet in base branch (git log baseBranch..HEAD --oneline -n 20) */
  gitLog: string;
  /** Diff stat between base branch and HEAD (git diff baseBranch..HEAD --stat) */
  diffStat: string;
  /** Directories under specrunner/changes/ (excluding "archive") */
  changesList: string[];
  /**
   * Pre-read content of the verification result file (for build-fixer inline failure section).
   * Populated by BuildFixerStep.enrichContext(); absent for other steps.
   */
  verificationContent?: string;
}

/**
 * Run a git command and return trimmed stdout.
 * Returns null on any error (non-zero exit, no git binary, etc.).
 * Delegates to the git-exec seam so secrets are stripped from the child env.
 */
async function runGit(cwd: string, args: string[]): Promise<string | null> {
  return gitExec(defaultSpawnFn, cwd, args);
}

/**
 * Collect dynamic repository context for a pipeline run.
 *
 * @param cwd - Working directory (worktree path)
 * @param baseBranch - Base branch name for log/diff comparison (e.g. "main" or "master")
 * @returns DynamicContext with all fields populated; falls back to empty on failure.
 *
 * This function NEVER throws — all failures are swallowed and return empty values.
 */
export async function collectDynamicContext(
  cwd: string,
  baseBranch: string,
): Promise<DynamicContext> {
  // Collect all fields in parallel; individual failures fall back gracefully.
  const [gitLogRaw, diffStatRaw, changesList] = await Promise.all([
    runGit(cwd, ["log", `${baseBranch}..HEAD`, "--oneline", "-n", "20"]),
    runGit(cwd, ["diff", `${baseBranch}..HEAD`, "--stat"]),
    collectChangesList(cwd),
  ]);

  return {
    gitLog: gitLogRaw ?? "",
    diffStat: diffStatRaw ?? "",
    changesList,
  };
}

/**
 * Collect directories under specrunner/changes/ excluding "archive".
 * Returns empty array when directory does not exist or read fails.
 */
async function collectChangesList(cwd: string): Promise<string[]> {
  const changesDir = path.join(cwd, changesDirRel());
  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name !== "archive")
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

