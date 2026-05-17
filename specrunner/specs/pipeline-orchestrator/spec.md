# pipeline-orchestrator Specification

## Purpose
TBD - created by archiving change 2026-04-29-spec-review-pipeline. Update Purpose after archive.
## Requirements

### Requirement: Pipeline is Driven by a Declarative Transition Table
The `Pipeline` class SHALL drive step execution as a state machine using a declarative `Transition[]` table provided at construction time.

A `Transition` SHALL have the shape:

```ts
type Transition = {
  step: StepName;
  on: Verdict;            // "approved" | "needs-fix" | "escalation" | "passed" | "failed" | "success" | "error"
  to: StepName | "end" | "escalate";
};
```

Inline `if`-chains for verdict-based step routing in `pipeline.ts` SHALL be replaced by table lookup.

The standard transition table SHALL be extended to incorporate the `pr-create` step at the publish layer. The `code-review --approved→ end` row from the prior table SHALL be **replaced** by `code-review --approved→ pr-create`, and two new rows SHALL be added: `pr-create --success→ end` and `pr-create --error→ escalate`. The full table SHALL be:

- `propose --success→ spec-review`
- `spec-review --approved→ implementer`
- `spec-review --needs-fix→ spec-fixer`
- `spec-review --escalation→ escalate`
- `spec-fixer --approved→ spec-review`
- `implementer --success→ verification`
- `implementer --error→ escalate`
- `verification --passed→ code-review`
- `verification --failed→ build-fixer`
- `verification --escalation→ escalate`
- `build-fixer --success→ verification`
- `build-fixer --error→ escalate`
- `code-review --approved→ pr-create`
- `code-review --needs-fix→ code-fixer`
- `code-review --escalation→ escalate`
- `code-fixer --approved→ code-review`
- `code-fixer --error→ escalate`
- `pr-create --success→ end`
- `pr-create --error→ escalate`

The prior row `code-review --approved→ end` SHALL NOT be present in the table after this change. `pr-create` is a single-shot step (no loop) and SHALL NOT appear as both `step` and `to` in any transition row (no `pr-create ↔ <fixer>` cycle exists).

#### Scenario: Standard pipeline transitions are expressed as table rows
- **GIVEN** the standard pipeline (propose → spec-review ↔ spec-fixer → implementer → verification ↔ build-fixer → code-review ↔ code-fixer → pr-create → end)
- **WHEN** `Pipeline` is constructed
- **THEN** the transition table contains the rows enumerated in this Requirement (the full transition list defined above)

#### Scenario: code-review approved routes to pr-create
- **GIVEN** the standard pipeline
- **WHEN** `code-review` returns `approved`
- **THEN** `Pipeline.run` selects the `code-review --approved→ pr-create` row
- **AND** the next step executed is `pr-create`
- **AND** the prior row `code-review --approved→ end` is NOT present in the table

#### Scenario: pr-create success routes to end
- **GIVEN** the standard pipeline
- **WHEN** `pr-create` returns `success`
- **THEN** `Pipeline.run` selects the `pr-create --success→ end` row
- **AND** the run terminates with verdict `end`

#### Scenario: pr-create error routes to escalate
- **GIVEN** the standard pipeline
- **WHEN** `pr-create` returns `error`
- **THEN** `Pipeline.run` selects the `pr-create --error→ escalate` row
- **AND** the run terminates with verdict `escalate`
- **AND** `pipeline:fail` is emitted

#### Scenario: code-review approved does NOT route to end (regression guard)
- **WHEN** `STANDARD_TRANSITIONS` is inspected
- **THEN** there is NO row where `step === "code-review"` AND `on === "approved"` AND `to === "end"`
- **NOTE** The existing test TC-012 in `tests/unit/core/pipeline/pipeline.transitions.test.ts` MUST be updated to assert `to: "pr-create"` instead of `to: "end"`. The `pipeline-integration.test.ts` TC-050 assertion `expect(result.step).toBe("code-review")` will remain valid as `code-review` is still the last agent step before the CLI pr-create step.

#### Scenario: verification passed routes to code-review
- **GIVEN** the standard pipeline
- **WHEN** `verification` returns `passed`
- **THEN** `Pipeline.run` selects the `verification --passed→ code-review` row
- **AND** the next step executed is `code-review`
- **AND** the prior row `verification --passed→ end` is NOT present in the table

