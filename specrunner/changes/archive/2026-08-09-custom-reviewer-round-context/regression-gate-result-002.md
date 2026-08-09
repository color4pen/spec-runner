# Regression Gate Result — Iteration 2

## Summary

7 findings verified. All 7 are fixed in the current code. No regressions detected.

## Finding Verification

### F-1 [MEDIUM] T-05 の persist 挿入点が曖昧で最初の 'running' persist が裁定を含まない可能性
**File**: src/core/command/resume.ts:232
**Status**: FIXED

`resume.ts` lines 238-261: `transitioned` を取得した直後に `stateToWrite` を算出し、
`this.options.prompt` が非空なら `appendOperatorAdjudication(transitioned, {...})` を適用。
worktree / no-worktree 両 path とも `persist(stateToWrite)` を使用。`updatedState = stateToWrite`。
最初の running 遷移 persist が裁定込みの state を 1 回にまとめて書き出す設計になっている。

---

### F-2 [MEDIUM] operator 自由記述の XML 特殊文字エスケープが設計に未定義
**File**: src/core/step/custom-reviewer-round-context.ts
**Status**: FIXED

`design.md` Risks セクションに「operator 自由記述に XML 特殊文字（`<`、`>`、`&`）が含まれると
ブロック境界が破壊される」リスクと `escapeXml` による mitigation が追記されている（lines 175-178）。
実装側の `escapeXml` helper（lines 54-59）も存在し、`buildOperatorAdjudicationBlock` が
すべての自由記述フィールドに適用している。

---

### F-3 [LOW] decisions projection で resumeComment 除外理由が tasks.md に未記載
**File**: specrunner/changes/custom-reviewer-round-context/tasks.md
**Status**: FIXED

`tasks.md` T-03 の `deriveOperatorAdjudicationContext` 記述に「`DecisionRecord.resumeComment` は
projection に含めない（`operatorAdjudications[*].text` と内容が重複するため除外。operator の
裁定文は `text` field 経由で注入される）」が明記されている（lines 58-59）。

---

### F-4 [LOW] iteration 1 かつ非空 decisions での裁定 block 注入を確認するシナリオが欠落
**File**: specrunner/changes/custom-reviewer-round-context/spec.md
**Status**: FIXED

`spec.md` に「#### Scenario: iteration 1 かつ decisions が存在するとき前周 context block は
注入されないが裁定 block は注入される」が追加されている（lines 87-93）。

---

### F-5 [LOW] appendOperatorAdjudication のシグネチャが appendSynthesizedCommit と不一致
**File**: src/state/schema/operations.ts:52
**Status**: FIXED

`operations.ts` lines 52-58:
```ts
export function appendOperatorAdjudication(
  state: JobState,
  record: OperatorAdjudication,
): JobState {
```
`appendSynthesizedCommit(state: JobState, oid: string): JobState` と同型。
`resume.ts` 側に `as JobState` キャストは不要となっている。

---

### F-6 [MEDIUM] buildOperatorAdjudicationBlock が DecisionRecord フィールドを null ガードなしで escapeXml に渡す
**File**: src/core/step/custom-reviewer-round-context.ts:160
**Status**: FIXED

`deriveOperatorAdjudicationContext` lines 198-205:
```ts
const decisions = (state.decisions ?? []).map((d) => ({
  step: d.step ?? "",
  title: d.finding.title ?? "",
  file: d.finding.file ?? "",
  selectedOption: d.selectedOption.label ?? "",
  consequence: d.selectedOption.consequence ?? "",
  rationale: d.finding.rationale ?? "",
}));
```
全フィールドに `?? ""` フォールバックが付与されており、undefined が `escapeXml` に到達しない。

---

### F-7 [MEDIUM] decisions[i].step lacks ?? "" null guard — incomplete F-001 fix
**File**: src/core/step/custom-reviewer-round-context.ts:199
**Status**: FIXED

line 199 に `step: d.step ?? "",` が存在する（F-6 の修正に含まれている）。
undefined が `escapeXml` に到達する経路はない。

---

## Evidence

- Checked: 7 findings
- Skipped: 0
- Unverified: 0
