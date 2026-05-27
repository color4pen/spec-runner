## Purpose

Persist CLI authentication, agent IDs, and other config under the user's XDG config directory.
## Requirements

### Requirement: 設定ファイルは固定パスに保存される

設定ファイルは MUST `${XDG_CONFIG_HOME:-$HOME/.config}/specrunner/config.json` (user global) に保存される。CLI は SHALL このパス以外を user global config の正規ストアとして用いない。

#### Scenario: XDG_CONFIG_HOME 未設定

- **WHEN** `XDG_CONFIG_HOME` が未設定で `HOME=~`
- **THEN** user global ファイルパスは `~/.config/specrunner/config.json` になる

#### Scenario: XDG_CONFIG_HOME 設定済み

- **WHEN** `XDG_CONFIG_HOME=/tmp/cfg`
- **THEN** user global ファイルパスは `/tmp/cfg/specrunner/config.json` になる

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

- `version` (number, 現在値は `1`)
- `runtime` (string, `"managed"` または `"local"`)
- `agents` (`Record<StepName, AgentRecord>`)
- `environment.id` (string)
- `environment.lastSyncedAt` (ISO8601)
- `pipeline.maxRetries` (number)
- `steps` (`StepConfigMap`, optional) — Step 実行パラメータの外部設定。以下の構造を持つ:
  - `steps.defaults` (`StepExecutionConfig`, optional) — 全 step に適用されるデフォルト値
  - `steps.<stepName>` (`StepExecutionConfig`, optional) — 特定 step のオーバーライド値
  - `StepExecutionConfig` は以下のフィールドを持つ:
    - `model` (string, optional) — 使用する model 名（例: `"claude-opus-4-6[1m]"`）
    - `maxTurns` (number | null, optional) — 最大ターン数。`null` は unlimited を意味する
    - `timeoutMs` (number | null, optional) — タイムアウト（ミリ秒）。`null` は no timeout を意味する
    - `byRequestType` (`Record<string, StepExecutionConfig>`, optional) — request type ごとの override。key は request type 名（`"bug-fix"` / `"spec-change"` / `"new-feature"` 等）、value は `StepExecutionConfig`（ただし `byRequestType` のネストは MUST 禁止、1 階層のみ）
- `progress` (`ProgressConfig`, optional)
- `models` (`ModelsConfig`, optional)
- `verification` (`VerificationConfig`, optional) — verification step の実行方法を設定。以下の構造を持つ:
  - `verification.commands` (`(string | { name?: string; run: string })[]`, optional) — 順次実行する command 配列。各 command は `sh -c` 経由で実行される。fail-fast（1 件失敗で残り skip）。未定義時は既存の phase 検出 fallback（`package.json` script → `bun run`）を使用する

`jobs` section は廃止された。旧 config に `jobs` section が残っていても SHALL 未知 field として無視される（error にならない）。`JobsConfig` 型は削除される。

#### Scenario: jobs section が残っていても無視される

- **WHEN** 既存の config file に `{ "jobs": { "location": "xdg" } }` が含まれている
- **THEN** config load は成功し、jobs section は無視される
- **AND** CLI は常に `<repo-root>/.specrunner/` をジョブ格納先として使用する

#### Scenario: byRequestType を含む steps 設定が読み込まれる

- **GIVEN** config に以下が設定されている:
  ```json
  { "steps": { "design": { "model": "claude-opus-4-6[1m]", "byRequestType": { "bug-fix": { "model": "claude-sonnet-4-6" } } } } }
  ```
- **WHEN** config を読み込む
- **THEN** `config.steps.design.byRequestType["bug-fix"].model` は `"claude-sonnet-4-6"` である

#### Scenario: byRequestType 未設定の後方互換

- **GIVEN** 既存の config に `byRequestType` が含まれない steps 設定がある
- **WHEN** config を読み込む
- **THEN** 読み込みは正常に完了する
- **AND** 既存の step config resolution（4 レベル）と同等の挙動が維持される

#### Scenario: verification.commands を含む config が読み込まれる

- **GIVEN** config に以下が設定されている:
  ```json
  { "verification": { "commands": ["bun run build", "bun run test", { "name": "lint", "run": "eslint ./src" }] } }
  ```
- **WHEN** config を読み込む
- **THEN** `config.verification.commands` は 3 要素の配列として取得される

#### Scenario: verification section なしの後方互換

- **GIVEN** 既存の config に `verification` section が含まれない
- **WHEN** config を読み込む
- **THEN** 読み込みは正常に完了する
- **AND** `config.verification` は `undefined` である

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

CLI は MUST `getStepExecutionConfig(config, stepName, stepDefaults, requestType?)` ヘルパを提供する。解決順は以下:

