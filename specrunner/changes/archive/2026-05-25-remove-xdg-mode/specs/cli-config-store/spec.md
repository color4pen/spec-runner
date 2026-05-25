## Requirements

### Requirement: 設定ファイルは固定スキーマに従う

設定ファイルは MUST 以下の構造を持つ JSON である:

- `version` (number, 現在値は `1`)
- `runtime` (string, `"managed"` または `"local"`)
- `agents` (`Record<StepName, AgentRecord>`)
- `environment.id` (string)
- `environment.lastSyncedAt` (ISO8601)
- `pipeline.maxRetries` (number)
- `steps` (`StepConfigMap`, optional)
- `progress` (`ProgressConfig`, optional)
- `models` (`ModelsConfig`, optional)

`jobs` section は廃止された。旧 config に `jobs` section が残っていても SHALL 未知 field として無視される（error にならない）。`JobsConfig` 型は削除される。

#### Scenario: jobs section が残っていても無視される

- **WHEN** 既存の config file に `{ "jobs": { "location": "xdg" } }` が含まれている
- **THEN** config load は成功し、jobs section は無視される
- **AND** CLI は常に `<repo-root>/.specrunner/` をジョブ格納先として使用する
