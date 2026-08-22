/**
 * halt checkpoint restack module (D7, halt-checkpoint-restack).
 *
 * When `commitFinalState` push fails twice (retry included), this module provides
 * `restackCheckpointOntoPublishedTip()` which creates a new checkpoint commit
 * on top of the last successful remote tip (`origin/<branch>`) rather than the
 * local branch tip that includes unpublished work commits.
 *
 * Design references (halt-checkpoint-restack/design.md):
 * D1: restack is called only after push double-failure (success path unchanged)
 * D3: tree construction uses temp index (GIT_INDEX_FILE) — no worktree/HEAD changes
 * D4: containment check before push (fail-closed)
 * D5: checkpoint-restack journal record appended BEFORE tree build
 * D6: graft — local branch advanced to include restacked commit as ancestor (-s ours)
 * D7: callbacks (recordRestack, persistCommit) for store/ledger side effects
 * D8: remote tip resolved via best-effort fetch + rev-parse of remote-tracking ref
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SpawnFn as PipelineSpawnFn } from "../../util/spawn.js";
import { changeFolderPath, localSidecarDir, slugEventsPath } from "../../util/paths.js";
import { maskSensitive, stderrWrite } from "../../logger/stdout.js";
import type { CheckpointRestackRecord } from "../../store/event-journal.js";

// ---------------------------------------------------------------------------
// RestackOutcome — discriminated union returned by restackCheckpointOntoPublishedTip
// ---------------------------------------------------------------------------

/**
 * Discriminated union for the outcome of `restackCheckpointOntoPublishedTip`.
 *
 * - skipped:    Restack was not attempted or was abandoned before push.
 * - published:  Restack commit was successfully pushed to origin/<branch>.
 * - push-failed: Restack commit was created but both push attempts failed.
 */
export type RestackOutcome =
  | {
      kind: "skipped";
      /**
       * - no-branch:            branch param was empty string.
       * - no-remote-tip:        origin/<branch> could not be resolved (D8).
       * - no-local-tip:         local HEAD could not be resolved.
       * - no-delta:             write-tree OID matches parentOid^{tree} (nothing to publish).
       * - tree-build-failed:    one of the plumbing git calls failed during tree construction.
       * - containment-violation: diff --name-only found paths outside change folder (D4).
       */
      reason:
        | "no-branch"
        | "no-remote-tip"
        | "no-local-tip"
        | "no-delta"
        | "tree-build-failed"
        | "containment-violation"
        /**
         * remote-diverged: origin/<branch> is NOT an ancestor of localTipOid.
         * Another runner has already advanced origin/<branch> beyond the local history.
         * Restacking would overwrite the remote state — must not proceed (spec D8).
         */
        | "remote-diverged";
    }
  | {
      kind: "published";
      /** OID of the newly created and pushed restack commit. */
      restackedOid: string;
      /** OID of the parent commit (last successful origin/<branch> tip). */
      parentOid: string;
      /** Result of the graft operation (D6). */
      graft: "merged" | "skipped" | "failed";
      /** Number of local commits that were NOT published. */
      unpublishedCount: number;
    }
  | {
      kind: "push-failed";
      /** OID of the restack commit that failed to push. */
      restackedOid: string;
      /** OID of the parent commit. */
      parentOid: string;
      /** git stderr from the second (final) push attempt. */
      stderr: string;
    };

// ---------------------------------------------------------------------------
// Internal: parse git ls-tree -r output
// ---------------------------------------------------------------------------

interface LsTreeEntry {
  mode: string;
  oid: string;
  path: string;
}

/**
 * Parse `git ls-tree -r` output into an array of entries.
 * Format per line: `<mode> <type> <oid>\t<path>`
 */
