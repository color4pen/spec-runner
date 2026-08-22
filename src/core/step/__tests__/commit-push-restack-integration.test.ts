/**
 * Integration tests for halt-checkpoint-restack behaviour inside commitFinalState.
 *
 * TC-033 (must): egress verification failure → restack is NOT invoked
 * TC-026 (should): push double-failure warn appears before the restack result message
 */

import { describe, it, expect, vi } from "vitest";

import { commitFinalState } from "../commit-push.js";
import type { SpawnFn as PipelineSpawnFn } from "../../../util/spawn.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CWD = "/tmp/fake-repo-restack-integration-test";
const BRANCH = "fix/test-branch-restack-int";
const SLUG = "test-slug-restack";

// ---------------------------------------------------------------------------
// Helper: async PipelineSpawnFn from a sequence of responses
// ---------------------------------------------------------------------------

/**
 * Build an async PipelineSpawnFn from a fixed sequence of responses.
 * Each call consumes the next entry; excess calls return { exitCode: 0, stdout: "" }.
 * Tracks all arg vectors in `calls`.
 */
function makePipelineSpawnFnFromSequence(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: PipelineSpawnFn; calls: string[][] } {
  const calls: string[][] = [];
  let idx = 0;
  const fn: PipelineSpawnFn = async (_cmd, args, _opts) => {
    calls.push([...args]);
    const response = responses[idx++] ?? { exitCode: 0 };
    return {
      exitCode: response.exitCode,
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
    };
  };
  return { fn, calls };
}

// ---------------------------------------------------------------------------
// TC-033: egress 検査失敗経路では restack が呼ばれない
// ---------------------------------------------------------------------------