1. `config.steps?.[stepName]?.byRequestType?.[requestType]?.[field]` が `undefined` でない → その値を使用（type 別 step level）
2. `config.steps?.[stepName]?.[field]` が `undefined` でない → その値を使用（step level）
3. `config.steps?.defaults?.byRequestType?.[requestType]?.[field]` が `undefined` でない → その値を使用（type 別 default）
4. `config.steps?.defaults?.[field]` が `undefined` でない → その値を使用（global default）
5. `stepDefaults[field]` が `undefined` でない → その値を使用（step 定義のハードコード値）
6. フィールド固有のフォールバック: `model` は step 定義の値が必ず存在するため到達しない。`maxTurns` は `null`（unlimited）。`timeoutMs` は `null`（no timeout）

`requestType` が未指定（undefined）の場合、level 1 と 3 は SHALL スキップされ、既存の 4 レベル解決（level 2, 4, 5, 6）と同等の挙動を維持する。

解決時、`null` は SHALL 有効値として扱われる（「制限なし」を明示的に指定）。`undefined`（JSON でキーが不在）のみが「未設定、次の fallback に進む」を意味する。

`ResolvedStepConfig` は MUST 以下の型を持つ:
- `model: string` — 必ず解決済み
- `maxTurns: number | null` — `null` = unlimited
- `timeoutMs: number | null` — `null` = no timeout

#### Scenario: type 別 step level が最優先で解決される

- **GIVEN** config に `{ "steps": { "design": { "model": "claude-opus-4-6[1m]", "byRequestType": { "bug-fix": { "model": "claude-sonnet-4-6" } } } } }` が設定されている
- **AND** step 定義のハードコード model が `"claude-opus-4-6[1m]"` である
- **WHEN** `getStepExecutionConfig(config, "design", { model: "claude-opus-4-6[1m]" }, "bug-fix")` を呼ぶ
- **THEN** `resolved.model` は `"claude-sonnet-4-6"`（type 別 step level の値）である

#### Scenario: step level が type 別 default より優先される

- **GIVEN** config に `{ "steps": { "defaults": { "byRequestType": { "bug-fix": { "model": "claude-sonnet-4-6" } } }, "design": { "model": "claude-opus-4-6[1m]" } } }` が設定されている
- **WHEN** `getStepExecutionConfig(config, "design", { model: "claude-sonnet-4-6" }, "bug-fix")` を呼ぶ
- **THEN** `resolved.model` は `"claude-opus-4-6[1m]"`（step level の値）である
- **AND** type 別 default の `"claude-sonnet-4-6"` は使用されない

#### Scenario: type 別 default が global default より優先される

- **GIVEN** config に `{ "steps": { "defaults": { "model": "claude-sonnet-4-6", "byRequestType": { "spec-change": { "model": "claude-opus-4-6[1m]" } } } } }` が設定されている
- **AND** `config.steps.design` は未設定
- **WHEN** `getStepExecutionConfig(config, "design", { model: "claude-sonnet-4-6" }, "spec-change")` を呼ぶ
- **THEN** `resolved.model` は `"claude-opus-4-6[1m]"`（type 別 default の値）である

#### Scenario: requestType 未指定で既存 4 レベル解決と同等

- **GIVEN** config に `{ "steps": { "defaults": { "model": "claude-sonnet-4-6" }, "design": { "model": "claude-opus-4-6[1m]" } } }` が設定されている
- **WHEN** `getStepExecutionConfig(config, "design", { model: "claude-sonnet-4-6" })` を呼ぶ（requestType 省略）
- **THEN** `resolved.model` は `"claude-opus-4-6[1m]"`（step level の値）である
- **AND** byRequestType は参照されない

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
- `byRequestType`: `object` 型であること。key は非空文字列であること。各 value は上記の `StepExecutionConfig` 検証を再帰的に適用する。value 内にネストした `byRequestType` が存在する場合は `CONFIG_INVALID` を throw する

未指定（`undefined` / JSON でキーが不在）のフィールドは SHALL 検証をスキップする（解決順序で後続の fallback に委ねる）。

検証は `steps.defaults` および `steps.<stepName>` の全エントリに対して適用される。

`byRequestType` の key（request type 名）について:
- 空文字列 key は MUST `CONFIG_INVALID` で reject する
- 既知の type 集合（`bug-fix` / `spec-change` / `new-feature` / `refactoring` / `chore`）と一致しない key は SHALL warning ログのみ出力し、reject しない

error message には MUST 問題の key path が含まれる（例: `CONFIG_INVALID: steps.code-review.byRequestType.spec-change.model must be a non-empty string`）。

