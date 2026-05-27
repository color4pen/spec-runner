## Requirements

### Requirement: `specrunner job start` の preflight は GitHub token 取得元を info ログに出力する

`runPreflight` 実行時、`resolveGitHubToken` が成功した直後に MUST 取得元を info ログに 1 行出力する。

- credentials.json 由来: `GitHub token source: credentials`
- env var 由来: `GitHub token source: env`

#### Scenario: preflight 成功時に取得元が stderr に出る

- **WHEN** `specrunner run` を起動し、preflight の token resolve が credentials.json で成功する
- **THEN** stderr に `GitHub token source: credentials` の info ログが 1 行出力される (stdout には出力されない)

#### Scenario: env var 経由でも取得元が表示される

- **WHEN** `specrunner run` を起動し、preflight の token resolve が `GITHUB_TOKEN` env var で成功する
- **THEN** stderr に `GitHub token source: env` の info ログが 1 行出力される (stdout には出力されない)

### Requirement: CLI 出力チャネル規約

`specrunner` CLI の全プロダクションコード (`src/` 配下) は MUST `src/logger/stdout.ts` が export する関数群を経由して出力する。`process.stdout.write` / `process.stderr.write` の直接呼び出しは SHALL NOT 存在する（`src/logger/stdout.ts` 内の最終出力点と `src/cli/progress.ts` 内の ProgressDisplay を除く）。

stdout はプログラムの結果データ (PR URL, job ID, テーブル出力, JSON 等、パイプで次のコマンドに渡すデータ) のみに使用し、`logResult` / `stdoutWrite` 経由で出力する。stderr は診断メッセージ (進捗表示, step verdict, warning, error, heartbeat, debug) に使用し、`logInfo` / `logStep` / `logSuccess` / `logError` / `logWarn` / `logDebug` / `stderrWrite` 経由で出力する。

`stdoutWrite` は MUST `maskSensitive` を適用する。`logResult` も MUST `maskSensitive` を適用する。これにより、全出力パスで既存のマスクパターン (`sk-ant-` / `gho_` / `ghp_` / `ghr_`) が自動適用される。

#### Scenario: stdout に進捗メッセージが混入しない

- **WHEN** `specrunner job start <slug>` を実行し、stdout をファイルにリダイレクトする
- **THEN** stdout ファイルにはプログラムの結果データのみが含まれ、`[step]` / `running...` / `✓` / heartbeat 等の進捗表示は含まれない

#### Scenario: マスキングが全出力パスに適用される

- **WHEN** 出力メッセージに `sk-ant-xxxx` や `gho_xxxx` パターンのトークンが含まれる
- **THEN** stdout / stderr いずれの出力先でも `sk-ant-...` / `gho_...` 形式にマスクされる

#### Scenario: logInfo は stderr に出力される

- **WHEN** `logInfo("message")` が呼ばれる
- **THEN** `message\n` が stderr に書き込まれる (stdout には書き込まれない)

#### Scenario: logResult は stdout に出力される

- **WHEN** `logResult("data")` が呼ばれる
- **THEN** `data\n` が stdout に書き込まれ、maskSensitive が適用されている
