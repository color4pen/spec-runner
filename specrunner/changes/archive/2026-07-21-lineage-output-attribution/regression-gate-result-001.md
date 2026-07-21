# Regression Gate Evidence Report — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --name-only` — 変更ファイル一覧を確認
- `events.jsonl` — code-review / code-fixer ステップの outcome を確認
- `specrunner/changes/lineage-output-attribution/test-cases.md:82-96` — TC-006 の GIVEN/WHEN/THEN 定義
- `src/core/step/__tests__/lineage-output-attribution.test.ts:581-625` — TC-006 の実装内容
- `specrunner/changes/lineage-output-attribution/review-feedback-001.md` — code-review の F-01 詳細

## Findings Ledger の検証

### [LOW] TC-006 実装が test-cases.md の GIVEN/WHEN/THEN と乖離している

**検証内容**: test-cases.md TC-006 WHEN 句（"初回 `commitSuccess` を実行する"）と実際の test 実装の比較。

**現在のコード状態**:
- `test.ts:582-625` のテストは `commitSuccess` を呼ばず、`step.writes()` を pre-push / post-push state に直接適用して数学的不変を証明する。
- `test.ts:583-586` のコメント「before this fix, the post-push state had length 1 → nextIteration=2 → path=-002」は present（test-cases.md 注記が要求する文書化は充足）。
- test-cases.md の TC-006 定義は変更なし。

**code-fixer の対応（events.jsonl より）**:
- code-fixer step-attempt outcome: `"LOW は無視の指示通り、コード変更なしで完了"` `"status":"success"`
- code-fixer は LOW findings を無視する指示に従い、コード変更なしで承認。この finding は意図的に非修正として処理された。

**評価**: リグレッションなし。code-fixer がコード変更なしで完了した時点と現在のコードは同一。TC-006 の乖離は意図的に「現状維持」と判断されており、TC-001/TC-002 が実際に `commitSuccess` を呼んで破壊確認として機能しているため、受け入れ基準の充足に影響なし。

## 総評

台帳 1 件（LOW/TC-006 乖離）は意図的に非修正のまま維持されており、code-fixer の approved outcome と整合している。新たなリグレッションは検出されなかった。
