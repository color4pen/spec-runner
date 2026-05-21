# Tasks: agent-step-name-whitelist

## Task 1: [x] Add AGENT_STEP_NAMES / CLI_STEP_NAMES arrays to step-names.ts

**File**: `src/core/step/step-names.ts`

Add two `as const` arrays before the existing `STEP_NAMES` object:

```typescript
export const AGENT_STEP_NAMES = [
  "design",
  "spec-review",
  "spec-fixer",
  "delta-spec-fixer",
  "test-case-gen",
  "implementer",
  "build-fixer",
  "code-review",
  "code-fixer",
] as const;

export const CLI_STEP_NAMES = [
  "verification",
  "pr-create",
  "delta-spec-validation",
] as const;
```

`STEP_NAMES` object はそのまま維持（既存 30+ 箇所の参照を壊さない）。

**Verification**: `bun run typecheck` pass.

---

## Task 2: [x] Update schema.ts — whitelist derivation

**File**: `src/state/schema.ts`

1. import に `AGENT_STEP_NAMES` と `CLI_STEP_NAMES` を追加
2. L18-22 の `AgentStepName` 定義を置換:

```typescript
import { AGENT_STEP_NAMES, CLI_STEP_NAMES, STEP_NAMES } from "../core/step/step-names.js";

export type StepName = typeof STEP_NAMES[keyof typeof STEP_NAMES];

/**
 * AgentStepName: names of steps that run as AI agent sessions.
 * Derived from AGENT_STEP_NAMES whitelist — new steps must be added to the appropriate array.
 */
export type AgentStepName = typeof AGENT_STEP_NAMES[number];

/**
 * CliStepName: names of steps that run as deterministic CLI processes.
 * Derived from CLI_STEP_NAMES whitelist.
 */
export type CliStepName = typeof CLI_STEP_NAMES[number];
```

**Verification**: `bun run typecheck` pass.

---

## Task 3: [x] Tighten config.agents key type

**File**: `src/config/schema.ts`

1. Add import: `import type { AgentStepName } from "../state/schema.js";`
2. L91 変更:

```typescript
// Before
agents: Record<string, AgentRecord>;

// After
agents: Partial<Record<AgentStepName, AgentRecord>>;
```

**Verification**: note compilation errors — addressed in Task 4.

---

## Task 4: [x] Fix compilation errors from type narrowing

### 4a: `src/config/getAgentId.ts`

- L2: import `AgentStepName` instead of (or in addition to) `StepName`
- L12: change param `role: StepName` → `role: AgentStepName`

### 4b: `src/core/agent/definition.ts`

- Import `AgentStepName` from `../../state/schema.js`
- Change `role: StepName` → `role: AgentStepName` (L60)

### 4c: `src/core/agent/registry.ts`

- L10: import `AgentStepName` (replace or add to `StepName` import)
- L15: `Map<StepName, AgentDefinition>` → `Map<AgentStepName, AgentDefinition>`
- L25: map type annotation
- L46: `get(role: StepName)` → `get(role: AgentStepName)`
- L63: `hashOf(role: StepName)` → `hashOf(role: AgentStepName)`

### 4d: `src/core/agent/syncer.ts`

- L12: import `AgentStepName` (replace or add to `StepName` import)
- L30: `SyncResult.results: Map<StepName, SyncRoleResult>` → `Map<AgentStepName, SyncRoleResult>`
- L38: `getStoredAgent(role: StepName)` → `getStoredAgent(role: AgentStepName)`
- L59: `roles` 型が自動推論で `AgentStepName[]` になることを確認

### 4e: `src/config/migrate.ts`

- `migrateConfig` 戻り値は `Record<string, AgentRecord>` を維持（migration は任意キーを受ける）
- `applyMigration` 内の `as SpecRunnerConfig` cast が `agents` フィールドの型不一致を吸収する — 変更不要であることを確認

### 4f: Other compilation fixes

- `src/cli/managed.ts`: `Object.keys(config.agents ?? {})` / `Object.entries(...)` — `Partial<Record<...>>` でも動作する。型エラーが出れば `?? {}` を `as Record<string, AgentRecord>` に cast
- `src/core/preflight.ts:44`: `cfg.agents?.["design"]` — `"design"` ∈ AgentStepName なので OK
- `src/adapter/managed-agent/agent-runner.ts`: `getAgentId(config, step.agent.role)` — D4b で `role` が `AgentStepName` になるため OK

