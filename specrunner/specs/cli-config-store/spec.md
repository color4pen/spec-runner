## Purpose

Persist CLI authentication, agent IDs, and other config under the user's XDG config directory.
## Requirements
### Requirement: 設定ファイルは固定パスに保存される

設定ファイルは MUST `${XDG_CONFIG_HOME:-$HOME/.config}/specrunner/config.json` に保存される。CLI は SHALL このパス以外を config の正規ストアとして用いない。

#### Scenario: XDG_CONFIG_HOME 未設定

- **WHEN** `XDG_CONFIG_HOME` が未設定で `HOME=~`
- **THEN** ファイルパスは `~/.config/specrunner/config.json` になる

#### Scenario: XDG_CONFIG_HOME 設定済み

- **WHEN** `XDG_CONFIG_HOME=/tmp/cfg`
- **THEN** ファイルパスは `/tmp/cfg/specrunner/config.json` になる

### Requirement: 設定ファイルはパーミッション 0600 で保存される

config の作成・更新時、CLI は MUST ファイルパーミッションを `0600` に設定する。読み込み時にモードをチェックし、グループまたは other に読み権限がある場合は SHALL stderr に警告を出す（読み込み自体は継続）。

#### Scenario: 新規作成時のパーミッション

- **WHEN** `specrunner init` が config を新規作成する
- **THEN** ファイルパーミッションは 0600 で作成される

#### Scenario: 既存ファイルの権限が緩い

- **WHEN** 既存 config が 0644 で配置されている
- **THEN** stderr に `Warning: ~/.config/specrunner/config.json has loose permissions (recommend 0600).` を出力し、書き込み時には 0600 に修正する

> **Note**: `specrunner ps` は config を読み込むが書き込みを行わない read-only 経路である。ps 経路では permission の自動修正（`chmod 0600`）は行わない。これは意図的な設計であり、read-only 処理が副作用を持たないことを保証する。permission 修正が必要な場合は `specrunner init` または `specrunner login` の実行を促すこと。

### Requirement: 設定ファイルは固定スキーマに従う

設定ファイルは MUST 以下の構造を持つ JSON である:

- `version` (number, 現在値は `1`。将来の schema bump に備えて `number` 型で宣言するが、現時点での有効値は `1` のみ。未知の version 値を読み込んだ場合は `CONFIG_INVALID` エラーを throw する)
- `runtime` (string, `"managed"` または `"local"`、未設定時は `"managed"` に正規化される)
- `anthropic.apiKey` (string、`runtime === "local"` のときは空でも許容)
- `agents` (`Record<StepName, AgentRecord>`) — Step 名をキーとする単一マップ。各 `AgentRecord` は `{ agentId: string, definitionHash: string, lastSyncedAt: ISO8601 }`。`runtime === "local"` のときは空オブジェクトでも許容
- `environment.id` (string)
- `environment.lastSyncedAt` (ISO8601)
- `github.accessToken` (string)
- `github.tokenObtainedAt` (ISO8601)
- `github.scopes` (string[])
- `pipeline.maxRetries` (number、既定 2)
- `steps` (`StepConfigMap`, optional) — Step 実行パラメータの外部設定。以下の構造を持つ:
  - `steps.defaults` (`StepExecutionConfig`, optional) — 全 step に適用されるデフォルト値
  - `steps.<stepName>` (`StepExecutionConfig`, optional) — 特定 step のオーバーライド値
  - `StepExecutionConfig` は以下のフィールドを持つ:
    - `model` (string, optional) — 使用する model 名（例: `"claude-opus-4-6[1m]"`）
    - `maxTurns` (number | null, optional) — 最大ターン数。`null` は unlimited を意味する
    - `timeoutMs` (number | null, optional) — タイムアウト（ミリ秒）。`null` は no timeout を意味する。現時点では config 定義のみで未使用

`init` 直後はまだ login 未実行のため `github` ブロックは未設定でもよく、CLI は SHALL この欠落を許容する。

