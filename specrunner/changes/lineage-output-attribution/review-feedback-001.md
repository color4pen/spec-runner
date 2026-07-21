# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` — 変更ファイル: `src/core/step/commit-orchestrator.ts` + テストファイル + change folder artifacts
- `src/core/step/commit-orchestrator.ts` 全体 + diff — `commitSuccess` / `commitRound` / `applySuccessPostPersistEffects` の変更内容
- `specrunner/changes/lineage-output-attribution/design.md` — root cause 分析・決定 D1/D2/D3 の内容
- `specrunner/changes/lineage-output-attribution/tasks.md` — T-01〜T-05 の完了チェック状態
- `specrunner/changes/lineage-output-attribution/spec.md` — Requirement・Scenario の仕様
- `specrunner/changes/lineage-output-attribution/test-cases.md` — TC-001〜TC-011 の定義と priority
- `src/core/step/__tests__/lineage-output-attribution.test.ts` — 全テストの実装
- `specrunner/changes/lineage-output-attribution/verification-result.md` — build/typecheck/test/lint/changed-line-coverage 全 phase green 確認
- `git diff main...HEAD -- src/core/step/__tests__/commit-orchestrator.test.ts` — 既存テスト無改変を確認（差分なし）
- 他の `src/core/step/__tests__/` 内テストでの `node:fs` 使用パターンを確認（既存踏襲と確認）

## 検証できなかった項目

None

## Findings 詳細

### F-01 (LOW): TC-006 実装と test-cases.md の GIVEN/WHEN/THEN の乖離

test-cases.md の TC-006 は次の仕様を定義している:

> GIVEN `applySuccessPostPersistEffects` が pre-push IO を受け取らず、メソッド内で `step.writes(s, deps)` を post-push state で再評価するよう実装を意図的に元に戻した（修正前の挙動）  
> WHEN 先行 run がゼロの状態で初回 `commitSuccess` を実行する  
> THEN `store.appendLineage` に渡される `outputs[0].path` が `-002` で終わる

実際の実装（test.ts:582）は `commitSuccess` を呼ばず、`step.writes()` を pre-push state / post-push state にそれぞれ直接適用して数学的不変を証明する。

**影響**: 非ブロッキング。TC-001/TC-002 が実際に `commitSuccess` を呼んで `-001`/`-002` を assert しており、fix を revert すれば確実に fail する。TC-006 はその補足的な数学的証明として機能する。コメント「before this fix, the post-push state had length 1 → nextIteration=2 → path=-002」が受け入れ基準の「記録する」を充足している。

## 総評

root cause（`applySuccessPostPersistEffects` 内での post-push state による `writes()` 再評価）が `commitSuccess`・`commitRound` 両経路で正確に修正されている。設計決定 D1/D2/D3 の実装への反映も忠実。

must 9 件・should 2 件の全テストケースが実装・green。既存テスト無改変（TC-008）、typecheck green（TC-009）、569 ファイル 8332 テスト全 pass を確認。

LOW 1 件（TC-006 の実装仕様乖離）は非ブロッキング。
