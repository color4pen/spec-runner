## Requirements

### Requirement: CLI 出力チャネル規約

`specrunner` CLI の全プロダクションコード (`src/` 配下) は MUST `src/logger/stdout.ts` が export する関数群を経由して出力する。`process.stdout.write` / `process.stderr.write` の直接呼び出しは SHALL NOT 存在する（`src/logger/stdout.ts` 内の最終出力点と `src/cli/progress.ts` 内の ProgressDisplay を除く）。

stdout はプログラムの結果データ (PR URL, job ID, テーブル出力, JSON 等、パイプで次のコマンドに渡すデータ) のみに使用し、`logResult` / `stdoutWrite` 経由で出力する。stderr は診断メッセージ (進捗表示, step verdict, warning, error, heartbeat, debug) に使用し、`logInfo` / `logStep` / `logSuccess` / `logError` / `logWarn` / `logDebug` / `stderrWrite` 経由で出力する。

`stdoutWrite` は MUST `maskSensitive` を適用する。`logResult` も MUST `maskSensitive` を適用する。これにより、全出力パスで既存のマスクパターン (`sk-ant-` / `gho_` / `ghp_` / `ghr_` / `ghs_` / `ghu_` / `github_pat_`) が自動適用される。

#### Scenario: stdout に進捗メッセージが混入しない

- **WHEN** `specrunner job start <slug>` を実行し、stdout をファイルにリダイレクトする
- **THEN** stdout ファイルにはプログラムの結果データのみが含まれ、`[step]` / `running...` / `✓` / heartbeat 等の進捗表示は含まれない

#### Scenario: マスキングが全出力パスに適用される

- **WHEN** 出力メッセージに `sk-ant-xxxx` や `gho_xxxx` パターンのトークンが含まれる
- **THEN** stdout / stderr いずれの出力先でも `sk-ant-...` / `gho_...` 形式にマスクされる

#### Scenario: GitHub App token と fine-grained PAT がマスクされる

- **WHEN** 出力メッセージに `ghu_abc123` / `ghs_def456` / `github_pat_xyz789` を含む文字列が書き込まれる
- **THEN** それぞれ `ghu_...` / `ghs_...` / `github_...` にマスクされる
