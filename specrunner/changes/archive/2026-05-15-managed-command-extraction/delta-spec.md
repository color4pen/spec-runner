# Delta Spec: managed-command-extraction

## Affected Specs

- `cli-commands` (10 requirements)
- `cli-config-store` (17 requirements)

---

## cli-commands

### MODIFY: `specrunner init` は Agent と Environment を作成または同期する

**Replace with**: `specrunner init` は config 雛形を生成する

`specrunner init` は MUST config 雛形（`version: 1` と `steps.defaults`）の生成のみを行い、managed runtime 固有の処理（Agent 同期・Environment 作成・API key 取得）は SHALL 行わない。

#### Scenario: 初回実行（config 未作成）

- **WHEN** `~/.config/specrunner/config.json` が存在しない状態で `specrunner init` を実行する
- **THEN** `version: 1` と `steps.defaults` を含む config をパーミッション 0600 で作成し、exit code 0 で終了する
- **AND** Anthropic API への通信は発生しない

#### Scenario: 既存 config がある状態で再実行

- **WHEN** 既に config が存在する状態で `specrunner init` を実行する
- **THEN** 既存の agents / github / environment 等のフィールドを保持したまま、version と steps.defaults を補完し、exit code 0 で終了する

#### Scenario: `--runtime managed` フラグが渡された場合

- **WHEN** `specrunner init --runtime managed` を実行する
- **THEN** `--runtime flag is no longer supported. Run 'init' for config scaffold, then set SPECRUNNER_API_KEY and run 'managed setup'.` を stderr に出し、exit code 1 で終了する

#### Scenario: `--runtime local` フラグが渡された場合

- **WHEN** `specrunner init --runtime local` を実行する
- **THEN** `--runtime flag is no longer needed. 'init' generates a local-default config scaffold.` を stderr に出し、exit code 1 で終了する

### ADD: `specrunner managed setup` は Anthropic リソースを idempotent に reconcile する

`specrunner managed setup` は MUST `SPECRUNNER_API_KEY` env var を読み取り、active provider の SDK 経由で AgentSyncer.syncAll と Environment create/retrieve を実行し、config に `runtime: "managed"` / `agents` / `environment` を書き込む。API key は config に書き込まない。二回目以降は drift がある agent だけ update し、Environment は retrieve する。

#### Scenario: SPECRUNNER_API_KEY 未設定

- **WHEN** `SPECRUNNER_API_KEY` env var が未設定の状態で `specrunner managed setup` を実行する
- **THEN** `SPECRUNNER_API_KEY env var is not set.` を stderr に出し、exit code 1 で終了する
- **AND** Anthropic API への通信は発生しない

#### Scenario: 初回 setup

- **WHEN** config に agents / environment が未設定の状態で `specrunner managed setup` を実行する
- **THEN** 全 agent を create し、Environment を create し、config に `runtime: "managed"` / agents / environment を保存し、exit code 0 で終了する
- **AND** config に `anthropic.apiKey` は書き込まれない

#### Scenario: 再実行（drift なし）

- **WHEN** 全 agent の definitionHash が一致し、Environment も存在する状態で `specrunner managed setup` を実行する
- **THEN** agent は全て skip、Environment は retrieve し、config の `lastSyncedAt` を更新し、exit code 0 で終了する

#### Scenario: Environment 作成失敗時の rollback

- **WHEN** agent の create 後に Environment 作成が失敗する
- **THEN** 新規作成された agent を archive して rollback し、エラーを throw する

### ADD: `specrunner managed status` は config の managed 設定状態を表示する

`specrunner managed status` は MUST config の runtime / agents / environment / `SPECRUNNER_API_KEY` env var の存在を整形して表示する。API 通信は SHALL 行わない。

#### Scenario: managed config

- **WHEN** `runtime: "managed"` の config が存在する状態で `specrunner managed status` を実行する
- **THEN** Runtime / Agents / Environment / API Key 状態を stdout に表示し、exit code 0 で終了する

#### Scenario: local config

- **WHEN** `runtime: "local"` の config が存在する（または runtime 未指定）の状態で `specrunner managed status` を実行する
- **THEN** `Runtime: local (managed setup not required)` を stdout に表示し、exit code 0 で終了する

### ADD: `specrunner managed reset` は Environment を削除し config をクリアする

`specrunner managed reset` は MUST `beta.environments.delete()` で Anthropic 側の Environment を削除し、config の `runtime` / `agents` / `environment` をクリアする。agent リソースは Anthropic 側に残る（SDK に delete API がないため）。

#### Scenario: 通常 reset

- **WHEN** managed config が存在する状態で `specrunner managed reset --force` を実行する
- **THEN** Anthropic 側の Environment を削除し、config の agents を `{}` に、environment を削除し、exit code 0 で終了する

#### Scenario: 確認プロンプト

- **WHEN** `--force` なしで `specrunner managed reset` を実行し、ユーザーが `n` を入力する
- **THEN** 何も変更せず exit code 0 で終了する

### MODIFY: `specrunner run` は起動前に fail-fast バリデーションを固定順序で実行する

ステップ 2 の検証内容を変更する:

2. `github.accessToken` が config に揃っていること（欠けている場合は `Run 'specrunner login' first.` + exit 1）
2.5. `runtime === "managed"` の場合: `SPECRUNNER_API_KEY` env var / `agents.design.agentId` / `environment.id` が揃っていること（欠けた項目に応じて `Run 'specrunner managed setup' first.` または `Set SPECRUNNER_API_KEY env var.` + exit 1、エラーコード `RUNTIME_PREREQ_MISSING`）

#### Scenario: managed runtime で SPECRUNNER_API_KEY が欠けている（ステップ 2.5 で失敗）

- **WHEN** `runtime: "managed"` の config で `SPECRUNNER_API_KEY` env var が未設定の状態で `specrunner run req.md` を実行する
- **THEN** ステップ 2.5 で `RUNTIME_PREREQ_MISSING` エラーで exit 1 し、`Set SPECRUNNER_API_KEY env var.` を hint として表示する

#### Scenario: local runtime ではステップ 2.5 をスキップする

- **WHEN** `runtime: "local"` の config で `specrunner run req.md` を実行する
- **THEN** ステップ 2.5 の managed 専用チェックは実行されない

### MODIFY: `specrunner` バイナリは 6 つのサブコマンドを提供する

**Replace with**: `specrunner` バイナリは 7 つのサブコマンド（+ managed 配下 3 つ）を提供する

`specrunner` CLI は SHALL `init`、`login`、`run`、`ps`、`doctor`、`finish`、`managed` の 7 サブコマンドを提供する。`managed` は `setup` / `status` / `reset` の 3 サブコマンドを持つ親コマンドである。

#### Scenario: help 表示

- **WHEN** `specrunner --help` を実行する
- **THEN** `init` は `Initialize config scaffold`、`login` は `Authenticate with GitHub via Device Flow OAuth`、`managed` は `Manage Anthropic Managed Agents resources` と表示される
- **AND** standard flow (local): `init -> login -> run` が例示される
- **AND** standard flow (managed): `init -> login -> (set SPECRUNNER_API_KEY) -> managed setup -> run` が例示される

### MODIFY: `specrunner doctor` は 7 カテゴリの環境前提条件を診断する

doctor の check registry を runtime 別に分離する:

- `commonChecks`: 両 runtime 共通（config / runtime / env / repo / storage 系）
- `managedChecks`: managed 専用（`SPECRUNNER_API_KEY` env var 存在 + 疎通、agents / environment の provider 側生存、definition drift）
- `localChecks`: local 専用（codex-cli 等）

`config.runtime` に応じて `commonChecks + managedChecks` または `commonChecks + localChecks` を実行する。

#### Scenario: local runtime では managed check が実行されない

- **WHEN** `runtime: "local"` の config で `specrunner doctor` を実行する
- **THEN** managed 専用 check（API key 疎通、agent 生存、environment 生存）は実行されない

#### Scenario: managed runtime で managed check が実行される

- **WHEN** `runtime: "managed"` の config で `specrunner doctor` を実行する
- **THEN** managed 専用 check が実行され、失敗時の hint は `"Run 'specrunner managed setup'."` を含む

---

## cli-config-store

### MODIFY: 設定ファイルは固定スキーマに従う

schema から以下を変更する:

- `anthropic.apiKey` フィールドを削除する。config に API key を保持しない
- `runtime` の未設定時のデフォルトを `"managed"` → `"local"` に変更する
- 既存 config に `anthropic` フィールドが残っていても validate を通る（無視される）

### MODIFY: 設定ファイルは runtime field を保持する

`runtime` field の default を変更する:

- 未設定の既存 config は `ConfigStore.load()` の migration で MUST `"local"` に正規化される（旧: `"managed"`）

#### Scenario: runtime field 未設定の既存 config

- **GIVEN** config ファイルが `runtime` field を持たない
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** in-memory `config.runtime` は `"local"` に正規化される

### MODIFY: local runtime では apiKey 不在を許容する

**Replace with**: config に apiKey フィールドが存在しない

config schema から `anthropic.apiKey` が削除されたため、両 runtime で apiKey は config に存在しない。managed runtime の API key は `SPECRUNNER_API_KEY` env var で渡す。

### MODIFY: 不完全な config（apiKey 欠落、managed runtime）

**Replace with**: managed runtime では apiKey は config に存在しない

- **WHEN** `runtime === "managed"` の config を読み込む
- **THEN** `anthropic.apiKey` の欠落による `CONFIG_INCOMPLETE` エラーは発生しない
- **AND** managed 専用の前提チェック（agents / environment / env var）は `checkRuntimePrereqs` で行われる

### MODIFY: `specrunner init --runtime=local` は steps.defaults を生成する

**Replace with**: `specrunner init` は steps.defaults を生成する

`specrunner init` は MUST config に `steps` セクションが存在しない場合、`steps.defaults` を追加する。`--runtime` フラグは廃止されたため、無条件で適用される。

### MODIFY: 機微情報は stdout に出力されない

`anthropic.apiKey` は config に存在しなくなるため、この制約は `github.accessToken` にのみ適用される。`SPECRUNNER_API_KEY` env var の値は `managed status` で存在有無（set/not set）のみ表示し、値自体は表示しない。