#### Scenario: Unknown transition triggers escalation
- **GIVEN** a step produces a verdict that has no matching `Transition` row
- **WHEN** `Pipeline.run` evaluates the routing
- **THEN** the run terminates as `escalate`
- **AND** the failure surfaces via `pipeline:fail` event with a diagnostic payload

### Requirement: Pipeline Enforces Loop Guard via maxIterations

以下を既存 Requirement に追加する:

---

`Pipeline` SHALL accept an additional constructor parameter `loopFixerPairs: Record<string, string>` that maps review step names to their paired fixer step names. The default value SHALL be `{}` (no pairs defined).

`Pipeline.runInternal` SHALL maintain a `fixerIters: Map<string, number>` counter parallel to `loopIters`. The counter SHALL be incremented each time a fixer step (a value in `loopFixerPairs`) is entered, before the step executes.

#### Exhaustion bypass for fixer's final iteration

When the next step is a loop step AND `loopIters[nextStep] >= maxIterations`, the pipeline SHALL check whether the exhaustion can be bypassed:

- **Bypass condition**: The immediately preceding step (the step that just completed) is the paired fixer for `nextStep` (per `loopFixerPairs`), AND `fixerIters[pairedFixer] >= maxIterations`.
- **When bypass condition is met**: The exhaustion check is skipped, and the review step executes one additional time (the "final-fix review").
- **When bypass condition is NOT met**: The pipeline escalates with `resumePoint.exhaustionPhase = "review-exhausted"` (conventional exhaustion).

This guarantees that the fixer's final iteration output is reviewed exactly once before any escalation decision.

#### Fixer exhaustion gate

When the next step is a fixer step (a value in `loopFixerPairs`) AND `fixerIters[nextStep] >= maxIterations`, the pipeline SHALL escalate immediately. The fixer SHALL NOT be re-entered. The escalation SHALL set `resumePoint.exhaustionPhase = "review-after-final-fix"` and use the paired review step's error shape from `LOOP_ERROR_CODES`.

#### Maximum review iterations

The maximum number of review iterations for a loop step with a paired fixer is `maxIterations + 1`. The `+1` iteration is exclusively the "final-fix review" (triggered only by the bypass condition). Loop steps without a paired fixer retain the existing maximum of `maxIterations`.

#### `ResumePoint.exhaustionPhase`

The `ResumePoint` interface SHALL include an optional field:

```typescript
exhaustionPhase?: "review-after-final-fix" | "review-exhausted";
```

- `"review-after-final-fix"`: The fixer ran to its maximum iterations, the subsequent review did not approve, and the pipeline escalated.
- `"review-exhausted"`: The review exhausted at `maxIterations` without the fixer bypass condition being met (conventional exhaustion path).

The field is optional for backward compatibility with existing state files.

#### `loopFixerPairs` standard configuration

The standard pipeline (`run.ts`) SHALL pass:

```typescript
loopFixerPairs: {
  [STEP_NAMES.CODE_REVIEW]: STEP_NAMES.CODE_FIXER,
  [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER,
  [STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER,
}
```

---

#### Scenario: fixer final iter output is reviewed before escalation (code-review)

- **GIVEN** `maxIterations = 2` and `loopFixerPairs` maps `code-review → code-fixer`
- **AND** code-review returns `needs-fix` for iterations 1 and 2
- **AND** code-fixer runs after each needs-fix (2 total fixer runs)
- **WHEN** code-fixer iteration 2 completes and transitions to code-review
- **THEN** code-review iteration 3 (the bypass) SHALL execute
- **AND** if iteration 3 returns `approved`, the pipeline continues to pr-create
- **AND** `state.steps["code-review"]` has 3 entries

#### Scenario: bypass review rejects → fixer gate escalation

- **GIVEN** same setup as above (maxIterations = 2, code-fixer runs 2 times)
- **WHEN** code-review iteration 3 (bypass) returns `needs-fix`
- **AND** the transition table routes to code-fixer
- **THEN** the fixer gate detects `fixerIters["code-fixer"] >= 2`
- **AND** pipeline escalates with `resumePoint.exhaustionPhase === "review-after-final-fix"`
- **AND** error.code is `CODE_REVIEW_RETRIES_EXHAUSTED`

#### Scenario: loop step without paired fixer exhausts at maxIterations (regression guard)