`agents` マップは MUST `Record<StepName, AgentRecord>` の単一マップであり、Step 名（`"propose"`, `"spec-review"`, `"spec-fixer"` など）をキーとする。固定キー型 `agents.propose` / `agents.specReview` / `agents.specFixer` を持つ中間スキーマは廃止される。

CLI は SHALL このスキーマを唯一の正として書き込み・読み込みを行う。

#### Scenario: 不完全な config（apiKey 欠落、managed runtime）

- **WHEN** `runtime === "managed"` の config に `anthropic.apiKey` が無い
- **THEN** 読み込み時に `CONFIG_INCOMPLETE` エラーを発生させ、`Run 'specrunner init' first.` を返す

#### Scenario: 不完全な config（apiKey 欠落、local runtime は許容）

- **WHEN** `runtime === "local"` の config に `anthropic.apiKey` が無い
- **THEN** 読み込みは success で `CONFIG_INCOMPLETE` エラーは発生しない
- **AND** in-memory `config.anthropic.apiKey` は空文字列または undefined のまま保持される

#### Scenario: login 未実行の状態で run を実行する

- **WHEN** init 完了後 login 未実行で `specrunner run` を実行する
- **THEN** `github.accessToken` が無いことを検知し、`Run 'specrunner login' first.` を返す

#### Scenario: spec-review Agent ID 欠落（managed runtime のみ）

- **WHEN** `runtime === "managed"` で `specrunner run` 実行時に `config.agents["spec-review"]` が未設定
- **THEN** `CONFIG_INCOMPLETE` エラーで `Run 'specrunner init' to create the spec-review agent.` を返す

#### Scenario: spec-review Agent ID 欠落（local runtime は許容）

- **WHEN** `runtime === "local"` で `specrunner run` 実行時に `config.agents["spec-review"]` が未設定
- **THEN** `CONFIG_INCOMPLETE` エラーは発生しない
- **AND** ClaudeCodeRunner 経由で spec-review step が実行される

#### Scenario: agents マップが単一形である

- **GIVEN** `specrunner init` 完了後の config
- **WHEN** JSON を確認する
- **THEN** `config.agents` は `Record<StepName, AgentRecord>` 形である
- **AND** `config.agent`（旧 単数形）は存在しない
- **AND** `config.agents` の固定キー型（`propose` / `specReview` / `specFixer` のみを持つ型）ではなく、任意の StepName をキーとして許容する形である

#### Scenario: steps セクション未設定の後方互換

- **GIVEN** 既存の config に `steps` セクションが存在しない
- **WHEN** config を読み込む
- **THEN** 読み込みは正常に完了し、`config.steps` は `undefined` である
- **AND** 既存の動作（step 定義のハードコード値を使用）が維持される

#### Scenario: steps.defaults で全 step のデフォルトを設定

- **GIVEN** config に `{ "steps": { "defaults": { "model": "claude-opus-4-6[1m]", "maxTurns": null } } }` が設定されている
- **WHEN** config を読み込む
- **THEN** `config.steps.defaults.model` は `"claude-opus-4-6[1m]"` である
- **AND** `config.steps.defaults.maxTurns` は `null`（unlimited）である

#### Scenario: step 個別設定がデフォルトを上書きする

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": 30 }, "implementer": { "maxTurns": 100 } } }` が設定されている
- **WHEN** config を読み込む
- **THEN** `config.steps.implementer.maxTurns` は `100` である
- **AND** `config.steps.defaults.maxTurns` は `30` である

### Requirement: 設定の更新は atomic に行う

config の書き込みは MUST `<path>.tmp.<random>` に書き込み後に rename する atomic write で行う。CLI は SHALL 部分書き込みされた config を残さない。

#### Scenario: 書き込み途中の異常終了

- **WHEN** init 中にプロセスが kill される
- **THEN** 既存の config は破損せず保持される

