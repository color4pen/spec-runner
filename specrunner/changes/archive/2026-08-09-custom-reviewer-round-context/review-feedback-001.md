# Code Review Feedback — custom-reviewer-round-context — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル

- `src/core/step/custom-reviewer-round-context.ts`（新設）
- `src/core/step/custom-reviewer.ts`（prepareRoundContext 追加）
- `src/state/schema/types.ts`（OperatorAdjudication 追加）
- `src/state/schema/operations.ts`（appendOperatorAdjudication + validateJobState 拡張）
- `src/git/dynamic-context.ts`（2 field 追加）
- `src/core/command/resume.ts`（T-05: 永続化追加）
- `src/core/step/post-fix-context.ts`（resolveCodeFixerRounds 再利用確認）
- `src/core/step/step-context-builder.ts`（seam の null no-op 確認 L153-160）
- `src/core/step/__tests__/custom-reviewer-round-context.test.ts`（全 TC 確認）
- `src/core/step/__tests__/custom-reviewer-step.test.ts`（TC-001/002/023 確認）
- `src/core/command/__tests__/resume-operator-adjudication.test.ts`（TC-024/025 確認）
- `src/state/__tests__/operator-adjudication-schema.test.ts`（TC-026〜030 確認）
- `specrunner/changes/custom-reviewer-round-context/verification-result.md`（全フェーズ green 確認）

### 確認した観点

1. **prepareRoundContext seam の動作**: step-context-builder.ts L153-160 が `null` return を no-op として扱い、throw を握り潰すことを確認 ✓
2. **all-or-nothing degrade**: `listCommitChangedFiles` が 1 件でも失敗なら null を返す（部分注入なし）ことを TC-008 と実装で確認 ✓
3. **endedAt フィルタ**: ISO 8601 文字列の辞書順比較で `endedAt > priorReviewerEndedAt` が正しく動作することを TC-006 で確認 ✓
4. **XML escape 順序**: `&` を先にエスケープ（二重エスケープ防止）することを確認 ✓
5. **永続化フロー**: `transitionJob()` 直後・`persist()` 前に `appendOperatorAdjudication` を適用し `stateToWrite` 経由で persist することを確認 ✓
6. **one-shot deps 注入の維持**: `resumePrompt: this.options.prompt` は変更なしで `PrepareResult` に伝播することを確認 ✓
7. **受け入れ基準 5 件**: すべてテストで固定されていることを確認 ✓
8. **スコープ外への侵犯なし**: built-in code-review・regression-gate・spec-review/adr-gen・inbox/decisions 生成フローへの変更なしを確認 ✓

## 検証できなかった項目

`createCustomReviewerStep(...).prepareRoundContext` 自体を直接呼び出して null return を確認するテストは存在しないが、
その内部で呼ぶ `deriveCustomReviewerPriorRound`（iteration<2 / degrade 全分岐）は
TC-003〜TC-010 で直接固定されており、間接的に十分カバーされている。

## Findings 詳細

### F-01: `appendOperatorAdjudication` のシグネチャが `appendSynthesizedCommit` と不一致

`appendSynthesizedCommit` は `(state: JobState, oid: string): JobState` と型付けされているが、
`appendOperatorAdjudication` は `(state: JobState | Record<string, unknown>, ...) : JobState | Record<string, unknown>` となっている。

この差は `operator-adjudication-schema.test.ts` が `makeMinimalRaw()` の戻り値（`Record<string, unknown>`）を
そのままキャストせずに渡すために生まれたテスト都合のシグネチャ拡張。結果として `resume.ts` 側で `as JobState` キャストが必要になっている。

typecheck は通過しており実害なし。修正するとしたらシグネチャを `(state: JobState, record: OperatorAdjudication): JobState` に絞り、
テスト側で `makeMinimalRaw()` を `as JobState` キャストするか、`validateJobState` 後の型付きオブジェクトを使う方法がある。
