# Delta Spec: cli-finish-command — `--pr` 経路の slug 導出で jobId suffix を除去する

## Changed Requirement: `--pr <num>` 経路の slug 解決ロジック

**Previous**: `--pr <num>` が指定された場合、`gh pr view <num> --json headRefName` で取得した `headRefName` から prefix を strip した残部をそのまま slug として使用する。

**Updated**: `headRefName` から prefix を strip した後、さらに `stripJobIdSuffix` を適用して末尾の `-[0-9a-f]{8}` パターンを除去してから slug として使用する。

#### Scenario: --pr で jobId-suffixed branch から slug を導出

- **WHEN** `specrunner finish --pr 42` を実行し、`gh pr view 42 --json headRefName` が `{ "headRefName": "feat/my-feature-abcd1234" }` を返す
- **THEN** prefix `feat/` を strip → `my-feature-abcd1234` → `stripJobIdSuffix` → `my-feature` を slug として解決する

#### Scenario: --pr で suffix なし branch から slug を導出（後方互換）

- **WHEN** `specrunner finish --pr 42` を実行し、`gh pr view 42 --json headRefName` が `{ "headRefName": "feat/readme-status-section" }` を返す
- **THEN** prefix `feat/` を strip → `readme-status-section` → `stripJobIdSuffix` が no-op → `readme-status-section` を slug として解決する

## Unchanged

- 解決優先順位（slug → --pr → --job → auto-detect）は変更なし
- Phase 0〜4 の実行フローは変更なし
- `--dry-run` の挙動は変更なし
- 冪等性・resume 挙動は変更なし

## Rationale

branch 名フォーマットが `feat/<slug>-<8char>` に変更されるため、`--pr` 経路の headRefName → slug 導出で jobId suffix の除去が必要になる。
