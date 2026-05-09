# Design: finish Phase 4 の markJobArchived を Phase 3 直後に移動する

## 変更の構造

### Before

```
runFinishOrchestrator():
  Phase 0: preflight
  Phase 1-3: archive → push → merge
  Phase 4 (runPhase4Finalize):
    worktree remove (try-catch)
    updateJobState(worktreePath: null)  ← 未保護
    git checkout main / git pull        ← 失敗で escalation
    branch -D / push --delete           ← best-effort
    markJobArchived()                   ← ここに到達しない場合がある
```

### After

```
runFinishOrchestrator():
  Phase 0: preflight
  Phase 1-3: archive → push → merge
  markJobArchived()                     ← Phase 3 成功直後に確定
  Phase 4 (runPhase4Cleanup):           ← rename: Finalize → Cleanup
    worktree remove (try-catch)
    updateJobState(worktreePath: null)  ← try-catch で保護
    git checkout main / git pull        ← best-effort 化
    branch -D / push --delete           ← best-effort（変更なし）
```

## 変更対象ファイル

| File | 変更内容 |
|------|---------|
| `src/core/finish/orchestrator.ts` | markJobArchived を main flow に移動。Phase 4 を cleanup 専用に変更。Phase 4 の escalation を best-effort 化 |
| `src/core/finish/job-state-update.ts` | assertJobFinishable を canTransition ベースに書き換え。markJobArchived を transitionJob ベースに書き換え |
| `tests/finish-orchestrator.test.ts` | TC-124 の期待順序を逆転。Phase 4 cleanup 失敗時に state=archived を検証する新テスト追加 |
| `tests/finish-job-state.test.ts` | assertJobFinishable のテストを canTransition ベースに更新 |

## 詳細設計

### D1: orchestrator.ts — markJobArchived の移動

`runFinishOrchestrator` の main flow で Phase 3 merge 成功直後に `markJobArchived` を呼ぶ。

```typescript
// Phase 3 成功後
stdoutWrite(`PR #${target.prNumber} merged successfully.`);

// markJobArchived: PR merge は不可逆。成功直後に state を確定
await markJobArchived(target.jobId);
stdoutWrite(`Job ${target.jobId} marked as archived.`);
```

PR already MERGED パス（`prAlreadyMerged === true`）でも同じ位置に配置:

```typescript
} else {
  stdoutWrite(`PR #${target.prNumber} already merged. Skipping Phase 1-3.`);
  await markJobArchived(target.jobId);
  stdoutWrite(`Job ${target.jobId} marked as archived.`);
}
```

`runPhase4Finalize` から `markJobArchived` 呼び出しと `stdoutWrite` を削除。関数名を概念的に cleanup に変更（rename は任意）。

### D2: Phase 4 の best-effort 化

Phase 4 全体を try-catch で囲み、cleanup 失敗を warning に降格する。state は既に archived なので cleanup 失敗は致命的ではない。

Phase 4 内の個別保護:
- L265 `updateJobState(... worktreePath: null)`: try-catch で保護、stderr warning
- git checkout/pull: 既存の `spawnOrEscalate` を使うが、失敗時は escalation ではなく warning に変更
- branch 削除: 変更なし（既に best-effort）

Phase 4 の戻り値を常に `{ ok: true }` にする（cleanup 失敗でも finish 成功）。

### D3: assertJobFinishable の canTransition 化

```typescript
import { canTransition } from "../../state/lifecycle.js";

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

### D4: markJobArchived の transitionJob 化

```typescript
import { transitionJob } from "../../state/lifecycle.js";

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

## テスト影響

### 修正が必要なテスト

| TC | 現在の期待 | 修正後の期待 |
|----|----------|-------------|
| TC-124 | markJobArchived が git pull の後 | markJobArchived が Phase 3 の後（Phase 4 の前） |
| TC-WT-FIN-003 | worktree remove の後に markJobArchived | markJobArchived が Phase 4 の前 |

### 追加テスト

| TC | 内容 |
|----|------|
| TC-FIN-P4-FAIL-001 | Phase 4 worktree remove 失敗 → state=archived（exit 0） |
| TC-FIN-P4-FAIL-002 | Phase 4 updateJobState(worktreePath: null) 失敗 → state=archived（exit 0） |

### 影響なしのテスト

- TC-123, TC-103, TC-106, TC-122: markJobArchived の呼び出し有無ではなく exit code を検証 → 影響なし
- TC-125: Phase 1 失敗 → markJobArchived 呼ばれない → 変更なし（Phase 3 に到達しないため）
- TC-126: archived no-op → TERMINAL_STATUSES check で早期 return → 変更なし
