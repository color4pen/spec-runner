## MODIFIED Requirements

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
