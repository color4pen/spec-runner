/**
 * Lockfile synchronization verification gate.
 *
 * Detects the case where a package.json dependency-related section was changed
 * but no lockfile was updated — the pattern that causes CI frozen-lockfile failures
 * (issue #935).
 *
 * Design:
 * - Diff-shape check only: no frozen-lockfile install, no network, no node_modules writes.
 * - Dependency sections compared via canonical (key-sorted) JSON to avoid false positives
 *   from key reordering or non-dependency changes (scripts, version, etc.).
 * - Unavailable diff → skipped with explicit note (not silently passed).
 * - Lockfile-untracked repo → skipped (not failed).
 *
 * No external runtime dependencies beyond node:fs/promises, node:path,
 * node:child_process, and existing utilities.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { stripSecrets } from "../../util/env-filter.js";
import {
  findLockfile,
  isLockfileName,
  detectPackageManager,
} from "../../util/detect-pm.js";
import type { PackageManager } from "../../util/detect-pm.js";
import { getChangedFileList } from "./changed-lines.js";
import type { SpawnFn } from "./changed-lines.js";
import type { PhaseResult } from "./runner.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Phase name for the lockfile-sync gate. */
export const LOCKFILE_SYNC_PHASE = "lockfile-sync" as const;

/** Dependency-related sections in package.json that affect lockfile content. */
const DEP_SECTION_KEYS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "overrides",
  "resolutions",
  "packageManager",
] as const;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Recursively sort object keys and return the value.
 * Arrays and primitives are returned as-is.
 */
function sortedValue(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of keys) {
    sorted[key] = sortedValue(obj[key]);
  }
  return sorted;
}

/** Canonical JSON representation with sorted keys at all levels. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortedValue(value));
}

/**
 * Extract the dependency-related sections from a parsed package.json object.
 * Returns an object containing only the DEP_SECTION_KEYS entries.
 * Missing keys produce `undefined` values (omitted by JSON.stringify).
 */
function extractDepSections(pkg: unknown): Record<string, unknown> {
  if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) {
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const key of DEP_SECTION_KEYS) {
    result[key] = (pkg as Record<string, unknown>)[key];
  }
  return result;
}

/**
 * Return true if the dependency-related sections differ between base and HEAD versions
 * of a package.json.
 *
 * - `basePkg = null`: base branch has no such file (new file added). Base sections = empty.
 * - `headPkg` not a plain object: treat as "no change" (safe fallback for malformed JSON).
 * - Key reordering only: returns false (canonical JSON absorbs ordering).
 */
export function depSectionsDiffer(basePkg: unknown, headPkg: unknown): boolean {
  // If headPkg is not a plain object, treat as no-diff (safe fallback — malformed JSON).
  if (headPkg === null || typeof headPkg !== "object" || Array.isArray(headPkg)) {
    return false;
  }

  const baseSection = extractDepSections(basePkg);
  const headSection = extractDepSections(headPkg);

  return canonicalJson(baseSection) !== canonicalJson(headSection);
}

// ---------------------------------------------------------------------------
// Pure evaluator
// ---------------------------------------------------------------------------

/** Input to the pure lockfile-sync evaluator. */
export interface EvaluateLockfileSyncInput {
  /**
   * List of package.json paths (repo-root-relative) whose dependency-related
   * sections differ between base and HEAD.
   */
  depChangedPackageJsons: string[];
  /** True if at least one lockfile (per LOCKFILE_MAP) appears in the change set. */
  lockfileInChangeSet: boolean;
  /** True if the repo tracks a lockfile (findLockfile found one, or lockfile is in changeset). */
  lockfileTracked: boolean;
  /** Detected package manager (used for install command in failure message). */
  pm: PackageManager;
}

/** Output of the pure lockfile-sync evaluator. */
export interface EvaluateLockfileSyncResult {
  status: "passed" | "failed" | "skipped";
  stdout: string;
}

/**
 * Pure decision function for the lockfile-sync gate.
 *
 * Decision table:
 * - depChangedPackageJsons empty → skipped (no dependency change detected).
 * - deps changed + lockfileInChangeSet → passed (lockfile was updated).
 * - deps changed + no lockfile in set + lockfileTracked=false → skipped (repo does not track lockfiles).
 * - deps changed + no lockfile in set + lockfileTracked=true → failed (sync missing).
 */
export function evaluateLockfileSync(
  input: EvaluateLockfileSyncInput,
): EvaluateLockfileSyncResult {
  const { depChangedPackageJsons, lockfileInChangeSet, lockfileTracked, pm } = input;

  // No dependency changes detected → skip
  if (depChangedPackageJsons.length === 0) {
    return {
      status: "skipped",
      stdout: "lockfile-sync: 依存関連セクションの変更なし — スキップ",
    };
  }

  // Lockfile present in changeset → sync already done
  if (lockfileInChangeSet) {
    return {
      status: "passed",
      stdout: "lockfile-sync: lockfile が変更集合に含まれています — OK",
    };
  }

  // Repo does not track lockfiles → skip
  if (!lockfileTracked) {
    return {
      status: "skipped",
      stdout:
        "lockfile-sync: このリポジトリは lockfile を追跡していないためスキップ（検査対象外）",
    };
  }

  // Deps changed, lockfile tracked, but lockfile not updated → fail
  const installCmd = pm === "npm" ? "npm install" : `${pm} install`;
  const pkgList = depChangedPackageJsons.map((p) => `  - ${p}`).join("\n");

  const stdout = [
    "lockfile-sync: 依存関連セクションが変更されましたが、lockfile が更新されていません。",
    "",
    `以下の package.json で依存変更が検出されました:\n${pkgList}`,
    "",
    `lockfile を同期するには \`${installCmd}\` を実行し、更新された lockfile を commit してください。`,
    `（例: ${installCmd} && git add <lockfile> && git commit --amend --no-edit）`,
  ].join("\n");

  return { status: "failed", stdout };
}

