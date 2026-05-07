# cli-finish-command

## MODIFIED Requirements

### Requirement: `specrunner finish` は Phase 0 pre-flight を irreversible op の前に全実行する

Phase 0 pre-flight SHALL execute the following checks before any destructive operation. All checks MUST pass (or warn) before Phase 1 begins.

| # | Check | Escalation |
|---|-------|-----------|
| 6 | `openspec validate <slug>`（change folder AND `specs/` subdirectory が存在する場合のみ実行。`specs/` が存在しない delta-less change では validate をスキップする） | fail なら escalation: "delta spec の sync 検証で失敗" |

#### Scenario: Phase 0 check 6 skips validate when specs/ is absent

- **GIVEN** `openspec/changes/<slug>/` が存在するが `openspec/changes/<slug>/specs/` ディレクトリが存在しない（delta-less change）
- **WHEN** Phase 0 check 6 に到達する
- **THEN** `openspec validate` は実行されず、check 6 は success として通過する

#### Scenario: Phase 0 check 6 runs validate when specs/ exists

- **GIVEN** `openspec/changes/<slug>/specs/` ディレクトリが存在する
- **WHEN** Phase 0 check 6 に到達する
- **THEN** `openspec validate <slug>` が実行され、exit 0 なら success、non-zero なら escalation

#### Scenario: Phase 0 checks out feature branch before check 5+6

- **GIVEN** `state.branch` が設定されている
- **WHEN** Phase 0 の check 5+6 を実行する前
- **THEN** `git checkout <state.branch>` で feature branch に切り替え、check 5+6 完了後に元の branch に復帰する
