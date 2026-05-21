## Requirements

### Requirement: `JobState.canceledAt` field は cancel 時刻を記録する

`JobState` interface に `canceledAt?: string` (ISO 8601) field を MUST 追加する。
`job cancel` 実行時に現在時刻を記録する。
既存の state file に field が absent の場合は `undefined` として扱う (backward compat)。

#### Scenario: cancel 後の state file に canceledAt が記録される

- **WHEN** `specrunner job cancel <jobId>` を実行し成功する
- **THEN** state file の `canceledAt` に ISO 8601 形式のタイムスタンプが記録される

#### Scenario: cancel 前の state file には canceledAt が存在しない

- **WHEN** 通常の pipeline 実行中の state file を読み込む
- **THEN** `canceledAt` field は `undefined` であり、validation error にならない
