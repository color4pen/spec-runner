/**
 * DynamicContext: collects per-run repository context for injection into agent prompts.
 *
 * Provides git log, diff stat, specs list, and changes list so agents do not
 * need to discover this information themselves each run.
 *
 * Design constraint: do NOT import from src/adapter/ — this is a core utility.
 * Uses node:child_process execFile directly (not git-exec.ts).
 */
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { specsDirRel, changesDirRel } from "../util/paths.js";

const execFileAsync = promisify(nodeExecFile);

/**
 * Dynamic context collected at the start of each pipeline run.
 * All fields are optional-by-fallback: git failures return empty strings/arrays.
 */
export interface DynamicContext {
  /** Commits on current branch not yet in base branch (git log baseBranch..HEAD --oneline -n 20) */
  gitLog: string;
  /** Diff stat between base branch and HEAD (git diff baseBranch..HEAD --stat) */
  diffStat: string;
  /** Subdirectory names under specrunner/specs/ (deprecated — baseline specs removed in R3) */
  specsList: string[];
  /** Directories under specrunner/changes/ (excluding "archive") */
  changesList: string[];
}

/**
 * Run a git command and return trimmed stdout.
 * Returns null on any error (non-zero exit, no git binary, etc.).
 */
async function runGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
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
  const [gitLogRaw, diffStatRaw, specsList, changesList] = await Promise.all([
    runGit(cwd, ["log", `${baseBranch}..HEAD`, "--oneline", "-n", "20"]),
    runGit(cwd, ["diff", `${baseBranch}..HEAD`, "--stat"]),
    collectSpecsList(cwd),
    collectChangesList(cwd),
  ]);

  return {
    gitLog: gitLogRaw ?? "",
    diffStat: diffStatRaw ?? "",
    specsList,
    changesList,
  };
}

/**
 * Collect subdirectory names under openspec/specs/.
 *
 * @deprecated baseline spec は消費者不在のため廃止。R3 で関数自体を削除予定。
 * Returns empty array always (openspec/specs/ baseline specs are no longer consumed).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function collectSpecsList(_cwd: string): Promise<string[]> {
  return [];
}

/**
 * Collect directories under openspec/changes/ excluding "archive".
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
