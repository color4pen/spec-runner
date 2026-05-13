# Design: Centralize Step Name Constants

## Overview

ステップ名の文字列リテラルを `src/core/step/step-names.ts` に集約し、全ファイルが定数を参照するようにするリファクタリング。振る舞いは変更しない。

## Problem

ステップ名（"design", "spec-review", "implementer" 等）が `src/` 内複数ファイルに文字列リテラルとして散在している。propose → design のリネームで多数ファイルへの影響が発生した（GitHub Issue #219）。文字列が1箇所で管理されていないため、将来のリネームで同様の影響が繰り返される。

## Design Decisions

### D1: 定数ファイルの配置 — `src/core/step/step-names.ts`

`src/core/step/` はステップ定義の中心地であり、ステップ名定数の自然な置き場所。`src/constants.ts` や `src/state/step-names.ts` より凝集度が高い。

`schema.ts` からの import は `step-names.ts` → `schema.ts` の一方向になるため循環依存は生じない。

### D2: `StepName` 型の導出

`schema.ts` の `StepName` を手動 union から `STEP_NAMES` 値の union に変更する:

```typescript
// Before
export type StepName =
  | "design"
  | "spec-review"
  // ...

// After
import { STEP_NAMES } from "../core/step/step-names.js";
export type StepName = typeof STEP_NAMES[keyof typeof STEP_NAMES];
```

`AgentStepName` は `STEP_NAMES.VERIFICATION` / `STEP_NAMES.PR_CREATE` を使った `Exclude` に更新する。

### D3: `LOOP_ERROR_CODES` のキーは computed property 記法で定数化

```typescript
export const LOOP_ERROR_CODES: Record<string, LoopErrorShape> = {
  [STEP_NAMES.SPEC_REVIEW]: { ... },
  [STEP_NAMES.VERIFICATION]: { ... },
  [STEP_NAMES.CODE_REVIEW]: { ... },
};
```

### D4: `STANDARD_TRANSITIONS` は `STEP_NAMES.*` で全 literal を置換

`Transition.step` と `Transition.to` の全文字列リテラルを定数参照に変える。`"end"` と `"escalate"` はステップ名ではなく制御値のため対象外。

### D5: `PROJECT_CONTEXT_STEPS` (executor.ts) を定数化

```typescript
const PROJECT_CONTEXT_STEPS: ReadonlySet<string> = new Set([
  STEP_NAMES.DESIGN, STEP_NAMES.SPEC_REVIEW, STEP_NAMES.IMPLEMENTER, STEP_NAMES.CODE_REVIEW,
]);
```

### D6: `resolve-step.ts` の全 Set / STEP_MAPPING を定数化

`SPEC_PHASE_STEPS`, `CODE_PHASE_STEPS`, `REVIEWER_STEPS`, `STEP_MAPPING` のすべての文字列リテラルを定数参照に変える。

### D7: `agents-registered.ts` / `definition-drift.ts` の配列を定数化

`REQUIRED_AGENTS` / `AGENT_ROLES` の文字列リテラルを定数参照に変える。

### D8: `config/migrate.ts` の `CAMEL_TO_KEBAB` の値を部分的に定数化

`"spec-fixer"`, `"spec-review"`, `"design"` の値を `STEP_NAMES.*` に変える。キーはキャメルケース（`specFixer` など）で変換元を表すため定数化しない。`"propose"` は後方互換キー（歴史的な値）なので定数化しない（request 要件に明記）。

### D9: スコープ外

- テストファイル（`*.test.ts`, `*.spec.ts`）内の文字列リテラルはスコープ外
- `validateJobState` の `"propose"` → `"design"` リマップは歴史的な値のため残す
- `step-names.ts` 自身と各 step 定義の `name:` プロパティ定義行はスコープ外（grep 検証除外対象）

### D10: `agent.role` 値も定数化対象

