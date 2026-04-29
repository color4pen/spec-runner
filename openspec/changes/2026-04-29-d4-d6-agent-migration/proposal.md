## Why

PR #26 で `step-and-agent-class-architecture` ADR の D1-D9 (Step interface / StepExecutor / Pipeline state machine / EventBus / JobStateStore / Tool 同居) は完了したが、Agent 周りは中途半端な状態で残っている。`Step.agent` は `{ agentId: "" }` のプレースホルダのみで実体は init.ts が握り、`STEP_AGENT_ROLE` のハードコード（spec-review が propose Agent を流用）が PR #22 で表面化した system prompt 矛盾を構造的に温存している。Config schema も旧 `agent` 単数と新 `agents.{propose,specReview,specFixer}` の二重管理で、Step を増やすたびに schema 拡張が必要になる。これを今放置すると、後続予定の implementer / verification / code-review / PR 作成 Step を追加する際にコピペが 4 倍に膨らむ。

## What Changes

- Step interface の `agent` フィールドを `{ agentId: string }` プレースホルダから完全な `AgentDefinition`（`name` / `role` / `model` / `system` / `tools` / `capabilities`）に拡張する。**BREAKING**（内部 API、外部 CLI 挙動は不変）
- 各 Step（propose / spec-review / spec-fixer）が自身の system prompt / model / tools を Step class 内で宣言する。spec-review は専用 AgentDefinition を持ち、propose Agent 流用を構造的に廃止する
- `AgentRegistry` を新設する（`core/agent/`）。`fromSteps(steps) / get(role) / list() / hashOf(role)` のみを持つ pure な集約点で、Anthropic API は呼ばない
- `AgentSyncer` を新設する（`core/agent/`）。per-role の retrieve/create/update/404 fallback、orphan rollback、definitionHash drift 検出をトランザクション境界として実装する
- `AnthropicClient` port を `core/port/` に新設し、Anthropic Agents API の Agent 操作を抽象化する。実装は `adapter/anthropic/` に置く
- Config schema を `agents: Record<StepName, { agentId, definitionHash, lastSyncedAt }>` の単一マップに統一する。旧 `agent` 単数と中間形 `agents.{propose,specReview,specFixer}` の両方から自動 migration する。**BREAKING**（schema 形状）
- `specrunner init` を AgentRegistry + AgentSyncer ベースに刷新する。idempotent な per-role sync を実装する
- `STEP_AGENT_ROLE` のハードコード（`src/core/step/executor.ts:23-27`）を完全に削除する。StepExecutor は `step.agent.role` を直接参照する
- `cli-config-store` の旧 schema 文言（legacy `agent.id` 必須維持、`agents.specReview` は予約席）を削除し、新 schema を正典とする
- `agent-environment-bootstrap` を新 AgentSyncer 仕様で書き直す（per-role syncAll、orphan rollback の per-role 化）

## Capabilities

### New Capabilities

- `agent-registry`: Step 群から `AgentDefinition` を集約する pure な registry の責務。`fromSteps` / `get` / `list` / `hashOf` の API と、Step を増やしても registry / config / syncer が無編集で済むことを保証する。
- `agent-syncer`: per-role の Agent sync ロジック（retrieve / create / update / 404 fallback）と、部分失敗時の orphan rollback、definitionHash による drift 検出をトランザクション境界として規定する。
- `agent-definition-ownership`: Step が自身の AgentDefinition（name / role / model / system / tools / capabilities）を所有することと、各 Step が独立した Agent を使う原則（fresh-per-task / system prompt 矛盾の構造的回避）を規定する。

### Modified Capabilities

- `step-execution-architecture`: Step.agent が完全な AgentDefinition となり、StepExecutor が `STEP_AGENT_ROLE` ハードコードを使わず `step.agent` を直接参照することを規定する（既存仕様の "Step exposes its agent definition" の補強）。
- `cli-config-store`: agents schema を `Record<StepName, AgentRecord>` の単一マップに統一する。旧 `agent` 単数と中間形 `agents.{propose,specReview,specFixer}` からの migration、legacy fallback 廃止、`getAgentId` の新 schema 直引きを規定する。
- `agent-environment-bootstrap`: `specrunner init` の Agent 作成・更新ロジックを per-role の AgentSyncer 経由に変更する。per-role definitionHash 比較・per-role 404 fallback・per-role orphan rollback を規定する。spec-review 専用 Agent の作成も含める。

## Impact

- **Affected code**:
  - `src/core/step/types.ts` — Step interface の agent フィールド型変更
  - `src/core/step/executor.ts:23-27` — STEP_AGENT_ROLE 削除、step.agent 直接参照へ
  - `src/core/step/{propose,spec-review,spec-fixer}.ts` — 各 Step に AgentDefinition を埋め込む（system prompt / model / tools の同居）
  - `src/core/agent/` — AgentDefinition 型、AgentRegistry、AgentSyncer の新設
  - `src/core/port/anthropic-client.ts` — 新規（Anthropic Agents API の port interface）
  - `src/adapter/anthropic/anthropic-client.ts` — 新規（port 実装、Agents API）
  - `src/cli/init.ts:51-83`, `:107-119` — AgentRegistry + AgentSyncer ベースに全面刷新
  - `src/config/schema.ts` および `src/config/getAgentId.ts` — schema 統一、migration、legacy fallback 廃止
- **Affected specs**: `step-execution-architecture`、`cli-config-store`、`agent-environment-bootstrap` の 3 つを delta で改訂し、`agent-registry` / `agent-syncer` / `agent-definition-ownership` の 3 つを新設する
- **External CLI behavior**: 不変（既存 214 テスト全 PASS、`specrunner init/login/run/ps` の挙動が同じ）
- **Dependencies**: PR #26 で merge 済みの D1-D9 に直接依存する。Anthropic Managed Agents SDK v0.91.0 の Agent / Session API を使用
- **Migration**: `specrunner init` 実行時に旧 schema を検出して新 schema に書き換える（idempotent、消費者は specrunner 単体のため互換シム不要）
- **Out of scope**: implementer / verification / code-review / PR 作成 Step の追加、E2E 実機検証、Web UI / cost ledger / observability subscriber