### Requirement: 機微情報は stdout に出力されない

`anthropic.apiKey` および `github.accessToken` は MUST CLI の通常出力（stdout）に出力されてはならない。デバッグログでも SHALL マスク（先頭 6 文字 + `...`）が必須である。

#### Scenario: init 完了メッセージ

- **WHEN** `specrunner init` が完了する
- **THEN** stdout に `apiKey` の生値が一切含まれず、`API key configured (sk-ant-...).` のようなマスク表記のみ含まれる

### Requirement: ロール解決はフォールバックチェーンに従う

CLI は MUST `getAgentId(config, role: StepName)` ヘルパを提供する。解決順は以下:

1. `config.agents[role].agentId` が存在し非空文字列 → それを返す
2. それ以外 → `CONFIG_INCOMPLETE` エラーを throw する

旧 schema の "propose role に限り `config.agent.id` を fallback として返す" ロジックは MUST 廃止される。

#### Scenario: propose ロールの直引き

- **WHEN** `config.agents.propose.agentId = "agent_01x"`
- **THEN** `getAgentId(config, "propose")` は `"agent_01x"` を返す

#### Scenario: legacy fallback の廃止

- **WHEN** `config.agents.propose` が未設定で、旧形式の `config.agent.id = "agent_01x"` のみ存在する（migration が走る前の生 JSON 状態）
- **THEN** `getAgentId(config, "propose")` は `CONFIG_INCOMPLETE` エラーを throw する
- **AND** 旧形式の自動 fallback は発生しない

#### Scenario: spec-fixer ロールで legacy fallback は不可

- **WHEN** `config.agents["spec-fixer"]` が未設定
- **THEN** `getAgentId(config, "spec-fixer")` は `CONFIG_INCOMPLETE` エラーを throw する

### Requirement: `pipeline.maxRetries` は iteration loop の上限値である

`config.pipeline.maxRetries` は MUST `runLoopUntil` の `maxIterations` に渡される正整数である。値は SHALL 1 以上 10 以下に制約され、範囲外は `CONFIG_INVALID` エラーで拒絶される。未設定時は SHALL 既定値 2 を採用する。

#### Scenario: 既定値の採用

- **WHEN** `config.pipeline.maxRetries` が未設定
- **THEN** `runPipeline` は loop プリミティブに `maxIterations: 2` を渡す

#### Scenario: 範囲外の値

- **WHEN** `config.pipeline.maxRetries = 0` で config 読み込みを試みる
- **THEN** `CONFIG_INVALID` エラーで `pipeline.maxRetries must be between 1 and 10.` を返す

### Requirement: config 書き込みは新形式のみを書き込む

`specrunner init` が config を書き込む際、CLI は MUST `agents: Record<StepName, AgentRecord>` の新形式のみを書き込む。旧 `config.agent` フィールドは MUST 書き込まれない。

#### Scenario: 新形式の単独書き込み

- **WHEN** `specrunner init` が propose Agent を新規作成し ID `agent_01x` を得る
- **THEN** config 書き込み後、`config.agents.propose.agentId === "agent_01x"` が成立する
- **AND** `config.agent` フィールドは存在しない（書き込みコードが触らない）

### Requirement: ConfigStore は load 時に旧 schema を新 schema に migration する

`ConfigStore.load()` は MUST ファイルから読み込んだ JSON が旧 schema（`agent` 単数）または中間 schema（`agents.{propose,specReview,specFixer}` 固定キー）の形である場合、新 schema（`agents: Record<StepName, AgentRecord>`）に in-memory で詰め直す。`ConfigStore.save()` で永続化された時点で新 schema に書き換わる。Migration は SHALL idempotent である（既に新 schema なら no-op）。

#### Scenario: 旧 schema（agent 単数のみ）→ 新 schema migration

