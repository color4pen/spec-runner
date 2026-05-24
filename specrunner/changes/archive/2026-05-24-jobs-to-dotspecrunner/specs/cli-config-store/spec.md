## Purpose

Persist CLI authentication, agent IDs, and other config under the user's XDG config directory.

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
- `jobs` (`JobsConfig`, optional) — ジョブ状態ファイルの格納先設定

`jobs` section SHALL `JobsConfig` 型のオブジェクトである。`JobsConfig` は optional field `location` (`"project"` | `"xdg"`) のみを持つ。

- `jobs.location`: `"project"` = `<repo-root>/.specrunner/` 配下、`"xdg"` = 従来の XDG パス
- `jobs` section 自体が未設定の場合、または `jobs.location` が未設定の場合は `"project"` として扱う
- `jobs.location` に `"project"` / `"xdg"` 以外の値が設定された場合は `CONFIG_INVALID` エラーを throw する

#### Scenario: jobs section 未設定（後方互換）

- **WHEN** 既存の config file に `jobs` section が含まれていない
- **THEN** config load は成功し、`config.jobs` は `undefined` となる
- **AND** CLI は `"project"` をデフォルト location として使用する

#### Scenario: jobs.location に無効値

- **WHEN** config に `{ "jobs": { "location": "local" } }` が設定されている
- **THEN** `validateConfig()` が `CONFIG_INVALID` エラーを throw する

#### Scenario: jobs.location に "xdg" を設定

- **WHEN** config に `{ "jobs": { "location": "xdg" } }` が設定されている
- **THEN** config load は成功し、`config.jobs.location === "xdg"` となる
