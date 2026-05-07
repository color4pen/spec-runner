# cli-finish-command

## MODIFIED Requirements

### Requirement: `specrunner finish` は `<slug>` を第一形の入力とし、複数 source の fallback で対象 job を解決する

`specrunner finish [<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` SHALL 次の優先順位で対象 job を解決する。いずれの source にも該当しない場合、コマンドは MUST exit code 2 で停止する。

1. 第一引数 `<slug>` が与えられた場合: `${XDG_DATA_HOME:-$HOME/.local/share}/specrunner/jobs/` 配下の state を `getJobSlug(state)` で評価し、一致するものを採用する。複数該当時は最新 `updatedAt` を優先し、その旨を stdout に出す
2. `--pr <num>` が指定された場合: `gh pr view <num> --json headRefName` を呼び `headRefName` から prefix（`feat/` `fix/` `change/` `refactor/` `chore/`）を strip し、さらに末尾の jobId suffix（`/-[0-9a-f]{8}$/` にマッチする部分）を strip した結果を slug として 1 と同じ流れで解決する
3. `--job <jobId>` が指定された場合: `jobs/<jobId>.json` を直接読む（forensics / debug 用、互換性のため残置）

#### Scenario: --pr で jobId-suffixed branch から slug を導出

- **WHEN** `specrunner finish --pr 42` を実行し、`gh pr view 42 --json headRefName` が `{ "headRefName": "feat/my-feature-abcd1234" }` を返す
- **THEN** prefix `feat/` を strip → `my-feature-abcd1234` → jobId suffix strip → `my-feature` を slug として解決する

#### Scenario: --pr で suffix なし branch から slug を導出（後方互換）

- **WHEN** `specrunner finish --pr 42` を実行し、`gh pr view 42 --json headRefName` が `{ "headRefName": "feat/readme-status-section" }` を返す
- **THEN** prefix `feat/` を strip → `readme-status-section` → jobId suffix strip が no-op → `readme-status-section` を slug として解決する
