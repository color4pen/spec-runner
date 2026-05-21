# Spec Review Result 002

- **date**: 2026-05-20
- **reviewer**: spec-reviewer agent
- **verdict**: approved

## Findings

- [info] request.md の根拠 (`job-state-update.ts:17-18` の `STATUS_HINTS`、`errors.ts:226` の `pollTimeoutError`、`rm/runner.ts:37` の `ALLOWED_STATUSES`) はすべて実コードと一致。行番号・文字列も正確。
- [info] `COMMANDS` registry に `rm` / `resume` / `finish` が top-level キーとして登録済、`cancel` は不存在であることを確認。hint コマンド存在テストは機械的に実装可能。
- [info] design.md D2 と tasks.md Task 3 の正規表現は spec-review-result-001 の MUST 指摘を反映して `/specrunner (\w+)/g`（クォート不要版）になっており、`specrunner rm <jobId>` から `rm` を正しく抽出可能。前回指摘は解消済。
- [info] design.md D3 の「既存 `tests/finish-job-state.test.ts` は `.toThrow(/failed|terminated/)` で cause message をマッチしており hint 変更の影響を受けない」は実テストコードと一致。`tests/` 全体に旧 hint 文字列を直接 assert している箇所は存在しないことを grep で確認済。
- [info] `STATUS_HINTS` の test 用 export 追加（tasks.md Task 3）は module-private const の解放だが副作用なし。妥当な選択。
- [info] スコープ外定義（`cancel` 自体の実装、他 hint の網羅監査、`specrunner job rm` 系再編）は適切に列挙されている。`src/` 内の `specrunner cancel` 参照は本 request 対象の 3 箇所のみで全廃可能。
- [info] セキュリティ観点: 変更対象は静的エラーメッセージ文字列のみで、ユーザー入力の埋め込み・shell 実行経路なし。インジェクション懸念なし。
- [info] tasks.md の依存関係（Task 3 は Task 1 の export 追加に依存）は妥当。Task 4（typecheck + test）が最終 gate になっており実装可能性に問題なし。
