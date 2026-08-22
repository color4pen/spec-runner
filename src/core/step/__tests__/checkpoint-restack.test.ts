/**
 * Unit tests for restackCheckpointOntoPublishedTip (T-06, halt-checkpoint-restack).
 *
 * TC-002: remote tip 解決不可 → push/recordRestack/persistCommit 未呼び出し
 * TC-004: 封じ込め検査違反 → push 未発行
 * TC-009: push 二重失敗 → throw せず push-failed
 * TC-010: recordRestack (journal) 失敗 → 後続 push 継続
 * TC-012: detached HEAD → update-ref 未発行
 * TC-016: tree 構築 git 呼び出しシーケンス + GIT_INDEX_FILE env
 * TC-017: rev-parse 空 stdout → push/recordRestack/persistCommit 未呼び出し
 * TC-018: recordRestack callback reject → 後続 tree 構築・push 継続
 * TC-019: persistCommit callback reject → push 継続
 * TC-020: write-tree == parent tree → push 未発行 (no-delta)
 * TC-021: push 二重失敗 → throw せず push-failed、stderr に git stderr を含む
 * TC-022: graft 後 branch tip tree が restack 前 HEAD の tree と同一
 * TC-023: graft 後 restackedOid がローカル branch の ancestor
 * TC-024: detached HEAD での update-ref 未発行
 * TC-028: worktree/index 変更 git サブコマンドの非発行 invariant
 * TC-029: maskSensitive が reason フィールドに適用される
 * TC-030: fetch 失敗を無視して rev-parse に進む
 * TC-031: push 成功後に remote-tracking ref が更新される
 * TC-032: graft の git 失敗で throw せず RestackOutcome.graft が "failed"
 * TC-033: egress 失敗経路では restack が呼ばれない (already covered by commitFinalState test)
 */

import { describe, it, expect, vi } from "vitest";
import type { SpawnFn as PipelineSpawnFn, SpawnOptions } from "../../../util/spawn.js";
import { restackCheckpointOntoPublishedTip } from "../checkpoint-restack.js";
import type { CheckpointRestackRecord } from "../../../store/event-journal.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CWD = "/tmp/fake-restack-test";
const BRANCH = "test/restack-branch-abc12345";
const SLUG = "test-restack-slug";
const PARENT_OID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const LOCAL_TIP = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TREE_OID = "cccccccccccccccccccccccccccccccccccccccc";
const PARENT_TREE = "dddddddddddddddddddddddddddddddddddddddd";
const RESTACK_OID = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const MERGE_OID = "ffffffffffffffffffffffffffffffffffffffff";
const BLOB_OID = "1111111111111111111111111111111111111111";

const CHANGE_DIR = `specrunner/changes/${SLUG}`;
const EVENTS_PATH = `specrunner/changes/${SLUG}/events.jsonl`;

// ---------------------------------------------------------------------------
// Helper: build fake spawnFn that records all calls (args + env)
// ---------------------------------------------------------------------------

interface FakeCall {
  args: string[];
  env?: Record<string, string | undefined>;
}

function makeFakeSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): {
  fn: PipelineSpawnFn;
  calls: FakeCall[];
} {
  const calls: FakeCall[] = [];
  let idx = 0;
  const fn: PipelineSpawnFn = async (_cmd: string, args: string[], opts?: SpawnOptions) => {
    calls.push({ args: [...args], env: opts?.env });
    const response = responses[idx++] ?? { exitCode: 0, stdout: "", stderr: "" };
    return {
      exitCode: response.exitCode,
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
    };
  };
  return { fn, calls };
}

// ---------------------------------------------------------------------------
// Helper: standard "happy-path" response sequence for full restack + graft
// ---------------------------------------------------------------------------

