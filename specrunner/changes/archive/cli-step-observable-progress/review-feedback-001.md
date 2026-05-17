# Code Review Feedback — cli-step-observable-progress — iter 1

## Meta

- **date**: 2026-05-17
- **reviewer**: code-review agent (iteration 1)
- **verdict**: needs-fix

---

## Summary

コア実装は正しく動作しており、2015 テストがすべて pass している。  
ただし test-cases.md で "must" と指定された 4 シナリオが新規テストでカバーされていない。  
うち TC-C02（fixer exhaustion パス）は request.md が明示的に「currentStep との取り違えを確認せよ」と記述した正確性保証であり、優先度が高い。  
コード品質面では `if (isAnyLoopStep)` の二重ガードが dead code として残っている。

---

## Findings

### [high] TC-C02 (must): fixer exhaustion で review 名が出ることを検証するテストが存在しない

**該当**: `tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts` / `pipeline.cli-step-output.test.ts`（新規テストファイル）  
**test-cases.md**: TC-C02 Priority=must

request.md 要件 3 に「L330 は `exhaustedLoopName` を使い `currentStep` と取り違えていない」と明示されている。  
実装は正しい（L340-344）：

```typescript
const pairedReview = Object.entries(this.loopFixerPairs)
  .find(([_, fixer]) => fixer === nextStep)?.[0];
const exhaustedLoopName = pairedReview ?? (nextStep as string);
stdoutWrite(`[iter ...] retries exhausted on ${exhaustedLoopName}, escalating\n`);
```

しかし「fixer が exhausted したとき stdout が fixer 名ではなく review 名を含む」ことを検証する専用テストがない。  
TC-029・TC-016・TC-063 は conventional exhaustion（L304 パス、spec-review が exhaust するケース）のみを更新しており、fixer exhaustion（L330 パス）はカバーされていない。

**必要な対処**: `pipeline.loop-iter-stdout.test.ts` に以下を追加する。
- Pipeline を `loopFixerPairs: { "spec-review": "spec-fixer" }` で構成
- spec-review が needs-fix を返し続け、fixer iteration が `maxIterations` に達した場合
- stdout に `retries exhausted on spec-review, escalating` が含まれる（= fixer 名 `spec-fixer` ではない）

---

### [medium] TC-A06 (must): code-review escalation → halt のテストが存在しない

**該当**: `tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts`  
**test-cases.md**: TC-A06 Priority=must

TC-L04 は spec-review approved / spec-review needs-fix / verification needs-fix をカバーするが、  
`code-review verdict: escalation → halt` を検証するケースがない。  
実装コードは L254-259 で `isAnyLoopStep && (outcome === "escalation" || outcome === "error")` をチェックしており正しいが、  
TC-A06 は「code-review が escalation を返したとき `code-review verdict: escalation → halt` が stdout に含まれる」という "must" シナリオ。

**必要な対処**: TC-L04 に sub-test を追加し、code-review が escalation を返したとき `code-review verdict: escalation → halt` が stdout に含まれることを assert する。

---

### [medium] TC-B03 / TC-B06 (must): dsv needs-fix / pr-create error の完了表示がテストされていない

**該当**: `tests/unit/core/pipeline/pipeline.cli-step-output.test.ts`  
**test-cases.md**: TC-B03, TC-B06 Priority=must

- TC-S02 は dsv approved をテストするが、dsv needs-fix（TC-B03）は未カバー
- TC-S04 は pr-create success をテストするが、pr-create error（TC-B06）は未カバー

コードは `stdoutWrite(`[step] ${currentStep}: ${stepVerdict}\n`)` と verdict を汎用的に出力するため正確性リスクは低い。  
ただし test-cases.md では両方とも "must" とマークされており、エラーパスの動作保証として必要。

**必要な対処**:
- `stateWithVerdict(state, "delta-spec-validation", "needs-fix")` を使い `[step] delta-spec-validation: needs-fix` を assert する TC を追加
- `stateWithVerdict(state, "pr-create", "error")` を使い `[step] pr-create: error` を assert する TC を追加

---

### [low] pipeline.ts L159/L164: `if (isAnyLoopStep)` の二重ガードが dead code

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

外側の `if (isAnyLoopStep)` ブロック内では `isAnyLoopStep` は常に true であるため、内側の `if` は不要。  
tasks.md 1.1 の diff では内側ガードのみを `isLoopStep` → `isAnyLoopStep` に置換することを意図していたが、  
外側も同時に変更されたため二重になった。機能的には正しいが、読み手に混乱を与える。

**推奨対処**: 内側の `if (isAnyLoopStep) {` を削除し、`const loopIter = newIter;` と `stdoutWrite(...)` を outer block に直接移動する。

---

## Positive Observations

- コア実装は正確: `isAnyLoopStep` が全 loopNames step に拡大され、verification / code-review でも `[iter N/M]` が出る
- L304 は `nextStep` を使い、L330 は `exhaustedLoopName` を使う区別が正しく実装されている
- `prevLoopStep = isLoopStep ? currentStep : ""` (L375) は primary loop のみに維持されており意図通り
- 最終サマリ `Pipeline finished: spec-review iterations=N` は `STEP_NAMES.SPEC_REVIEW` に紐づけられており維持されている
- spec.md に両 Requirement が明記されており spec authority として機能する
- `isNonLoopCliStep = step.kind === "cli" && !isAnyLoopStep` は clean で正確
- verification-result: 168 files, 2015 tests 全 pass / build + typecheck green

---

## Required Actions (needs-fix)

1. **[high]** TC-C02: fixer exhaustion パス (L330) のテストを追加し、stdout が `retries exhausted on <review-name>` であって fixer 名でないことを検証
2. **[medium]** TC-A06: code-review escalation → halt のテストを TC-L04 に追加
3. **[medium]** TC-B03 / TC-B06: dsv needs-fix / pr-create error 完了表示テストを追加
4. **[low]** pipeline.ts L164 の冗長な `if (isAnyLoopStep)` を削除してコードを整理

- **verdict**: needs-fix
