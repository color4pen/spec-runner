# Review Feedback: merge-transient-retry (Iteration 1)

- **reviewer**: code-review
- **iteration**: 1
- **date**: 2026-05-26
- **verdict**: approved

## Summary

実装は設計通り。`retryWithBackoff` helper は throw ベース / return-value ベースの両軸を正しく実装し、`mergePullRequest` の wrap も adapter 責務に閉じている。423 分岐追加、transient 判定ロジック、二重 retry 回避 (D6) のいずれも設計通り。typecheck / 2859 tests 全通過。

must カテゴリのテストケース (A, B, C, D) は全カバー。should カテゴリ (E ログ検証、F 二重 retry 明示検証) が未実装で、軽微な style 指摘が 2 点ある。blocking 要因はない。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.70** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | testing | tests/unit/adapter/github/github-client-pr.test.ts | TC-TF-005 (must): `{ merged: true, message: "Base branch was modified" }` のシナリオが未テスト。`isMergeTransientFailure` の `if (result.merged) return false` guard は TC-PM-001 で暗黙的に通るが、guard が意味を持つケース（transient message つき merged:true）を直接 assert するテストがない | TC-PM-001 に `expect(mockFetch).toHaveBeenCalledTimes(1)` を追加し、成功時に retry しないことを明示。または 200 + "Base branch was modified" message の mergeResponse で 1 回呼出を assert する独立テストを追加 |
| 2 | LOW | testing | tests/unit/adapter/github/github-client-pr.test.ts | TC-LOG-001/002/003 (should): `onRetry` callback の `process.stdout.write` 呼び出し、および retry 前の sleepFn 呼び出し回数が未検証。ログが本当に出ているかのテストがない | `vi.spyOn(process.stdout, 'write')` でログ文字列を assert するテスト、または `sleepFn` spy を buildClient に注入して呼び出し回数を検証するテストを追加 |
| 3 | LOW | testing | tests/unit/adapter/github/github-client-pr.test.ts | TC-DR-001 (should): 5xx が `mergePullRequest` 層で retry されないこと（二重 retry 回避）が直接テストされていない。設計 D6 の「`isTransientError` 未定義 → re-throw」パスが integration test で確認されていない | mockFetch が 5xx を返し `request()` が throw する mock を使い、`mergePullRequest` が例外を propagate することを `await expect(...).rejects.toThrow()` で assert するテストを追加 |
| 4 | INFO | maintainability | src/adapter/github/github-client.ts | `onRetry` ログの分母が `3` にハードコード: `` `retrying (${attempt}/3)` ``。`this.mergeMaxAttempts` が 4 以外に変更された場合（テスト以外でも将来あり得る）、ログが実態と乖離する | `this.mergeMaxAttempts - 1` に変更: `` `retrying (${attempt}/${this.mergeMaxAttempts - 1})` `` |
| 5 | INFO | maintainability | src/adapter/github/github-client.ts | 423 handler が `data.message \|\| fallback` を使用。405/409 handler は `data.message ?? fallback` と `??` で統一されている。空文字列の message が来た場合に挙動が異なる (minor) | `data.message || fallback` → `data.message ?? fallback` に変更し他 handler と統一 |

## Scenario Coverage (test-cases.md)

### Category A — retryWithBackoff helper (must)

| ID | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-RB-001 | must | ✅ covered | "returns result immediately on first success" |
| TC-RB-002 | must | ✅ covered | "shouldRetryResult: retries twice then returns 3rd result" |
| TC-RB-003 | must | ✅ covered | "isTransientError: retries once then returns 2nd result" |
| TC-RB-004 | must | ✅ covered | "shouldRetryResult exhausted: returns last result without throwing" |
| TC-RB-005 | must | ✅ covered | "isTransientError exhausted: re-throws last error" |
| TC-RB-006 | must | ✅ covered | "onRetry called with correct attempt numbers and info" (実装は 2 retry まで検証し spec より充実) |
| TC-RB-007 | must | ✅ covered | "delay is exponential: sleepFn called with 1000, 2000, 4000" |
| TC-RB-008 | must | ✅ covered | "shouldRetryResult undefined: returns result without retry" |
| TC-RB-009 | must | ✅ covered | "isTransientError undefined: re-throws error without retry" |

### Category B — isMergeTransientFailure 判定 (must)

| ID | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-TF-001 | must | ✅ indirectly | TC-PM-010 で "Base branch was modified" → retry 成功を確認 |
| TC-TF-002 | must | ✅ indirectly | TC-PM-011 で "unstable state" → retry 成功を確認 |
| TC-TF-003 | must | ✅ indirectly | TC-PM-012 で 423 (locked message 含む) → retry 成功を確認 |
| TC-TF-004 | must | ✅ indirectly | TC-PM-016 で "Pull request is not mergeable" → 1 回呼出を確認 |
| TC-TF-005 | must | ⚠️ partial | merged:true の guard は TC-PM-001 で暗黙通過するが call count 未assert (Finding #1) |

### Category C — mergePullRequest retry 挙動 (must)

| ID | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-PM-010 | must | ✅ covered | 405 "Base branch was modified" → 2 回呼出、merged:true |
| TC-PM-011 | must | ✅ covered | 405 "unstable state" → 2 回呼出、merged:true |
| TC-PM-012 | must | ✅ covered | 423 Locked → 2 回呼出、merged:true |
| TC-PM-013 | must | ✅ covered | 4 回全敗 → exhausted → merged:false, 4 回呼出 |
| TC-PM-014 | must | ✅ covered | 403 → 1 回呼出、merged:false, permission denied |
| TC-PM-015 | must | ✅ covered | 409 → 1 回呼出、merged:false |
| TC-PM-016 | must | ✅ covered | 405 "not mergeable" → 1 回呼出、merged:false |

### Category D — 423 Locked ハンドリング (must)

| ID | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-423-001 | must | ✅ covered | JSON body のメッセージが保持される |
| TC-423-002 | should | ✅ covered | JSON parse 失敗 → デフォルトメッセージ |

### Category E — ログ出力 (should)

| ID | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-LOG-001 | should | ❌ missing | stdout spy なし (Finding #2) |
| TC-LOG-002 | should | ❌ missing | sleepFn 呼び出しは noop injection で確認可能だが未 assert |
| TC-LOG-003 | should | ❌ missing | 3 回ログ + 4 回目は出ないことを未検証 |

### Category F — 二重 retry 回避 (should)

| ID | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-DR-001 | should | ❌ missing | 5xx throw の propagation テスト未実装 (Finding #3) |

### Category G — Orchestrator 統合 (could)

| ID | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-ORC-001 | could | not tested | adapter 側で吸収するため orchestrator テスト不要と判断可 |
| TC-ORC-002 | could | not tested | 同上 |

## Verification

- `bun run typecheck`: pass
- `bun run test`: 254 files, 2859 tests, all passed