- **GIVEN** config ファイルが `{ "agent": { "id": "agent_01x", "definitionHash": "abc", "lastSyncedAt": "2026-04-29T00:00:00Z" } }` のみを持つ
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** in-memory の `config.agents.propose` が `{ agentId: "agent_01x", definitionHash: "abc", lastSyncedAt: "2026-04-29T00:00:00Z" }` で詰め直される
- **AND** `config.agent` は読み捨てられ、in-memory 表現には含まれない

#### Scenario: 中間 schema（agents.specReview / agents.specFixer など固定キー）→ 新 schema migration

- **GIVEN** config ファイルが `{ "agents": { "propose": {...}, "specFixer": {...} } }` の固定キー形である
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** in-memory の `config.agents` が `Record<StepName, AgentRecord>` 形に詰め直され、キーは `"propose"` および `"spec-fixer"`（StepName の正規形）になる
- **AND** 中間 schema の固定キー（`specFixer` の camelCase 形式など）は使われない

**正規化ルール（MUST）**:
- `"specFixer"` → `"spec-fixer"`
- `"specReview"` → `"spec-review"`
- `"propose"` → `"propose"`（変換不要）

これらの camelCase → kebab-case 変換は MUST migration 時に適用され、`ConfigStore.save()` 後の永続 JSON には camelCase キーが現れてはならない。

#### Scenario: 旧 schema と中間 schema の両方が併存

- **GIVEN** config ファイルが `agent: {...}` と `agents.propose: {...}` の両方を持つ
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** `agents.propose` が採用され、`agent` は読み捨てられる

#### Scenario: 新 schema は no-op

- **GIVEN** config ファイルが既に新 schema（`agents: Record<StepName, AgentRecord>`）の形である
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** in-memory 表現はファイル内容と等価で、変換は発生しない

#### Scenario: 片側欠損（agents.propose のみ存在、spec-review / spec-fixer 未設定）

- **GIVEN** config ファイルが `agents: { propose: {...} }` のみを持つ
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** in-memory の `config.agents` は `propose` のみを持つ
- **AND** `config.agents["spec-review"]` および `config.agents["spec-fixer"]` は未定義のままである（次の `syncAll()` で新規作成される）

#### Scenario: どちらも未設定（新規 init）

- **GIVEN** config ファイルが `agents` も `agent` も持たない（または config ファイル自体が存在しない）
- **WHEN** `ConfigStore.load()` を呼ぶ（または初期化する）
- **THEN** in-memory の `config.agents` は `{}`（空オブジェクト）で初期化される

### Requirement: ConfigStore.save() は atomic に新 schema を書き込む

`ConfigStore.save(config)` は MUST `<path>.tmp.<random>` への書き込み後 rename する atomic write を行い、書き込む内容は SHALL 新 schema のみである（旧 `agent` 単数や中間固定キーは書かない）。書き込み権限は MUST `0600` である。

#### Scenario: save 後の永続表現

- **GIVEN** in-memory config が `config.agents = { propose: {...}, "spec-review": {...} }` を持つ
- **WHEN** `ConfigStore.save(config)` を呼ぶ
- **THEN** ファイルには `agents: Record<StepName, AgentRecord>` 形のみが書き込まれる
- **AND** `agent`（旧形）フィールドは出力に存在しない
- **AND** ファイルパーミッションは 0600 である

### Requirement: 設定ファイルは runtime field を保持する

config schema は MUST top-level に `runtime: "managed" | "local"` field を持つ。値は SHALL `"managed"` または `"local"` のみ許容され、それ以外は `CONFIG_INVALID` エラーで拒絶される。未設定の既存 config は `ConfigStore.load()` の migration で MUST `"managed"` に正規化される（idempotent）。

`runtime === "local"` の場合、`anthropic.apiKey` および `agents` map は MUST 空のままでもよく、CLI は SHALL この欠落を許容する。`runtime === "managed"` の場合は既存挙動通り `anthropic.apiKey` および `agents` の各 entry が必要である。

#### Scenario: managed runtime の正常 load

