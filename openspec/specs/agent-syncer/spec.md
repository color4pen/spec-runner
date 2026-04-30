# agent-syncer Specification

## Purpose
TBD - created by archiving change 2026-04-29-d4-d6-agent-migration. Update Purpose after archive.
## Requirements
### Requirement: AgentSyncer は per-role に Anthropic Agent を sync する

既存 Requirement「AgentSyncer は per-role に Anthropic Agent を sync する」に以下の Scenario を追加する。`AgentSyncer` のソースは MUST 無編集であり、registry が `code-review` / `code-fixer` を含むことで自動的に sync 対象に入ることを確認する。

#### Scenario: code-review / code-fixer も同じ retrieve / create / update / 404 fallback ロジックで sync される

- **GIVEN** `AgentRegistry` に `code-review` および `code-fixer` の `AgentDefinition` が登録されている
- **AND** config の `agents["code-review"]` および `agents["code-fixer"]` のエントリが存在しない（初回 init）
- **WHEN** `AgentSyncer.syncAll()` を呼ぶ
- **THEN** `code-review` / `code-fixer` の各 role に対して `client.createAgent` が 1 回ずつ呼ばれ、新 ID が返される
- **AND** config の `agents["code-review"]` および `agents["code-fixer"]` が `{ agentId, definitionHash, lastSyncedAt }` で書き込まれる
- **AND** SyncResult の対応 role の action 種別は `create` である
- **AND** `AgentSyncer` のソースは変更されていない（`src/core/syncer/` の変更行 = 0）

### Requirement: AgentSyncer は idempotent である

`syncAll()` を 2 回連続実行した結果、Anthropic API の create / update 呼び出しが MUST 2 回目には発生しない。SyncResult は SHALL 全 role の action 種別が `no-op` となる。

**idempotent の境界**: idempotent の保証は **Anthropic API 呼び出し**（create / update が発生しないこと）に限定される。`lastSyncedAt` フィールドは no-op であっても sync 実行時刻に更新されるため、ファイルの diff は `lastSyncedAt` のみ発生する。これは意図された挙動であり、idempotent の違反ではない。

**Note**: `agent-environment-bootstrap` の「既存 Agent ID が有効（per-role）」Scenario にある「config の各 `agents[role]` は変化しない（lastSyncedAt の更新を除く）」も同じ境界定義に基づく。両者は一致している。

#### Scenario: 連続実行で差分なし

- **GIVEN** 1 回目の `syncAll()` が全 role を create で完了している
- **WHEN** 2 回目の `syncAll()` を呼ぶ
- **THEN** 全 role に対して `client.retrieveAgent` のみが呼ばれ、`createAgent` / `updateAgent` は呼ばれない
- **AND** config ファイルは（lastSyncedAt の更新を除き）変化しない

### Requirement: AgentSyncer は部分失敗時に新規作成 Agent をロールバックする

`syncAll()` の途中で例外が発生した場合、AgentSyncer は MUST この `syncAll()` 呼び出しの中で **create** したすべての Agent に対して `client.archiveAgent(id)` を試み、orphan を残さない。**update した既存 Agent は MUST ロールバック対象外**（Agent バージョンの戻し操作が SDK にないため、データ破壊を構造的に避ける）。

#### Scenario: spec-fixer の create 中に例外 → propose の create をロールバック

- **GIVEN** 1 回目の `syncAll()`、config の `agents` は空
- **AND** `client.createAgent` の呼び出し順は propose（成功、ID `"agent_01x"`）→ spec-review（成功、ID `"agent_02y"`）→ spec-fixer（失敗、例外 throw）
- **WHEN** `AgentSyncer.syncAll()` を呼ぶ
- **THEN** 例外が再 throw される前に `client.archiveAgent("agent_01x")` および `client.archiveAgent("agent_02y")` が呼ばれる
- **AND** config の `agents` は空のままである（部分書き込みされない）

#### Scenario: update 中に例外 → update した Agent はロールバックされない

- **GIVEN** config に既存の `agents.propose.agentId = "agent_01x"` があり、definitionHash 不一致で update を実行する
- **AND** `client.updateAgent("agent_01x", def)` が成功する
- **AND** その後 `client.createAgent` で spec-review を作成中に例外が発生する
- **WHEN** `AgentSyncer.syncAll()` を呼ぶ
- **THEN** propose（update 済み）に対して `archiveAgent` は呼ばれない
- **AND** spec-review が create 完了していれば `archiveAgent` でロールバックされる
- **AND** 例外が再 throw される

#### Scenario: rollback 中の archiveAgent も失敗

- **GIVEN** 部分失敗 → rollback 経路に入る
- **AND** `client.archiveAgent("agent_01x")` が例外を throw する
- **WHEN** rollback が走る
- **THEN** stderr に `Failed to cleanup orphaned agent agent_01x; please archive manually.` を出力する
- **AND** 残りの archive 対象に対する rollback は継続する
- **AND** 元の例外（spec-fixer の create 失敗）が最終的に再 throw される

### Requirement: AgentSyncer は AnthropicClient port を介して Anthropic API を呼ぶ

AgentSyncer は MUST core/port の `AnthropicClient` interface のみを通じて Agent 操作を行う。SDK の具象型を直接 import しては SHALL ならない。

#### Scenario: テストでは fake AnthropicClient を注入できる

- **GIVEN** in-memory な fake AnthropicClient（create / retrieve / update / archive を Map で実装）
- **WHEN** AgentSyncer に fake を注入して `syncAll()` を呼ぶ
- **THEN** 実 SDK や HTTP リクエストを発生させず、シナリオを完全にユニットテストできる

### Requirement: AgentSyncer は SyncResult として per-role の action 種別を返す

`syncAll()` の戻り値は MUST 各 role について以下のいずれかを含む `SyncResult` である:
- `action: "no-op"` — 既存 Agent が definitionHash 一致で再利用された
- `action: "create"` — 新規作成された（404 fallback も含む）
- `action: "update"` — 既存 Agent の system / tools / model が更新された

#### Scenario: SyncResult の action 種別

- **GIVEN** propose は no-op、spec-review は新規作成、spec-fixer は update のシナリオ
- **WHEN** `syncAll()` を呼ぶ
- **THEN** SyncResult.results.get("propose").action === "no-op"
- **AND** SyncResult.results.get("spec-review").action === "create"
- **AND** SyncResult.results.get("spec-fixer").action === "update"