> **Note**: `steps` のキー名（step 名）自体の存在検証は本 change では対象外とする。存在しない step 名はサイレントに無視される（将来 `specrunner doctor` で検証可能にする）。

#### Scenario: byRequestType 内の valid config が検証を通過する

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "bug-fix": { "model": "claude-sonnet-4-6" } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する

#### Scenario: byRequestType の空文字列 key で CONFIG_INVALID

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "": { "model": "claude-sonnet-4-6" } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される
- **AND** error message に `steps.design.byRequestType` が含まれる

#### Scenario: byRequestType 内の model 空文字列で CONFIG_INVALID

- **GIVEN** config に `{ "steps": { "code-review": { "byRequestType": { "spec-change": { "model": "" } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される
- **AND** error message に `steps.code-review.byRequestType.spec-change.model` が含まれる

#### Scenario: ネストした byRequestType で CONFIG_INVALID

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "bug-fix": { "byRequestType": { "nested": { "model": "x" } } } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: 未知 type key が warning のみで通過する

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "unknown-type": { "model": "claude-sonnet-4-6" } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する
- **AND** stderr に warning が出力される

#### Scenario: byRequestType 内の maxTurns / timeoutMs が検証される

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "bug-fix": { "maxTurns": -1 } } } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される
- **AND** error message に `steps.design.byRequestType.bug-fix.maxTurns` が含まれる

#### Scenario: maxTurns に負数を設定した場合

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": -1 } } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: model に空文字列を設定した場合

- **GIVEN** config に `{ "steps": { "propose": { "model": "" } } }` が設定されている
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

### Requirement: project local config は repo root 配下に配置され user global に overlay される

CLI は MUST `<repo-root>/.specrunner/config.json` を project local config として認識する。`loadConfig(repoRoot?)` は以下の優先順で config を解決する:

1. `~/.config/specrunner/config.json` (user global) を読み込む → base
2. `<repoRoot>/.specrunner/config.json` (project local) が存在する場合、読み込む → overlay
3. deep merge で overlay が base を上書き、不在 key は base を継承

不在時の挙動:
- **両方存在**: project local は partial overlay として許容される（必須 field 全部書かなくて OK、user global の値を継承）
- **user global なし + project local のみ**: project local は standalone config として valid（`version: 1` + 必須 field を含む完全な schema）でなければならない。部分 config だけだと `CONFIG_INVALID`
- **project local なし + user global のみ**: 既存挙動（regression なし）
- **両方なし**: 既存挙動通り（`CONFIG_MISSING`）

deep merge のルール:
- object 型の value は再帰的に merge
- primitive は overlay が上書き
- overlay に key が不在（undefined）→ base を維持
- overlay に `null` → `null` で上書き

`repoRoot` が `loadConfig()` に渡されない場合は SHALL user global config のみを使用する（既存挙動と完全同等）。

repo root 解決は既存の `resolveRepoRoot()` (`src/util/repo-root.ts`) を再利用する。

#### Scenario: user global + project local が deep merge される

- **GIVEN** user global に `{ "version": 1, "steps": { "defaults": { "model": "claude-sonnet-4-6" } } }` が存在する
- **AND** project local に `{ "steps": { "design": { "model": "claude-opus-4-6[1m]" } } }` が存在する
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** merged config の `steps.defaults.model` は `"claude-sonnet-4-6"`（user global から継承）
- **AND** `steps.design.model` は `"claude-opus-4-6[1m]"`（project local から上書き）

#### Scenario: project local のみで standalone config として valid

- **GIVEN** user global config が存在しない
- **AND** project local に `{ "version": 1, "runtime": "local", "agents": {}, "steps": { "defaults": { "model": "claude-sonnet-4-6" } } }` が存在する
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** config load は成功し、`config.steps.defaults.model` は `"claude-sonnet-4-6"` である

#### Scenario: project local のみで部分 config も migration により valid として扱われる

- **GIVEN** user global config が存在しない
- **AND** project local に `{ "steps": { "design": { "model": "claude-opus-4-6[1m]" } } }` のみが存在する（version なし）
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** config load は成功する。`applyMigration()` が `version: 1` と `agents: {}` を自動補完するため、部分 config でも standalone として valid と判定される。model が有効な registry エントリを指していれば `CONFIG_INVALID` にならない。
- **NOTE**: 当初の仕様では「部分 config のみで CONFIG_INVALID」としていたが、`applyMigration()` の version 補完挙動を活用することで partial overlay も standalone として動作するよう決定した（impl が仕様より先行、ここで仕様を実装に合わせて修正）。

#### Scenario: project local なしで既存挙動

- **GIVEN** user global config のみが存在する
- **AND** `<repoRoot>/.specrunner/config.json` が存在しない
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** user global config がそのまま返される（既存挙動と同等）

#### Scenario: repoRoot 未指定で user global のみ

- **WHEN** `loadConfig()` を呼ぶ（repoRoot 省略）
- **THEN** user global config のみが読み込まれる
- **AND** project local config は一切参照されない

#### Scenario: project local config の JSON parse error

- **GIVEN** user global config が valid で存在する
- **AND** project local config が不正な JSON（parse error）である
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが throw される

### Requirement: CLI entry は起動直後に config を load する

各 CLI command は MUST pipeline 実行の前段階（起動直後）で `loadConfig()` を呼び出す。config の不正値は SHALL pipeline 中盤ではなく起動直後に `CONFIG_INVALID` として検出される。

`loadConfig()` を呼び出す timing:
- `run.ts`: `runPreflight()` 内（既存、起動直後）
- `resume.ts`: `bootstrap()` 内（既存、起動直後）
- `init.ts`: best-effort（config 作成が目的のため例外）
- `doctor.ts`: best-effort（診断目的のため例外）
- その他 config 不要 command（`ps`, `cancel`）: 不要

repoRoot を解決可能な command（`run`, `resume` 等）は SHALL `loadConfig(repoRoot)` を呼び project local overlay を適用する。

#### Scenario: run command で不正 config が起動直後に検出される

- **GIVEN** config に `{ "steps": { "design": { "byRequestType": { "bug-fix": { "model": "" } } } } }` が設定されている
- **WHEN** `specrunner job start <slug>` を実行する
- **THEN** pipeline 開始前に `CONFIG_INVALID` エラーで終了する
- **AND** error message に `steps.design.byRequestType.bug-fix.model` が含まれる

### Requirement: verification config の値は型と形式が検証される

`validateConfig()` は MUST `verification` section が存在する場合、以下のルールで検証する:

- `verification`: object 型であること。違反時は `CONFIG_INVALID` エラーを throw する
- `verification.commands`: array 型であること。違反時は `CONFIG_INVALID` エラーを throw する
- 各 commands element: string（非空）または object（`run` が非空 string、`name` は optional string）であること。違反時は `CONFIG_INVALID` エラーを throw する

未指定（`undefined` / JSON でキーが不在）の `verification` section は SHALL 検証をスキップする。

error message には MUST 問題の key path が含まれる（例: `CONFIG_INVALID: verification.commands[2].run must be a non-empty string`）。

#### Scenario: valid な verification.commands が検証を通過する

- **GIVEN** config に `{ "verification": { "commands": ["bun run build", { "run": "bun run test" }, { "name": "lint", "run": "eslint ./src" }] } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する

#### Scenario: verification section なしで検証通過

- **GIVEN** config に `verification` section が存在しない
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** 検証は正常に通過する

#### Scenario: commands が array でない場合の CONFIG_INVALID

- **GIVEN** config に `{ "verification": { "commands": "not-an-array" } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: commands element に空文字列がある場合の CONFIG_INVALID

- **GIVEN** config に `{ "verification": { "commands": [""] } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される

#### Scenario: commands element の run が空文字列の場合の CONFIG_INVALID

- **GIVEN** config に `{ "verification": { "commands": [{ "run": "" }] } }` が設定されている
- **WHEN** config を読み込み `validateConfig()` を実行する
- **THEN** `CONFIG_INVALID` エラーが throw される
- **AND** error message に `verification.commands[0].run` が含まれる

### Requirement: config schema に logs セクションを追加

`SpecRunnerConfig` に `logs?: LogsConfig` フィールドを追加しなければならない（MUST）。`LogsConfig` は `maxJobs?: number` フィールドを持ち、retention で保持する最大 job 数を指定する（デフォルト: 20、範囲: 1-1000）。

`validateConfig()` は `logs` が定義されている場合 object であること、`logs.maxJobs` が定義されている場合 1 以上 1000 以下の整数であることを検証しなければならない（SHALL）。範囲外の場合は `CONFIG_INVALID` をスローする。未指定時のデフォルト値 20 は config 読み取り側（`pruneOldLogs` の呼び出し元）が適用する。

#### Scenario: logs.maxJobs が有効値で設定される

- **WHEN** `config.json` に `{ "logs": { "maxJobs": 50 } }` が設定される
- **THEN** retention は最新 50 job のログを保持する

#### Scenario: logs.maxJobs が範囲外で CONFIG_INVALID

- **WHEN** `config.json` に `{ "logs": { "maxJobs": 0 } }` が設定される
- **THEN** `validateConfig()` が `CONFIG_INVALID` をスローする

#### Scenario: logs セクション未指定でデフォルト 20

- **WHEN** `config.json` に `logs` フィールドが存在しない
- **THEN** retention はデフォルトの 20 job を保持する