- **GIVEN** a loop step that has no entry in `loopFixerPairs` keys
- **WHEN** that step reaches `maxIterations`
- **THEN** pipeline escalates immediately without bypass
- **AND** `resumePoint.exhaustionPhase === "review-exhausted"`

#### Scenario: spec-review ↔ spec-fixer bypass operates identically

- **GIVEN** `maxIterations = 2` and `loopFixerPairs` maps `spec-review → spec-fixer`
- **AND** spec-review returns `needs-fix` for iterations 1 and 2
- **WHEN** spec-fixer iteration 2 completes
- **THEN** spec-review iteration 3 (bypass) SHALL execute

#### Scenario: verification ↔ build-fixer bypass operates identically

- **GIVEN** `maxIterations = 2` and `loopFixerPairs` maps `verification → build-fixer`
- **AND** verification returns `failed` for iterations 1 and 2
- **WHEN** build-fixer iteration 2 completes
- **THEN** verification iteration 3 (bypass) SHALL execute

### Requirement: Pipeline Emits Lifecycle Events
`Pipeline.run` SHALL emit lifecycle events through the injected `EventBus`:

- `pipeline:start` at the beginning of `run`
- `pipeline:complete` when the run terminates with verdict `end`
- `pipeline:fail` when the run terminates with verdict `escalate` or by exception

#### Scenario: Successful run emits start and complete
- **GIVEN** a pipeline that ends in `spec-review --approved→ end`
- **WHEN** `Pipeline.run` is invoked and completes
- **THEN** `pipeline:start` is emitted exactly once at the beginning
- **AND** `pipeline:complete` is emitted exactly once at the end
- **AND** `pipeline:fail` is NOT emitted

#### Scenario: Escalation emits pipeline:fail
- **WHEN** `Pipeline.run` terminates due to escalation or loop-guard exhaustion
- **THEN** `pipeline:fail` is emitted with the failure reason in the payload

### Requirement: step implementations are located in src/core/step/
Step implementations SHALL be located at `src/core/step/<step>.ts` (singular `step/`), replacing the prior layout `src/core/steps/<step>.ts` (plural `steps/`).

`Pipeline` itself SHALL be located at `src/core/pipeline/pipeline.ts`.

#### Scenario: File layout
- **WHEN** the change is applied
- **THEN** `src/core/step/propose.ts`, `src/core/step/spec-review.ts`, `src/core/step/spec-fixer.ts` exist
- **AND** `src/core/pipeline/pipeline.ts` exists
- **AND** `src/core/steps/` directory does not exist

### Requirement: Pipeline Emits Iteration Progress to Stdout

`Pipeline.run` SHALL emit iteration progress to stdout in the same format previously produced by `runLoopUntil`. This Requirement is the authoritative (single source of truth) definition of these format strings, superseding `pipeline-loop-primitive` spec which is REMOVED by this change.

The canonical format strings are:

- Iteration start: `[iter <N>] <loopName> starting`
- Iteration verdict approved: `[iter <N>/<max>] <loopName> verdict: approved → done`
- Iteration verdict escalation: `[iter <N>/<max>] <loopName> verdict: escalation → halt`
- Iteration verdict needs-fix (not last): `[iter <N>/<max>] <loopName> verdict: needs-fix → spawning fixer`
- Iterations exhausted: `[iter <N>/<max>] retries exhausted, escalating`

These strings MUST be reproduced bit-for-bit by `Pipeline.run`. Any future change to these format strings MUST be made in this Requirement only.

#### Scenario: Iteration progress format — approved

- **WHEN** `Pipeline.run` completes an iteration and the step returns `approved`
- **THEN** stdout contains `[iter 1/<max>] <loopName> verdict: approved → done`

#### Scenario: Iteration progress format — needs-fix continuation

- **GIVEN** `maxIterations = 2`
- **WHEN** iter=1 step returns `needs-fix` and iter < maxIterations
- **THEN** stdout contains `[iter 1/2] <loopName> verdict: needs-fix → spawning fixer`

#### Scenario: Iteration progress format — exhausted

- **GIVEN** `maxIterations = 2`
- **WHEN** iter=2 step returns `needs-fix` and the loop guard fires
- **THEN** stdout contains `[iter 2/2] retries exhausted, escalating`

### Requirement: Verdict union includes implementation-layer verdicts

