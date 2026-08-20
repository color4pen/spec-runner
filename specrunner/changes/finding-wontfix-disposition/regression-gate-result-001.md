# Regression Gate Result — finding-wontfix-disposition iteration 1

## Evidence

### [HIGH] T-01: DecisionRecord.selectedOption 非 narrowing 参照の修正対象ファイル

**Verdict**: FIXED — no regression.

- `tasks.md` T-01 lines 15–22: 両ファイルを明示列挙済み。
- `src/core/step/custom-reviewer-round-context.ts:198–199`: `.filter((d) => d.kind !== "disposition")` が挿入されており disposition arm を除外してから map する実装になっている。
- `src/core/design-layer/topic-emission.ts:180`: `if (matchedDecision && "selectedOption" in matchedDecision)` の narrowing guard が追加されており、disposition record が返った場合にクラッシュしない。

### [MEDIUM] T-02: 同一 step の複数 StepRun から生成するレコード数の定義

**Verdict**: FIXED — no regression.

- `tasks.md` T-02 lines 43–45: 「ただし **record 生成はステップ単位**で行う: 同一 step 名を持つ複数の StepRun が同一 fingerprint を報告していても、その step につき 1 record のみ生成する（最初に見つかった StepRun の finding を代表値として使用）」と明記済み。
- `src/core/decision/wontfix.ts:104–107`: `if (!stepMap.has(stepName)) { stepMap.set(stepName, f); }` でステップ単位 dedup が実装されている。

### [LOW] getLatestJudgeFindings が decision-needed findings も返す点

**Verdict**: FIXED — no regression.

- `spec.md` 「解決不能な --wontfix」要件の直後に Note を追加済み: decision-needed findings が --wontfix 対象外であること、fingerprint が reviewerChain に一致せず exit 2 になることを明記。

### [LOW] spec.md が重複インデックスをエラー条件として定義していない

**Verdict**: FIXED — no regression.

- `spec.md` 「解決不能な --wontfix は exit code 2 で停止し decisions を変更しない」要件の SHALL 節に "the number list contains empty elements or duplicate indices" が列挙されている。
- `src/core/decision/wontfix.ts:60–62`: 重複検出ロジック（`if (indices.includes(n))`）も実装済み。

### [MEDIUM] `approved + fixable → code-fixer` 遷移ガード

**Verdict**: FIXED — no regression.

- `src/core/pipeline/reviewer-chain.ts:178–181` (`buildReviewerChainTransitions`): `when` ガードが `filterUndecidedFindings(reviewer, fixable, s.decisions)` で active findings を算出してから `active.length > 0` を返す実装になっている。
- `src/core/pipeline/reviewer-chain.ts:364–369` (`buildParallelReviewerTransitions`): 同様に `filterUndecidedFindings(STEP_NAMES.CODE_REVIEW, fixable, s.decisions)` を使用。
- wontfix 済み finding のみを持つ reviewer が approved を返した場合、code-fixer は起動しない。

## Summary

Checked: 5 / Regressions: 0
