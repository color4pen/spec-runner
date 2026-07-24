# Regression Gate Result — Iteration 1

## Evidence Summary

checked: 2 / skipped: 0 / unverified: 0

---

## Finding 1: StepOutcome.commitOid は参照されない dead スキーマフィールド

**File**: src/state/schema/types.ts:173  
**Ledger resolution**: fixable  
**Status**: REGRESSION (not fixed)

### Verification

`src/state/schema/types.ts:173` を確認:

```typescript
/**
 * Commit OID captured at the time this outcome was recorded.
 * Alternative storage site for commitOid (also available at StepRun level).
 * Added in spec-review-full-enumeration to support test construction patterns
 * where outcome and commitOid are set together.
 */
commitOid?: string;
```

フィールドは現在も `StepOutcome` に存在する。

Production コード全体で `outcome.commitOid` / `outcome?.commitOid` を grep した結果、ヒットゼロ。`commit-orchestrator.ts:278` が読む priorOid 解決は `stepRuns[n-2]?.commitOid`（`StepRun` トップレベル）であり、`StepOutcome.commitOid` は読まれていない。

### Root cause

code-fixer は events.jsonl において「全 finding が LOW severity のため修正対象なし。指示通り LOW は無視」と自己申告し、コード変更を行わなかった。コード変更なし = 修正されていない。

---

## Finding 2: TC-022 — priorStepRun.outcome.commitOid を設定しているが orchestrator は stepRun.commitOid（トップレベル）を読む

**File**: tests/unit/core/step/spec-review-scope-exclusion.test.ts:147  
**Ledger resolution**: fixable  
**Status**: REGRESSION (not fixed)

### Verification

`buildIteration2State()` の `priorStepRun` 構築（line 143–154）:

```typescript
const priorStepRun: StepRun = {
  attempt: 1,
  sessionId: null,
  outcome: {
    verdict: "needs-fix",
    findingsPath: null,
    error: null,
    commitOid: PRIOR_COMMIT_OID,   // ← outcome 配下 (line 150)
  },
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:05:00.000Z",
  // トップレベル commitOid は未設定
};
```

`commit-orchestrator.ts:278`:
```typescript
const priorOid = stepRuns[stepRuns.length - 2]?.commitOid ?? null;
```

`stepRuns[0].commitOid` はトップレベルフィールドを参照するため、上記テスト構築では `undefined → null` になる。`recordFindingRecency` がモックされているためテストは通過するが、オーケストレーターが `PRIOR_COMMIT_OID` を `priorOid` として渡す経路は検証されていない。

提示された修正案（トップレベルに `commitOid: PRIOR_COMMIT_OID` を移し、呼び出し params の `priorOid` をアサートする）は適用されていない。

---

## Pipeline trace

- `code-review` (commit `7db68b5f`) → `approved` with 2 LOW findings
- `code-fixer` (commit `890bcb5d`) → コード変更なし（events.jsonl: "全 finding が LOW severity のため修正対象なし"）
- 両 finding はコード変更を受けていない