The `Verdict` union (`src/state/schema.ts`) SHALL include the literal values `"passed"`, `"failed"`, `"success"`, `"error"` in addition to the existing `"approved"`, `"needs-fix"`, `"escalation"`. The exhaustiveness of `Verdict` SHALL be enforced by TypeScript exhaustive-switch checks at every site that handles a verdict.

- `passed` / `failed` — produced by `verification` step
- `success` / `error` — produced by `implementer` and `build-fixer` steps via `StepExecutor` lifecycle (verdict file 不在のため CLI 側が導出)
- `approved` / `needs-fix` / `escalation` — produced by `propose` / `spec-review` / `spec-fixer` (unchanged)

`spec-fixer` の `parseResult` は引き続き `{ verdict: null, ... }` を返す（`NULL_PARSE_RESULT` 定数を使用）。`StepExecutor` は `resultFilePath === null` かつ session 正常完了の agent step に対して `verdict: "success"` を導出するため、spec-fixer / implementer / build-fixer の 3 step は全て同一の「session 完了 = success」パターンに統一される。将来的に spec-fixer も `"success"` verdict を明示的に返す `Verdict` 型に移行する際は、`NULL_PARSE_RESULT` 参照を `{ verdict: "success", findingsPath: null, fileContent: null }` に置き換えるだけで完結する（Open Question として記録）。

#### Scenario: Verdict union accepts new literals

- **WHEN** TypeScript compiles a switch statement that exhaustively handles the `Verdict` union
- **THEN** the compilation succeeds when all 7 literals (`approved`, `needs-fix`, `escalation`, `passed`, `failed`, `success`, `error`) are covered
- **AND** the compilation fails when any of the 7 literals is omitted

### Requirement: Pipeline はループごとのエラーコードを lookup table から取得する

`Pipeline` SHALL retrieve per-cycle error code / message / hint from a `LOOP_ERROR_CODES: Record<StepName, { code: string; message: (n: number) => string; hint: (nnn: string) => string }>` lookup table. The pipeline MUST derive the cycle endpoint step name from the transition table, look it up in `LOOP_ERROR_CODES`, and assemble the error shape from the resulting entry. Hardcoded error code literals MUST NOT appear in `Pipeline` itself.

```ts
const LOOP_ERROR_CODES: Record<string, { code: string; message: (n: number) => string; hint: (nnn: string) => string }> = {
  "spec-review": {
    code: "SPEC_REVIEW_RETRIES_EXHAUSTED",
    message: (n) => `spec-review did not approve after ${n} iterations`,
    hint: (nnn) => `Review spec-review-result-${nnn}.md and adjust the request manually.`,
  },
  "verification": {
    code: "VERIFICATION_RETRIES_EXHAUSTED",
    message: (n) => `verification did not pass after ${n} iterations`,
    hint: (nnn) => `Review verification-result-${nnn}.md and inspect failed phases manually.`,
  },
  "code-review": {
    code: "CODE_REVIEW_RETRIES_EXHAUSTED",
    message: (n) => `code-review did not approve after ${n} iterations`,
    hint: (nnn) => `Review review-feedback-${nnn}.md and address findings manually.`,
  },
};
```

新しい cycle を追加する際は `LOOP_ERROR_CODES` に 1 エントリを追加するだけでよく、`Pipeline.handleExhausted` の実装は無編集である。

#### Scenario: ループエラーコードが lookup から導出される

- **WHEN** spec-review ↔ spec-fixer cycle が maxIterations に達する
- **THEN** `Pipeline` は `LOOP_ERROR_CODES["spec-review"]` を参照して error shape を構築する
- **AND** error.code は `"SPEC_REVIEW_RETRIES_EXHAUSTED"` である

- **WHEN** verification ↔ build-fixer cycle が maxIterations に達する
- **THEN** `Pipeline` は `LOOP_ERROR_CODES["verification"]` を参照して error shape を構築する
- **AND** error.code は `"VERIFICATION_RETRIES_EXHAUSTED"` である

- **WHEN** code-review ↔ code-fixer cycle が maxIterations に達する
- **THEN** `Pipeline` は `LOOP_ERROR_CODES["code-review"]` を参照して error shape を構築する
- **AND** error.code は `"CODE_REVIEW_RETRIES_EXHAUSTED"` である

### Requirement: StepName union includes implementation-layer steps