function parseLsTree(output: string): LsTreeEntry[] {
  const entries: LsTreeEntry[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Format: "<mode> <type> <oid>\t<path>"
    const tabIdx = trimmed.indexOf("\t");
    if (tabIdx === -1) continue;
    const meta = trimmed.slice(0, tabIdx);
    const filePath = trimmed.slice(tabIdx + 1);
    const parts = meta.split(" ");
    if (parts.length < 3) continue;
    entries.push({ mode: parts[0]!, oid: parts[2]!, path: filePath });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// restackCheckpointOntoPublishedTip — main export
// ---------------------------------------------------------------------------

/**
 * Restack the halt checkpoint onto the last successful remote tip (D1, D3, D4, D5, D6, D8).
 *
 * Called by `commitFinalState` after its push fails twice. Resolves `origin/<branch>`
 * (best-effort fetch + rev-parse, D8), builds a new commit tree by overlaying the
 * local change folder onto the remote tip (D3), validates containment (D4), journals
 * the restack event (D5), pushes with one retry, and grafts the local branch to include
 * the restacked commit as an ancestor (D6).
 *
 * This function **never throws**. All errors are caught and warned to stderr.
 *
 * @param params.cwd               - Working directory for all git commands.
 * @param params.branch            - Target branch. Empty string → immediate `skipped: no-branch`.
 * @param params.slug              - Job slug (for paths and commit message).
 * @param params.spawnFn           - Pipeline spawn function (from `util/spawn.ts`).
 * @param params.messageLabel      - Commit message label (e.g. "checkpoint").
 * @param params.pushFailureStderr - stderr from the failed direct push; masked + truncated for journal.
 * @param params.recordRestack     - Optional callback to append `CheckpointRestackRecord` to journal.
 *                                   Called BEFORE tree construction (D5). Throw is caught + warned.
 * @param params.persistCommit     - Optional callback to persist a commit OID to synthesizedCommits.
 *                                   Called before each push (restack and graft). Throw is caught + warned.
 */
export async function restackCheckpointOntoPublishedTip(params: {
  cwd: string;
  branch: string;
  slug: string;
  spawnFn: PipelineSpawnFn;
  messageLabel: string;
  pushFailureStderr: string;
  recordRestack?: (record: CheckpointRestackRecord) => Promise<void>;
  persistCommit?: (oid: string) => Promise<void>;
}): Promise<RestackOutcome> {
  const { cwd, branch, slug, spawnFn, messageLabel, pushFailureStderr } = params;

  try {
    // ── Step 0: early exit for empty branch (D8) ────────────────────────────
    if (!branch) {
      return { kind: "skipped", reason: "no-branch" };
    }

    // ── Step 1: resolve remote tip via best-effort fetch + rev-parse (D8) ───
    // fetch failure is ignored — stale tracking ref is still usable
    await spawnFn("git", ["fetch", "origin", branch], { cwd });

    const revParseResult = await spawnFn(
      "git",
      ["rev-parse", `refs/remotes/origin/${branch}^{commit}`],
      { cwd },
    );
    const parentOid = revParseResult.stdout.trim();
    // Empty stdout or non-zero exit → origin/<branch> does not exist; skip restack (D8).
    // This early-exit also ensures existing failure-path unit tests remain green:
    // sequences that return { exitCode:0, stdout:"" } for excess calls hit this branch.
    if ((revParseResult.exitCode ?? 1) !== 0 || !parentOid) {
      return { kind: "skipped", reason: "no-remote-tip" };
    }

    // ── Step 2: local tip + unpublished commits ──────────────────────────────
    const localTipResult = await spawnFn("git", ["rev-parse", "HEAD"], { cwd });
    const localTipOid = localTipResult.stdout.trim();
    const localTipFailed = (localTipResult.exitCode ?? 1) !== 0 || !localTipOid;

    let unpublishedCommits: string[] = [];
    if (!localTipFailed) {
      try {
        const revListResult = await spawnFn(
          "git",
          ["rev-list", `${parentOid}..${localTipOid}`],
          { cwd },
        );
        if ((revListResult.exitCode ?? 1) === 0) {
          unpublishedCommits = revListResult.stdout
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      } catch {
        // ignore — empty array is fine
      }
    }

    // Early exit: no local tip means we cannot build a restack tree and there
    // is no valid localTipOid to include in the journal record (CheckpointRestackRecord
    // requires a non-empty 40-char SHA per spec). Skip both record and tree build.
    if (localTipFailed) {
      return { kind: "skipped", reason: "no-local-tip" };
    }

    // ── Step 2.5: divergence check (D8) ─────────────────────────────────────
    // Verify that origin/<branch> is an ancestor of local HEAD.
    // If another runner has already advanced origin/<branch> beyond our local
    // history (non-fast-forward), restacking would silently overwrite their state.
    // We must not restack in that case (MUST NOT per spec).
    {
      const mergeBaseResult = await spawnFn(
        "git",
        ["merge-base", "--is-ancestor", parentOid, localTipOid],
        { cwd },
      );
      if ((mergeBaseResult.exitCode ?? 1) !== 0) {
        // parentOid is NOT an ancestor of localTipOid → remote has diverged.
        stderrWrite(
          `Warning: checkpoint-restack: remote divergence detected for ${slug} — ` +
          `origin/${branch} is not an ancestor of local HEAD; skipping restack to avoid overwriting remote state`,
        );
        return { kind: "skipped", reason: "remote-diverged" };
      }
    }

    // ── Step 3: journal record BEFORE tree construction (D5) ────────────────
    // Appended after localTipOid is confirmed valid (non-empty).
    // The reason field is sanitized via maskSensitive (D5).
    const reason = maskSensitive(pushFailureStderr).slice(0, 500);
    const restackRecord: CheckpointRestackRecord = {
      type: "checkpoint-restack",
      ts: new Date().toISOString(),
      slug,
      branch,
      parentOid,
      localTipOid,
      unpublishedCommits,
      reason,
    };
    if (params.recordRestack) {
      try {
        await params.recordRestack(restackRecord);
      } catch (err) {
        stderrWrite(
          `Warning: checkpoint-restack: journal append failed for ${slug}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── Step 4: tree construction via temp index (D3) ────────────────────────
    // All git operations use GIT_INDEX_FILE to avoid touching the real index/worktree.
    const changeDir = changeFolderPath(slug); // e.g. "specrunner/changes/<slug>"
    const eventsRelPath = slugEventsPath(slug); // e.g. "specrunner/changes/<slug>/events.jsonl"

    const sidecarAbsDir = path.join(cwd, localSidecarDir(slug));
    const tempIndexPath = path.join(sidecarAbsDir, `restack-index-${Date.now()}`);

    try {
      await fs.mkdir(sidecarAbsDir, { recursive: true });
    } catch {
      // ignore — will fail on the first git call if the directory cannot be created
    }

    const idxEnv: Record<string, string | undefined> = { GIT_INDEX_FILE: tempIndexPath };

    let treeOid: string;
    try {
      // 4a: Initialize temp index from parentOid (remote tip)
      const readTreeResult = await spawnFn(
        "git",
        ["read-tree", parentOid],
        { cwd, env: idxEnv },
      );
      if ((readTreeResult.exitCode ?? 1) !== 0) {
        stderrWrite(`Warning: checkpoint-restack: git read-tree failed for ${slug}`);
        return { kind: "skipped", reason: "tree-build-failed" };
      }

      // 4b: List entries under change folder from both remote tip and local tip
      const parentLsResult = await spawnFn(
        "git",
        ["ls-tree", "-r", parentOid, "--", `${changeDir}/`],
        { cwd, env: idxEnv },
      );
      if ((parentLsResult.exitCode ?? 1) !== 0) {
        stderrWrite(`Warning: checkpoint-restack: git ls-tree (parent) failed for ${slug}`);
        return { kind: "skipped", reason: "tree-build-failed" };
      }

      const localLsResult = await spawnFn(
        "git",
        ["ls-tree", "-r", localTipOid, "--", `${changeDir}/`],
        { cwd, env: idxEnv },
      );
      if ((localLsResult.exitCode ?? 1) !== 0) {
        stderrWrite(`Warning: checkpoint-restack: git ls-tree (local) failed for ${slug}`);
        return { kind: "skipped", reason: "tree-build-failed" };
      }

      const parentEntries = parseLsTree(parentLsResult.stdout);
      const localEntries = parseLsTree(localLsResult.stdout);

      const localPathSet = new Set(localEntries.map((e) => e.path));

      // Remove paths present in remote tip but absent from local tip
      for (const entry of parentEntries) {
        if (!localPathSet.has(entry.path)) {
          const removeResult = await spawnFn(
            "git",
            ["update-index", "--force-remove", "--", entry.path],
            { cwd, env: idxEnv },
          );
          if ((removeResult.exitCode ?? 1) !== 0) {
            stderrWrite(
              `Warning: checkpoint-restack: git update-index --force-remove failed for ${slug}: ${entry.path}`,
            );
            return { kind: "skipped", reason: "tree-build-failed" };
          }
        }
      }

      // Add / update all local change folder entries
      for (const entry of localEntries) {
        const cacheinfo = `${entry.mode},${entry.oid},${entry.path}`;
        const addResult = await spawnFn(
          "git",
          ["update-index", "--add", "--cacheinfo", cacheinfo],
          { cwd, env: idxEnv },
        );
        if ((addResult.exitCode ?? 1) !== 0) {
          stderrWrite(
            `Warning: checkpoint-restack: git update-index --add --cacheinfo failed for ${slug}: ${entry.path}`,
          );
          return { kind: "skipped", reason: "tree-build-failed" };
        }
      }

      // 4c: Hash worktree events.jsonl (includes restack record from Step 3) and update index.
      // Always attempt hash-object; if events.jsonl is absent git returns non-zero which we
      // treat as "no events file to include" (silent skip — not a tree-build-failed).
      // Using git hash-object instead of fs.access avoids a filesystem dependency in tests.
      const hashResult = await spawnFn(
        "git",
        ["hash-object", "-w", "--", eventsRelPath],
        { cwd, env: idxEnv },
      );
      const blobOid = hashResult.stdout.trim();
      if ((hashResult.exitCode ?? 1) === 0 && blobOid) {
        const cacheinfo = `100644,${blobOid},${eventsRelPath}`;
        const updateEventsResult = await spawnFn(
          "git",
          ["update-index", "--add", "--cacheinfo", cacheinfo],
          { cwd, env: idxEnv },
        );
        if ((updateEventsResult.exitCode ?? 1) !== 0) {
          stderrWrite(
            `Warning: checkpoint-restack: git update-index for events.jsonl failed for ${slug}`,
          );
          return { kind: "skipped", reason: "tree-build-failed" };
        }
      }
      // If hash-object fails (events.jsonl absent from worktree), skip silently — the
      // temp index retains whatever events.jsonl was in the parent or local ls-tree entries.

      // 4d: write-tree
      const writeTreeResult = await spawnFn("git", ["write-tree"], { cwd, env: idxEnv });
      treeOid = writeTreeResult.stdout.trim();
      if ((writeTreeResult.exitCode ?? 1) !== 0 || !treeOid) {
        stderrWrite(`Warning: checkpoint-restack: git write-tree failed for ${slug}`);
        return { kind: "skipped", reason: "tree-build-failed" };
      }
    } finally {
      // Cleanup temp index (best-effort, regardless of success or failure)
      try {
        await fs.unlink(tempIndexPath);
      } catch {
        // ignore
      }
    }

    // ── Step 5: no-delta check (D3) ─────────────────────────────────────────
    const parentTreeResult = await spawnFn(
      "git",
      ["rev-parse", `${parentOid}^{tree}`],
      { cwd },
    );
    const parentTree = parentTreeResult.stdout.trim();
    if ((parentTreeResult.exitCode ?? 1) === 0 && parentTree && parentTree === treeOid) {
      return { kind: "skipped", reason: "no-delta" };
    }

    // ── Step 6: commit-tree ──────────────────────────────────────────────────
    const commitMsg = `${messageLabel}: ${slug} (restacked onto origin/${branch})`;
    const commitTreeResult = await spawnFn(
      "git",
      ["commit-tree", treeOid, "-p", parentOid, "-m", commitMsg],
      { cwd },
    );
    const restackedOid = commitTreeResult.stdout.trim();
    if ((commitTreeResult.exitCode ?? 1) !== 0 || !restackedOid) {
      stderrWrite(`Warning: checkpoint-restack: git commit-tree failed for ${slug}`);
      return { kind: "skipped", reason: "tree-build-failed" };
    }

    // ── Step 7: containment check (D4) ──────────────────────────────────────
    const diffResult = await spawnFn(
      "git",
      ["diff", "--name-only", parentOid, restackedOid],
      { cwd },
    );
    if ((diffResult.exitCode ?? 1) !== 0) {
      stderrWrite(
        `Warning: checkpoint-restack: containment check (git diff) failed for ${slug}; skipping push`,
      );
      return { kind: "skipped", reason: "containment-violation" };
    }
    const diffPaths = diffResult.stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const changeDirPrefix = `${changeDir}/`;
    for (const p of diffPaths) {
      if (!p.startsWith(changeDirPrefix)) {
        stderrWrite(
          `Warning: checkpoint-restack: containment violation — path outside change folder: ${p}; skipping push for ${slug}`,
        );
        return { kind: "skipped", reason: "containment-violation" };
      }
    }

    // ── Step 8: persistCommit before push ────────────────────────────────────
    if (params.persistCommit) {
      try {
        await params.persistCommit(restackedOid);
      } catch (err) {
        stderrWrite(
          `Warning: checkpoint-restack: persistCommit (restack OID) failed for ${slug}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── Step 9: push (max 2 attempts) ────────────────────────────────────────
    const pushRefspec = `${restackedOid}:refs/heads/${branch}`;
    const push1 = await spawnFn("git", ["push", "origin", pushRefspec], { cwd });
    if ((push1.exitCode ?? 1) !== 0) {
      const push2 = await spawnFn("git", ["push", "origin", pushRefspec], { cwd });
      if ((push2.exitCode ?? 1) !== 0) {
        const pushStderr = (push2.stderr ?? "").trim();
        stderrWrite(
          `Warning: checkpoint-restack: push failed for ${slug} to origin/${branch}.` +
          (pushStderr ? ` git stderr: ${pushStderr}` : ""),
        );
        return { kind: "push-failed", restackedOid, parentOid, stderr: pushStderr };
      }
    }

    // ── Step 10: update remote-tracking ref (best-effort) ────────────────────
    try {
      await spawnFn(
        "git",
        ["update-ref", `refs/remotes/origin/${branch}`, restackedOid],
        { cwd },
      );
    } catch {
      // best-effort — failure is non-fatal
    }

    // ── Step 11: graft local branch onto restacked commit (D6) ───────────────
    const graft = await _doGraft({
      cwd,
      branch,
      slug,
      spawnFn,
      restackedOid,
      localTipOid,
      persistCommit: params.persistCommit,
    });

    return {
      kind: "published",
      restackedOid,
      parentOid,
      graft,
      unpublishedCount: unpublishedCommits.length,
    };
  } catch (err) {
    // Outer catch-all: this function must NEVER throw
    stderrWrite(
      `Warning: checkpoint-restack: unexpected error for ${slug}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { kind: "skipped", reason: "tree-build-failed" };
  }
}

// ---------------------------------------------------------------------------
// _doGraft — local branch reconnection after restack (D6)
// ---------------------------------------------------------------------------

/**
 * Reconnect the local branch to include the restacked commit as an ancestor (D6).
 *
 * Creates a synthetic merge commit:
 *   tree    = HEAD^{tree}  (local content preserved — equivalent to `git merge -s ours`)
 *   parents = [localHead, restackedOid]
 *
 * Advances the branch ref via compare-and-swap (`update-ref <new> <expected-old>`).
 * The graft ensures subsequent pipeline steps can push (fast-forward from the graft commit).
 *
 * Never throws. Returns:
 * - "merged":  Branch successfully advanced.
 * - "skipped": HEAD is detached or points to a different branch.
 * - "failed":  commit-tree or update-ref failed.
 */
async function _doGraft(params: {
  cwd: string;
  branch: string;
  slug: string;
  spawnFn: PipelineSpawnFn;
  restackedOid: string;
  localTipOid: string;
  persistCommit?: (oid: string) => Promise<void>;
}): Promise<"merged" | "skipped" | "failed"> {
  const { cwd, branch, slug, spawnFn, restackedOid, localTipOid } = params;

  try {
    // Check that HEAD is the expected branch (not detached)
    const symrefResult = await spawnFn("git", ["symbolic-ref", "-q", "HEAD"], { cwd });
    if ((symrefResult.exitCode ?? 1) !== 0) {
      // Detached HEAD — skip graft
      return "skipped";
    }
    const headRef = symrefResult.stdout.trim();
    if (headRef !== `refs/heads/${branch}`) {
      // HEAD is on a different branch — skip
      return "skipped";
    }

    // Get HEAD^{tree} for the merge commit (preserves local content, D6 -s ours)
    const headTreeResult = await spawnFn("git", ["rev-parse", "HEAD^{tree}"], { cwd });
    const headTree = headTreeResult.stdout.trim();
    if ((headTreeResult.exitCode ?? 1) !== 0 || !headTree) {
      stderrWrite(
        `Warning: checkpoint-restack: graft: could not resolve HEAD^{tree} for ${slug}`,
      );
      return "failed";
    }

    // Create merge commit (tree = HEAD tree, parents = [localHead, restackedOid])
    const mergeMsg = `merge: publish restacked checkpoint for ${slug}`;
    const mergeCommitResult = await spawnFn(
      "git",
      ["commit-tree", headTree, "-p", localTipOid, "-p", restackedOid, "-m", mergeMsg],
      { cwd },
    );
    const mergeOid = mergeCommitResult.stdout.trim();
    if ((mergeCommitResult.exitCode ?? 1) !== 0 || !mergeOid) {
      stderrWrite(
        `Warning: checkpoint-restack: graft: git commit-tree failed for ${slug}`,
      );
      return "failed";
    }

    // Persist merge OID to synthesizedCommits ledger before advancing branch ref
    if (params.persistCommit) {
      try {
        await params.persistCommit(mergeOid);
      } catch (err) {
        stderrWrite(
          `Warning: checkpoint-restack: graft: persistCommit (merge OID) failed for ${slug}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Advance branch ref (compare-and-swap: only succeeds if HEAD is still localTipOid)
    const updateRefResult = await spawnFn(
      "git",
      ["update-ref", `refs/heads/${branch}`, mergeOid, localTipOid],
      { cwd },
    );
    if ((updateRefResult.exitCode ?? 1) !== 0) {
      stderrWrite(
        `Warning: checkpoint-restack: graft: git update-ref failed for ${slug}`,
      );
      return "failed";
    }

    return "merged";
  } catch (err) {
    stderrWrite(
      `Warning: checkpoint-restack: graft: unexpected error for ${slug}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return "failed";
  }
}