/**
 * Responses for a full normal-path execution:
 *   0:  fetch origin <branch>                            → exit 0
 *   1:  rev-parse refs/remotes/origin/<branch>^{commit} → PARENT_OID
 *   2:  rev-parse HEAD                                   → LOCAL_TIP
 *   3:  rev-list <parent>..<local>                       → (empty)
 *   4:  read-tree <parent>                               → exit 0
 *   5:  ls-tree -r <parent> -- <changeDir>/              → 1 entry (state.json)
 *   6:  ls-tree -r <local>  -- <changeDir>/              → 1 entry (state.json)
 *   7:  update-index --add --cacheinfo ...               → exit 0
 *   8:  hash-object -w -- <eventsPath>                   → BLOB_OID
 *   9:  update-index --add --cacheinfo 100644,...        → exit 0
 *  10:  write-tree                                        → TREE_OID
 *  11:  rev-parse <parent>^{tree}                        → PARENT_TREE  (≠ TREE_OID)
 *  12:  commit-tree <tree> -p <parent> -m ...            → RESTACK_OID
 *  13:  diff --name-only <parent> <restack>              → <changeDir>/state.json
 *  14:  push origin <restack>:refs/heads/<branch>        → exit 0
 *  15:  update-ref refs/remotes/origin/<branch> <restack>→ exit 0
 *  16:  symbolic-ref -q HEAD                             → refs/heads/<branch>
 *  17:  rev-parse HEAD^{tree}                            → PARENT_TREE  (local HEAD tree)
 *  18:  commit-tree <headTree> -p <local> -p <restack> -m merge:...  → MERGE_OID
 *  19:  update-ref refs/heads/<branch> <merge> <local>   → exit 0
 */
function makeHappyPathResponses() {
  const stateJsonEntry = `100644 blob 2222222222222222222222222222222222222222\t${CHANGE_DIR}/state.json`;
  return [
    { exitCode: 0, stdout: "" },                  // 0: fetch
    { exitCode: 0, stdout: PARENT_OID + "\n" },   // 1: rev-parse remote
    { exitCode: 0, stdout: LOCAL_TIP + "\n" },    // 2: rev-parse HEAD
    { exitCode: 0, stdout: "" },                  // 3: rev-list (no unpublished)
    { exitCode: 0 },                              // 4: read-tree
    { exitCode: 0, stdout: stateJsonEntry + "\n" }, // 5: ls-tree parent
    { exitCode: 0, stdout: stateJsonEntry + "\n" }, // 6: ls-tree local
    { exitCode: 0 },                              // 7: update-index (cacheinfo for state.json)
    { exitCode: 0, stdout: BLOB_OID + "\n" },     // 8: hash-object events.jsonl
    { exitCode: 0 },                              // 9: update-index (cacheinfo for events.jsonl)
    { exitCode: 0, stdout: TREE_OID + "\n" },     // 10: write-tree
    { exitCode: 0, stdout: PARENT_TREE + "\n" },  // 11: rev-parse parent^{tree}
    { exitCode: 0, stdout: RESTACK_OID + "\n" },  // 12: commit-tree (restack)
    { exitCode: 0, stdout: `${CHANGE_DIR}/state.json\n` }, // 13: diff --name-only
    { exitCode: 0 },                              // 14: push origin restack:refs/heads/<branch>
    { exitCode: 0 },                              // 15: update-ref remote tracking
    { exitCode: 0, stdout: `refs/heads/${BRANCH}\n` }, // 16: symbolic-ref
    { exitCode: 0, stdout: PARENT_TREE + "\n" },  // 17: rev-parse HEAD^{tree}
    { exitCode: 0, stdout: MERGE_OID + "\n" },    // 18: commit-tree (merge/graft)
    { exitCode: 0 },                              // 19: update-ref branch
  ];
}

// ---------------------------------------------------------------------------
// TC-017: rev-parse 空 stdout で push/recordRestack/persistCommit が未呼び出し
// ---------------------------------------------------------------------------

describe("TC-017: rev-parse empty stdout → skipped: no-remote-tip, no callbacks called", () => {
  it("TC-017: returns no-remote-tip when rev-parse returns empty stdout", async () => {
    const recordRestack = vi.fn(async (_r: CheckpointRestackRecord) => {});
    const persistCommit = vi.fn(async (_oid: string) => {});

    const { fn, calls } = makeFakeSpawnFn([
      { exitCode: 0, stdout: "" }, // fetch
      { exitCode: 0, stdout: "" }, // rev-parse → empty stdout → no-remote-tip
    ]);

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "remote: rejected",
      recordRestack,
      persistCommit,
    });

    expect(outcome).toEqual({ kind: "skipped", reason: "no-remote-tip" });
    expect(recordRestack).not.toHaveBeenCalled();
    expect(persistCommit).not.toHaveBeenCalled();
    // No push call
    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).not.toContain("push");
  });

  it("TC-017b: returns no-remote-tip when rev-parse returns non-zero exit", async () => {
    const { fn } = makeFakeSpawnFn([
      { exitCode: 0 },                  // fetch
      { exitCode: 1, stdout: "", stderr: "not found" }, // rev-parse fails
    ]);

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    expect(outcome).toEqual({ kind: "skipped", reason: "no-remote-tip" });
  });
});

