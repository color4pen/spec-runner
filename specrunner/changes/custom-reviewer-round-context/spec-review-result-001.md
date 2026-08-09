# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 仕様の整合性
- request.md の要件 1〜4 と design.md の D1〜D8 決定の対応関係
- spec.md の 4 Requirement × Scenario が要件を網羅しているか（GWT 形式、MUST/SHALL NOT keyword 確認）
- tasks.md の T-01〜T-06 が仕様を実装可能な単位に分解できているか
- 既存コードベースとの整合性：
  - `spec-review.ts`・`adr-gen.ts` の `prepareRoundContext` 実装パターン
  - `post-fix-context.ts` の `resolveCodeFixerRounds`（`{commitOid, endedAt}[]` 型、endedAt フィルタへの利用可能性）
  - `fixer-helpers.ts` の `getLatestJudgeFindings`（`state.steps[stepName]` 末尾 run の findings 返却セマンティクス）
  - `step-context-builder.ts` の seam（`if (step.prepareRoundContext && dynamicContext)` ガード）
  - `parallel-review-round.ts` → `executor.produceResult` → `buildStepContext` 経由での seam 到達可能性
- `resume.ts` `prepare()` の persist 経路（lines 228–254）と T-05 の挿入点記述の整合性
- `DynamicContext` 拡張型（inline structural type、cross-layer import なし）のパターン適合性
- `validateJobState` の backward compat 設計パターン（`reviewerStatuses`・`biteEvidence` と同型の軽量検証）
- セキュリティ：operator 自由記述の XML ブロック境界に対する prompt injection リスク
- `DecisionRecord` の型構造（`finding.title/file/rationale`、`selectedOption.label/consequence`）が T-03 projection と一致するか
- `nextIteration` の動作（past execution count + 1）と `prepareRoundContext` 呼び出し時点の state との整合性

### spec.md 記法確認
- 各 Requirement に `SHALL` または `MUST` keyword が存在することを確認
- 各 Requirement に GWT Scenario が 1 件以上存在することを確認
- Layer-1 振る舞いが記述されているか（型・FSM が強制する Layer-0 は含まれていないか）

## 検証できなかった項目

- `stateToStateJson` 相当のシリアライズ経路の直接確認（該当ファイルは読んでいない）。`validateJobState` が `raw as JobState` を返すパターンから `operatorAdjudications` の JSON round-trip 互換性は推定可能だが、event-journal 経路での取り扱いは未確認。
- managed runtime 環境での end-to-end 動作（`listCommitChangedFiles` が unavailable を返す経路）はテスト環境での確認が必要。
- `composeSplitLayoutFromContent` と event-journal threading 経路での `operatorAdjudications` 取り扱い（コードは読んでいない）。

## Findings 詳細

### Finding 1: T-05 の persist 挿入点が曖昧で最初の "running" persist が裁定を含まない可能性がある

**severity**: medium  
**resolution**: fixable  
**file**: `src/core/command/resume.ts`  
**line**: 232

resume.ts の構造は次の通りである（lines 232–250）:

```
const { state: transitioned } = transitionJob(...);
if (this.options.noWorktree) {
  await noWorktreeStore.persist(transitioned);  // ← ここで persist 完了
} else {
  if (runStore) await runStore.persist(transitioned);  // ← ここで persist 完了
}
updatedState = transitioned;  // ← persist の後で代入
```

T-05 は「running 遷移直後（`updatedState = transitioned` 付近）に append を適用し `updatedState` を更新する」と記述するが、"running" 遷移の persist は `updatedState = transitioned` より前の行にある。`updatedState = transitioned` の後に append を行った場合、後続の apply-canon / adopt-commits persist（`runStore.persist(updatedState)` を使う）には裁定が含まれるが、最初の "running" 遷移 persist（`persist(transitioned)` を使う）は裁定を含まない。

T-05 の意図「append を persist の前に行う・裁定込みで 1 回にまとめる」を正しく実装するには:
1. `transitionJob()` の戻り値に対して即座に `appendOperatorAdjudication` を適用する
2. 修正済み state を `persist()` に渡す

```ts
let finalState = transitioned;
if (this.options.prompt) {
  finalState = appendOperatorAdjudication(finalState, {
    text: this.options.prompt, step: startStep, recordedAt: new Date().toISOString(),
  });
}
// 両 path で finalState を persist
updatedState = finalState;
```

T-05 の記述を上記のように明確化し、no-worktree path（`noWorktreeStore.persist(transitioned)`）にも同じ修正を適用することを確認する必要がある。

---

### Finding 2: operator 自由記述の XML 特殊文字エスケープが設計に未定義

**severity**: medium  
**resolution**: fixable  
**file**: `src/core/step/custom-reviewer-round-context.ts`（新設予定、設計段階）

`buildOperatorAdjudicationBlock` は `operatorAdjudications[*].text`（`--prompt` 由来の自由記述）を `<operator-adjudication>` XML タグ内に verbatim で埋め込む設計である。design.md は「XML block（`<operator-adjudication>`）で明示ラベル」をセキュリティ緩和策として挙げるが、XML 特殊文字のエスケープ（`<` → `&lt;`、`>` → `&gt;`、`&` → `&amp;`）については言及がない。

operator が信頼された実行者であっても、`--prompt` に `</operator-adjudication>` を含む文字列が渡されると XML ブロック境界が破壊され、reviewer がコンテキストと指示の境界を誤認するリスクがある（間接注入シナリオ：operator が別ソースからコピーした文字列を渡す場合など）。

design.md の Risks セクション（最初のリスク項目）に XML エスケープの要件を明示すること、または `buildOperatorAdjudicationBlock` の実装仕様に「自由記述 text は XML 特殊文字をエスケープする」と記載することを推奨する。

---

### Finding 3: `decisions` projection で `resumeComment` 除外理由が tasks.md に未記載

**severity**: low  
**resolution**: fixable  
**file**: `specrunner/changes/custom-reviewer-round-context/tasks.md`

`DecisionRecord` は `resumeComment?: string` を持つ。T-03 の `deriveOperatorAdjudicationContext` projection 定義は `step / finding.title / finding.file / selectedOption.label / selectedOption.consequence / finding.rationale` の 6 フィールドを列挙するが、`resumeComment` の除外理由が記載されていない。

除外は設計上妥当（`resumeComment` と `operatorAdjudications[*].text` が重複する可能性がある）と判断できるが、実装者が迷わないよう T-03 または design.md D7 に 1 行補記を推奨する。

---

### Finding 4: spec.md に「iteration 1 ＋ 非空 decisions」での裁定 block 注入を確認するシナリオが欠落している

**severity**: low  
**resolution**: fixable  
**file**: `specrunner/changes/custom-reviewer-round-context/spec.md`

Requirement 3（operator 裁定 block 注入）の Scenario は「裁定記録が存在するとき注入」と「存在しないとき非注入」の 2 ケースのみを定義する。design.md D7 は裁定 block を全周回に注入する（iteration 非依存）と明示しているが、「iteration 1 かつ `state.decisions` 非空」というケースを検証するシナリオが spec にない。

Requirement 1 の「iteration 1 では前周 context block を注入しない」と Requirement 3 の「裁定記録があれば block を注入する」が同時に成立するケースを確認する Scenario を追加すると、regression 防止が強化される。