各 step 定義ファイルの `role:` プロパティ（例: `role: "design"`）は agent の role を指定する値だが、step name と同一文字列。これも定数化対象に含める。
`src/adapter/managed-agent/agent-runner.ts` 行 98 の `step.agent.role === "design"` 比較も同様に `STEP_NAMES.DESIGN` に置換する。受け入れ基準の grep でヒットするすべての文字列リテラルを定数化する方針と整合する。

## File Impact Map

| ファイル | 変更内容 |
|---------|---------|
| `src/core/step/step-names.ts` | **新規作成**: `STEP_NAMES` 定数定義 |
| `src/state/schema.ts` | `StepName` 型を `STEP_NAMES` から導出、`AgentStepName` 更新 |
| `src/core/step/design.ts` | `name: STEP_NAMES.DESIGN` |
| `src/core/step/spec-review.ts` | `name: STEP_NAMES.SPEC_REVIEW` |
| `src/core/step/spec-fixer.ts` | `name: STEP_NAMES.SPEC_FIXER` |
| `src/core/step/test-case-gen.ts` | `name: STEP_NAMES.TEST_CASE_GEN` |
| `src/core/step/implementer.ts` | `name: STEP_NAMES.IMPLEMENTER` |
| `src/core/step/verification.ts` | `name: STEP_NAMES.VERIFICATION` |
| `src/core/step/build-fixer.ts` | `name: STEP_NAMES.BUILD_FIXER` |
| `src/core/step/code-review.ts` | `name: STEP_NAMES.CODE_REVIEW` |
| `src/core/step/code-fixer.ts` | `name: STEP_NAMES.CODE_FIXER` |
| `src/core/step/pr-create.ts` | `name: STEP_NAMES.PR_CREATE` |
| `src/core/pipeline/types.ts` | `STANDARD_TRANSITIONS`, `LOOP_ERROR_CODES` を定数化 |
| `src/core/pipeline/run.ts` | `steps` Map のキーを定数化、`loopName` / `loopNames` を定数化 |
| `src/core/step/executor.ts` | `PROJECT_CONTEXT_STEPS` を定数化 |
| `src/core/resume/resolve-step.ts` | `SPEC_PHASE_STEPS`, `CODE_PHASE_STEPS`, `REVIEWER_STEPS`, `STEP_MAPPING` を定数化 |
| `src/core/doctor/checks/agents/agents-registered.ts` | `REQUIRED_AGENTS` を定数化 |
| `src/core/doctor/checks/agents/definition-drift.ts` | `AGENT_ROLES` を定数化 |
| `src/config/migrate.ts` | `CAMEL_TO_KEBAB` の値（step names 部分）を定数化 |
| `src/core/pipeline/pipeline.ts` | default loopName、`this.steps.has()` チェック、`state.steps?.[...]`、`getLatestStepResult()` 呼び出し、`getStepOutcome()` 内 special case 等の step name リテラルを定数化 |
| `src/core/command/pipeline-run.ts` | `startStep: "design"` を定数化 |
| `src/adapter/managed-agent/agent-runner.ts` | `step.name === "code-review"` 等の比較、`step.agent.role === "design"` 比較を定数化 |
| `src/core/command/runner.ts` | 該当する文字列リテラルを定数化 |
| `src/config/schema.ts` | 該当する文字列リテラルを定数化 |
| `src/core/pr-create/body-template.ts` | 該当する文字列リテラルを定数化 |

## Verification Strategy

実装後に以下を実行して完了を確認:

```bash
# 残存リテラル確認（step-names.ts 本体と step の name: 定義行を除く）
grep -rn '"design"\|"spec-review"\|"spec-fixer"\|"test-case-gen"\|"implementer"\|"verification"\|"build-fixer"\|"code-review"\|"code-fixer"\|"pr-create"' src/ --include='*.ts' \
  | grep -v 'step-names.ts' \
  | grep -v "name: STEP_NAMES\." \
  | grep -v '\.test\.ts'

# 型チェック
bun run typecheck

# テスト
bun run test
```