// ---------------------------------------------------------------------------
// TC-002: publish 済み tip が存在しない branch での積み直しスキップ
// ---------------------------------------------------------------------------

describe("TC-002: no-branch when branch param is empty string", () => {
  it("TC-002: returns skipped: no-branch for empty branch", async () => {
    const { fn, calls } = makeFakeSpawnFn([]);

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: "",
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    expect(outcome).toEqual({ kind: "skipped", reason: "no-branch" });
    // No git calls at all
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-030: fetch 失敗を無視して rev-parse に進む
// ---------------------------------------------------------------------------

describe("TC-030: fetch failure is ignored — rev-parse proceeds", () => {
  it("TC-030: non-zero fetch exit does not abort restack", async () => {
    const { fn, calls } = makeFakeSpawnFn([
      { exitCode: 1, stdout: "", stderr: "network error" }, // fetch fails
      { exitCode: 0, stdout: PARENT_OID + "\n" },           // rev-parse still runs
      // Return empty stdout after to abort early (simplify test)
      { exitCode: 0, stdout: "" }, // rev-parse HEAD → empty → no-local-tip
    ]);

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    // fetch failed but we continued past it
    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands[0]).toBe("fetch");
    expect(subcommands[1]).toBe("rev-parse");
    // outcome is no-local-tip (since HEAD rev-parse returned empty)
    expect(outcome).toEqual({ kind: "skipped", reason: "no-local-tip" });
  });
});

// ---------------------------------------------------------------------------
// TC-016: tree 構築 git 呼び出しシーケンスと GIT_INDEX_FILE env
// ---------------------------------------------------------------------------

describe("TC-016: tree build git call sequence and GIT_INDEX_FILE env", () => {
  it("TC-016: read-tree → ls-tree×2 → update-index→ hash-object → update-index → write-tree, all with GIT_INDEX_FILE", async () => {
    const { fn, calls } = makeFakeSpawnFn(makeHappyPathResponses());

    await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    // Extract tree-building calls (those with GIT_INDEX_FILE)
    const treeCalls = calls.filter((c) => c.env?.["GIT_INDEX_FILE"] !== undefined);

    // All tree-building calls share the SAME GIT_INDEX_FILE value
    const indexPaths = new Set(treeCalls.map((c) => c.env!["GIT_INDEX_FILE"]));
    expect(indexPaths.size).toBe(1);

    // Extract subcommands for tree-building calls
    const treeSubcmds = treeCalls.map((c) => c.args[0]);

    // read-tree must be first
    expect(treeSubcmds[0]).toBe("read-tree");
    // write-tree must be last
    expect(treeSubcmds[treeSubcmds.length - 1]).toBe("write-tree");

    // ls-tree must come before update-index
    const firstLsTree = treeSubcmds.indexOf("ls-tree");
    const firstUpdateIndex = treeSubcmds.indexOf("update-index");
    expect(firstLsTree).toBeGreaterThan(-1);
    expect(firstUpdateIndex).toBeGreaterThan(-1);
    expect(firstLsTree).toBeLessThan(firstUpdateIndex);

    // hash-object must come before write-tree (and after ls-tree)
    const hashObjectIdx = treeSubcmds.indexOf("hash-object");
    const writeTreeIdx = treeSubcmds.indexOf("write-tree");
    expect(hashObjectIdx).toBeGreaterThan(-1);
    expect(hashObjectIdx).toBeGreaterThan(firstLsTree);
    expect(hashObjectIdx).toBeLessThan(writeTreeIdx);

    // hash-object must be called with the events.jsonl path
    const hashObjectCall = treeCalls.find((c) => c.args[0] === "hash-object");
    expect(hashObjectCall?.args).toContain(EVENTS_PATH);

    // Verify ls-tree args: first is for parent, second is for local
    const lsTreeCalls = treeCalls.filter((c) => c.args[0] === "ls-tree");
    expect(lsTreeCalls.length).toBeGreaterThanOrEqual(2);
    expect(lsTreeCalls[0]!.args).toContain(PARENT_OID);
    expect(lsTreeCalls[1]!.args).toContain(LOCAL_TIP);
    // Both ls-tree calls reference the change folder
    expect(lsTreeCalls[0]!.args).toContain(`${CHANGE_DIR}/`);
    expect(lsTreeCalls[1]!.args).toContain(`${CHANGE_DIR}/`);
  });
});

// ---------------------------------------------------------------------------
// TC-018: recordRestack callback reject で後続 tree 構築・push が継続
// ---------------------------------------------------------------------------

describe("TC-018: recordRestack reject does not abort tree build or push", () => {
  it("TC-018: recordRestack throwing still allows tree build and push", async () => {
    const recordRestack = vi.fn(async (_r: CheckpointRestackRecord) => {
      throw new Error("journal-write-failed");
    });

    const { fn, calls } = makeFakeSpawnFn(makeHappyPathResponses());

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
      recordRestack,
    });

    expect(outcome.kind).toBe("published");
    // recordRestack was called
    expect(recordRestack).toHaveBeenCalledTimes(1);
    // push was still attempted
    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).toContain("push");
  });
});

