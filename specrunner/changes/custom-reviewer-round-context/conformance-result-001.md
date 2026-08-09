# Conformance Review — custom-reviewer-round-context — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Identity

- **Reviewer role**: conformance
- **Change slug**: custom-reviewer-round-context
- **Iteration**: 1
- **Date**: 2026-08-09

---

## Scope (git diff main...HEAD --stat)

29 files changed, 5048 insertions, 9 deletions.

Key production files:
- `src/core/step/custom-reviewer-round-context.ts` (new, 298 lines)
- `src/core/step/custom-reviewer.ts` (+47 — prepareRoundContext + message injection)
- `src/git/dynamic-context.ts` (+26 — 2 new DynamicContext fields)
- `src/state/schema/types.ts` (+33 — OperatorAdjudication type + JobState field)
- `src/state/schema/operations.ts` (+45 — appendOperatorAdjudication + validateJobState block)
- `src/core/command/resume.ts` (+25 — operator adjudication persistence)

---

## 検証した項目

### tasks.md — 全チェックボックス [x] 確認

- **T-01**: `OperatorAdjudication` interface が types.ts に追加。JobState.operatorAdjudications フィールド追加。`appendOperatorAdjudication` が operations.ts に pure helper として実装（既存 state 不変、不在時は 1 要素配列を作る）。`validateJobState` に軽量検証ブロック追加（非配列 / 必須フィールド欠落で throw、不在は受理）。
- **T-02**: DynamicContext に `customReviewerPriorRound?` と `operatorAdjudicationContext?` を追加。両 field に「in-memory only、state/journal 非永続、custom reviewer 専用」旨の doc コメント。`collectDynamicContext` 変更なし（既存挙動不変）。
- **T-03**: `src/core/step/custom-reviewer-round-context.ts` 新設。4 関数すべて export 済み（deriveCustomReviewerPriorRound / buildCustomReviewerPriorRoundBlock / deriveOperatorAdjudicationContext / buildOperatorAdjudicationBlock）。pure block builder + async derivation の分離は prior-round-context.ts / post-fix-context.ts と同型。XML 特殊文字エスケープ helper `escapeXml` 実装済み（& → &amp;、< → &lt;、> → &gt;）。
- **T-04**: `createCustomReviewerStep` が返す step object に `prepareRoundContext(state, cwd, runtimeStrategy)` を実装。`nextIteration` で iteration を算出し、両 derive 関数を呼んで非 null 値を `Partial<DynamicContext>` に載せて返す。`buildCustomReviewerMessage` に `priorRoundSection` と `adjudicationSection` を追加（dynamicContext の対応 field が存在するときのみ展開）。
- **T-05**: `resume.ts` `prepare()` 内で `transitionJob()` 直後に `appendOperatorAdjudication` を適用。worktree / no-worktree 両 path で `stateToWrite` を persist するよう変更。`updatedState = stateToWrite` で後続処理に裁定済み state を伝播。one-shot `resumePrompt` 注入（line 446）は変更なし。
- **T-06**: テスト 4 ファイル追加（custom-reviewer-round-context.test.ts / custom-reviewer-step.test.ts 追記 / resume-operator-adjudication.test.ts / operator-adjudication-schema.test.ts）。TC-001〜TC-030 に対応するテストが存在することを確認。

### design.md — 設計判断 D1〜D8 の適合確認

- **D1**: `prepareRoundContext` seam 経由で注入。adapter 共通 bundle（agent-runner.ts の touched-files 注入）は変更なし。✓
- **D2**: `custom-reviewer-round-context.ts` が独立モジュールとして存在。4 関数が step 非依存の純粋関数として export されている。✓
- **D3**: `resolveCodeFixerRounds(state)` を import 再利用し、`endedAt > priorReviewerEndedAt` でフィルタ。Set でデータ重複除去。`kind !== "success"` → null（all-or-nothing）。✓
- **D4**: `OperatorAdjudication = { text, step, recordedAt }` 新型。JobState に top-level field。`appendOperatorAdjudication` は immutable（spread で新 state 返す）。`validateJobState` 検証ブロック追加。✓
- **D5**: 永続化点は `resume.ts` prepare() の `transitionJob()` 直後。`startStep` を `step` フィールドに使用。one-shot deps 注入（resumePrompt）は保持。✓
- **D6**: `customReviewerPriorRound?` / `operatorAdjudicationContext?` の 2 field を DynamicContext に追加。in-memory only（collectDynamicContext で付与しない）。✓
- **D7**: `deriveOperatorAdjudicationContext` は reviewer 名でのフィルタなし。operatorAdjudications + decisions の両方を projection。両空なら null。各エントリに step ラベルを含む。✓
- **D8**: degrade 条件一覧を確認済み。前周 block: iteration < 2 / runs 不在 / endedAt 不在 / getLatestJudgeFindings null / strategy 不在 / unavailable / throw → null。裁定 block: 両 ledger 空 → null。✓

### spec.md — 要件・シナリオの網羅確認

- **R1 (iteration ≥ 2 注入)**: シナリオ 2 件をそれぞれ TC-001 / TC-002 がカバー。SHALL NOT for iter 1 を iteration guard で実現。
- **R2 (導出失敗 degrade)**: TC-003（findings 欠落）/ TC-004（unavailable + throw）でカバー。MUST NOT throw を try/catch で保証。
- **R3 (resume 永続化)**: TC-024（prompt あり）/ TC-025（prompt なし）でカバー。
- **R4 (裁定 block 注入)**: TC-016（存在→注入）/ TC-017（不在→非注入）/ TC-023（iter 1 + decisions → 前周 block なし、裁定 block あり）でカバー。

### request.md — 受け入れ基準の確認

- AC-1 (iter ≥ 2 注入 / iter 1 非注入): テストで固定済み（TC-001, TC-002）✓
- AC-2 (導出失敗 degrade): テストで固定済み（TC-003, TC-004, TC-005, TC-008）✓
- AC-3 (resume 永続化): テストで固定済み（TC-024, TC-025）✓
- AC-4 (裁定 block 注入): テストで固定済み（TC-016, TC-017, TC-018, TC-019, TC-020, TC-021）✓
- AC-5 (typecheck && test green): verification-result.md — 736 test files / 10962 tests passed / typecheck passed ✓

### DecisionRecord フィールドマッピングの確認

`deriveOperatorAdjudicationContext` は `d.finding.title`, `d.finding.file`, `d.finding.rationale`, `d.selectedOption.label`, `d.selectedOption.consequence` にアクセス。`types.ts` の `DecisionFindingSnapshot` / `DecisionSelectedOption` interface と一致することを確認。型チェックが green である点でも間接的に保証。

### XML インジェクションリスクの緩和確認

`buildOperatorAdjudicationBlock` は全ユーザー入力フィールド（`adj.step`, `adj.text`, `d.step`, `d.title`, `d.file`, `d.selectedOption`, `d.consequence`, `d.rationale`）を `escapeXml()` でエスケープしてから埋め込み。TC-022 が `<b>bold</b> & test > 0` → エスケープ済み文字列に変換されることを unit test で固定。

---

## 検証できなかった項目

None — all acceptance criteria, design decisions, spec requirements, and task checkboxes are verifiable from static code review and the verification-result.md artifact.

---

## Findings 詳細

None — 実装はすべての受け入れ基準・設計判断・仕様要件に適合している。不適合は検出されなかった。
