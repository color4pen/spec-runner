# Code Review Feedback — cli-step-observable-progress — iter 2

## Meta

- **date**: 2026-05-17
- **reviewer**: code-review agent (iteration 2)
- **verdict**: approved

---

## Summary

review-001 の [high] × 1 / [medium] × 2 の必須修正がすべて対処されている。  
TC-C02 (fixer exhaustion L330 パス)、TC-A06 (code-review escalation)、TC-B03/B06 (dsv needs-fix / pr-create error) の各テストが正しく追加・通過している。  
[low] の redundant double guard (L164) は引き続き未対処だが、機能的正確性に影響しないため承認とする。

---

## Findings

### [nit] pipeline.ts L164: `if (isAnyLoopStep)` の二重ガードが依然として残存

**該当**: `src/core/pipeline/pipeline.ts` L159, L164

```typescript
if (isAnyLoopStep) {           // L159: outer guard
  const prevIter = loopIters.get(currentStep) ?? 0;
  const newIter = prevIter + 1;
  loopIters.set(currentStep, newIter);

  if (isAnyLoopStep) {         // L164: 常に true — dead code
    const loopIter = newIter;
    stdoutWrite(`[iter ${loopIter}/${this.maxIterations}] starting ${currentStep}\n`);
  }
  ...
}
```

review-001 [low] で指摘済み。外側 if 内では `isAnyLoopStep` は常に true のため、内側 if は不要な dead code。  
機能的に正しく、マージを阻害しない。後続 PR で整理推奨。

---

## Positive Observations

- **TC-C02 追加**: `pipeline.loop-iter-stdout.test.ts` に describe "TC-C02: fixer exhaustion stdout uses review name not fixer name (L330 path)" が追加された。`spec-review` が needs-fix を返し続けて `maxIterations=2` に達するシナリオで `retries exhausted on spec-review` を assert し、`retries exhausted on spec-fixer` でないことも確認している。L330 パスの正確性保証として十分。
- **TC-A06 追加**: TC-L04 の第 3 it block で `code-review verdict: escalation → halt` が stdout に含まれることを assert している。
- **TC-B03 / TC-B06 追加**: `pipeline.cli-step-output.test.ts` に dsv needs-fix 完了表示・pr-create error 完了表示のテストが追加された。
- **test-cases.md の must 項目を全カバー**: TC-A01〜A06 / TC-B01〜B09 / TC-C01〜C03 / TC-D01 / TC-E01〜E02 / TC-F01〜F02 / TC-G01〜G04 のうち must 指定はすべて新規または更新済みテストでカバー。
- **実装コードの正確性**: L304 が `nextStep` を参照し、L330 が `exhaustedLoopName`（pairedReview lookup 結果）を参照する区別は維持されている。
- **TC-L04 の verification needs-fix テスト**: `expect(stdout).not.toContain("spec-review verdict: needs-fix → spawning fixer")` で old behavior (this.loopName リテラル) の退行を明示的に除外している。
- **spec.md 更新**: 「Pipeline Emits Iteration Progress to Stdout」および「Pipeline Emits Step Progress for Non-Loop CliSteps」の両 Requirement が仕様権威に反映されており spec authority として機能する。
- **verification-result (iter 1)**: 168 files, 2015 tests green / build + typecheck green。

---

- **verdict**: approved