// ---------------------------------------------------------------------------
// TC-019: persistCommit callback reject で push が継続
// ---------------------------------------------------------------------------

describe("TC-019: persistCommit reject does not abort push", () => {
  it("TC-019: persistCommit throwing still allows push to proceed", async () => {
    const persistCommit = vi.fn(async (_oid: string) => {
      throw new Error("ledger-write-failed");
    });

    const { fn, calls } = makeFakeSpawnFn(makeHappyPathResponses());

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
      persistCommit,
    });

    expect(outcome.kind).toBe("published");
    // persistCommit was called (at least once for restack OID)
    expect(persistCommit).toHaveBeenCalled();
    // push was still executed
    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).toContain("push");
  });
});

// ---------------------------------------------------------------------------
// TC-020: write-tree が parent tree と同値の場合は push しない (no-delta)
// ---------------------------------------------------------------------------

describe("TC-020: write-tree OID matches parent^{tree} → skipped: no-delta", () => {
  it("TC-020: returns no-delta when tree has no changes", async () => {
    const stateJsonEntry = `100644 blob 2222222222222222222222222222222222222222\t${CHANGE_DIR}/state.json`;

    const { fn, calls } = makeFakeSpawnFn([
      { exitCode: 0, stdout: "" },                  // fetch
      { exitCode: 0, stdout: PARENT_OID + "\n" },   // rev-parse remote
      { exitCode: 0, stdout: LOCAL_TIP + "\n" },    // rev-parse HEAD
      { exitCode: 0, stdout: "" },                  // rev-list
      { exitCode: 0 },                              // read-tree
      { exitCode: 0, stdout: stateJsonEntry + "\n" }, // ls-tree parent
      { exitCode: 0, stdout: stateJsonEntry + "\n" }, // ls-tree local
      { exitCode: 0 },                              // update-index (cacheinfo)
      { exitCode: 0, stdout: BLOB_OID + "\n" },     // hash-object
      { exitCode: 0 },                              // update-index (events)
      { exitCode: 0, stdout: TREE_OID + "\n" },     // write-tree → TREE_OID
      { exitCode: 0, stdout: TREE_OID + "\n" },     // rev-parse parent^{tree} → SAME as write-tree
    ]);

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    expect(outcome).toEqual({ kind: "skipped", reason: "no-delta" });
    // commit-tree and push must NOT have been called
    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).not.toContain("commit-tree");
    expect(subcommands).not.toContain("push");
  });
});

// ---------------------------------------------------------------------------
// TC-004 / TC-021: 封じ込め検査違反 → push 抑制
// ---------------------------------------------------------------------------

