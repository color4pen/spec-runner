# Code Review — pipeline-transition-migration — Iteration 1

- **reviewer**: code-reviewer
- **date**: 2026-05-09
- **verdict**: needs-fix

## Summary

`transitionJob` / `appendHistoryEntry` への移行は大部分で正しく実行されている。全 1471 テスト PASS、型チェック green。ただし pipeline.ts L280-289 に `status: "awaiting-resume"` の直接代入が 1 箇所残っており、受け入れ基準「pipeline.ts に `state.status = "..."` の直接代入が存在しない」に違反している。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/core/pipeline/pipeline.ts:282 | `failed → awaiting-resume` の escalation fallback パスで `status: "awaiting-resume"` を直接代入している。受け入れ基準「pipeline.ts に `state.status = "..."` の直接代入が存在しない」に違反。`VALID_TRANSITIONS` が `failed → awaiting-resume` を許可しないため `transitionJob` を使えないという制約が根本原因 | `src/state/lifecycle.ts` の `VALID_TRANSITIONS` で `failed` の遷移先に `"awaiting-resume"` を追加し、L269-289 の分岐を `transitionJob` 一本に統一する。lifecycle.test.ts にも `failed → awaiting-resume` の valid transition テストを追加する |
| 2 | MEDIUM | architecture | src/core/pipeline/pipeline.ts:269-289 | escalation ブロックが `state.status === "running"` と `else`（実質 `failed`）で分岐し、running は `transitionJob`、failed は直接代入と 2 つの遷移パスが混在している。移行の目的（遷移バリデーション一元化）が部分的に達成されていない | Finding #1 の修正で解消される。`VALID_TRANSITIONS` 拡張後は `transitionJob` 一本で済むため、if/else 分岐自体が不要になる |
| 3 | LOW | maintainability | src/core/pipeline/pipeline.ts:270-273 | `failed → awaiting-resume is not in VALID_TRANSITIONS` のコメントが 4 行あり、実装の制約を丁寧に説明しているが、Finding #1 の修正後は不要になる | `VALID_TRANSITIONS` 拡張後にコメントを削除する |

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 6 | 動作は正しい（全テスト PASS）が、受け入れ基準の明示的な条件を 1 箇所違反 |
| security | 8 | セキュリティ関連の変更なし |
| architecture | 7 | `transitionJob` 一元化の設計方針は適切。failed fallback の分岐が唯一の例外 |
| performance | 8 | パフォーマンスへの影響なし |
| maintainability | 7 | コードは明確で意図が読める。コメントで制約を説明している |
| testing | 7 | 既存 1471 テスト全 PASS。must TC の大部分は既存テストでカバー |

**Total**: 6×0.30 + 8×0.25 + 7×0.15 + 8×0.10 + 7×0.10 + 7×0.10 = 1.80 + 2.00 + 1.05 + 0.80 + 0.70 + 0.70 = **7.05**

**Verdict: needs-fix** (HIGH finding #1: 受け入れ基準違反)

## Scenario Coverage (test-cases.md)

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-01 | must | covered | appendHistoryEntry の MAX_HISTORY_SIZE は schema.ts の既存テストでカバー |
| TC-02 | must | covered | pipeline.test.ts の loop bookkeeping テストで検証 |
| TC-03 | must | covered | 同上 |
| TC-06 | must | covered | pipeline.test.ts の end 条件テスト |
| TC-07 | must | covered | transitionJob が自動追記（lifecycle.test.ts） |
| TC-09 | must | covered | pipeline.test.ts の catch block テスト |
| TC-10 | must | covered | 同上 |
| TC-11 | must | covered | 同上 |
| TC-13 | must | covered | pipeline.test.ts の escalation テスト |
| TC-14 | must | covered | 同上 |
| TC-15 | must | covered | FATAL_ERROR_CODES テスト |
| TC-17 | must | covered | handleExhausted テスト |
| TC-18 | must | covered | 同上 |
| TC-19 | must | covered | 同上 |
| TC-20 | must | covered | 同上 |
| TC-23 | must | covered | executor timeout テスト |
| TC-24 | must | covered | 同上 |
| TC-25 | must | covered | 同上 |
| TC-27 | must | **FAIL** | L282 に `status: "awaiting-resume"` 直接代入が残存 |
| TC-28 | must | covered | `history: [...state.history` のスプレッドは 0 箇所 |
| TC-29 | must | covered | 1471 テスト全 PASS |
| TC-30 | must | covered | typecheck green |
| TC-31 | must | covered | lifecycle.test.ts で検証 |
| TC-33 | must | covered | lifecycle.test.ts で検証 |

## Recommended Fix

```typescript
// src/state/lifecycle.ts — VALID_TRANSITIONS の failed 行を修正
["failed", new Set(["running", "canceled", "awaiting-resume"])],
```

これにより pipeline.ts L254-292 の escalation ブロックを以下に簡素化できる:

```typescript
if (nextStep === "escalate" && (state.status !== "failed" || !FATAL_ERROR_CODES.has(state.error?.code ?? ""))) {
  const { state: escalateState } = transitionJob(state, "awaiting-resume", {
    trigger: "pipeline",
    reason: state.error?.message ?? `${currentStep} escalated`,
    patch: {
      resumePoint: {
        step: currentStep as StepName,
        reason: state.error?.message ?? `${currentStep} escalated`,
        iterationsExhausted: loopIters.get(currentStep) ?? 0,
      },
    },
  });
  state = escalateState;
  const escalateStore = new JobStateStore(state.jobId);
  await escalateStore.persist(state);
}
```
