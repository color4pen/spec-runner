# Delta Spec: cli-finish-command — finish-conflict-precheck

## ADDED Requirements

### Requirement: `specrunner finish` は Phase 3 の merge 実行前に PR の mergeable 状態を確認する

`specrunner finish` は MUST Phase 3 で `gh pr merge` を実行する前に `gh pr view <prNumber> --json mergeable` で PR の mergeable 状態を確認する SHALL。

判定ロジック:

- `mergeable=MERGEABLE` の場合: そのまま `gh pr merge` を実行する
- `mergeable=CONFLICTING` の場合: rebase を促す escalation メッセージを出力し、`gh pr merge` を SHALL NOT 実行せず exit code 1 で停止する
- `mergeable=UNKNOWN` の場合: 5 秒間隔で最大 3 回リトライする。リトライ後に `MERGEABLE` になれば merge を実行する。3 回リトライ後も `UNKNOWN` のままなら escalation で停止する

escalation メッセージには MUST 以下を含める:
- 失敗した Phase 名（Phase 3）
- 検知された mergeable 状態
- rebase コマンド例（`git rebase <baseBranch>` を含む）
- resume コマンド（`specrunner finish <slug>`）

この guard は Phase 2 の `mergeStateStatus=DIRTY` ガードと相補的に動作する。Phase 2 ガードは push 直後の即座な検出、Phase 3 ガードは merge 直前の最終確認を担う。

#### Scenario: mergeable=CONFLICTING で escalation

- **WHEN** Phase 3 で `gh pr view --json mergeable` が `{ "mergeable": "CONFLICTING" }` を返す
- **THEN** escalation メッセージに rebase を促す指示が含まれ、`gh pr merge` は実行されない、exit code 1

#### Scenario: mergeable=UNKNOWN のリトライ後に MERGEABLE

- **WHEN** Phase 3 の mergeable チェックで 1 回目が `UNKNOWN`、5 秒後の 2 回目が `MERGEABLE` を返す
- **THEN** リトライが成功扱いになり `gh pr merge` が実行される

#### Scenario: mergeable=UNKNOWN が 3 回連続でリトライ超過

- **WHEN** Phase 3 の mergeable チェックで 3 回リトライ後も `UNKNOWN` のまま
- **THEN** escalation で停止、`gh pr merge` は実行されない、exit code 1

#### Scenario: mergeable=MERGEABLE で通常 merge

- **WHEN** Phase 3 で `gh pr view --json mergeable` が `{ "mergeable": "MERGEABLE" }` を返す
- **THEN** `gh pr merge --squash` が実行され、通常の Phase 3 フローが継続する
