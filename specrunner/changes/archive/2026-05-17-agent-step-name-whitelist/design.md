# Design: agent-step-name-whitelist

## Problem

`AgentStepName` は `Exclude<StepName, ...>` の黒リスト方式で定義されている。新規 CliStep 追加時に Exclude リストへの追加忘れで型ホール発生（PR #274 で実証済み）。

## Solution

ホワイトリスト列挙方式に反転。`AGENT_STEP_NAMES` / `CLI_STEP_NAMES` を明示配列で分離し、`AgentStepName = typeof AGENT_STEP_NAMES[number]` で派生。

## Design Decisions

### D1: ホワイトリスト列挙方式を採用

`AGENT_STEP_NAMES` と `CLI_STEP_NAMES` を `as const` 配列で明示列挙。新 step 追加時にどちらの配列に入れるかを型 system が強制する。

**後方互換**: `STEP_NAMES` object 形 (`STEP_NAMES.DESIGN` 等) は維持。30+ 箇所の参照が無傷で動く。`STEP_NAMES` は明示宣言形式 (`{ DESIGN: "design", ... } as const`) を維持する。`Object.fromEntries` で `AGENT_STEP_NAMES` + `CLI_STEP_NAMES` から合成する案は literal type が消失するため不採用。

### D2: `config.agents` キー型を `Partial<Record<AgentStepName, AgentRecord>>` に締める

現状 `Record<string, AgentRecord>` で任意 string をキーに許容。`Partial<Record<AgentStepName, AgentRecord>>` に変更し、CliStep 名をキーに書けない型 gate を獲得。

**コンパイル影響の対処方針**:
- `getAgentId.ts`: param を `StepName` → `AgentStepName` に narrowing（呼び出し元は全て AgentStep 経由で agent role を渡しており、実質 AgentStepName）
- `migrate.ts`: `migrateConfig` 戻り値は migration 層なので `Record<string, AgentRecord>` を維持。`applyMigration` 内の `as SpecRunnerConfig` cast で吸収（migration は任意キーを扱う必要がある）
- `managed.ts`: `Object.keys()` / `Object.entries()` は `Partial<Record<...>>` に対しても動作する
- `preflight.ts:44`: `cfg.agents?.["design"]` は `"design"` が AgentStepName に含まれるため OK
- `syncer.ts`: `getStoredAgent(role: StepName)` → `getStoredAgent(role: AgentStepName)` に narrowing
- `registry.ts`: `Map<StepName, AgentDefinition>` → `Map<AgentStepName, AgentDefinition>` に narrowing。`get()` / `hashOf()` param も `AgentStepName` に
- `definition.ts`: `AgentDefinition.role: StepName` → `AgentStepName` に narrowing

### D3: テスト戦略

runtime test 4 本 + type-level assertion で網羅:
1. disjoint: 両配列に重複なし
2. exhaustive: union が `STEP_NAMES` 値集合と一致
3. agent step 整合: 全 AgentStep.name ∈ AGENT_STEP_NAMES
4. cli step 整合: 全 CliStep.name ∈ CLI_STEP_NAMES
5. type-level: `@ts-expect-error` で CliStep 名の AgentStepName 代入拒否 + config.agents の CliStep キー拒否

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/core/step/step-names.ts` | MODIFY | `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` 配列追加 |
| `src/state/schema.ts` | MODIFY | `AgentStepName` ホワイトリスト化 + `CliStepName` 追加 |
| `src/config/schema.ts` | MODIFY | `agents` キー型を `Partial<Record<AgentStepName, AgentRecord>>` に |
| `src/config/getAgentId.ts` | MODIFY | param `StepName` → `AgentStepName` |
| `src/core/agent/definition.ts` | MODIFY | `role: StepName` → `role: AgentStepName` |
| `src/core/agent/registry.ts` | MODIFY | Map key + method params を `AgentStepName` に |
| `src/core/agent/syncer.ts` | MODIFY | `getStoredAgent` param + `SyncResult.results` key を `AgentStepName` に |
| `tests/unit/core/step/step-names.test.ts` | ADD | runtime test 4 本 + type-level assertion |
| `specrunner/specs/pipeline-orchestrator/spec.md` | MODIFY | AgentStepName 仕様をホワイトリスト方式に更新 |

## Scope Exclusions

- `STEP_NAMES` 定数の参照置換 (`STEP_NAMES.DESIGN` → `AGENT_STEP_NAMES[0]` 等)
- step kind による config schema 構造分離 (`agents:` / `cli-steps:` 分離)
- 既存 user config の migration (後方互換維持のため不要)
