# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル
- `specrunner/changes/round-all-skip-pass-through/request.md` — 全要件・スコープ外・受け入れ基準
- `specrunner/changes/round-all-skip-pass-through/spec.md` — 全 Requirement / Scenario
- `specrunner/changes/round-all-skip-pass-through/design.md` — D1〜D5 / D-journal / Risks
- `specrunner/changes/round-all-skip-pass-through/tasks.md` — T-01〜T-07 実装タスク

### 参照した現状コード
- `src/core/pipeline/reviewer-status.ts:250-288` — `aggregateVerdict` の現行実装（`!hasNonSkipped → escalation` 分岐）
- `src/core/pipeline/parallel-review-round.ts:315-354, 454-484` — `members` push / `allMembersSkipped` 判定 / guard / `roundError` 設定
- `src/core/step/commit-orchestrator.ts:556-570, 585-596` — `projectSkip` + `skipHistoryEntry` の skipped 経路、`state.error = roundError` の上書き
- `src/core/pipeline/pipeline.ts:380-425` — 終端 seam の `ROUND_ALL_MEMBERS_SKIPPED` 分岐
- `src/core/pipeline/reviewer-chain.ts:428-466` — coordinator 遷移行と all-members-skipped escalation routing
- `src/core/command/resume.ts:209-213` — `transitionJob(..., "running", { patch: { error: null } })`
- `src/store/event-journal.ts:392-413` — `stepRunToRecord` が `skipReason` を outcome に含める経路

### 検証した主要事項

**コード参照の正確性**: design.md が引用する行番号・ファイルパスをすべて突合した。
`commit-orchestrator.ts` の実際のパスは `src/core/step/commit-orchestrator.ts`（design.md では path 省略だが内容は一致）。
`state.error = roundError` は `commit-orchestrator.ts:594` に実在し、`roundError = null` で sticky error がクリアされる動作を確認。

**D1 (aggregateVerdict 変更)**: 現行の分岐 `if (memberVerdicts.length > 0 && !hasNonSkipped) return "escalation"` を削除した場合のトレース：
- `["skipped","skipped"]` → `hasNeedsFix=false` → `"approved"` ✓
- `["skipped","escalation"]` → 先頭ループで即 return `"escalation"` ✓（要件 3）
- `["approved","skipped"]` → `hasNonSkipped=true`（不変）、`"approved"` ✓
- `["needs-fix","skipped"]` → `hasNeedsFix=true` → `"needs-fix"` ✓
- `[]` → `hasNeedsFix=false` → `"approved"` ✓
- 削除後に `hasNonSkipped` 変数自体が不要になる点も確認（T-01 の整理対象として正しい）。

**D-journal (skip 証跡の既存経路)**: `parallel-review-round.ts:317-334` の `members.push` は fulfilled な結果（`{kind:"skipped"}` を含む）をすべて push する。`commitRound` の `result.kind === "skipped"` 分岐（commit-orchestrator.ts:556-570）が `projectSkip` + `skipHistoryEntry` を呼び、`store.persist` 経由で events.jsonl に step-attempt record（`skipReason` 付き）と transition record を書く。新規 event type 不要という design.md の主張を実コードで確認。

**D2 sticky error クリアの後方回復経路 (要件 6)**: `roundError = null` のまま `commitRound` が `state.error = roundError`（line 594）を実行する → sticky `ROUND_ALL_MEMBERS_SKIPPED` がクリアされる。resume では `transitionJob(..., "running", { patch: { error: null } })` が先に error をクリアするが、coordinator round 再走時に D2 がなければ再び `roundError = ROUND_ALL_MEMBERS_SKIPPED` で上書きされる。D2 があることで再上書きが発生せず、D4 の終端 seam 単一経路が awaiting-archive へ進む。論理的に完全なチェーン。

**D3 guard（`applyRoundResults` 抑止）の永続性**: D1 で `aggregateVerdict` が `approved` を返しても、guard `if (!inspectionEscalated && !allMembersSkipped)` は `allMembersSkipped` フラグに基づく（`aggregateVerdictResult` の値と独立）。T-02 がこの guard を明示的に維持すると指定しており、恒久 free-pass 回避（要件 5）が成立。

**D5 dead code 除去の正当性**: D1 で all-skip が `escalation` を返さなくなるため、`reviewer-chain.ts:456-466` の `when: error.code === "ROUND_ALL_MEMBERS_SKIPPED"` 遷移は D1 適用後に発火不能。除去が正当。skip+error 混在（`["skipped","escalation"]` → `"escalation"`）は専用 when 条件なしの default `escalate` 終端に落ちて停止する（要件 3 維持）。

**セキュリティ検討**:
- 変更対象は内部 pipeline state machine のみ。認証・入力バリデーション・外部 API は触れない。
- fail-closed（diff 導出不能 → 活性化に倒す）は executor レイヤで維持（要件 4、Non-Goal として明示）。
- error/skip の verdict 語彙区別は D1 の escalation 短絡で維持（要件 3）。
- fail-open リスク（全員担当外の request が無検査で PR まで通る）は design.md Risks に明示し、per-member skip 証跡の journal 記録と coverage floor（別 request）で緩和する戦略をとる。architect が採用した意図的な挙動変更であり、runtime 停止より journal 証跡を選ぶ判断は明確に根拠付けられている。

**タスクと設計決定の対応**: D1→T-01, D2+D3→T-02, D4→T-03, D5→T-04, unit テスト→T-05, E2E→T-06, gate→T-07。すべて 1:1 対応し漏れなし。

**既存テスト影響の網羅性**: design.md「テスト影響」節と tasks T-05/T-06 が更新対象テストを具体的 TC 番号で列挙。更新が必要な TC（TC-006/TC-038/TC-ACT-01/TC-ACT-02/TC-ACT-04）と維持する TC（TC-008/TC-009/TC-ACT-02 一致ケース/TC-ACT-03/TC-ACT-05）を明確に分離。

## 検証できなかった項目

- `bun run typecheck && bun run test` の実際の green 確認（実装前の spec review のため）
- `tests/reviewer-activation-e2e.test.ts`・`src/core/pipeline/__tests__/parallel-review-round-canon.test.ts` の実コードと TC 番号の突合（テストファイル参照を省略）
- `src/core/reviewers/activation.ts` の `evaluateActivation` が返す `decision.reason` のフォーマット（skip 証跡の `skipReason` 内容の具体的な文字列確認）

None of these omissions affect the ability to assess spec correctness.

## Findings 詳細

### 情報事項（ブロックなし）

**`reviewer-chain.ts:439` の `on: "skipped"` 遷移コメント**: 現行コードにも存在するが、`aggregateVerdict` は "skipped" を返さない（戻り値型は `"approved" | "needs-fix" | "escalation"`）ため、この coordinator `on: "skipped"` 遷移は D1 適用前後ともに到達不能な dead code。D5 はこの行を除去せず残す設計だが、本 change のスコープ外であり既存コードとして存在していた問題。D5 の Rationale にも説明がないが、ブロッキング事項ではない。

**D-journal コードパス呼び出しの前提**: 全 skip round でも `members` 配列へのフルメンバー push が走ることを parallel-review-round.ts:317-334 で確認。ただし `allMembersSkipped` guard が `applyRoundResults` を抑止する一方で `commitRound` へ渡す `members` 配列には影響しない（スコープが別）ことを、実装者が実コード上で再確認することを推奨する。T-06 のジャーナル証跡テストがこれを固定する役割を担う。