describe("TC-033: egress failure → restackCheckpointOntoPublishedTip is not invoked", () => {
  it(
    // TC-033
    "TC-033: when verifyEgressLedger throws (unknown commit), no push or restack git calls are issued",
    async () => {
      const CHECKPOINT_OID = "sha-checkpoint-033";
      const UNKNOWN_OID = "deadbeef-unknown-oid-033";

      // Setup: commit succeeds, but rev-list returns an OID that is NOT in the ledger.
      // ledger = [CHECKPOINT_OID] (synthesizedCommits=[] + rev-parse HEAD result)
      // UNKNOWN_OID ∉ ledger → verifyEgressLedger throws → commitFinalState returns early
      // (early return — before the push and before the restack call).
      const { fn: pipelineSpawnFn, calls } = makePipelineSpawnFnFromSequence([
        { exitCode: 0 },                                // 0: add state.json
        { exitCode: 0 },                                // 1: add events.jsonl
        { exitCode: 0 },                                // 2: add usage.json
        { exitCode: 0 },                                // 3: add bite-evidence-result.md
        { exitCode: 0 },                                // 4: add pr-create-result.md
        { exitCode: 1 },                                // 5: diff --cached --quiet → staged changes
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // 6: commit
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // 7: rev-parse HEAD (verifyEgressLedger)
        { exitCode: 0, stdout: `${UNKNOWN_OID}\n` },    // 8: rev-list → UNKNOWN_OID not in ledger → throws
        // egress fails → early return; NO push, NO restack calls follow
      ]);

      // commitFinalState must NOT throw (egress failure is caught internally and warned to stderr)
      await expect(
        commitFinalState({
          cwd: CWD,
          branch: BRANCH,
          slug: SLUG,
          spawnFn: pipelineSpawnFn,
          messageLabel: "checkpoint",
          synthesizedCommits: [], // empty ledger → only CHECKPOINT_OID (from rev-parse HEAD)
          // no persistBeforePush: keeps the sequence at exactly 9 calls
        }),
      ).resolves.toBeUndefined();

      // TC-033: restackCheckpointOntoPublishedTip always begins with "git fetch origin <branch>".
      // Absence of both "push" and "fetch" git subcommands confirms the function was not reached
      // (the egress failure causes an early return before the restack call).
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).not.toContain("push");
      expect(subcommands).not.toContain("fetch");

      // Exact call count: 5 add + 1 diff + 1 commit + 1 rev-parse + 1 rev-list = 9
      expect(calls).toHaveLength(9);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-026 (should): push 二重失敗後の既存 warn と restack 結果メッセージの出力順
// ---------------------------------------------------------------------------

describe("TC-026 (should): push double-failure warn appears before restack result message", () => {
  it(
    // TC-026
    "TC-026: 'Warning: failed to push' is written to stderr before the restack result message",
    async () => {
      const CHECKPOINT_OID = "sha-checkpoint-026";

      // Suppress and capture all stderr output in order.
      const stderrSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      try {
        // Setup: push double-failure triggers restack; restack resolves immediately
        // as no-remote-tip (excess calls beyond the defined sequence return
        // { exitCode: 0, stdout: "" }, so git rev-parse origin/<branch> returns
        // empty stdout → no-remote-tip skip → "Info: checkpoint-restack: skipped" message).
        const { fn: pipelineSpawnFn } = makePipelineSpawnFnFromSequence([
          { exitCode: 0 },                                // 0: add state.json
          { exitCode: 0 },                                // 1: add events.jsonl
          { exitCode: 0 },                                // 2: add usage.json
          { exitCode: 0 },                                // 3: add bite-evidence-result.md
          { exitCode: 0 },                                // 4: add pr-create-result.md
          { exitCode: 1 },                                // 5: diff --cached --quiet → staged changes
          { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // 6: commit
          { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // 7: rev-parse HEAD (verifyEgressLedger)
          { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // 8: rev-list → CHECKPOINT_OID in ledger → passes
          { exitCode: 1 },                                // 9: push1 → fails
          { exitCode: 1 },                                // 10: push2 → fails → restack called
          // excess: 11=fetch (exit 0, stdout ""), 12=rev-parse origin/<branch> (exit 0, stdout "")
          // → parentOid="" → no-remote-tip → restack returns {kind:"skipped",reason:"no-remote-tip"}
        ]);

        await commitFinalState({
          cwd: CWD,
          branch: BRANCH,
          slug: SLUG,
          spawnFn: pipelineSpawnFn,
          messageLabel: "checkpoint",
          synthesizedCommits: [], // empty → ledger = [CHECKPOINT_OID] → egress passes
        });

        // TC-026: Capture all stderr messages written during the run
        const messages = stderrSpy.mock.calls.map((c) => String(c[0]));

        // Find the "Warning: failed to push" message (existing warn — must be present)
        const warnIdx = messages.findIndex((m) =>
          m.includes("Warning: failed to push"),
        );
        expect(
          warnIdx,
          "Expected 'Warning: failed to push' to appear in stderr output",
        ).toBeGreaterThan(-1);

        // Verify the existing warn text is unchanged from the pre-restack implementation
        expect(messages[warnIdx]).toContain(
          `failed to push checkpoint commit for ${SLUG}`,
        );
        expect(messages[warnIdx]).toContain(`origin/${BRANCH}`);

        // Find the restack result message (must appear AFTER the existing warn)
        const restackIdx = messages.findIndex((m) =>
          m.includes("checkpoint-restack"),
        );
        expect(
          restackIdx,
          "Expected a 'checkpoint-restack' result message to appear in stderr output",
        ).toBeGreaterThan(-1);

        // TC-026: The existing warn MUST precede the restack result message
        expect(warnIdx).toBeLessThan(restackIdx);
      } finally {
        stderrSpy.mockRestore();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// TC-039: finalize label では restack が発動しない
// ---------------------------------------------------------------------------

describe("TC-039 (must): messageLabel 'finalize' → restack git operations are never issued", () => {
  it(
    // TC-039
    "TC-039: when messageLabel is 'finalize', no fetch/rev-parse-origin/merge-base/read-tree/commit-tree/update-ref are issued",
    async () => {
      const FINALIZE_OID = "sha-finalize-039";

      // Setup: commit succeeds, both push attempts fail.
      // Sequence ends after the second push failure — restack must NOT be triggered.
      // Note: no persistBeforePush callback → only 1 rev-parse for egress, not 2.
      const { fn: pipelineSpawnFn, calls } = makePipelineSpawnFnFromSequence([
        { exitCode: 0 },                                  // 0: add state.json
        { exitCode: 0 },                                  // 1: add events.jsonl
        { exitCode: 0 },                                  // 2: add usage.json
        { exitCode: 0 },                                  // 3: add bite-evidence-result.md
        { exitCode: 0 },                                  // 4: add pr-create-result.md
        { exitCode: 1 },                                  // 5: diff --cached --quiet → staged changes
        { exitCode: 0, stdout: `${FINALIZE_OID}\n` },     // 6: commit
        { exitCode: 0, stdout: `${FINALIZE_OID}\n` },     // 7: rev-parse HEAD (verifyEgressLedger)
        { exitCode: 0, stdout: `${FINALIZE_OID}\n` },     // 8: rev-list → FINALIZE_OID in synthesizedCommits → pass
        { exitCode: 1 },                                  // 9: push1 → fails
        { exitCode: 1 },                                  // 10: push2 → fails → existing warn emitted
        // NO further calls expected: restack is NOT triggered for finalize
      ]);

      const stderrSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      try {
        // TC-039: commitFinalState must NOT throw
        await expect(
          commitFinalState({
            cwd: CWD,
            branch: BRANCH,
            slug: SLUG,
            spawnFn: pipelineSpawnFn,
            messageLabel: "finalize",          // ← finalize label
            synthesizedCommits: [FINALIZE_OID], // ledger passes egress
          }),
        ).resolves.toBeUndefined();

        // TC-039: restack git operations must not have been issued
        // (the function returns after the existing warn without calling restackCheckpointOntoPublishedTip)
        const subcommands = calls.map((c) => c[0]);
        expect(subcommands).not.toContain("fetch");
        // rev-parse is used by egress check (allowed), but must not appear for restack's "origin/<branch>" parsing
        // We verify by checking that merge-base, read-tree, and commit-tree were not called:
        expect(subcommands).not.toContain("merge-base");
        expect(subcommands).not.toContain("read-tree");
        expect(subcommands).not.toContain("commit-tree");

        // TC-039: the existing warn message appears (finalize path is unchanged)
        const messages = stderrSpy.mock.calls.map((c) => String(c[0]));
        const warnIdx = messages.findIndex((m) => m.includes("Warning: failed to push"));
        expect(
          warnIdx,
          "Expected 'Warning: failed to push' to appear in stderr for finalize path",
        ).toBeGreaterThan(-1);
        // TC-039: finalize warn must reference "finalize" label
        expect(messages[warnIdx]).toContain("finalize commit for");

        // TC-039: no checkpoint-restack message (restack was not invoked)
        const hasRestackMsg = messages.some((m) => m.includes("checkpoint-restack"));
        expect(hasRestackMsg).toBe(false);
      } finally {
        stderrSpy.mockRestore();
      }
    },
  );
});
