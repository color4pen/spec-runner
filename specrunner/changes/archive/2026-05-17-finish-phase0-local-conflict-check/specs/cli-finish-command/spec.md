# cli-finish-command Delta Spec

## MODIFIED Requirements

### Requirement: `specrunner finish` は Phase 0 pre-flight を irreversible op の前に全実行する

`specrunner finish` は MUST 以下の検査を `gh pr merge` 実行前に全部走らせる SHALL Phase 0 pre-flight を持つ。1 つでも fail（warning を除く）した場合 escalation で停止し、destructive op は一切実行しない。

| # | check | fail action |
|---|-------|------------|
| 1 | slug 解決可能（前 Requirement の解決ロジック） | escalation: "slug を `<slug>` 引数 / `--pr` / `--job` で明示してください" |
| 2 | `state.pullRequest.number` 存在 | escalation: "pr-create が完走していません" |
| 3 | `gh pr view <num> --json mergeStateStatus,state,headRefName` 成功 + state 取得 | escalation: "PR を gh で取得できません。auth / network を確認してください" |
| 4 | `mergeStateStatus=UNKNOWN` の場合は 3 秒間隔で 3 回 retry | retry 後も UNKNOWN なら escalation |
| 5 | `gh` `git` バイナリ available | fail なら escalation: "doctor を実行してください" |
| 6 | feature branch の未 push commit 無し | warning のみ（user 判断で続行） |
| 7 | feature branch の remote / local 存在確認（`git ls-remote --heads origin <branch>` で判定） | 存在しない場合は PR が MERGED 状態なら resume path（Phase 1〜3 skip）へ進む。MERGED 以外かつ branch 不在は escalation |
| 8 | ローカル conflict check: `git fetch origin <baseBranch>` + `git merge-tree --write-tree HEAD origin/<baseBranch>` | conflict 検出 → escalation (conflict path 一覧 + rebase 手順を含む)。`git fetch` 失敗 → escalation (silent skip 禁止) |

Check #8 は check #1〜#7 が全て通過した後にのみ実行される。PR が既に MERGED 状態の場合は check #8 をスキップする（Phase 1〜3 が不要なため）。`--dry-run` 時も check #8 をスキップする（destructive op の前段ガードであり dry-run では不要）。

Check #8 は deterministic（retry 不要）。`git merge-tree --write-tree` の exit code が primary 判定基準であり、exit code 非 0 = conflict ありと判定する。

#### Scenario: ローカル conflict 検出で Phase 1 阻止

- **WHEN** Phase 0 check #1〜#7 が全 pass し、check #8 で `git merge-tree --write-tree HEAD origin/main` が exit code 1 を返す（conflict あり）
- **THEN** escalation メッセージに conflict path 一覧と recovery 手順（`git rebase origin/main` + `specrunner finish <slug>` 再実行）が含まれ、Phase 1 archive は実行されない、exit code 1

#### Scenario: git fetch 失敗で escalation

- **WHEN** Phase 0 check #8 の `git fetch origin main` が non-zero exit で失敗する（ネットワーク不可等）
- **THEN** escalation メッセージに fetch エラー内容が含まれ、Phase 1 archive は実行されない、exit code 1。silent skip / フォールバックは SHALL NOT 行わない

#### Scenario: ローカル conflict check 通過で Phase 1 進行

- **WHEN** Phase 0 check #8 で `git merge-tree --write-tree HEAD origin/main` が exit code 0 を返す（conflict なし）
- **THEN** Phase 1 archive に進む（既存フローと同一）

#### Scenario: conflict escalation 後の再実行が可能

- **WHEN** check #8 で conflict escalation が発生した後、ユーザーが `git rebase origin/main` で conflict を解消する
- **THEN** `specrunner finish <slug>` の再実行が可能（job state は変更されていないため `assertJobFinishable` で block されない）
