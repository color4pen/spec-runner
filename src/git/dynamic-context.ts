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
import { changesDirRel, specsDirRel } from "../util/paths.js";

const execFileAsync = promisify(nodeExecFile);

/**
 * A single entry in the baseline spec index.
 */
export interface SpecIndexEntry {
  /** The capability name (subdirectory name under specrunner/specs/) */
  capability: string;
  /** First non-empty line of the ## Purpose section */
  purpose: string;
  /** Number of ### Requirement: occurrences in the spec file */
  requirementCount: number;
}

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
  /** Index of baseline specs under specrunner/specs/ */
  specIndex: SpecIndexEntry[];
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
  const [gitLogRaw, diffStatRaw, changesList, specIndex] = await Promise.all([
    runGit(cwd, ["log", `${baseBranch}..HEAD`, "--oneline", "-n", "20"]),
    runGit(cwd, ["diff", `${baseBranch}..HEAD`, "--stat"]),
    collectChangesList(cwd),
    collectSpecIndex(cwd),
  ]);

  return {
    gitLog: gitLogRaw ?? "",
    diffStat: diffStatRaw ?? "",
    changesList,
    specIndex,
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

/**
 * Collect a lightweight index of baseline specs under specrunner/specs/.
 * Returns empty array when directory does not exist or read fails.
 * Individual spec.md read failures are skipped (that entry is excluded).
 */
async function collectSpecIndex(cwd: string): Promise<SpecIndexEntry[]> {
  const specsDir = path.join(cwd, specsDirRel());
  let capabilityNames: string[];
  try {
    const entries = await fs.readdir(specsDir, { withFileTypes: true });
    capabilityNames = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  const results = await Promise.all(
    capabilityNames.map(async (name): Promise<SpecIndexEntry | null> => {
      const specFile = path.join(specsDir, name, "spec.md");
      let content: string;
      try {
        content = await fs.readFile(specFile, "utf-8");
      } catch {
        return null;
      }

      const purpose = extractPurpose(content);
      const requirementCount = countRequirements(content);

      return { capability: name, purpose, requirementCount };
    }),
  );

  return results
    .filter((e): e is SpecIndexEntry => e !== null)
    .sort((a, b) => a.capability.localeCompare(b.capability));
}

/**
 * Extract the first non-empty line of the ## Purpose section.
 * Returns empty string when ## Purpose is not found or has no content.
 */
function extractPurpose(content: string): string {
  const lines = content.split("\n");
  let inPurpose = false;
  for (const line of lines) {
    if (line.startsWith("## Purpose")) {
      inPurpose = true;
      continue;
    }
    if (inPurpose) {
      // Stop at next ## header
      if (line.startsWith("## ")) {
        return "";
      }
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return "";
}

/**
 * Count the number of ### Requirement: occurrences in the spec content.
 */
function countRequirements(content: string): number {
  const matches = content.match(/^### Requirement:/gm);
  return matches ? matches.length : 0;
}
