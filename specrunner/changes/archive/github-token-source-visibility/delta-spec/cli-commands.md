# Delta Spec: cli-commands

Baseline: `specrunner/specs/cli-commands/spec.md`

## MODIFIED

### R-doctor-github-token-source: `specrunner doctor` が GitHub token 取得元を表示する

`github-token-present` check の pass message に token 取得元を含める。
- token が credentials file 由来の場合: `GitHub token is available (source: credentials)`
- token が GITHUB_TOKEN env var 由来の場合: `GitHub token is available (source: env)`

### R-run-preflight-token-source-log: `specrunner run` の preflight が token 取得元をログ出力する

`runPreflight` 実行時、`resolveGitHubToken` 成功直後に info ログを 1 行出力する。
- 形式: `GitHub token source: credentials` / `GitHub token source: env`
