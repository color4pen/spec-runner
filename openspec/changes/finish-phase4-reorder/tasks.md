# Tasks: finish Phase 4 の markJobArchived を Phase 3 直後に移動する

## T1: job-state-update.ts — assertJobFinishable を canTransition ベースに書き換え

**File**: `src/core/finish/job-state-update.ts`

**Changes**:

1. `canTransition` を `../../state/lifecycle.js` から import 追加
2. `assertJobFinishable` の switch/case を `canTransition(state.status, "archived")` + lookup table に置換

**Before** (L17-55):
```typescript
export function assertJobFinishable(state: JobState): void {
  switch (state.status) {
    case "archived":
      return;
    case "awaiting-merge":
      return;
    case "running":
      throw new SpecRunnerError(...);
    // ... 各 status の case
  }
}
```

**After**:
```typescript
const STATUS_HINTS: Record<string, string> = {
  running: "Wait for the running job to complete before finishing.",
  "awaiting-resume": "Run 'specrunner resume' to continue the halted job before finishing.",
  canceled: "Job is already canceled. No action needed.",
  failed: "Use 'specrunner cancel' to clean up failed or terminated jobs.",
  terminated: "Use 'specrunner cancel' to clean up failed or terminated jobs.",
};

export function assertJobFinishable(state: JobState): void {
  if (canTransition(state.status, "archived")) return;

  const hint = STATUS_HINTS[state.status]
    ?? `Cannot finish job in status '${state.status}'.`;
  throw new SpecRunnerError(
    ERROR_CODES.JOB_NOT_FINISHABLE,
    hint,
    `Cannot finish job ${state.jobId}: status is '${state.status}'.`,
  );
}
```

**Note**: `canTransition("archived", "archived")` は same-status で true を返すため、TC-126 の archived no-op は TERMINAL_STATUSES check（orchestrator.ts L82）で引き続き処理される。`canTransition("awaiting-merge", "archived")` は VALID_TRANSITIONS で定義済みのため true。

---

## T2: job-state-update.ts — markJobArchived を transitionJob ベースに書き換え

**File**: `src/core/finish/job-state-update.ts`

**Changes**:

1. `transitionJob` を `../../state/lifecycle.js` から import 追加
2. `markJobArchived` 内部の手動 status/history 更新を `transitionJob` 呼び出しに置換
3. `appendHistoryEntry` の import が T1/T2 後に不要になれば削除

**Before** (L62-75):
```typescript
export async function markJobArchived(jobId: string): Promise<JobState> {
  return updateJobState(jobId, (state) => {
    const withHistory = appendHistoryEntry(state, {
      ts: new Date().toISOString(),
      step: "finish",
      status: "ok",
      message: "Job archived via specrunner finish.",
    });
    return {
      ...withHistory,
      status: "archived",
    };
  });
}
```

**After**:
```typescript
export async function markJobArchived(jobId: string): Promise<JobState> {
  return updateJobState(jobId, (state) => {
    const { state: updated, noop } = transitionJob(state, "archived", {
      trigger: "finish",
      reason: "PR merged",
    });
    if (noop) return state; // 既に archived → 変更なし
    return updated;
  });
}
```

---

## T3: orchestrator.ts — markJobArchived を Phase 3 直後に移動

**File**: `src/core/finish/orchestrator.ts`

**Changes**:

### 3a: main flow に markJobArchived 追加

L135（`stdoutWrite(`PR #${target.prNumber} merged successfully.`);`）の直後に markJobArchived を追加:

```typescript
stdoutWrite(`PR #${target.prNumber} merged successfully.`);
// State確定: PR merge は不可逆。成功直後に archived に遷移
await markJobArchived(target.jobId);
stdoutWrite(`Job ${target.jobId} marked as archived.`);
```

### 3b: prAlreadyMerged パスにも追加

L137（`stdoutWrite(`PR #${target.prNumber} already merged. Skipping Phase 1-3.`);`）の直後に追加:

```typescript
stdoutWrite(`PR #${target.prNumber} already merged. Skipping Phase 1-3.`);
await markJobArchived(target.jobId);
stdoutWrite(`Job ${target.jobId} marked as archived.`);
```

### 3c: runPhase4Finalize から markJobArchived を削除

L314-316 を削除:
```typescript
// markJobArchived AFTER Phase 4 operations  ← 削除
await markJobArchived(target.jobId);          ← 削除
stdoutWrite(`Job ${target.jobId} marked as archived.`);  ← 削除
```

### 3d: Phase 4 の escalation を warning に降格

`runPhase4Finalize` 内の `spawnOrEscalate` による git checkout/pull の失敗を escalation（`return { ok: false, ... }`）から warning（stderr 出力 + 続行）に変更する。state は既に archived なので cleanup 失敗は致命的ではない。

具体的には L274-292 の git checkout + git pull のブロックで、`spawnOrEscalate` の失敗時に `return { ok: false }` ではなく `process.stderr.write(...)` + 続行にする。

### 3e: Phase 4 の updateJobState(worktreePath: null) を try-catch で保護

L265 を try-catch で囲む:
```typescript
try {
  await updateJobState(target.jobId, (s) => ({ ...s, worktreePath: null }));
} catch {
  process.stderr.write(`Warning: failed to clear worktreePath for job ${target.jobId}.\n`);
}
```

### 3f: orchestrator ファイル先頭コメントの TC-124 を更新

L15 の `TC-124: markJobArchived called AFTER git pull --ff-only` を更新:
```
TC-124: markJobArchived called AFTER Phase 3 merge (BEFORE Phase 4 cleanup)
```

### 3g: import 整理

`markJobArchived` を orchestrator の main flow で使うが、`runPhase4Finalize` では使わなくなる。import 自体は残す（main flow で使用するため）。

---

## T4: tests/finish-orchestrator.test.ts — TC-124 の期待順序を修正

**File**: `tests/finish-orchestrator.test.ts`

**Changes**:

### 4a: TC-124 のテスト名と assertion を更新

TC-124 の describe/it を更新:
- 名前: `markJobArchived called after Phase 3 merge (before Phase 4 cleanup)`
- assertion: git-pull が呼ばれる前に state が archived になっていることを検証

```typescript
describe("TC-124: markJobArchived called after Phase 3 merge (before Phase 4)", () => {
  it("state is archived before git pull executes", async () => {
    const { jobId } = await makeJobWithPr({ status: "awaiting-merge" });

    const callOrder: string[] = [];
    const { loadJobState } = await import("../src/state/store.js");

    const spawn: SpawnFn = vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "pull") {
        // At the point git pull is called, state should already be archived
        const stateAtPull = await loadJobState(jobId);
        callOrder.push(`git-pull:status=${stateAtPull.status}`);
      }
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn;
      return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(0);
    expect(callOrder).toContain("git-pull:status=archived");
  });
});
```

### 4b: TC-WT-FIN-003 の assertion を修正

TC-WT-FIN-003 は worktree remove → markJobArchived の順序を検証している。修正後は worktree remove の時点で既に archived であることを検証する。

### 4c: Phase 4 cleanup 失敗テスト追加

```typescript
describe("TC-FIN-P4-FAIL-001: Phase 4 worktree remove failure → state=archived, exit 0", () => {
  it("state is archived even if worktree remove throws", async () => {
    const worktreePath = path.join(tempDir, ".git", "specrunner-worktrees", "test-slug-abcdef12");
    const { jobId } = await makeJobWithPr({ worktreePath });

    const mockManager = {
      create: vi.fn(),
      remove: vi.fn().mockRejectedValue(new Error("worktree remove failed")),
      prune: vi.fn().mockResolvedValue(undefined),
    };

    const spawn = makeHappyPathSpawn("OPEN");
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator({
      slug: "test-slug",
      baseBranch: "main",
      flags: {},
      cwd: tempDir,
      spawn,
      fs: stubFs,
      worktreeManagerFn: () => mockManager,
    });

    expect(result.exitCode).toBe(0);
    const { loadJobState } = await import("../src/state/store.js");
    const finalState = await loadJobState(jobId);
    expect(finalState.status).toBe("archived");
  });
});
```

---

## T5: tests/finish-job-state.test.ts — assertJobFinishable テストの更新

**File**: `tests/finish-job-state.test.ts`

**Changes**:

既存の TC-031 テストは `assertJobFinishable` が running → error を throw することを検証している。canTransition ベースに書き換え後も同じ挙動なので、テスト自体は pass するはず。エラーメッセージの文言が変わる場合は assertion を更新する。

---

## T6: 型チェックとテスト実行

**Command**: `bun run typecheck && bun test`

**Verification checklist**:
- [x] `bun run typecheck` が exit 0
- [x] TC-124 が新しい期待順序で pass
- [x] TC-125 が引き続き pass（Phase 1 fail → markJobArchived 呼ばれない）
- [x] TC-126 が引き続き pass（archived → no-op）
- [x] TC-FIN-P4-FAIL-001 が pass（cleanup 失敗 → state=archived）
- [x] `bun test` finish suite (74 tests) が green

---

## タスク依存関係

```
T1 (assertJobFinishable) ─┐
                          ├─ T3 (orchestrator) ─── T4 (orchestrator tests) ─── T6 (verify)
T2 (markJobArchived)   ───┘                    └── T5 (job-state tests) ──────┘
```

T1, T2 は並行実施可能。T3 は T1/T2 に依存。T4, T5 は T3 に依存。T6 は最終検証。