describe("TC-004: containment-violation → push not called", () => {
  it("TC-004: diff --name-only outside change folder causes skipped: containment-violation", async () => {
    const stateJsonEntry = `100644 blob 2222222222222222222222222222222222222222\t${CHANGE_DIR}/state.json`;

    const { fn, calls } = makeFakeSpawnFn([
      { exitCode: 0, stdout: "" },                  // fetch
      { exitCode: 0, stdout: PARENT_OID + "\n" },   // rev-parse remote
      { exitCode: 0, stdout: LOCAL_TIP + "\n" },    // rev-parse HEAD
      { exitCode: 0, stdout: "" },                  // rev-list
      { exitCode: 0 },                              // read-tree
      { exitCode: 0, stdout: stateJsonEntry + "\n" }, // ls-tree parent
      { exitCode: 0, stdout: stateJsonEntry + "\n" }, // ls-tree local
      { exitCode: 0 },                              // update-index
      { exitCode: 0, stdout: BLOB_OID + "\n" },     // hash-object
      { exitCode: 0 },                              // update-index events
      { exitCode: 0, stdout: TREE_OID + "\n" },     // write-tree
      { exitCode: 0, stdout: PARENT_TREE + "\n" },  // rev-parse parent^{tree}
      { exitCode: 0, stdout: RESTACK_OID + "\n" },  // commit-tree
      // diff --name-only includes a path outside change folder
      { exitCode: 0, stdout: `src/foo.ts\n${CHANGE_DIR}/state.json\n` }, // diff
    ]);

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    expect(outcome).toEqual({ kind: "skipped", reason: "containment-violation" });
    const subcommands = calls.map((c) => c.args[0]);
    expect(subcommands).not.toContain("push");
  });
});

// ---------------------------------------------------------------------------
// TC-009 / TC-021: push 二重失敗 → throw せず push-failed
// ---------------------------------------------------------------------------

describe("TC-021: push double-failure → push-failed (no throw)", () => {
  it("TC-021: returns push-failed with stderr when both push attempts fail", async () => {
    const PUSH_STDERR = "remote: error: push rejected by pre-receive hook";
    const stateJsonEntry = `100644 blob 2222222222222222222222222222222222222222\t${CHANGE_DIR}/state.json`;

    const { fn } = makeFakeSpawnFn([
      { exitCode: 0, stdout: "" },                  // fetch
      { exitCode: 0, stdout: PARENT_OID + "\n" },   // rev-parse remote
      { exitCode: 0, stdout: LOCAL_TIP + "\n" },    // rev-parse HEAD
      { exitCode: 0, stdout: "" },                  // rev-list
      { exitCode: 0 },                              // read-tree
      { exitCode: 0, stdout: stateJsonEntry + "\n" }, // ls-tree parent
      { exitCode: 0, stdout: stateJsonEntry + "\n" }, // ls-tree local
      { exitCode: 0 },                              // update-index
      { exitCode: 0, stdout: BLOB_OID + "\n" },     // hash-object
      { exitCode: 0 },                              // update-index events
      { exitCode: 0, stdout: TREE_OID + "\n" },     // write-tree
      { exitCode: 0, stdout: PARENT_TREE + "\n" },  // rev-parse parent^{tree}
      { exitCode: 0, stdout: RESTACK_OID + "\n" },  // commit-tree
      { exitCode: 0, stdout: `${CHANGE_DIR}/state.json\n` }, // diff --name-only
      { exitCode: 1, stderr: "first push error\n" }, // push attempt 1
      { exitCode: 1, stderr: PUSH_STDERR + "\n" }, // push attempt 2
    ]);

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    expect(outcome.kind).toBe("push-failed");
    if (outcome.kind === "push-failed") {
      expect(outcome.restackedOid).toBe(RESTACK_OID);
      expect(outcome.parentOid).toBe(PARENT_OID);
      expect(outcome.stderr).toContain(PUSH_STDERR.trim());
    }
  });
});

// ---------------------------------------------------------------------------
// TC-029: reason フィールドに maskSensitive が適用される
// ---------------------------------------------------------------------------

