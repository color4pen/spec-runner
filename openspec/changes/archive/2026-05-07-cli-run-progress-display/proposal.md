## Why

`specrunner run` 実行中の CLI 表示が不十分で、ユーザーはどの step が実行中か判別できない。現状の問題:

1. **進捗の不可視**: spec-review の `[iter N/M]` 以外、propose→implementer→verification→code-review→pr-create の遷移が沈黙。数分間何も出力されない区間がある
2. **warning ノイズ**: `logWarn` の出力が本筋の進捗情報を埋没させる
3. **完了後の案内なし**: pipeline 完了後に `finish` コマンドの案内がなく、ユーザーが次のアクションを自分で調べる必要がある

## What Changes

- EventBus subscriber として `ProgressDisplay` クラスを新設し、step 遷移・所要時間・verdict を stdout にリアルタイム表示する
- `--verbose` フラグを `specrunner run` に追加し、デフォルトでは warning を抑制する
- pipeline 完了時に `Next: bun ./bin/specrunner.ts finish <slug>` を表示する
- `runPipeline` が外部から EventBus を受け取れるよう signature を拡張する（DI の改善）

## Capabilities

### New Capabilities

- `progress-display`: EventBus subscriber による step 遷移表示と所要時間表示
- `cli-verbose-flag`: `specrunner run --verbose` で warning を表示。デフォルトは抑制

### Modified Capabilities

- `run-pipeline-eventbus`: `runPipeline` が optional EventBus を受け取り、外部から subscriber 登録可能にする
- `run-command-options`: `runRun`/`runRunCore` が verbose オプションを受け取る
- `logger-warn-control`: `logWarn` が verbose モードでのみ出力する制御を追加

## Impact

- **src/cli/progress.ts**: 新規。`ProgressDisplay` クラス（EventBus subscriber）
- **src/cli/run.ts**: EventBus 生成→ProgressDisplay 登録→runPipeline に EventBus を渡す。verbose オプション追加
- **src/core/pipeline/run.ts**: `runPipeline` の signature に optional `events?: EventBus` を追加
- **src/logger/stdout.ts**: `setVerbose`/`isVerbose` を追加。`logWarn` が verbose 時のみ出力
- **bin/specrunner.ts**: `run` コマンドの `--verbose` フラグ解析
- **テストファイル**: ProgressDisplay 単体テスト、verbose フラグの統合テスト
- **外部 API/依存の変更なし**: 全て内部の表示改善
