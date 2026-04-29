## Why

直近 4 PR で propose / spec-review / spec-fixer の 3 step を実装したことで、**コピペ重複**（各 step 45–55 行 × 3 ファイル）、**verdict 分岐の inline 表現**（`pipeline.ts:78-86` の if 連鎖）、**Custom Tool spec / handler のグローバル registry 経由分離**、**AgentDefinition の単数前提**といった構造的痛みが顕在化した。3 step では管理可能だが、code-review / implementer 等 5 step 以上に増やす前にこれを解消する。

設計は `ADR-20260429-step-and-agent-class-architecture` で D1〜D10 として確定済みであり、本 change は **D10 の手順 1〜4**（D8a/b → D1+D2+D9 → D3 → D7）を実装する。Agent 関連の D4〜D6（AgentRegistry 分離、config schema migration）は scope を分離するため後続 request に回す。

**振る舞いは不変**（現状の passing テスト全 PASS 維持、CLI stdout / 状態ファイル / エラーコード維持）。これは仕様変更ではなく内部リファクタである。ただし `JobState.steps` schema（`StepResult[]` → `StepRun[]`）と `src/` のディレクトリレイアウトは spec-bearing surface であり、明示的な spec delta として記録する。

> **Baseline test count**: `bun test` reports 162 total tests (161 passing, 1 fail, 1 error). The 1 fail + 1 error are in `tests/cli.test.ts` which uses vitest API (`vi.mock`) — incompatible with the Bun runtime. This is a pre-existing breakage unrelated to this refactor. The acceptance criterion is that all 161 currently-passing tests remain passing and the cli.test.ts failure is not introduced or worsened by this change.

## What Changes

### 手順 1: JobStateStore class + StepRun[] schema (D8a + D8b)
- `src/state/store.ts` の関数群を `JobStateStore` class（`src/store/job-state-store.ts`）に再構成し、`load` / `persist` / `appendHistory` / `appendStepRun` を method 化、`atomic-write` を実装詳細に隠蔽
- `JobState.steps` schema を `Record<StepName, StepRun[]>` に変更。`StepRun` は `attempt / sessionId / outcome / startedAt / endedAt`
- 旧 schema（PR #24 の `StepResult[]`、それ以前の単数 `StepResult`）の load 時 normalization により後方互換維持

### 手順 2: Step interface + StepExecutor + Tool 同居 (D1 + D2 + D9)
- `Step` interface（`name` / `agent` / `toolHandlers?` / `buildMessage` / `resultFilePath` / `parseResult`）を `src/core/step/types.ts` に定義
- `StepExecutor` class が I/O lifecycle（セッション生成・完了 polling・結果 fetch・parse・state 永続化・event emit）を集約
- propose / spec-review / spec-fixer を Step 実装に移植し、各 step ファイルを 1/3 LOC に縮小
- Custom Tool（`register_branch`）の spec と handler を `ProposeStep` に同居させ、グローバル registry (`src/core/tools/registry.ts`) を廃止

### 手順 3: Pipeline class + transition table (D3)
- `Pipeline` class（`src/core/pipeline/pipeline.ts`）が `Map<StepName, Step>` と `Transition[]` を constructor で受け取り、`run(start, state, deps)` で state machine 駆動
- `Transition = { step, on: Verdict, to: StepName | "end" | "escalate" }`
- 既存 `pipeline.ts:78-86` の inline if + `runLoopUntil` を transition table に置換、`maxIterations` を loop guard に持つ

### 手順 4: EventBus 予約席 (D7)
- `EventBus` class（`src/core/event/event-bus.ts`）に `on(event, handler)` / `emit(event, payload)` の最小実装
- StepExecutor が `step:start` / `step:complete` / `step:error` / `verdict:parsed` を emit
- Pipeline が `pipeline:start` / `pipeline:complete` / `pipeline:fail` を emit
- v1 では subscriber を持たない（後続 request の学習層実装で使用）

### モジュール構造の再編 (ADR-20260429-module-architecture-style D4)
- `src/core/{pipeline,step,agent,event,port}` / `src/adapter/{anthropic,github}` / `src/store/` / `src/cli/` に整列
- `core` が依存できるのは `store`, `util`, `core/port` のみ（逆向き依存禁止）
- `@anthropic-ai/sdk` の import は `src/adapter/anthropic/` 内に閉じる

## Impact

### Affected Specs
- **MODIFIED**: `job-state-store` — `JobState.steps` の type を `Record<StepName, StepRun[]>` に変更、後方互換 normalization 追加、`iteration`/`session`/`completedAt` → `attempt`/`sessionId`/`endedAt` フィールド名マッピング
- **ADDED**: `step-execution-architecture` — Step interface / StepExecutor / Tool 同居の契約
- **MODIFIED**: `pipeline-orchestrator` — Pipeline class + Transition table 駆動、`runLoopUntil` 委譲の廃止、`src/core/steps/` → `src/core/step/` レイアウト変更、stdout format の single source of truth は `pipeline-loop-primitive` に維持
- **ADDED**: `module-boundary` — core / adapter / store / port の依存方向と SDK 直 import 禁止ルール

### Affected Code
- New: `src/core/{pipeline,step,agent,event,port}/`, `src/adapter/{anthropic,github}/`, `src/store/job-state-store.ts`
- Modified: `src/core/pipeline.ts` → 廃止 / 移行、`src/core/steps/{propose,spec-review,spec-fixer}.ts` → `src/core/step/` へ移動 + Step 実装化
- Removed: `src/core/tools/registry.ts`（Step 同居化により）
- 推定変更量: ~600–800 LOC

### Behavior Invariance (CRITICAL)
- 現在 passing の 161 テスト全 PASS が必須 acceptance。`tests/cli.test.ts` の vitest API 非互換による既存 1 fail + 1 error は本 change 対象外（scope 外）
- CLI stdout（`[iter N/M]` 進捗、最終サマリ）の文字列フォーマットを bit-for-bit 維持
- 状態ファイル（`~/.local/share/specrunner/jobs/<id>.json`）は旧 schema をロード可能
- エラーコード `SESSION_TIMEOUT` / `SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE` を維持
- Custom Tool `register_branch` の `input_schema` を維持

### Out of Scope (後続 request)
- D4〜D6: AgentDefinition / AgentRegistry / AgentSyncer の分離、config schema の `agents: Record<StepName, ...>` 化、`specrunner init` の per-role agent 作成変更
- 学習層実装（EventBus subscriber）
- e2e ハーネス（`tests/e2e-pipeline.test.ts`）
- Argo / Tekton 由来の retry strategies / typed I/O / exit handlers の追加
