## MODIFIED Requirements

### Requirement: 設定ファイルは固定スキーマに従う

設定ファイルは MUST 以下の構造を持つ JSON である:

- `version` (number, 現在値は `1`。将来の schema bump に備えて `number` 型で宣言するが、現時点での有効値は `1` のみ。未知の version 値を読み込んだ場合は `CONFIG_INVALID` エラーを throw する)
- `anthropic.apiKey` (string)
- `agents` (`Record<StepName, AgentRecord>`) — Step 名をキーとする単一マップ。各 `AgentRecord` は `{ agentId: string, definitionHash: string, lastSyncedAt: ISO8601 }`
- `environment.id` (string)
- `environment.lastSyncedAt` (ISO8601)
- `github.accessToken` (string)
- `github.tokenObtainedAt` (ISO8601)
- `github.scopes` (string[])
- `pipeline.maxRetries` (number、既定 2)

`init` 直後はまだ login 未実行のため `github` ブロックは未設定でもよく、CLI は SHALL この欠落を許容する。

`agents` マップは MUST `Record<StepName, AgentRecord>` の単一マップであり、Step 名（`"propose"`, `"spec-review"`, `"spec-fixer"` など）をキーとする。固定キー型 `agents.propose` / `agents.specReview` / `agents.specFixer` を持つ中間スキーマは廃止される。

CLI は SHALL このスキーマを唯一の正として書き込み・読み込みを行う。

#### Scenario: 不完全な config（apiKey 欠落）

- **WHEN** config に `anthropic.apiKey` が無い
- **THEN** 読み込み時に `CONFIG_INCOMPLETE` エラーを発生させ、`Run 'specrunner init' first.` を返す

#### Scenario: login 未実行の状態で run を実行する

- **WHEN** init 完了後 login 未実行で `specrunner run` を実行する
- **THEN** `github.accessToken` が無いことを検知し、`Run 'specrunner login' first.` を返す

#### Scenario: spec-review Agent ID 欠落

- **WHEN** `specrunner run` 実行時に `config.agents["spec-review"]` が未設定
- **THEN** `CONFIG_INCOMPLETE` エラーで `Run 'specrunner init' to create the spec-review agent.` を返す

#### Scenario: agents マップが単一形である

- **GIVEN** `specrunner init` 完了後の config
- **WHEN** JSON を確認する
- **THEN** `config.agents` は `Record<StepName, AgentRecord>` 形である
- **AND** `config.agent`（旧 単数形）は存在しない
- **AND** `config.agents` の固定キー型（`propose` / `specReview` / `specFixer` のみを持つ型）ではなく、任意の StepName をキーとして許容する形である

### Requirement: ロール解決はフォールバックなしの直引きである

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

### Requirement: config 書き込みは新形式のみを書き込む

`specrunner init` が config を書き込む際、CLI は MUST `agents: Record<StepName, AgentRecord>` の新形式のみを書き込む。旧 `config.agent` フィールドは MUST 書き込まれない。

#### Scenario: 新形式の単独書き込み

- **WHEN** `specrunner init` が propose Agent を新規作成し ID `agent_01x` を得る
- **THEN** config 書き込み後、`config.agents.propose.agentId === "agent_01x"` が成立する
- **AND** `config.agent` フィールドは存在しない（書き込みコードが触らない）

## ADDED Requirements

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

### Requirement: top-level timeout config はキー変換せず別軸として維持される

既存 `SpecRunnerConfig` の top-level `specReview` / `specFixer` ブロック（`pollIntervalMs`, `timeoutMs` を持つ executor 設定）は MUST `agents` マップの kebab-case 正規化とは独立した別軸として扱われる。具体的には次の 2 点を SHALL 満たす:

- `agents.specFixer` / `agents.specReview` キー（`AgentRecord` を値とするマップエントリ）は MUST kebab-case（`"spec-fixer"` / `"spec-review"`）に正規化される
- top-level の `specReview: { pollIntervalMs, timeoutMs }` / `specFixer: { pollIntervalMs, timeoutMs }` ブロックは MUST この migration スコープで変更されない。これらは executor の動作設定であり、Agent ID の管理とは責務が異なる

本 request では top-level timeout config のキー名変更は Non-Goal とする。将来的に kebab-case 統一が必要になれば別 request で対応する。

#### Scenario: top-level timeout config が migration 後も読める

- **GIVEN** config ファイルが `agents.specFixer`（camelCase）と top-level `specFixer.timeoutMs` の両方を持つ
- **WHEN** `ConfigStore.load()` を呼ぶ
- **THEN** `config.agents["spec-fixer"]`（kebab-case に正規化された AgentRecord）が存在する
- **AND** top-level `config.specFixer.timeoutMs` は変更されずそのまま読める
- **AND** `executor.ts` の `getTimeoutMs("spec-fixer", config)` が引き続き正しい値を返す

## REMOVED Requirements

### Requirement: config 書き込みは新形式と legacy 形式を両方更新する
**Reason**: 互換シムは不要（消費者は specrunner 単体）。新 schema を唯一の正として書き込み、`agent` 単数フィールドは出力に含めない方針に変更した。
**Migration**: `specrunner init` を実行すると `ConfigStore.load() → save()` の経路で旧 schema が自動的に新 schema に置き換わる。手動の編集は不要。
