# request.md バリデーションエラー時に job status を failed に更新する

## Meta

- **slug**: fix-ghost-job-status
- **type**: bug-fix
- **base-branch**: main
- **date**: 2026-05-11
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

`specrunner run` で request.md のバリデーション（例: `base-branch` 未指定）がエラーになると、job state が `running` のまま残る。`specrunner status` で見ると実行中に見えるが実際は停止している。

GitHub Issue #193。

## 目的

バリデーションエラーや初期化失敗時に job status を `failed` に更新し、ghost job を防ぐ。

## 要件

1. `src/core/command/runner.ts` の `run()` で request.md パース・バリデーションが失敗した場合、job state を `failed` status に更新してから throw する
2. job state が作成される前のエラー（ファイル不在等）は state 更新不要（state がないので）
3. state 作成後 〜 pipeline 開始前のエラーで status を `failed` に更新する

## 受け入れ基準

- [ ] `base-branch` 未指定の request.md で `specrunner run` を実行すると job status が `failed` になる
- [ ] `specrunner status` で ghost job が表示されない
- [ ] 正常な pipeline 実行に影響しない
- [ ] `bun run typecheck` / `bun run test` が全 pass
