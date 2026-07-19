/**
 * Group 9: Attach authenticity 検証
 *
 * TC-035: checkpoint の journal digest が anchor と一致しない場合は attach 不可（spec シナリオ）
 * TC-036: authentic checkpoint が自己整合性＋authorship 両立で attach できる（spec シナリオ）
 * TC-037: attach 時 anchor が absent のとき自己整合性のみで判定する（backward-compat）
 * TC-038: attach 時 anchor fetch が unavailable のとき fail-closed reject する
 *
 * Source: spec.md > Requirement: attach shall verify checkpoint authenticity in addition to self-consistency
 *         tasks.md > T-08 / design.md > D6
 */

import { describe, it, expect, vi } from "vitest";
import { verifyCheckpoint } from "../verify-checkpoint.js";
import { computeJournalDigest } from "../../../store/journal-anchor.js";
import { runAttachVerification } from "../orchestrator.js";
import type { SpawnFn } from "../../../util/spawn.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OWNER = "octo";
const REPO = "myrepo";
const BRANCH = "change/my-feature-abc12345";
const SLUG = "my-feature";
const CWD = "/tmp/fake-repo";

function makeSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: SpawnFn; calls: Array<[string, string[]]> } {
  const calls: Array<[string, string[]]> = [];
  let idx = 0;
  const fn = vi.fn(async (cmd: string, args: string[]) => {
    calls.push([cmd, args]);
    const r = responses[idx++] ?? { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: r.exitCode, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  }) as unknown as SpawnFn;
  return { fn, calls };
}

/** Minimal self-consistent awaiting-resume state.json for verifyCheckpoint */
function makeStateJson(overrides: Record<string, unknown> = {}): string {
  const state = {
    version: 2,
    jobId: "test-job-001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "Test feature",
      type: "bug-fix",
      slug: SLUG,
    },
    repository: { owner: OWNER, name: REPO },
    session: null,
    step: "pr-create",
    status: "awaiting-resume",
    branch: BRANCH,
    history: [],
    error: null,
    steps: {},
    _journal: { historyCount: 0, stepCounts: {} },
    resumePoint: { step: "pr-create", reason: "test", iterationsExhausted: 0 },
    ...overrides,
  };
  return JSON.stringify(state, null, 2) + "\n";
}

const EVENTS_JSONL = "";
const CHECKPOINT_OID = "checkpoint-commit-sha-001";

// ---------------------------------------------------------------------------
// TC-037: anchor absent → self-consistency only (backward-compat)
// ---------------------------------------------------------------------------

describe("TC-037: attach 時 anchor が absent のとき自己整合性のみで判定する（backward-compat）", () => {
  it("TC-037: anchorDigest=undefined → authenticity predicate skipped, self-consistency decides", async () => {
    const stateJson = makeStateJson();
    const treeFiles = [
      `specrunner/changes/${SLUG}/request.md`,
      `specrunner/changes/${SLUG}/state.json`,
      `specrunner/changes/${SLUG}/events.jsonl`,
    ];

    // No anchorDigest passed → backward-compat: self-consistency only
    const result = await verifyCheckpoint({
      slug: SLUG,
      stateJson,
      eventsJsonl: EVENTS_JSONL,
      treeFiles,
      branch: BRANCH,
      expectedRepo: { owner: OWNER, name: REPO },
      checkpointOid: CHECKPOINT_OID,
      // anchorDigest intentionally omitted
    });

    // Should succeed (self-consistent, no authenticity required)
    expect(result.slug).toBe(SLUG);
    expect(result.branch).toBe(BRANCH);
  });
});

// ---------------------------------------------------------------------------
// TC-035: checkpoint journal digest != anchor → not attachable (spec scenario)
// ---------------------------------------------------------------------------

