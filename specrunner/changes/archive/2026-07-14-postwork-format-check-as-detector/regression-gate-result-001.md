# Regression Gate Result — iteration 001

- **verdict**: approved
- **iteration**: 001

## Ledger Verification

### [HIGH] managed runDesignStyle に outputVerification ループがなく、content-format/follow-up 契約が事実上 halt に縮退する

**Source**: cross-boundary-invariants (iteration 001)
**Fix claimed**: runDesignStyle の postWorkPrompts ループ直後に outputVerification ループを追加

**Verification result**: ✅ Fix is present.

`src/adapter/managed-agent/agent-runner.ts` L271–297 に `outputVerification` ループが存在する:

```typescript
// Output verification follow-up loop (D3: step-completion-verification).
// Runs after postWorkPrompts, only when outputVerification is configured.
const outputVerif = ctx.policy?.outputVerification;
if (outputVerif) {
  for (let attempt = 1; attempt <= outputVerif.maxAttempts; attempt++) {
    // detect → filter follow-up → executeFollowUpTurn
  }
}
```

構造は `runPollingStyle`（L534–558）と対称。`policy: "follow-up"` セマンティクスが local / managed 両 path で成立している。

---

### [LOW] content-format repair prompt の「Do not use tool calls to submit results」が曖昧

**Source**: code-review (iteration 001)
**Fix status**: `Fix: no`（code-review の verdict が `approved`、code-fixer が LOW ポリシーでスキップ）

**Verification result**: ✅ 承認済み状態から後退なし。

- `src/core/step/output-verify.ts` L182 の文言は `"Do not use tool calls to submit results."` のまま（approved 時点と同一）。
- `Fix: no` の決定に従い変更は行われていない。意図どおりの最終状態。
- 対応する不変条件テスト（`tests/unit/step/output-verify.test.ts` L414）が `report_result` の非包含を固定しており、リスクは封じられている:
  ```typescript
  expect(prompt.toLowerCase()).not.toContain("report_result");
  ```

---

## Summary

2 件の ledger finding を検証した。

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | HIGH | managed runDesignStyle に outputVerification ループがない | ✅ Fix present |
| 2 | LOW | repair prompt 文言が曖昧 | ✅ Fix: no（承認済み状態から後退なし） |

リグレッションなし。verdict: **approved**