- **GIVEN** config ファイルが `{ "version": 1, "runtime": "managed", "anthropic": { "apiKey": "sk-..." }, "agents": { "propose": {...} } }` を持つ
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** in-memory `config.runtime === "managed"` である
- **AND** load は success である

#### Scenario: local runtime の正常 load

- **GIVEN** config ファイルが `{ "version": 1, "runtime": "local" }` のみを持つ（apiKey も agents も無い）
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** in-memory `config.runtime === "local"` である
- **AND** `config.anthropic.apiKey` 不在で `CONFIG_INCOMPLETE` エラーは発生しない
- **AND** `config.agents` は空オブジェクトのまま

#### Scenario: runtime field 未設定の既存 config

- **GIVEN** config ファイルが `runtime` field を持たない（本 change 適用前の形式）
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** in-memory `config.runtime` は `"managed"` に正規化される
- **AND** `ConfigStore.save()` 後の永続 JSON にも `runtime: "managed"` が書き込まれる

#### Scenario: 不正な runtime 値

- **GIVEN** config ファイルが `{ "version": 1, "runtime": "remote" }` を持つ
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーで `runtime must be "managed" or "local".` を返す

### Requirement: local runtime では apiKey 不在を許容する

`config.runtime === "local"` の場合、CLI は MUST `anthropic.apiKey` の存在チェックを skip する。`getAgentId(config, role)` 系の解決路は SHALL `runtime === "managed"` のときにのみ呼ばれる経路となる（呼び出し側 = CLI composition root の責務）。

#### Scenario: local runtime で apiKey 不在でも run できる

- **GIVEN** `config.runtime === "local"` で `config.anthropic.apiKey` が空である
- **WHEN** `specrunner run` を実行する
- **THEN** `CONFIG_INCOMPLETE` で startup が止まることはない
- **AND** Anthropic API への HTTP リクエストは pipeline 中に発生しない（pr-create の GitHub API は別系統）

#### Scenario: managed runtime では apiKey 必須が継続する

- **GIVEN** `config.runtime === "managed"` で `config.anthropic.apiKey` が空である
- **WHEN** `ConfigStore.load()` を呼ぶ、または `specrunner run` を実行する
- **THEN** `CONFIG_INCOMPLETE` エラーで `Run 'specrunner init' first.` を返す（既存挙動）

### Requirement: 廃止 timeout キーは silently ignore される

ConfigStore は MUST 旧 schema の `specReview.timeoutMs` / `specFixer.timeoutMs` / top-level `timeout` キーを読み取り時に warn / error なしで無視する。これらのキーは SHALL `ConfigStore.save()` で書き出されず、in-memory `SpecRunnerConfig` 型からも除外される。`pollIntervalMs` 等 timeout 以外の executor 設定の扱いは本 Requirement の対象外である。

#### Scenario: 旧 config の `specReview.timeoutMs` を含むファイルを読み込む

- **GIVEN** 既存 config ファイルが `{ "specReview": { "timeoutMs": 600000 }, "anthropic": { "apiKey": "sk-ant-..." }, ... }` を含む
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** load は成功し、warn / error は出力されない
- **AND** in-memory `config.specReview.timeoutMs` は存在しない（型に含まれない）

#### Scenario: 旧 config の top-level `timeout` を含むファイルを読み込む

- **GIVEN** 既存 config ファイルが `{ "timeout": "30m", ... }` を含む
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** load は成功し、warn / error は出力されない
- **AND** in-memory `config.timeout` は存在しない

#### Scenario: save 後のファイルから timeout キーが消える

- **GIVEN** load 直後の in-memory config（旧 timeout キーは無視済み）
- **WHEN** `ConfigStore.save(config)` を呼ぶ
- **THEN** 永続化されたファイルに `specReview.timeoutMs` / `specFixer.timeoutMs` / top-level `timeout` キーは含まれない

### Requirement: step 実行パラメータの解決順序