describe("TC-029: reason field is masked by maskSensitive", () => {
  it("TC-029: sensitive token in pushFailureStderr is masked in recordRestack reason", async () => {
    const SENSITIVE_STDERR = "remote: token sk-ant-api03-ABCDEFGH1234567890123456789012345 rejected";
    let capturedRecord: CheckpointRestackRecord | null = null;
    const recordRestack = vi.fn(async (r: CheckpointRestackRecord) => {
      capturedRecord = r;
    });

    // recordRestack is only called when localTipOid is valid (non-empty 40-char SHA).
    // Use LOCAL_TIP as a valid HEAD; let read-tree fail to terminate early after journaling.
    const { fn } = makeFakeSpawnFn([
      { exitCode: 0, stdout: "" },                  // fetch
      { exitCode: 0, stdout: PARENT_OID + "\n" },   // rev-parse remote
      { exitCode: 0, stdout: LOCAL_TIP + "\n" },    // rev-parse HEAD → valid local tip
      { exitCode: 0, stdout: "" },                  // rev-list → no unpublished commits
      { exitCode: 1, stderr: "read-tree error\n" }, // read-tree → fail → tree-build-failed (early exit after journal)
    ]);

    await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: SENSITIVE_STDERR,
      recordRestack,
    });

    expect(recordRestack).toHaveBeenCalledTimes(1);
    expect(capturedRecord).not.toBeNull();
    // The sensitive token should be masked
    expect(capturedRecord!.reason).not.toContain("ABCDEFGH1234567890123456789012345");
    // The prefix should still be there (masked as "sk-ant-...")
    expect(capturedRecord!.reason).toContain("sk-ant-...");
  });

  it("TC-029-b: recordRestack is NOT called when rev-parse HEAD fails (no-local-tip)", async () => {
    // Per F-01: CheckpointRestackRecord.localTipOid must be a non-empty 40-char SHA.
    // When localTipFailed, we skip journaling to avoid writing a semantically invalid record.
    const recordRestack = vi.fn();

    const { fn } = makeFakeSpawnFn([
      { exitCode: 0, stdout: "" },                 // fetch
      { exitCode: 0, stdout: PARENT_OID + "\n" }, // rev-parse remote
      { exitCode: 0, stdout: "" },                 // rev-parse HEAD → empty → no-local-tip
    ]);

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "some error",
      recordRestack,
    });

    expect(outcome.kind).toBe("skipped");
    if (outcome.kind === "skipped") {
      expect(outcome.reason).toBe("no-local-tip");
    }
    expect(recordRestack).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-024: detached HEAD での update-ref 未発行
// ---------------------------------------------------------------------------