The `StepName` union (`src/state/schema.ts`) SHALL include the literal values `"implementer"`, `"verification"`, `"build-fixer"`, `"code-review"`, `"code-fixer"` in addition to the existing `"propose"`, `"spec-review"`, `"spec-fixer"`.

#### Scenario: StepName union accepts new literals

- **WHEN** the StepName union is inspected
- **THEN** it contains the 8 literals: `propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`

### Requirement: Pipeline.loopNames 既定値は code-review を含む

`Pipeline` constructor の `loopNames` パラメータ既定値 SHALL `["spec-review", "verification", "code-review"]` とし、iteration 進捗 stdout（`[iter <N>] <loopName> starting` 等）と loop guard が code-review ↔ code-fixer cycle にも適用されるようにする。明示的に `loopNames` を渡された場合はその値を優先する（既存契約と一致）。

#### Scenario: loopNames 既定値に code-review が含まれる

- **GIVEN** `Pipeline` constructor を `loopNames` 引数なしで呼ぶ
- **WHEN** インスタンスの `loopNames` を inspect する
- **THEN** `["spec-review", "verification", "code-review"]` を含む

#### Scenario: code-review 入場時に iteration 進捗が stdout に出る

- **GIVEN** loopNames 既定値で構築された pipeline
- **WHEN** `code-review` step が iteration 1 として開始する
- **THEN** stdout に `[iter 1] code-review starting` が出力される

### Requirement: pr-create is excluded from loopNames

`Pipeline.loopNames`既定値 SHALL `["spec-review", "verification", "code-review"]` のままとし、`pr-create` を含めない。pr-create は単発 step（loop なし）であり、iteration 進捗 stdout（`[iter <N>] <loopName> starting`）と loop guard の対象外である。

#### Scenario: pr-create は loopNames に含まれない

- **GIVEN** `Pipeline` constructor を `loopNames` 引数なしで呼ぶ
- **WHEN** インスタンスの `loopNames` を inspect する
- **THEN** `["spec-review", "verification", "code-review"]` を含み、`"pr-create"` を含まない

#### Scenario: pr-create 入場時に iteration 進捗は出力されない

- **GIVEN** loopNames 既定値で構築された pipeline
- **WHEN** `pr-create` step が実行される
- **THEN** stdout に `[iter <N>] pr-create starting` という行は出力されない（pr-create は loopNames に含まれないため）

### Requirement: pr-create は LOOP_ERROR_CODES に登録されない

`pr-create` は loop ではないため、`LOOP_ERROR_CODES` lookup table に entry を追加してはならない (MUST NOT)。`Pipeline.handleExhausted` は `pr-create` を考慮 SHALL NOT する。

#### Scenario: LOOP_ERROR_CODES に pr-create は存在しない

- **WHEN** `LOOP_ERROR_CODES` を inspect する
- **THEN** keys は `"spec-review"` / `"verification"` / `"code-review"` の 3 つのみで、`"pr-create"` は含まれない

### Requirement: StepName union includes "pr-create"

The `StepName` union (`src/state/schema.ts`) SHALL be extended to include the literal value `"pr-create"`, in addition to the 8 literals defined by prior changes (`propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`).

#### Scenario: StepName union accepts "pr-create"

- **WHEN** the StepName union is inspected
- **THEN** it contains the 9 literals: `propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`, `pr-create`

### Requirement: AgentStepName excludes "pr-create" from the Exclude clause

The `AgentStepName` type (`src/state/schema.ts`) SHALL be updated to:

```ts
export type AgentStepName = Exclude<StepName, "verification" | "pr-create">;
```

`pr-create` is a `kind: "cli"` step with no `agent` field, mirroring `verification`. Including `pr-create` in `AgentStepName` would cause `AgentRegistry`, `AgentSyncer`, and `config.agents` to treat it as an agent role, which is incorrect. The Exclude clause MUST enumerate both `"verification"` and `"pr-create"` simultaneously with this change.

#### Scenario: AgentStepName does not include "pr-create"

- **WHEN** `AgentStepName` is inspected (e.g., via TypeScript type checking or runtime assertion)
- **THEN** `"pr-create"` is NOT assignable to `AgentStepName`
- **AND** `"verification"` is NOT assignable to `AgentStepName`
- **AND** all agent-resident steps (`propose`, `spec-review`, `spec-fixer`, `implementer`, `build-fixer`, `code-review`, `code-fixer`) ARE assignable to `AgentStepName`