CLI は MUST `getStepExecutionConfig(config, stepName, stepDefaults)` ヘルパを提供する。解決順は以下:

1. `config.steps?.[stepName]?.[field]` が `undefined` でない → その値を使用
2. `config.steps?.defaults?.[field]` が `undefined` でない → その値を使用
3. `stepDefaults[field]` が `undefined` でない → その値を使用（step 定義のハードコード値）
4. フィールド固有のフォールバック: `model` は step 定義の値が必ず存在するため到達しない。`maxTurns` は `undefined` のまま（SDK 側で unlimited）。`timeoutMs` は `null`（no timeout）

解決時、`null` は SHALL 有効値として扱われる（「制限なし」を明示的に指定）。`undefined`（JSON でキーが不在）のみが「未設定、次の fallback に進む」を意味する。

`ResolvedStepConfig` は MUST 以下の型を持つ:
- `model: string` — 必ず解決済み
- `maxTurns: number | null` — `null` = unlimited
- `timeoutMs: number | null` — `null` = no timeout

#### Scenario: config step-level が最優先で解決される

- **GIVEN** config に `{ "steps": { "defaults": { "model": "claude-sonnet-4-6" }, "propose": { "model": "claude-opus-4-6[1m]" } } }` が設定されている
- **AND** step 定義のハードコード model が `"claude-opus-4-6[1m]"` である
- **WHEN** `getStepExecutionConfig(config, "propose", { model: "claude-opus-4-6[1m]" })` を呼ぶ
- **THEN** `resolved.model` は `"claude-opus-4-6[1m]"`（config step-level の値）である

#### Scenario: config defaults が step 定義より優先される

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": null } } }` が設定されている
- **AND** step 定義のハードコード maxTurns が `60` である
- **AND** `config.steps.implementer` は未設定
- **WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-sonnet-4-6", maxTurns: 60 })` を呼ぶ
- **THEN** `resolved.maxTurns` は `null`（unlimited、config defaults の値）である

#### Scenario: config 未設定時は step 定義のハードコード値を使用

- **GIVEN** config に `steps` セクションが存在しない
- **AND** step 定義のハードコード model が `"claude-sonnet-4-6"` で maxTurns が `30` である
- **WHEN** `getStepExecutionConfig(config, "spec-fixer", { model: "claude-sonnet-4-6", maxTurns: 30 })` を呼ぶ
- **THEN** `resolved.model` は `"claude-sonnet-4-6"` である
- **AND** `resolved.maxTurns` は `30` である

#### Scenario: null は有効値として解決される

- **GIVEN** config に `{ "steps": { "implementer": { "maxTurns": null } } }` が設定されている
- **AND** step 定義のハードコード maxTurns が `60` である
- **WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-sonnet-4-6", maxTurns: 60 })` を呼ぶ
- **THEN** `resolved.maxTurns` は `null`（unlimited）である
- **AND** step 定義の `60` は使用されない

#### Scenario: timeoutMs のデフォルトは null

- **GIVEN** config に `steps` セクションが存在しない
- **WHEN** `getStepExecutionConfig(config, "propose", { model: "claude-opus-4-6[1m]" })` を呼ぶ
- **THEN** `resolved.timeoutMs` は `null`（no timeout）である

### Requirement: specrunner init --runtime=local は steps.defaults を生成する

`specrunner init --runtime=local` は MUST config に `steps` セクションが存在しない場合、以下の `steps.defaults` を追加する:

```json
{
  "steps": {
    "defaults": {
      "model": "claude-sonnet-4-6",
      "maxTurns": null,
      "timeoutMs": null
    }
  }
}
```

既存 config に `steps` セクションが既に存在する場合は SHALL 上書きしない。

#### Scenario: 新規 init で steps.defaults が生成される