**Verification**: `bun run typecheck` green (0 errors).

---

## Task 5: [x] Write tests

**File**: `tests/unit/core/step/step-names.test.ts` (新規作成)

### TC-1: AGENT_STEP_NAMES と CLI_STEP_NAMES は disjoint

```typescript
import { describe, it, expect } from "vitest";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES, STEP_NAMES } from "../../../../src/core/step/step-names.js";

describe("step name arrays", () => {
  it("AGENT_STEP_NAMES and CLI_STEP_NAMES are disjoint", () => {
    const overlap = AGENT_STEP_NAMES.filter((n) =>
      (CLI_STEP_NAMES as readonly string[]).includes(n)
    );
    expect(overlap).toEqual([]);
  });
```

### TC-2: union が STEP_NAMES 値集合と一致

```typescript
  it("union of AGENT + CLI equals STEP_NAMES values", () => {
    const union = [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].sort();
    const all = Object.values(STEP_NAMES).sort();
    expect(union).toEqual(all);
  });
```

### TC-3: 全 AgentStep.name ∈ AGENT_STEP_NAMES

```typescript
  it("all AgentStep instances have names in AGENT_STEP_NAMES", () => {
    // Import all step instances from pipeline/run.ts step map
    // Filter kind === "agent", assert each .name is in AGENT_STEP_NAMES
  });
```

実装: `src/core/pipeline/run.ts` から step を import するか、各 step file から直接 import して `kind === "agent"` のものを検証。

### TC-4: 全 CliStep.name ∈ CLI_STEP_NAMES

```typescript
  it("all CliStep instances have names in CLI_STEP_NAMES", () => {
    // Filter kind === "cli", assert each .name is in CLI_STEP_NAMES
  });
```

### TC-5: Type-level assertions

```typescript
  it("type-level: AgentStepName rejects CliStep names", () => {
    // @ts-expect-error - "verification" is a CliStep, not AgentStepName
    const _bad1: AgentStepName = "verification";
    // @ts-expect-error - "pr-create" is a CliStep, not AgentStepName
    const _bad2: AgentStepName = "pr-create";
    // @ts-expect-error - "delta-spec-validation" is a CliStep, not AgentStepName
    const _bad3: AgentStepName = "delta-spec-validation";

    // Should compile: AgentStepName accepts agent step names
    const _ok: AgentStepName = "design";
    expect(_ok).toBe("design");
  });
```

**Verification**: `bun run test -- tests/unit/core/step/step-names.test.ts` pass.

---

## Task 6: [x] Update spec authority

**File**: `specrunner/specs/pipeline-orchestrator/spec.md`

L291-306 周辺を更新:

1. **Requirement 名を変更**: "AgentStepName excludes ..." → "AgentStepName accepts only agent-resident steps (whitelist)"
2. **本文を更新**: `Exclude<StepName, ...>` 記述を「`AgentStepName` is derived from `AGENT_STEP_NAMES` whitelist array (`typeof AGENT_STEP_NAMES[number]`), not from `StepName` Exclude」に
3. **Scenario 更新**:
   - agent-resident step 一覧に `delta-spec-fixer` / `test-case-gen` を追加
   - NOT assignable 側に `delta-spec-validation` を追加
   - `propose` → `design` に修正 (旧名残存の修正)
4. **新規 Scenario 2 件追加**:
   - 「新 step 追加時に AGENT_STEP_NAMES にも CLI_STEP_NAMES にも追加しないと、STEP_NAMES 値集合との不一致で test が fail する」
   - 「`config.agents` に CliStep 名をキーとして書くと型エラーになる」

---

## Task 7: [x] Final verification

```bash
bun run typecheck && bun run test
```

全テスト green を確認。

---

## Acceptance Criteria Checklist

- [x] `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` が `src/core/step/step-names.ts` から export
- [x] `STEP_NAMES` object 形は維持、既存参照が無傷
- [x] `AgentStepName` が `typeof AGENT_STEP_NAMES[number]` で定義
- [x] `CliStepName` が export
- [x] `config.agents` キー型が `Partial<Record<AgentStepName, AgentRecord>>`
- [x] CliStep 名を config.agents に書くと型エラー (`@ts-expect-error` test 保証)
- [x] test 4 本 + type-level assertion が pass
- [x] 全 `AgentStepName` 参照箇所がコンパイル整合
- [x] spec authority に新定義が反映
- [x] `bun run typecheck && bun run test` green
