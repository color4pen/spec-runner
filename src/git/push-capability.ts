/**
 * push-capability: shared-kernel module for detecting and matching push constraints.
 *
 * Shared-kernel layer (src/git/): may only import from node:* and src/util/*.
 *
 * Design:
 *   - detectPushCapability: pure environment → capability declaration (no I/O)
 *   - collectPublishablePaths: git I/O to enumerate what a push would publish
 *   - matchUnpushablePaths: pure pattern matcher against capability patterns
 *   - renderPushCapabilityNotice: pure notice renderer for agent messages
 */

import type { SpawnFn } from "../util/spawn.js";
import { matchesGlob } from "../util/glob-match.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The glob pattern for GitHub Actions workflow files. */
export const WORKFLOWS_PATTERN = ".github/workflows/**";

/** Prefix identifying GitHub App installation tokens. */
export const INSTALLATION_TOKEN_PREFIX = "ghs_";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A push capability declaration produced by detectPushCapability.
 *
 * patterns: the list of path glob patterns that cannot be pushed in this environment.
 * source:   human-readable description of the environment constraint.
 */
export interface PushCapability {
  patterns: string[];
  source: string;
}

// ---------------------------------------------------------------------------
// T-01: Capability detection
// ---------------------------------------------------------------------------

/**
 * Derive the push capability declaration from the runtime environment.
 *
 * Returns a PushCapability with the workflows pattern when ALL of the following hold:
 *   - env.GITHUB_ACTIONS === "true"
 *   - env.GH_TOKEN is unset or empty
 *   - resolvedToken starts with the installation token prefix "ghs_"
 *
 * Returns { patterns: [], source: "none" } (undeclared) in every other case.
 *
 * Pure function — no I/O.
 */
export function detectPushCapability(
  env: Record<string, string | undefined>,
  resolvedToken: string | undefined,
): PushCapability {
  // Condition 1: must be running in GitHub Actions
  if (env["GITHUB_ACTIONS"] !== "true") return { patterns: [], source: "none" };

  // Condition 2: GH_TOKEN must be unset or empty
  const ghToken = env["GH_TOKEN"] ?? "";
  if (ghToken.length > 0) return { patterns: [], source: "none" };

  // Condition 3: resolved token must begin with the installation token prefix
  if (!resolvedToken || !resolvedToken.startsWith(INSTALLATION_TOKEN_PREFIX)) return { patterns: [], source: "none" };

  return {
    patterns: [WORKFLOWS_PATTERN],
    source: "GitHub Actions installation token (ghs_) cannot push to .github/workflows/**",
  };
}

// ---------------------------------------------------------------------------
// T-01: Pattern matching
// ---------------------------------------------------------------------------

/**
 * Return the subset of paths that match any of the declared patterns from the capability.
 *
 * Pure function — no I/O.
 */
export function matchUnpushablePaths(
  paths: string[],
  capability: PushCapability | undefined,
): string[] {
  const patterns = capability?.patterns ?? [];
  if (patterns.length === 0 || paths.length === 0) return [];
  return paths.filter((p) =>
    patterns.some((pattern) => matchesGlob(p, pattern)),
  );
}

// ---------------------------------------------------------------------------
// T-02: Publishable path enumeration
// ---------------------------------------------------------------------------

/**
 * Compute the set of paths that an upcoming push would publish.
 *
 * The publishable set is the union of:
 *   (a) worktree change paths including untracked files (git status)
 *   (b) paths touched by every commit reachable from HEAD that is not yet
 *       present on any origin remote-tracking ref (git rev-list + diff-tree)
 *
 * A path contributed by any single unpushed commit is included even when a
 * later commit reverts it.
 *
 * Returns [] on any git command failure (fail-open: callers treat as no violation).
 * Never throws.
 */
export async function collectPublishablePaths(
  spawnFn: SpawnFn,
  cwd: string,
): Promise<string[]> {
  const paths = new Set<string>();

  try {
    // (a) Worktree changes: modified + untracked files
    const statusResult = await spawnFn(
      "git",
      ["status", "--porcelain", "-z", "--no-renames", "--untracked-files=all"],
      { cwd },
    );
    if (statusResult.exitCode === 0) {
      const parts = statusResult.stdout.split("\0").filter((p) => p.length > 0);
      for (const part of parts) {
        // Format: XY<SP>path — 2-char status + space + path
        if (part.length < 4) continue;
        const filePath = part.slice(3);
        if (filePath) paths.add(filePath);
      }
    }
  } catch {
    // Best-effort; fall through
  }

  try {
    // (b) Unpushed commits: all commits reachable from HEAD not on any origin ref
    const revListResult = await spawnFn(
      "git",
      ["rev-list", "HEAD", "--not", "--remotes=origin"],
      { cwd },
    );
    if (revListResult.exitCode === 0) {
      const oids = revListResult.stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      for (const oid of oids) {
        try {
          // Enumerate paths touched by each unpushed commit
          const diffResult = await spawnFn(
            "git",
            ["diff-tree", "--no-commit-id", "-r", "--name-only", oid],
            { cwd },
          );
          if (diffResult.exitCode === 0) {
            const filePaths = diffResult.stdout
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            for (const fp of filePaths) {
              paths.add(fp);
            }
          }
        } catch {
          // Skip failed oid
        }
      }
    }
  } catch {
    // Best-effort; fall through
  }

  return Array.from(paths).sort();
}

// ---------------------------------------------------------------------------
// T-04: Capability notice renderer
// ---------------------------------------------------------------------------

/**
 * Render a push capability notice for injection into agent messages.
 *
 * Returns empty string when pushCapability is null/undefined or has no patterns.
 * Includes advance warning for predictedTouchedFiles that match declared patterns.
 *
 * Pure function — no I/O.
 */
export function renderPushCapabilityNotice(
  pushCapability: PushCapability | null | undefined,
  predictedTouchedFiles?: string[],
): string {
  if (!pushCapability || pushCapability.patterns.length === 0) return "";

  const lines: string[] = [
    "",
    "## Push Capability Notice",
    "",
    `The current environment cannot push changes to the following paths:`,
    "",
  ];

  for (const pattern of pushCapability.patterns) {
    lines.push(`- \`${pattern}\``);
  }

  lines.push("");
  lines.push(`Reason: ${pushCapability.source}`);

  // Advance warning for predicted matches
  if (predictedTouchedFiles && predictedTouchedFiles.length > 0) {
    const matchedFiles = matchUnpushablePaths(predictedTouchedFiles, pushCapability);
    if (matchedFiles.length > 0) {
      lines.push("");
      lines.push("**Advance warning**: the following predicted files match the unpushable pattern:");
      lines.push("");
      for (const f of matchedFiles) {
        lines.push(`- \`${f}\``);
      }
      lines.push("");
      lines.push(
        "If your implementation modifies these paths, the push will be blocked. " +
        "Consider an alternative approach that does not modify these paths.",
      );
    }
  }

  lines.push("");

  return lines.join("\n");
}
