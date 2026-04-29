# Implementer Decisions

## 書式: `〜する :: 理由`（現在形・事前宣言）

### Group 1: Foundation

- `ToolSpec` を `src/core/agent/definition.ts` に定義し `CustomToolDefinition` とは別型にする :: `CustomToolDefinition` は tool handler 呼び出しに使う runtime 型で、`ToolSpec` は Agent 定義に埋め込む static な型。両者の役割が違うため型を分ける。adapter/anthropic が `ToolSpec` → SDK Tool 型に変換する責務を持つ
- `AgentToolsetSpec` 型を `ToolSpec` の union で表現する :: init.ts の既存コードが `{ type: "agent_toolset_20260401" }` を tools 配列に含めており、ProposeStep もこれを引き継ぐ必要がある。`ToolSpec = AgentToolsetSpec | CustomToolSpec` のような union にする
- `AnthropicClient` port は `src/core/port/anthropic-client.ts` に置く :: 既存の `src/core/port/` に session-client.ts と github-client.ts があるため一貫性がある

### Group 2: AgentRegistry

- `hashOf` は SHA-256 を用い `sha256:` プレフィックスを付ける :: 既存の `computeDefinitionHash` が同形式を使っているため一貫性を保つ
- `canonicalJson` は既存の `src/core/agent-definition.ts` から流用せず `src/core/agent/hash.ts` に再実装する :: agent-definition.ts は init.ts 向けの legacy コードであり、将来削除対象。依存を持たせない

### Group 3: AgentSyncer

- `SyncResult.results` の型は `Map<StepName, SyncRoleResult>` にする :: per-role の action 種別と agentId / definitionHash / lastSyncedAt が一箇所にまとまり、rollback ロジックが create 済み ID を参照しやすい
- AgentSyncer は `syncAll` を直列で実行する（Promise.all でなく） :: rollback ロジックで「これまでに create したもの」を追跡するため、順序が決定的である必要がある

### Group 4: Config schema migration

- `AgentRecord` の `id` フィールド名を `agentId` に統一する :: 中間スキーマでは `id` だったが、design.md D4 の `AgentRecord` 定義は `agentId` を使う。新スキーマへの移行の機会に統一する
- `validateConfig` は migration 後のスキーマを検証する :: load 内で migrate してから validate を呼ぶ。validate 前の raw JSON に旧 `agent` フィールドが含まれていても許容し、migrate で正規化する
- 旧テスト `tests/config/getAgentId.test.ts` の legacy fallback テスト（TC-025）を削除し、新スキーマベースのテストに書き換える :: legacy fallback が廃止されるため

### Group 5: Step が AgentDefinition を所有

- `SPEC_REVIEW_SYSTEM_PROMPT` は既存 `src/prompts/spec-review-system.ts` で `const` で定義されているが、`export` されていない。export を追加して `SpecReviewStep` から参照する :: 既存のプロンプトが適切な内容（verdict 規約・findings 形式）を既に含んでいるため新規作成は不要
- `AgentDefinition.tools` の型を `ToolSpec[]` にする :: SDK 型への依存を core から除外するため

### Group 6: STEP_AGENT_ROLE 除去

- `StepExecutor` コンストラクタに `ConfigStore` を追加せず、代わりに `PipelineDeps.config` から直接参照する :: ConfigStore port を追加すると既存テストが大幅に壊れる。`getAgentId` 関数を新スキーマ対応に更新し、`step.agent.role` を key として使う形でスコープを最小化する
- `runPollingStyleStep` / `runProposeStyleStep` は `STEP_AGENT_ROLE` を削除し `step.agent.role` 直接参照に変更する :: spec-review が propose Agent を流用するバグの根本解消

### Group 7: init.ts 刷新

- `AgentRecord` フィールド名 `agentId` を init.ts の save 時に使う :: 新スキーマに統一
- init.ts の既存テスト（TC-057〜TC-061）は config schema の変化に合わせて更新する :: `config.agent?.id` の参照を削除し `config.agents["propose"].agentId` に変更

### Group 8: 既存テスト更新

- `tests/config/getAgentId.test.ts` の TC-025（legacy fallback）を削除して新動作に置き換える :: design.md D4 で legacy fallback 廃止が決定されているため
- `tests/core/step/step-interface.test.ts` の `agent: { agentId: "..." }` プレースホルダを `AgentDefinition` に更新する :: Step.agent 型変更に伴う必須更新
