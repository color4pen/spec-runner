# Delta Spec: managed-cli-commands

Baseline: (none — new capability)

## ADDED Requirements

### Requirement: `managed status` は `runtime != managed` のとき stale managed config を列挙する

`specrunner managed status` は `config.runtime !== "managed"` のとき、1 行目に `Runtime: local (managed setup not required)` を出力した後、stale managed config（`environment.id` が truthy または `agents` が非空）が存在する場合に列挙を SHALL 出力する。stale config が存在しない場合は 1 行のみで完結する。

#### Scenario: runtime: local + stale config で managed status

- **GIVEN** config に `runtime` 未設定（= local）、`environment.id: "env_001"`、`agents.design: { agentId: "agent_001" }` が存在する
- **WHEN** `specrunner managed status` を実行する
- **THEN** stdout に `Runtime: local (managed setup not required)` の後に `Stale managed config detected:` と `environment.id: env_001` と `agents.design: agent_001` が出力される

#### Scenario: runtime: local + stale なしで managed status

- **GIVEN** config に `runtime` 未設定（= local）、`agents: {}`、`environment` なし
- **WHEN** `specrunner managed status` を実行する
- **THEN** stdout に `Runtime: local (managed setup not required)` の 1 行のみが出力され、`Stale` を含まない

### Requirement: `managed reset` は `runtime != managed` のとき警告を出し確認なしには destructive 操作を実行しない

`specrunner managed reset` は `config.runtime !== "managed"` のとき、以下の手順で MUST 動作する:

1. stale managed config が存在しない場合は `"No stale managed config. Nothing to reset."` を出力して return する
2. stderr に警告（`Warning: runtime is "<value>", not "managed". This will reset stale managed fields only.`）を出力する
3. `--force` flag が無い場合:
   - non-TTY（`process.stdin.isTTY` が falsy）の場合は即時中断する
   - TTY の場合は `Proceed? [y/N]` で対話確認を取り、`y` 以外で中断する
4. 続行する場合は stale fields（`agents` / `environment`）をクリアし `logSuccess("Reset stale managed fields.")` を出力する

`runtime !== "managed"` のときは既存の destructive 確認 prompt（「This will delete the Anthropic Environment...」）を SHALL NOT 表示する（二重確認防止）。

#### Scenario: runtime: local + managed reset

- **GIVEN** config に `runtime` 未設定、stale managed config あり
- **WHEN** `specrunner managed reset` を TTY 環境で `--force` なしで実行する
- **THEN** stderr に runtime 不一致の警告が出力され、`Proceed? [y/N]` の確認 prompt が表示される

#### Scenario: runtime: local + managed reset --force

- **GIVEN** config に `runtime` 未設定、stale managed config あり
- **WHEN** `specrunner managed reset --force` を実行する
- **THEN** 確認 prompt なしで stale fields がリセットされ、`Reset stale managed fields.` が出力される

#### Scenario: non-TTY + managed reset (--force なし)

- **GIVEN** config に `runtime` 未設定、stale managed config あり
- **WHEN** non-TTY 環境で `specrunner managed reset` を `--force` なしで実行する
- **THEN** `--force` が必要な旨を出力して中断する。config は変更されない

### Requirement: `managed reset` の `--force` flag は runtime 不一致時の confirmation も bypass する

`--force` flag は (a) `runtime === "managed"` 時の既存 destructive 確認と (b) `runtime !== "managed"` 時の runtime 不一致確認の両方を bypass する。

### Requirement: non-TTY 環境では `--force` 無しの `managed reset` は中断する

`process.stdin.isTTY` が falsy の環境で `--force` flag が指定されていない場合、`managed reset` は MUST confirmation prompt を試みず即時中断する。これは CI 環境での安全策である。