describe("TC-035: checkpoint の journal digest が anchor と一致しない場合は attach 不可（spec シナリオ）", () => {
  it("TC-035: anchorDigest present and mismatches checkpoint tree journal → checkpointNotAttachableError", async () => {
    const eventsJsonl = '{"type":"history","step":"implementer-started"}\n';
    const stateJson   = makeStateJson();

    const checkpointDigest = computeJournalDigest(eventsJsonl, stateJson);
    // Provide a DIFFERENT digest as the anchor (simulating tampering)
    const differentDigest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    expect(checkpointDigest).not.toBe(differentDigest);

    const treeFiles = [
      `specrunner/changes/${SLUG}/request.md`,
      `specrunner/changes/${SLUG}/state.json`,
      `specrunner/changes/${SLUG}/events.jsonl`,
    ];

    await expect(
      verifyCheckpoint({
        slug: SLUG,
        stateJson,
        eventsJsonl,
        treeFiles,
        branch: BRANCH,
        expectedRepo: { owner: OWNER, name: REPO },
        checkpointOid: CHECKPOINT_OID,
        anchorDigest: differentDigest,
      }),
    ).rejects.toMatchObject({ code: "CHECKPOINT_NOT_ATTACHABLE" });
  });

  it("TC-035: error indicates journal-authenticity as the reason", async () => {
    const eventsJsonl = '{"type":"history"}\n';
    const stateJson   = makeStateJson();
    const wrongDigest = "sha256:wrongdigest";

    const treeFiles = [
      `specrunner/changes/${SLUG}/request.md`,
      `specrunner/changes/${SLUG}/state.json`,
      `specrunner/changes/${SLUG}/events.jsonl`,
    ];

    let thrown: Error | null = null;
    try {
      await verifyCheckpoint({
        slug: SLUG,
        stateJson,
        eventsJsonl,
        treeFiles,
        branch: BRANCH,
        expectedRepo: { owner: OWNER, name: REPO },
        checkpointOid: CHECKPOINT_OID,
        anchorDigest: wrongDigest,
      });
    } catch (err) {
      thrown = err as Error;
    }

    expect(thrown).not.toBeNull();
    expect((thrown as { code?: string }).code).toBe("CHECKPOINT_NOT_ATTACHABLE");
    // The error detail should mention journal-authenticity
    expect(thrown!.message).toContain("journal-authenticity");
  });
});

// ---------------------------------------------------------------------------
// TC-036: authentic checkpoint attaches (self-consistency + authenticity) (spec)
// ---------------------------------------------------------------------------

describe("TC-036: authentic checkpoint が自己整合性＋authorship 両立で attach できる（spec シナリオ）", () => {
  it("TC-036: anchorDigest matches checkpoint tree journal → attach proceeds", async () => {
    const eventsJsonl = '{"type":"history","step":"implementer-started"}\n';
    const stateJson   = makeStateJson();

    // Compute the correct digest of the checkpoint tree's journal
    const correctDigest = computeJournalDigest(eventsJsonl, stateJson);

    const treeFiles = [
      `specrunner/changes/${SLUG}/request.md`,
      `specrunner/changes/${SLUG}/state.json`,
      `specrunner/changes/${SLUG}/events.jsonl`,
    ];

    const result = await verifyCheckpoint({
      slug: SLUG,
      stateJson,
      eventsJsonl,
      treeFiles,
      branch: BRANCH,
      expectedRepo: { owner: OWNER, name: REPO },
      checkpointOid: CHECKPOINT_OID,
      anchorDigest: correctDigest, // matches → authenticity passes
    });

    expect(result.slug).toBe(SLUG);
    expect(result.branch).toBe(BRANCH);
    expect(result.checkpointOid).toBe(CHECKPOINT_OID);
  });
});

// ---------------------------------------------------------------------------
// TC-038: anchor fetch unavailable → fail-closed reject
// ---------------------------------------------------------------------------

describe("TC-038: attach 時 anchor fetch が unavailable のとき fail-closed reject する", () => {
  it("TC-038: readEvidenceAnchor unavailable → runAttachVerification rejects", async () => {
    // This test verifies that when the evidence anchor cannot be fetched (network error),
    // runAttachVerification rejects fail-closed rather than proceeding with self-consistency only.

    const checkpointCommitSha = "checkpoint-sha-001";
    const stateJson = makeStateJson();
    const eventsJsonl = "";

    // Build the full set of git responses needed for runAttachVerification:
    // 1. git fetch origin <branch> (fetch branch)
    // 2. git rev-parse origin/<branch>^{commit}
    // 3. git ls-tree for slug resolution
    // 4. git cat-file -e for state.json in candidates
    // 5. git show <oid>:state.json
    // 6. git show <oid>:events.jsonl
    // 7. git ls-tree -r for treeFiles
    // 8. git fetch for evidence anchor (FAILS with network error)
    const { fn } = makeSpawnFn([
      { exitCode: 0 },                        // git fetch origin <branch>
      { exitCode: 0, stdout: checkpointCommitSha + "\n" }, // git rev-parse
      { exitCode: 0, stdout: `specrunner/changes/${SLUG}\n` }, // ls-tree (slug list)
      { exitCode: 0 },                        // cat-file -e state.json
      { exitCode: 0, stdout: stateJson },     // git show state.json
      { exitCode: 0, stdout: eventsJsonl },   // git show events.jsonl
      { exitCode: 0, stdout: `specrunner/changes/${SLUG}/request.md\nspecrunner/changes/${SLUG}/state.json\nspecrunner/changes/${SLUG}/events.jsonl\n` }, // ls-tree -r
      // Evidence anchor fetch: NETWORK ERROR
      { exitCode: 128, stderr: "fatal: network unreachable" },
    ]);

    await expect(
      runAttachVerification({
        cwd: CWD,
        branch: BRANCH,
        spawnFn: fn,
        expectedRepo: { owner: OWNER, name: REPO },
      }),
    ).rejects.toMatchObject({ code: "CHECKPOINT_NOT_ATTACHABLE" });
  });
});