- **GIVEN** config ファイルが存在しない
- **WHEN** `specrunner init --runtime=local` を実行する
- **THEN** 生成された config に `steps.defaults` が含まれる
- **AND** `steps.defaults.model` は `"claude-sonnet-4-6"` である
- **AND** `steps.defaults.maxTurns` は `null` である
- **AND** `steps.defaults.timeoutMs` は `null` である

#### Scenario: 既存 config に steps がない場合に追加される

- **GIVEN** 既存 config に `steps` セクションが存在しない
- **WHEN** `specrunner init --runtime=local` を実行する
- **THEN** config に `steps.defaults` が追加される
- **AND** 既存の他のフィールド（agents, github 等）は保持される

#### Scenario: 既存 config に steps がある場合は上書きしない

- **GIVEN** 既存 config に `{ "steps": { "defaults": { "maxTurns": 50 } } }` が設定されている
- **WHEN** `specrunner init --runtime=local` を実行する
- **THEN** `config.steps.defaults.maxTurns` は `50` のまま変更されない

### Requirement: steps config の値は型と範囲が検証される

`validateConfig()` は MUST `steps` セクションが存在する場合、各 `StepExecutionConfig` のフィールドを以下のルールで検証する:

- `model`: `string` 型かつ空文字列でないこと。違反時は `CONFIG_INVALID` エラーを throw する
- `maxTurns`: `number` 型（正整数、>= 1）または `null` であること。`0`、負数、小数、文字列は `CONFIG_INVALID` エラーを throw する
- `timeoutMs`: `number` 型（正整数、>= 1）または `null` であること。`0`、負数、小数、文字列は `CONFIG_INVALID` エラーを throw する

未指定（`undefined` / JSON でキーが不在）のフィールドは SHALL 検証をスキップする（解決順序で後続の fallback に委ねる）。

検証は `steps.defaults` および `steps.<stepName>` の全エントリに対して適用される。

> **Note**: `steps` のキー名（step 名）自体の存在検証は本 change では対象外とする。存在しない step 名はサイレントに無視される（将来 `specrunner doctor` で検証可能にする）。

#### Scenario: maxTurns に負数を設定した場合

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": -1 } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: maxTurns に 0 を設定した場合

- **GIVEN** config に `{ "steps": { "implementer": { "maxTurns": 0 } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: maxTurns に文字列を設定した場合

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": "unlimited" } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: model に空文字列を設定した場合

- **GIVEN** config に `{ "steps": { "propose": { "model": "" } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: timeoutMs に負数を設定した場合

- **GIVEN** config に `{ "steps": { "defaults": { "timeoutMs": -500 } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: null は有効値として検証を通過する

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": null, "timeoutMs": null } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する

#### Scenario: 未指定フィールドは検証をスキップする

- **GIVEN** config に `{ "steps": { "implementer": { "model": "claude-opus-4-6[1m]" } } }` が設定されている（maxTurns と timeoutMs は未指定）
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する

### Requirement: steps config は local runtime でのみ効果を持つ

`config.steps` の設定は SHALL `runtime: "local"`（ClaudeCodeRunner）でのみ step 実行パラメータに反映される。`runtime: "managed"`（ManagedAgentRunner）では `config.steps` は読み込まれるが step 実行には適用されない（Managed Agents API が session 単位の model / maxTurns 変更をサポートしないため）。

config の読み込み・validation 自体は runtime に関わらず実行される（steps セクションの型・範囲検証は managed runtime でも適用される）。

> **Note**: managed runtime で steps を設定してもエラーにはならないが、設定は step 実行に反映されない。将来 Managed Agents API が対応した場合に拡張する。

#### Scenario: managed runtime で steps 設定が存在しても読み込みは成功する

- **GIVEN** config に `runtime: "managed"` と `{ "steps": { "defaults": { "maxTurns": 100 } } }` が設定されている
- **WHEN** config を読み込む
- **THEN** 読み込みは正常に完了し、`config.steps.defaults.maxTurns` は `100` である
- **AND** ManagedAgentRunner は `config.steps` を参照せず、agent 定義の値を使用する

