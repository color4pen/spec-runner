/**
 * Structural CI-presence detection for `job archive --with-merge`.
 *
 * Determines whether a git tree-ish contains GitHub Actions workflow definitions
 * that trigger on `push` or `pull_request` events. Detection is performed using
 * local git commands only — no GitHub API calls, no added package dependencies.
 *
 * Fail-closed: any git inspection failure returns `present: true` so that the
 * caller waits rather than merging unverified.
 */
import type { SpawnFn } from "../../util/spawn.js";

export type CiDetectionReason = "trigger-match" | "no-workflows" | "no-trigger" | "inspection-failed";

export interface CiPresenceResult {
  present: boolean;
  reason: CiDetectionReason;
}

/**
 * Text-level CI trigger pattern.
 *
 * Matches `push` or `pull_request` (as a prefix — covers pull_request_target,
 * pull_request_review, etc.) as YAML event names. Biased to over-detect:
 * false positives resolve to the waiting (fail-closed) side.
 *
 * Pattern: `/(?:^|[\s,[{'"])push(?:[\s,:\]}'"]|$)|(?:^|[\s,[{'"])pull_request/m`
 */
const CI_TRIGGER_RE =
  /(?:^|[\s,[{'"])push(?:[\s,:\]}'"]|$)|(?:^|[\s,[{'"])pull_request/m;

/**
 * Detect whether the git tree identified by `ref` contains a workflow definition
 * under `.github/workflows/` with a `push` or `pull_request` trigger.
 *
 * Algorithm:
 * 1. `git ls-tree <ref> -- .github/workflows/` (non-recursive) to enumerate blobs.
 *    - exit ≠ 0 → `{ present: true, reason: "inspection-failed" }` (fail-closed).
 *    - exit 0, no `.yml`/`.yaml` blobs → `{ present: false, reason: "no-workflows" }`.
 * 2. For each `.yml`/`.yaml` blob, `git cat-file -p <sha>` to read body.
 *    - exit ≠ 0 → `{ present: true, reason: "inspection-failed" }` (fail-closed).
 *    - body matches CI_TRIGGER_RE → `{ present: true, reason: "trigger-match" }`.
 * 3. No blob matched → `{ present: false, reason: "no-trigger" }`.
 *
 * Uses only the injected `spawn`; never calls the GitHub API.
 */
export async function detectWorkflowCiPresence(opts: {
  spawn: SpawnFn;
  cwd: string;
  ref: string;
}): Promise<CiPresenceResult> {
  const { spawn, cwd, ref } = opts;

  // Step 1: List immediate entries under .github/workflows/ (non-recursive)
  const lsTree = await spawn("git", ["ls-tree", ref, "--", ".github/workflows/"], { cwd });

  if (lsTree.exitCode !== 0) {
    return { present: true, reason: "inspection-failed" };
  }

  // Parse output: each line is "<mode> <type> <sha>\t<path>"
  const blobs: { sha: string }[] = [];
  for (const line of lsTree.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const tabIdx = trimmed.indexOf("\t");
    if (tabIdx === -1) continue;

    const metaPart = trimmed.slice(0, tabIdx);
    const filePath = trimmed.slice(tabIdx + 1);

    // "<mode> <type> <sha>" — split on space
    const parts = metaPart.split(" ");
    if (parts.length < 3) continue;

    const type = parts[1];
    const sha = parts[2]!;

    // Skip tree entries (subdirectories) — only process blobs
    if (type !== "blob") continue;

    // Only process GitHub-recognised workflow file extensions
    if (!filePath.endsWith(".yml") && !filePath.endsWith(".yaml")) continue;

    blobs.push({ sha });
  }

  if (blobs.length === 0) {
    return { present: false, reason: "no-workflows" };
  }

  // Step 2: Read each blob and check for a push/pull_request trigger token
  for (const { sha } of blobs) {
    const catFile = await spawn("git", ["cat-file", "-p", sha], { cwd });

    if (catFile.exitCode !== 0) {
      return { present: true, reason: "inspection-failed" };
    }

    if (CI_TRIGGER_RE.test(catFile.stdout)) {
      return { present: true, reason: "trigger-match" };
    }
  }

  // Workflow files exist but none contains a push/pull_request trigger
  return { present: false, reason: "no-trigger" };
}
