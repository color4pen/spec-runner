# Tasks: Centralize Step Name Constants

## [x] Task 1: Create `src/core/step/step-names.ts`

新規ファイルを作成する。

```typescript
/**
 * Canonical step name constants for the specrunner pipeline.
 * All pipeline files must reference these constants instead of string literals.
 * Single source of truth — rename here to propagate everywhere.
 */
export const STEP_NAMES = {
  DESIGN: "design",
  SPEC_REVIEW: "spec-review",
  SPEC_FIXER: "spec-fixer",
  TEST_CASE_GEN: "test-case-gen",
  IMPLEMENTER: "implementer",
  VERIFICATION: "verification",
  BUILD_FIXER: "build-fixer",
  CODE_REVIEW: "code-review",
  CODE_FIXER: "code-fixer",
  PR_CREATE: "pr-create",
} as const;
```

## [x] Task 2: Update `src/state/schema.ts` — StepName 型の導出

- `STEP_NAMES` を `src/core/step/step-names.ts` から import する
- `StepName` 型を `typeof STEP_NAMES[keyof typeof STEP_NAMES]` に変更する
- `AgentStepName` を `Exclude<StepName, typeof STEP_NAMES.VERIFICATION | typeof STEP_NAMES.PR_CREATE>` に変更する

変更前:
```typescript
export type StepName =
  | "design"
  | "spec-review"
  | "spec-fixer"
  | "test-case-gen"
  | "implementer"
  | "verification"
  | "build-fixer"
  | "code-review"
  | "code-fixer"
  | "pr-create";

export type AgentStepName = Exclude<StepName, "verification" | "pr-create">;
```

変更後:
```typescript
import { STEP_NAMES } from "../core/step/step-names.js";

export type StepName = typeof STEP_NAMES[keyof typeof STEP_NAMES];

export type AgentStepName = Exclude<StepName, typeof STEP_NAMES.VERIFICATION | typeof STEP_NAMES.PR_CREATE>;
```

注意: `validateJobState` 内の `"propose"` → `"design"` リマップ文字列は変更しない（後方互換のため）。

## [x] Task 3: Update 10 step definition files

各ファイルに `STEP_NAMES` import を追加し、`name: "step-name"` を `name: STEP_NAMES.STEP_NAME` に置換する。

- `src/core/step/design.ts` — `name: "design"` → `name: STEP_NAMES.DESIGN`
- `src/core/step/spec-review.ts` — `name: "spec-review"` → `name: STEP_NAMES.SPEC_REVIEW`
- `src/core/step/spec-fixer.ts` — `name: "spec-fixer"` → `name: STEP_NAMES.SPEC_FIXER`
- `src/core/step/test-case-gen.ts` — `name: "test-case-gen"` → `name: STEP_NAMES.TEST_CASE_GEN`
- `src/core/step/implementer.ts` — `name: "implementer"` → `name: STEP_NAMES.IMPLEMENTER`
- `src/core/step/verification.ts` — `name: "verification"` → `name: STEP_NAMES.VERIFICATION`
- `src/core/step/build-fixer.ts` — `name: "build-fixer"` → `name: STEP_NAMES.BUILD_FIXER`
- `src/core/step/code-review.ts` — `name: "code-review"` → `name: STEP_NAMES.CODE_REVIEW`
- `src/core/step/code-fixer.ts` — `name: "code-fixer"` → `name: STEP_NAMES.CODE_FIXER`
- `src/core/step/pr-create.ts` — `name: "pr-create"` → `name: STEP_NAMES.PR_CREATE`

各ファイル先頭の import に `import { STEP_NAMES } from "./step-names.js";` を追加すること。

**追加スコープ**: 各ステップ定義ファイルには `name:` プロパティ以外にも step name リテラルが存在する。同ファイルを編集する際、以下のパターンも合わせて定数化する:

- `role: "step-name"` — agent 定義の role プロパティ（例: `role: STEP_NAMES.SPEC_REVIEW`）。8 ファイルに存在。
- `state.steps?.["step-name"]` — step result 参照（`spec-review.ts`, `code-review.ts`, `verification.ts`）
- `getLatestStepResult(state, "step-name")` — 前ステップ結果参照（`spec-fixer.ts`, `code-fixer.ts`, `build-fixer.ts`）
- `branchNotSetError("step-name")` — エラー生成（`pr-create.ts`, `implementer.ts`, `spec-fixer.ts`, `code-fixer.ts`, `build-fixer.ts`, `test-case-gen.ts`）

## [x] Task 4: Update `src/core/pipeline/types.ts`

`STEP_NAMES` import を追加し、以下を置換する:

**LOOP_ERROR_CODES**: キーを computed property 記法で定数化:
```typescript
import { STEP_NAMES } from "../step/step-names.js";

export const LOOP_ERROR_CODES: Record<string, LoopErrorShape> = {
  [STEP_NAMES.SPEC_REVIEW]: { ... },
  [STEP_NAMES.VERIFICATION]: { ... },
  [STEP_NAMES.CODE_REVIEW]: { ... },
};
```

**STANDARD_TRANSITIONS**: 全 `step` / `to` のステップ名を `STEP_NAMES.*` に置換。`"end"` と `"escalate"` は制御値のため変更しない。

## [x] Task 5: Update `src/core/pipeline/run.ts`

`STEP_NAMES` import を追加し、以下を置換する:

**`createStandardPipeline` 内:**
- `steps` Map のキー（10箇所）を `STEP_NAMES.*` に置換
- `loopName: "spec-review"` → `loopName: STEP_NAMES.SPEC_REVIEW`
- `loopNames: ["spec-review", "verification", "code-review"]` → `loopNames: [STEP_NAMES.SPEC_REVIEW, STEP_NAMES.VERIFICATION, STEP_NAMES.CODE_REVIEW]`

**`runDesignPipeline` / `runPipeline` 内:**
- `pipeline.run("design", ...)` の第1引数 → `STEP_NAMES.DESIGN`
- design-only steps Map のキー `"design"` → `STEP_NAMES.DESIGN`
- design-only transition table 内の `"design"` リテラル（複数箇所）→ `STEP_NAMES.DESIGN`
- `loopName: "design"` → `loopName: STEP_NAMES.DESIGN`

## [x] Task 6: Update `src/core/step/executor.ts`

`STEP_NAMES` import を追加し、`PROJECT_CONTEXT_STEPS` を置換:

```typescript
import { STEP_NAMES } from "./step-names.js";

const PROJECT_CONTEXT_STEPS: ReadonlySet<string> = new Set([
  STEP_NAMES.DESIGN, STEP_NAMES.SPEC_REVIEW, STEP_NAMES.IMPLEMENTER, STEP_NAMES.CODE_REVIEW,
]);
```

## [x] Task 7: Update `src/core/resume/resolve-step.ts`

`STEP_NAMES` import を追加し、以下の全文字列リテラルを定数参照に置換:

- `SPEC_PHASE_STEPS`: `"design"`, `"spec-review"`, `"spec-fixer"`
- `CODE_PHASE_STEPS`: `"implementer"`, `"verification"`, `"build-fixer"`, `"code-review"`, `"code-fixer"`, `"pr-create"`
- `REVIEWER_STEPS`: `"spec-review"`, `"code-review"`
- `STEP_MAPPING` の値（`"spec-review"`, `"spec-fixer"`, `"design"`, `"code-review"`, `"code-fixer"`, `"implementer"`）

## [x] Task 8: Update `src/core/doctor/checks/agents/agents-registered.ts`

`STEP_NAMES` import を追加し、`REQUIRED_AGENTS` 配列を定数参照に置換:

```typescript
import { STEP_NAMES } from "../../../step/step-names.js";

export const REQUIRED_AGENTS = [
  STEP_NAMES.DESIGN,
  STEP_NAMES.SPEC_REVIEW,
  STEP_NAMES.SPEC_FIXER,
  STEP_NAMES.IMPLEMENTER,
  STEP_NAMES.BUILD_FIXER,
  STEP_NAMES.CODE_REVIEW,
  STEP_NAMES.CODE_FIXER,
] as const;
```

## [x] Task 9: Update `src/core/doctor/checks/agents/definition-drift.ts`

`STEP_NAMES` import を追加し、`AGENT_ROLES` 配列を定数参照に置換:

```typescript
import { STEP_NAMES } from "../../../step/step-names.js";

const AGENT_ROLES = [
  STEP_NAMES.DESIGN,
  STEP_NAMES.SPEC_REVIEW,
  STEP_NAMES.SPEC_FIXER,
  STEP_NAMES.IMPLEMENTER,
  STEP_NAMES.BUILD_FIXER,
  STEP_NAMES.CODE_REVIEW,
  STEP_NAMES.CODE_FIXER,
] as const;
```

## [x] Task 10: Update `src/config/migrate.ts`

`STEP_NAMES` import を追加し、`CAMEL_TO_KEBAB` の値（ステップ名部分）を定数化:

```typescript
import { STEP_NAMES } from "../core/step/step-names.js";

const CAMEL_TO_KEBAB: Record<string, string> = {
  specFixer: STEP_NAMES.SPEC_FIXER,
  specReview: STEP_NAMES.SPEC_REVIEW,
  propose: STEP_NAMES.DESIGN,  // backward compat alias — value は定数化可能
  design: STEP_NAMES.DESIGN,
};
```

注意: キー（`specFixer`, `specReview`, `propose`, `design`）はキャメルケース変換元を表すため変更しない。

また、同ファイル内の `result["design"]`（行 78, 82）のキーアクセスも `STEP_NAMES.DESIGN` に置換する:
```typescript
result[STEP_NAMES.DESIGN] = ...
```

## [x] Task 11: Scan and update remaining files

以下のファイルを `grep` で確認し、ステップ名の文字列リテラルがあれば定数参照に置換する:

- `src/adapter/managed-agent/agent-runner.ts` — `step.name === "code-review"` 等の比較、`step.agent.role === "design"` 等の role 比較（D10 参照）
- `src/core/command/runner.ts` — ステップ名の文字列リテラル
- `src/config/schema.ts` — ステップ名の文字列リテラル
- `src/config/step-config.ts` — ステップ名の文字列リテラル
- `src/core/pipeline/pipeline.ts` — default loopName、`this.steps.has()` チェック、`state.steps?.[...]`、`getLatestStepResult()` 呼び出し、`getStepOutcome()` 内 special case（8+ 箇所）
- `src/core/command/pipeline-run.ts` — `startStep: "design"` リテラル
- `src/core/pr-create/body-template.ts` — ステップ名の文字列リテラル

各ファイルに対して:
1. `grep '"design"\|"spec-review"\|"implementer"\|"verification"\|"build-fixer"\|"code-review"\|"code-fixer"\|"pr-create"\|"spec-fixer"\|"test-case-gen"' <file>` で確認
2. 該当箇所を `STEP_NAMES.*` に置換
3. `import { STEP_NAMES } from "...step-names.js"` を追加（相対パスは各ファイルの位置に合わせる）

## [x] Task 12: Verification

以下をすべて実行し、全 pass を確認する:

```bash
# 残存リテラル確認（期待: step-names.ts と step の name: 定義行と後方互換リマップのみ）
grep -rn '"design"\|"spec-review"\|"spec-fixer"\|"test-case-gen"\|"implementer"\|"verification"\|"build-fixer"\|"code-review"\|"code-fixer"\|"pr-create"' src/ --include='*.ts' \
  | grep -v 'step-names.ts' \
  | grep -v '\.test\.ts'

# 型チェック
bun run typecheck

# テスト
bun run test
```

残存リテラルがある場合は Task 11 に戻って対応する。
