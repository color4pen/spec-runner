# cli-finish-command Delta Spec (specrunner-dir-rename)

This delta spec modifies the `cli-finish-command` specification for the `specrunner-dir-rename` change.

## Modified Requirements

### Requirement: `specrunner finish` は `<slug>` を第一形の入力とし、複数 source の fallback で対象 job を解決する

The input resolution logic is updated as follows:

`specrunner finish [<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` は MUST 次の優先順位で対象 job を解決する SHALL 入力解決ロジックを備える。いずれにも該当しない場合は exit code 2 で停止する。

1. 第一引数 `<slug>` が与えられた場合: `${XDG_DATA_HOME:-$HOME/.local/share}/specrunner/jobs/` 配下の state を `getJobSlug(state)` で評価し、一致するものを採用する。複数該当時は最新 `updatedAt` を優先し、その旨を stdout に出す
2. `--pr <num>` が指定された場合: `gh pr view <num> --json headRefName` を呼び `headRefName` から prefix（`feat/` `fix/` `change/` `refactor/` `chore/`）を strip した残部を slug として 1 と同じ流れで解決する
3. `--job <jobId>` が指定された場合: `jobs/<jobId>.json` を直接読む（forensics / debug 用、互換性のため残置）
4. 引数なしの場合:
   - 4-a. cwd が `specrunner/requests/active/<dir>/` 配下なら `<dir>` を slug として 1 と同じ流れで解決する
   - 4-b. main worktree から起動された場合、`specrunner/requests/active/<dir>/` が厳密に 1 件のみ存在すれば `<dir>` を slug として 1 と同じ流れで解決する
   - 4-c. 0 件 / 2 件以上の場合は usage と該当 slug 一覧を stderr に出し exit code 2 で停止する

#### Scenario: cwd auto-detect（worktree 内）

- **WHEN** cwd が `specrunner/requests/active/readme-status-section/` 配下で `specrunner finish` を引数なしで実行する
- **THEN** `readme-status-section` を slug として採用し、対応 state を解決する

#### Scenario: active 自動検出で 0 件

- **WHEN** 引数なしで `specrunner finish` を実行し `active/` が空である
- **THEN** `No request found in active/. Specify <slug>, --pr, or --job.` を stderr に出し exit code 2 で停止する

#### Scenario: active 自動検出で 2 件以上

- **WHEN** 引数なしで `specrunner finish` を実行し `active/` に 2 件以上の slug が存在する
- **THEN** `Multiple slugs in active/: <list>. Specify <slug>, --pr, or --job.` を stderr に出し exit code 2 で停止する

Note: The previous requirement for `openspec-workflow/requests/{active,awaiting-merge}/<dir>/` is superseded by this delta spec. The `awaiting-merge/` directory is no longer used for auto-detection.