// ---------------------------------------------------------------------------
// Gate orchestrator
// ---------------------------------------------------------------------------

/**
 * Run `git show <ref>:<filepath>` and return the content, or null if unavailable.
 * Never throws; resolves null on any error (file not in base, non-0 exit, spawn error).
 *
 * Uses the injected spawnFn (never imports node:child_process directly — B-12 invariant).
 */
async function gitShowFile(
  filepath: string,
  ref: string,
  cwd: string,
  spawnFn: SpawnFn,
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const child = spawnFn("git", ["show", `${ref}:${filepath}`], {
        cwd,
        shell: false,
        env: stripSecrets(process.env as Record<string, string | undefined>),
      });
      const chunks: Buffer[] = [];
      child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.on("close", (code) => {
        if (code !== 0) {
          resolve(null);
        } else {
          resolve(Buffer.concat(chunks).toString("utf-8"));
        }
      });
      child.on("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Run the lockfile-sync gate.
 *
 * Steps:
 * 1. Obtain changed file list via `getChangedFileList`. On throw → skipped with note.
 * 2. Filter package.json files (basename === "package.json") and detect lockfile in set.
 * 3. If no package.json files → skipped.
 * 4. For each package.json: get base via `git show <baseBranch>:<path>`, HEAD from disk,
 *    run `depSectionsDiffer`. Collect `depChangedPackageJsons`.
 * 5. Determine lockfileTracked and pm.
 * 6. Call `evaluateLockfileSync` → map to PhaseResult.
 *
 * `spawn` is required: the caller (runner.ts, which is in the B-12 allowlist) provides it,
 * and tests always inject a mock spawn. lockfile-sync.ts itself does not import
 * node:child_process — the B-12 invariant must not be violated here.
 */
export async function runLockfileSyncGate(options: {
  slug: string;
  cwd: string;
  baseBranch: string;
  spawn: SpawnFn;
  fsLike?: { existsSync(path: string): boolean };
}): Promise<PhaseResult> {
  const { cwd, baseBranch, spawn, fsLike } = options;
  const start = Date.now();

  // 1. Get changed file list
  let changedFiles: string[];
  try {
    changedFiles = await getChangedFileList({ cwd, baseBranch, spawn });
  } catch {
    return {
      phase: LOCKFILE_SYNC_PHASE,
      status: "skipped",
      stdout:
        "lockfile-sync: diff unavailable — lockfile 同期を検証できませんでした（fail はさせません）",
      stderr: "",
      exitCode: null,
      durationMs: Date.now() - start,
    };
  }

  // 2. Separate package.json files and detect lockfile in changeset
  const pkgJsonFiles = changedFiles.filter((f) => path.basename(f) === "package.json");
  const lockfileInChangeSet = changedFiles.some((f) => isLockfileName(path.basename(f)));

  // 3. No package.json changes → skip
  if (pkgJsonFiles.length === 0) {
    return {
      phase: LOCKFILE_SYNC_PHASE,
      status: "skipped",
      stdout: "lockfile-sync: package.json の変更なし — スキップ",
      stderr: "",
      exitCode: null,
      durationMs: Date.now() - start,
    };
  }

  // 4. For each package.json, compare dep sections between base and HEAD
  const depChangedPackageJsons: string[] = [];

  for (const pkgFile of pkgJsonFiles) {
    // Get base version from git
    const baseRaw = await gitShowFile(pkgFile, baseBranch, cwd, spawn);
    let basePkg: unknown = null;
    if (baseRaw !== null) {
      try {
        basePkg = JSON.parse(baseRaw);
      } catch {
        // Malformed base JSON → treat as null (no base)
        basePkg = null;
      }
    }

    // Get HEAD version from disk
    let headPkg: unknown;
    try {
      const headRaw = await fs.readFile(path.join(cwd, pkgFile), "utf-8");
      headPkg = JSON.parse(headRaw);
    } catch {
      // HEAD not readable or unparseable → treat as "no dep change" for this file
      continue;
    }

    if (depSectionsDiffer(basePkg, headPkg)) {
      depChangedPackageJsons.push(pkgFile);
    }
  }

  // 5. Determine lockfileTracked and pm
  const lockfileInfo = findLockfile(cwd, fsLike);
  const lockfileTracked = lockfileInfo !== null || lockfileInChangeSet;

  let pm: PackageManager;
  if (lockfileInfo !== null) {
    pm = lockfileInfo.pm;
  } else {
    const detected = await detectPackageManager(cwd);
    pm = detected.pm;
  }

  // 6. Evaluate and map to PhaseResult
  const evaluation = evaluateLockfileSync({
    depChangedPackageJsons,
    lockfileInChangeSet,
    lockfileTracked,
    pm,
  });

  const exitCode =
    evaluation.status === "passed" ? 0 : evaluation.status === "failed" ? 1 : null;

  return {
    phase: LOCKFILE_SYNC_PHASE,
    status: evaluation.status,
    stdout: evaluation.stdout,
    stderr: "",
    exitCode,
    durationMs: Date.now() - start,
  };
}
