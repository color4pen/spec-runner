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
| 7 | feature branch の remote / local 存在確認（`git ls-remote --heads origin <branch>` で判定） | 存在しない場合は PR が MERGED 状態なら resume path（Phase 1〜3 skip）へ進む。MERGED 以外かつ branch 不在は escalation: "feature branch が見つかりません。PR の状態を確認してください" |

#### Scenario: 全 check 通過で Phase 1 へ進む

- **WHEN** Phase 0 の 1〜5 が全部 pass、6 で warning なし
- **THEN** Phase 1（archive 操作）に進む

#### Scenario: `mergeStateStatus=UNKNOWN` の transient retry

- **WHEN** `gh pr view` の 1 回目で `mergeStateStatus=UNKNOWN`、3 秒後の 2 回目で `CLEAN` を返す
- **THEN** retry が成功扱いになり Phase 1 へ進む。retry 経過は stdout に出力される

#### Scenario: `mergeStateStatus=UNKNOWN` が 3 回連続

- **WHEN** 3 回 retry 後も `UNKNOWN` のまま
- **THEN** escalation で停止、`gh pr merge` は実行されない、exit code 1

#### Scenario: バイナリ不在で escalation

- **WHEN** `gh` バイナリが PATH に存在しない
- **THEN** `Binary not found: gh. Run 'specrunner doctor'.` を stderr に出し exit code 1 で停止、destructive op は実行されない

#### Scenario: feature branch に未 push commit が残っている（warning）

- **WHEN** feature branch に local 未 push commit が 1 件以上ある
- **THEN** `Warning: feature branch has unpushed commits.` を stderr に出すが、escalation せず Phase 1 へ進む