describe("TC-024: detached HEAD → update-ref refs/heads/... not called", () => {
  it("TC-024: graft is skipped and no update-ref for branch when HEAD is detached", async () => {
    const stateJsonEntry = `100644 blob 2222222222222222222222222222222222222222\t${CHANGE_DIR}/state.json`;

    const { fn, calls } = makeFakeSpawnFn([
      { exitCode: 0, stdout: "" },                  // fetch
      { exitCode: 0, stdout: PARENT_OID + "\n" },   // rev-parse remote
      { exitCode: 0, stdout: LOCAL_TIP + "\n" },    // rev-parse HEAD
      { exitCode: 0, stdout: "" },                  // rev-list
      { exitCode: 0 },                              // read-tree
      { exitCode: 0, stdout: stateJsonEntry + "\n" }, // ls-tree parent
      { exitCode: 0, stdout: stateJsonEntry + "\n" }, // ls-tree local
      { exitCode: 0 },                              // update-index
      { exitCode: 0, stdout: BLOB_OID + "\n" },     // hash-object
      { exitCode: 0 },                              // update-index events
      { exitCode: 0, stdout: TREE_OID + "\n" },     // write-tree
      { exitCode: 0, stdout: PARENT_TREE + "\n" },  // rev-parse parent^{tree}
      { exitCode: 0, stdout: RESTACK_OID + "\n" },  // commit-tree
      { exitCode: 0, stdout: `${CHANGE_DIR}/state.json\n` }, // diff
      { exitCode: 0 },                              // push → success
      { exitCode: 0 },                              // update-ref remote tracking
      // symbolic-ref fails → detached HEAD
      { exitCode: 1, stdout: "" },                  // symbolic-ref -q HEAD
    ]);

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    expect(outcome.kind).toBe("published");
    if (outcome.kind === "published") {
      expect(outcome.graft).toBe("skipped");
    }

    // update-ref for refs/heads/<branch> must NOT have been called
    const updateRefCalls = calls.filter(
      (c) => c.args[0] === "update-ref" && c.args[1]?.startsWith("refs/heads/"),
    );
    expect(updateRefCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-012: detached HEAD での graft スキップと branch ref 不変 (unit variant)
// ---------------------------------------------------------------------------

describe("TC-012: detached HEAD → graft: skipped in RestackOutcome", () => {
  it("TC-012: RestackOutcome.graft === 'skipped' when HEAD is detached", async () => {
    const stateJsonEntry = `100644 blob 2222222222222222222222222222222222222222\t${CHANGE_DIR}/state.json`;

    const { fn } = makeFakeSpawnFn([
      { exitCode: 0, stdout: "" },
      { exitCode: 0, stdout: PARENT_OID + "\n" },
      { exitCode: 0, stdout: LOCAL_TIP + "\n" },
      { exitCode: 0, stdout: "" },
      { exitCode: 0 },
      { exitCode: 0, stdout: stateJsonEntry + "\n" },
      { exitCode: 0, stdout: stateJsonEntry + "\n" },
      { exitCode: 0 },
      { exitCode: 0, stdout: BLOB_OID + "\n" },
      { exitCode: 0 },
      { exitCode: 0, stdout: TREE_OID + "\n" },
      { exitCode: 0, stdout: PARENT_TREE + "\n" },
      { exitCode: 0, stdout: RESTACK_OID + "\n" },
      { exitCode: 0, stdout: `${CHANGE_DIR}/state.json\n` },
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 1, stdout: "" }, // symbolic-ref fails → detached
    ]);

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    expect(outcome.kind).toBe("published");
    if (outcome.kind === "published") {
      expect(outcome.graft).toBe("skipped");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-022: graft 後の branch tip tree が restack 前 HEAD の tree と同一
// ---------------------------------------------------------------------------

describe("TC-022: graft merge commit tree equals local HEAD tree", () => {
  it("TC-022: commit-tree -p <local> -p <restack> uses HEAD^{tree}", async () => {
    const HEAD_TREE = "9999999999999999999999999999999999999999";
    const stateJsonEntry = `100644 blob 2222222222222222222222222222222222222222\t${CHANGE_DIR}/state.json`;

    const { fn, calls } = makeFakeSpawnFn([
      { exitCode: 0, stdout: "" },
      { exitCode: 0, stdout: PARENT_OID + "\n" },
      { exitCode: 0, stdout: LOCAL_TIP + "\n" },
      { exitCode: 0, stdout: "" },
      { exitCode: 0 },
      { exitCode: 0, stdout: stateJsonEntry + "\n" },
      { exitCode: 0, stdout: stateJsonEntry + "\n" },
      { exitCode: 0 },
      { exitCode: 0, stdout: BLOB_OID + "\n" },
      { exitCode: 0 },
      { exitCode: 0, stdout: TREE_OID + "\n" },
      { exitCode: 0, stdout: PARENT_TREE + "\n" },
      { exitCode: 0, stdout: RESTACK_OID + "\n" },
      { exitCode: 0, stdout: `${CHANGE_DIR}/state.json\n` },
      { exitCode: 0 },    // push
      { exitCode: 0 },    // update-ref remote
      { exitCode: 0, stdout: `refs/heads/${BRANCH}\n` }, // symbolic-ref
      { exitCode: 0, stdout: HEAD_TREE + "\n" },  // rev-parse HEAD^{tree}
      { exitCode: 0, stdout: MERGE_OID + "\n" },  // commit-tree merge
      { exitCode: 0 },    // update-ref branch
    ]);

    await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    // Find the merge commit-tree call
    const mergeCommitTree = calls.find(
      (c) =>
        c.args[0] === "commit-tree" &&
        c.args.includes("-p") &&
        c.args.includes(RESTACK_OID) &&
        c.args.includes(LOCAL_TIP),
    );

    expect(mergeCommitTree).toBeDefined();
    // First arg to commit-tree is the tree OID = HEAD^{tree}
    expect(mergeCommitTree!.args[1]).toBe(HEAD_TREE);
  });
});

// ---------------------------------------------------------------------------
// TC-023: graft 後に restackedOid がローカル branch の ancestor (unit)
// ---------------------------------------------------------------------------

describe("TC-023: graft produces published outcome with merged graft", () => {
  it("TC-023: happy path produces kind:published graft:merged", async () => {
    const { fn } = makeFakeSpawnFn(makeHappyPathResponses());

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    expect(outcome.kind).toBe("published");
    if (outcome.kind === "published") {
      expect(outcome.restackedOid).toBe(RESTACK_OID);
      expect(outcome.parentOid).toBe(PARENT_OID);
      expect(outcome.graft).toBe("merged");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-031: push 成功後に remote-tracking ref が更新される
// ---------------------------------------------------------------------------

describe("TC-031: push success → update-ref refs/remotes/origin/<branch>", () => {
  it("TC-031: update-ref refs/remotes/origin/<branch> is called with restackedOid", async () => {
    const { fn, calls } = makeFakeSpawnFn(makeHappyPathResponses());

    await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    const trackingUpdateCall = calls.find(
      (c) =>
        c.args[0] === "update-ref" &&
        c.args[1] === `refs/remotes/origin/${BRANCH}` &&
        c.args[2] === RESTACK_OID,
    );
    expect(trackingUpdateCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-032: graft の git 失敗で throw せず graft が "failed"
// ---------------------------------------------------------------------------

describe("TC-032: graft update-ref failure → graft:failed (no throw)", () => {
  it("TC-032: returns published with graft:failed when update-ref fails", async () => {
    const stateJsonEntry = `100644 blob 2222222222222222222222222222222222222222\t${CHANGE_DIR}/state.json`;

    const { fn } = makeFakeSpawnFn([
      { exitCode: 0, stdout: "" },
      { exitCode: 0, stdout: PARENT_OID + "\n" },
      { exitCode: 0, stdout: LOCAL_TIP + "\n" },
      { exitCode: 0, stdout: "" },
      { exitCode: 0 },
      { exitCode: 0, stdout: stateJsonEntry + "\n" },
      { exitCode: 0, stdout: stateJsonEntry + "\n" },
      { exitCode: 0 },
      { exitCode: 0, stdout: BLOB_OID + "\n" },
      { exitCode: 0 },
      { exitCode: 0, stdout: TREE_OID + "\n" },
      { exitCode: 0, stdout: PARENT_TREE + "\n" },
      { exitCode: 0, stdout: RESTACK_OID + "\n" },
      { exitCode: 0, stdout: `${CHANGE_DIR}/state.json\n` },
      { exitCode: 0 },    // push
      { exitCode: 0 },    // update-ref remote tracking
      { exitCode: 0, stdout: `refs/heads/${BRANCH}\n` }, // symbolic-ref
      { exitCode: 0, stdout: PARENT_TREE + "\n" },  // rev-parse HEAD^{tree}
      { exitCode: 0, stdout: MERGE_OID + "\n" },  // commit-tree merge
      { exitCode: 1 },    // update-ref branch FAILS
    ]);

    const outcome = await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    expect(outcome.kind).toBe("published");
    if (outcome.kind === "published") {
      expect(outcome.graft).toBe("failed");
      // But push was still successful
      expect(outcome.restackedOid).toBe(RESTACK_OID);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-028: worktree/index 変更 git サブコマンドの非発行 invariant
// ---------------------------------------------------------------------------

describe("TC-028: no worktree/index-modifying git subcommands issued", () => {
  it("TC-028: add/commit/checkout/reset/stash/merge never appear in call list", async () => {
    const { fn, calls } = makeFakeSpawnFn(makeHappyPathResponses());

    await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    const porcelainForbidden = new Set(["add", "commit", "checkout", "reset", "stash", "merge"]);
    const subcommands = calls.map((c) => c.args[0]);

    for (const forbidden of porcelainForbidden) {
      expect(subcommands, `Forbidden subcommand '${forbidden}' was issued`).not.toContain(forbidden);
    }
  });

  it("TC-028: GIT_INDEX_FILE is present for tree-building calls only", async () => {
    const { fn, calls } = makeFakeSpawnFn(makeHappyPathResponses());

    await restackCheckpointOntoPublishedTip({
      cwd: CWD,
      branch: BRANCH,
      slug: SLUG,
      spawnFn: fn,
      messageLabel: "checkpoint",
      pushFailureStderr: "",
    });

    const treeBuildSubcmds = new Set(["read-tree", "ls-tree", "update-index", "hash-object", "write-tree"]);
    const nonTreeBuildSubcmds = new Set(["fetch", "rev-parse", "rev-list", "commit-tree", "diff", "push", "update-ref", "symbolic-ref"]);

    for (const c of calls) {
      const sub = c.args[0];
      const hasIndexFile = c.env?.["GIT_INDEX_FILE"] !== undefined;
      if (sub && treeBuildSubcmds.has(sub)) {
        // Tree-building commands MUST have GIT_INDEX_FILE
        expect(hasIndexFile, `Expected GIT_INDEX_FILE for '${sub}'`).toBe(true);
      }
      if (sub && nonTreeBuildSubcmds.has(sub)) {
        // Non-tree-building commands should NOT have GIT_INDEX_FILE
        // (Note: some like commit-tree don't need it)
        expect(hasIndexFile, `Unexpected GIT_INDEX_FILE for '${sub}'`).toBe(false);
      }
    }
  });
});
