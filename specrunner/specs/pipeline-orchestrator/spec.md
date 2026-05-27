# pipeline-orchestrator Specification

## Purpose
TBD - created by archiving change 2026-04-29-spec-review-pipeline. Update Purpose after archive.
## Requirements

### Requirement: Pipeline is Driven by a Declarative Transition Table

以下を既存 Requirement の transition table 定義に追加・変更する:

---

The `Transition` interface SHALL support an optional `when?: (state: JobState) => boolean` predicate を追加する。既存の `step`, `on`, `to` フィールドは変更しない。

`Pipeline.runInternal()` の transition lookup SHALL `when` predicate を評価する:
- `when` が undefined → 常にマッチ（既存挙動維持）
- `when` が定義 → `when(state)` が true の場合のみマッチ
- `Array.find()` の first-match 特性により、conditional transition を fallback の前に配置すること

The standard transition table SHALL include the following changes:

**Replaced row:**
- `code-review --approved→ adr-gen` → `code-review --approved→ delta-spec-validation`

**Added conditional row:**
- `delta-spec-validation --approved→ adr-gen` (when: `state.steps["code-review"]` に attempt が存在する場合のみ)

**Existing row retained as fallback:**
- `delta-spec-validation --approved→ spec-review` (when なし — 1st phase のデフォルト)

The full table SHALL be:

- `design --success→ delta-spec-validation`
- `design --error→ escalate`
- `delta-spec-validation --approved→ adr-gen` (when: code-review 実行済み)
- `delta-spec-validation --approved→ spec-review` (fallback)
- `delta-spec-validation --needs-fix→ delta-spec-fixer`
- `delta-spec-validation --escalation→ escalate`
- `delta-spec-fixer --approved→ delta-spec-validation`
- `delta-spec-fixer --error→ escalate`
- `spec-review --approved→ test-case-gen`
- `spec-review --needs-fix→ spec-fixer`
- `spec-review --escalation→ escalate`
- `spec-fixer --approved→ delta-spec-validation`
- `spec-fixer --error→ escalate`
- `test-case-gen --success→ implementer`
- `test-case-gen --error→ escalate`
- `implementer --success→ verification`
- `implementer --error→ escalate`
- `verification --passed→ code-review`
- `verification --failed→ build-fixer`
- `verification --escalation→ escalate`
- `build-fixer --success→ verification`
- `build-fixer --error→ escalate`
- `code-review --approved→ delta-spec-validation`
- `code-review --needs-fix→ code-fixer`
- `code-review --escalation→ escalate`
- `code-fixer --approved→ code-review`
- `code-fixer --error→ escalate`
- `adr-gen --success→ pr-create`
- `adr-gen --error→ escalate`
- `pr-create --success→ end`
- `pr-create --error→ escalate`

#### Scenario: 1st phase delta-spec-validation approved routes to spec-review

- **GIVEN** pipeline is in 1st phase (code-review has NOT run)
- **WHEN** `delta-spec-validation` returns `approved`
- **THEN** the next step is `spec-review`

#### Scenario: 2nd phase delta-spec-validation approved routes to adr-gen

- **GIVEN** pipeline is in 2nd phase (code-review HAS run with at least one attempt)
- **WHEN** `delta-spec-validation` returns `approved`
- **THEN** the next step is `adr-gen`

#### Scenario: code-review approved routes to delta-spec-validation

- **GIVEN** `code-review` returns `approved`
- **WHEN** the transition table is consulted
- **THEN** the next step is `delta-spec-validation`

#### Scenario: delta-spec-validation needs-fix routes to delta-spec-fixer in both phases

- **GIVEN** `delta-spec-validation` returns `needs-fix` in either 1st or 2nd phase
- **WHEN** the transition table is consulted
- **THEN** the next step is `delta-spec-fixer`

#### Scenario: existing transitions without when predicate are unaffected

- **GIVEN** a transition without `when` predicate (e.g., `design --success→ delta-spec-validation`)
- **WHEN** the transition is evaluated
- **THEN** it matches regardless of pipeline state (backward compatible)

### Requirement: Pipeline Enforces Loop Guard via maxIterations

`Pipeline` SHALL accept a `maxIterations` parameter and SHALL terminate cycles when the cycle count reaches the limit. The loop guard MUST apply to the delta-spec-validation cycle (`delta-spec-validation ↔ delta-spec-fixer`), the spec-layer cycle (`spec-review ↔ spec-fixer`), the implementation-layer build cycle (`verification ↔ build-fixer`), and the implementation-layer review cycle (`code-review ↔ code-fixer`).

The `DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED` error shape SHALL be introduced for the delta-spec-validation cycle.

#### Scenario: delta-spec-validation ↔ delta-spec-fixer cycle terminates at maxIterations

- **GIVEN** `maxIterations = 3`
- **AND** `delta-spec-validation` returns `needs-fix` for 3 consecutive iterations
- **WHEN** the loop guard fires
- **THEN** `Pipeline.run` raises an error with code `DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED`
- **AND** `state.error` is set to `{ code: "DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED", message: LOOP_ERROR_CODES["delta-spec-validation"].message(3), hint: LOOP_ERROR_CODES["delta-spec-validation"].hint("003") }` — i.e. `message(3) === "delta-spec-validation did not pass after 3 iterations"`

#### Scenario: delta-spec-validation loop counter is independent from spec-review

- **GIVEN** `maxIterations = 3`
- **AND** `delta-spec-validation` has already iterated 2 times (needs-fix → fixer → validation)
- **WHEN** the pipeline later enters `spec-review` for the first time
- **THEN** `spec-review` iteration counter starts at 1 (not 3)
- **AND** `delta-spec-validation` counter remains at 2

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

`Pipeline` SHALL retrieve per-cycle error code / message / hint from a `LOOP_ERROR_CODES: Record<StepName, { code: string; message: (n: number) => string; hint: (nnn: string) => string }>` lookup table. The table SHALL include `delta-spec-validation`:

```ts
const LOOP_ERROR_CODES: Record<string, { code: string; message: (n: number) => string; hint: (nnn: string) => string }> = {
  "delta-spec-validation": {
    code: "DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED",
    message: (n) => `delta-spec-validation did not pass after ${n} iterations`,
    hint: (nnn) => `Review delta-spec-validation-result.md and fix path/format violations manually.`,
  },
  "spec-review": { /* unchanged */ },
  "verification": { /* unchanged */ },
  "code-review": { /* unchanged */ },
};
```

#### Scenario: delta-spec-validation ループエラーコードが lookup から導出される

- **WHEN** delta-spec-validation ↔ delta-spec-fixer cycle が maxIterations に達する
- **THEN** `Pipeline` は `LOOP_ERROR_CODES["delta-spec-validation"]` を参照して error shape を構築する
- **AND** error.code は `"DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED"` である

### Requirement: StepName union includes implementation-layer steps

The `StepName` union (`src/state/schema.ts`) SHALL include the literal values `"implementer"`, `"verification"`, `"build-fixer"`, `"code-review"`, `"code-fixer"` in addition to the existing `"propose"`, `"spec-review"`, `"spec-fixer"`.

#### Scenario: StepName union accepts new literals

- **WHEN** the StepName union is inspected
- **THEN** it contains the 8 literals: `propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`

### Requirement: Pipeline.loopNames 既定値は code-review を含む

`Pipeline` constructor の `loopNames` パラメータ既定値 SHALL `["spec-review", "verification", "code-review"]` とし、`delta-spec-validation` は含まない。delta-spec-validation の retry 上限は paired fixer (delta-spec-fixer) の `fixerIters` で gate される (= `loopFixerPairs` 経由)。

これにより `delta-spec-validation` が approved を返して spec-review に進む経路で、dsv 自身の loopIters がカウントされず、後続 spec-review が paired fixer (spec-fixer) の bypass 機能を正しく受けられる。

#### Scenario: loopNames 既定値に delta-spec-validation が含まれない

- **GIVEN** `Pipeline` constructor を `loopNames` 引数なしで呼ぶ
- **WHEN** インスタンスの `loopNames` を inspect する
- **THEN** `["spec-review", "verification", "code-review"]` のみを含み、`"delta-spec-validation"` は含まない

#### Scenario: delta-spec-validation の retry は delta-spec-fixer の fixerIters で gate される

- **GIVEN** `loopFixerPairs` に `delta-spec-validation → delta-spec-fixer` が登録されている
- **WHEN** delta-spec-validation が needs-fix を返し続けると delta-spec-fixer が `maxIterations` 回走る
- **THEN** delta-spec-fixer 入場直前の fixer exhaustion check で `fixerIters[delta-spec-fixer] >= maxIterations` が検出され escalate する
- **AND** error.code は `"DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED"` である

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

### Requirement: AgentStepName accepts only agent-resident steps (whitelist)

以下を既存 Requirement に追加する:

---

`AGENT_STEP_NAMES` 配列に `"adr-gen"` を追加する。`AgentStepName` 型は `typeof AGENT_STEP_NAMES[number]` から derive されるため自動的に `"adr-gen"` を含む。

`STEP_NAMES` オブジェクトに `ADR_GEN: "adr-gen"` を追加する。

#### Scenario: AgentStepName accepts "adr-gen"

- **WHEN** `AgentStepName` is inspected via TypeScript type checking
- **THEN** `"design"`, `"spec-review"`, `"spec-fixer"`, `"delta-spec-fixer"`, `"test-case-gen"`, `"implementer"`, `"build-fixer"`, `"code-review"`, `"code-fixer"`, `"adr-gen"` ARE assignable to `AgentStepName`
- **AND** `"verification"`, `"pr-create"`, `"delta-spec-validation"` are NOT assignable to `AgentStepName`

### Requirement: Loop exhaustion bypass is gated by fixer iteration count, not preceding step identity

`Pipeline` の loop exhaustion bypass 条件 SHALL `pairedFixer` の `fixerIters` が `maxIterations` に達していることのみに基づく。直前 step (`currentStep`) が `pairedFixer` 自身であることは要件ではない。これにより `spec-fixer → delta-spec-validation → spec-review` のように fixer と review の間に deterministic step が挿入される transition でも bypass が機能する。

#### Scenario: bypass operates through intermediate deterministic step

- **GIVEN** `spec-review → spec-fixer → delta-spec-validation → spec-review` の transition チェーン
- **AND** spec-fixer が `maxIterations` 回 (= 2) 走った後
- **WHEN** spec-review iteration 3 (bypass) に到達する直前の exhaustion check が行われる
- **THEN** `fixerIters[spec-fixer] >= 2` が成立し bypass が許可される
- **AND** 直前 step が spec-fixer ではなく delta-spec-validation でも bypass は機能する

### Requirement: StepName union includes "delta-spec-validation" and "delta-spec-fixer"

The `StepName` union (`src/state/schema.ts`) SHALL be extended to include the literal values `"delta-spec-validation"` and `"delta-spec-fixer"`, in addition to the existing literals.

#### Scenario: StepName union accepts new step names

- **WHEN** the StepName union is inspected
- **THEN** it contains `"delta-spec-validation"` and `"delta-spec-fixer"` among its literals

### Requirement: delta-spec-validation は spec-change/new-feature type で specs/ 不在を reject する

`delta-spec-validation` step SHALL、request type が `spec-change` または `new-feature` の場合に、change folder の `specs/` 配下に `.md` ファイルが 1 件以上存在することを検証する。0 件の場合は `no-specs-for-required-type` violation を生成し verdict `needs-fix` を返す。

この check は既存 Step 1-4 (legacy path / format check) の **前** に実行し、specs/ 不在時は短絡 fail する。

request type が `bug-fix` / `refactoring` / `chore` 等の場合は本 check の対象外とし、specs/ 不在でも既存挙動 (approved) を維持する。

`DeltaSpecViolationReason` union に `"no-specs-for-required-type"` を追加する。violation の schema は既存 (`path` / `reason` / `suggested`) 準拠とする。

#### Scenario: type=spec-change で specs/ 不在 → needs-fix

- **GIVEN** request type が `spec-change`
- **AND** change folder の `specs/` 配下に `.md` ファイルが 0 件
- **WHEN** `delta-spec-validation` step が実行される
- **THEN** violation `no-specs-for-required-type` が 1 件生成される
- **AND** verdict は `needs-fix`

#### Scenario: type=new-feature で specs/ 不在 → needs-fix

- **GIVEN** request type が `new-feature`
- **AND** change folder の `specs/` 配下に `.md` ファイルが 0 件
- **WHEN** `delta-spec-validation` step が実行される
- **THEN** violation `no-specs-for-required-type` が 1 件生成される
- **AND** verdict は `needs-fix`

#### Scenario: type=bug-fix で specs/ 不在 → approved (対象外)

- **GIVEN** request type が `bug-fix`
- **AND** change folder の `specs/` 配下に `.md` ファイルが 0 件
- **WHEN** `delta-spec-validation` step が実行される
- **THEN** `no-specs-for-required-type` violation は生成されない
- **AND** 他の violation がなければ verdict は `approved`

#### Scenario: type=spec-change で specs/ に .md 1 件以上 → 後段 check 継続

- **GIVEN** request type が `spec-change`
- **AND** change folder の `specs/` 配下に `.md` ファイルが 1 件以上
- **WHEN** `delta-spec-validation` step が実行される
- **THEN** `no-specs-for-required-type` violation は生成されない
- **AND** 既存 Step 1-4 (legacy path / format check) が継続実行される

### Requirement: Pipeline は deps.storeFactory 経由で JobStateStore を取得する

`Pipeline` SHALL obtain `JobStateStore` instances exclusively via `deps.storeFactory(jobId)` (where `deps: PipelineDeps` is passed to `run` / `runInternal`). `Pipeline` SHALL NOT import or inline-construct `JobStateStore` via `new`.

This applies to all state persistence points within `Pipeline`:
- Error recovery in `run()` catch block
- Post-step state persistence in `runInternal()`
- Terminal state transitions (`end` → awaiting-merge, `escalate` → awaiting-resume)
- Transition history recording
- Loop exhaustion handling in `handleExhausted()`

`PipelineDeps` SHALL include a required `storeFactory: StoreFactory` field. `StoreFactory` is defined as `(jobId: string) => JobStateStore` and SHALL be exported from `src/core/types.ts`.

The `storeFactory` SHALL be injected at the composition root (`RuntimeStrategy.buildDeps()` in `local.ts` and `managed.ts`), alongside the existing `spawn: spawnCommand` injection.

#### Scenario: Pipeline does not import JobStateStore for construction

- **WHEN** `src/core/pipeline/pipeline.ts` is grepped for `new JobStateStore`
- **THEN** zero matches are returned

#### Scenario: storeFactory is required on PipelineDeps

- **WHEN** a `PipelineDeps` object is constructed without `storeFactory`
- **THEN** TypeScript compilation fails

#### Scenario: Pipeline and StepExecutor share the same injected storeFactory

- **GIVEN** `RuntimeStrategy.buildDeps()` returns a `PipelineDeps` with `storeFactory: (id) => new JobStateStore(id)`
- **WHEN** `createStandardPipeline(deps)` constructs the `StepExecutor` and the pipeline runs
- **THEN** both `Pipeline` and `StepExecutor` use the same `deps.storeFactory` reference
- **AND** replacing `storeFactory` in deps replaces store creation for both components

#### Scenario: buildDeps injects storeFactory in both runtimes

- **WHEN** `LocalRuntime.buildDeps()` or `ManagedRuntime.buildDeps()` is invoked
- **THEN** the returned `PipelineDeps` includes `storeFactory` that creates `JobStateStore` instances

### Requirement: Verdict union includes `approved-with-fixes`

`Verdict` union (`src/state/schema.ts`) SHALL include the literal value `"approved-with-fixes"` in addition to the existing 7 literals. This verdict indicates that a review step approved the change but identified fixable observations that should be automatically resolved before proceeding.

#### Scenario: Verdict union accepts `approved-with-fixes`

- **WHEN** TypeScript compiles a switch statement that exhaustively handles the `Verdict` union
- **THEN** the compilation succeeds when all 8 literals (`approved`, `approved-with-fixes`, `needs-fix`, `escalation`, `passed`, `failed`, `success`, `error`) are covered
- **AND** the compilation fails when any of the 8 literals is omitted

### Requirement: code-review `approved-with-fixes` verdict routes to code-fixer

The transition table SHALL include a row `code-review --approved-with-fixes→ code-fixer`. This row routes code-review output to the code-fixer step when the review is approved but contains fixable findings (`Fix: yes` in the Findings table).

#### Scenario: code-review approved-with-fixes routes to code-fixer

- **GIVEN** `code-review` returns verdict `approved-with-fixes`
- **WHEN** the transition table is consulted
- **THEN** the next step is `code-fixer`

#### Scenario: code-review approved (without fixes) routes to delta-spec-validation unchanged

- **GIVEN** `code-review` returns verdict `approved` (no fixable findings)
- **WHEN** the transition table is consulted
- **THEN** the next step is `delta-spec-validation` (existing behavior preserved)

### Requirement: code-fixer exit routes based on prior review verdict

The code-fixer `approved` exit SHALL be split into two conditional transitions:

1. `code-fixer --approved→ delta-spec-validation` (when: the latest `code-review` step result has verdict `approved-with-fixes`)
2. `code-fixer --approved→ code-review` (fallback, no `when` — preserves existing needs-fix loop)

The conditional row MUST precede the fallback row in the transition table (first-match via `Array.find`).

The `when` predicate SHALL inspect `state.steps["code-review"]` and check the `outcome.verdict` of the last entry.

#### Scenario: code-fixer after approved-with-fixes routes to delta-spec-validation

- **GIVEN** the latest `code-review` step result has verdict `approved-with-fixes`
- **AND** `code-fixer` completes successfully (verdict `approved`)
- **WHEN** the transition table is consulted
- **THEN** the next step is `delta-spec-validation` (skipping re-review)

#### Scenario: code-fixer after needs-fix routes to code-review (existing loop)

- **GIVEN** the latest `code-review` step result has verdict `needs-fix`
- **AND** `code-fixer` completes successfully (verdict `approved`)
- **WHEN** the transition table is consulted
- **THEN** the next step is `code-review` (existing loop preserved)

#### Scenario: code-fixer error routes to escalate regardless of prior verdict

- **GIVEN** `code-fixer` fails (verdict `error`)
- **WHEN** the transition table is consulted
- **THEN** the next step is `escalate` (existing behavior, unchanged)

### Requirement: `determineVerdict()` is abolished — agent verdict is adopted directly

`code-review.ts` の `parseResult()` SHALL adopt the agent's verdict directly without CLI-side score recalculation. The `determineVerdict()` function (which computes CLI verdict from score table and severity counts and takes the stricter of CLI and agent verdicts) SHALL be removed.

The new verdict logic SHALL be:

1. `agentVerdict === "escalation"` → `"escalation"`
2. `agentVerdict === "approved"` AND fixable finding count > 0 → `"approved-with-fixes"`
3. `agentVerdict === "approved"` AND fixable finding count === 0 → `"approved"`
4. `agentVerdict === "needs-fix"` → `"needs-fix"`
5. `agentVerdict === null` → `"escalation"`

`parseReviewScores()` and `parseFindingSeverityCounts()` SHALL NOT be called from `parseResult()`.

#### Scenario: agent verdict approved is adopted without score override

- **GIVEN** agent outputs verdict `approved` with a total score of 6.5 (below the old 7.0 threshold)
- **AND** no fixable findings exist
- **WHEN** `parseResult()` is called
- **THEN** the returned verdict is `approved` (not overridden to `needs-fix`)

#### Scenario: agent verdict approved with fixable findings yields approved-with-fixes

- **GIVEN** agent outputs verdict `approved`
- **AND** the Findings table contains at least one finding with `Fix: yes`
- **WHEN** `parseResult()` is called
- **THEN** the returned verdict is `approved-with-fixes`

#### Scenario: agent verdict needs-fix is adopted regardless of fix column

- **GIVEN** agent outputs verdict `needs-fix`
- **WHEN** `parseResult()` is called
- **THEN** the returned verdict is `needs-fix` (fixable finding count is not consulted)

### Requirement: Pipeline は進捗メッセージを DomainEvent 経由で出力する

`Pipeline` クラス (`src/core/pipeline/pipeline.ts`) は MUST stdout/stderr に直接出力しない。パイプラインの進捗・状態メッセージは DomainEvent 経由で emit し、プレゼンテーション層 (`src/cli/progress.ts`) が subscribe して stderr に出力する。新 DomainEvent として `"pipeline:iteration:start"` / `"pipeline:iteration:verdict"` / `"pipeline:iteration:exhausted"` / `"pipeline:summary"` / `"pipeline:cli-step"` を `src/core/event/types.ts` に追加する。

`ProgressDisplay` の TTY 検出は MUST `process.stderr.isTTY` を参照する。heartbeat の `\r` 上書きとカラム幅は `process.stderr.columns` を SHALL 使用する。

#### Scenario: pipeline.ts が stdout/stderr に直接出力しない

- **GIVEN** pipeline が実行される
- **WHEN** iteration 開始 / verdict / exhaustion / summary が発生する
- **THEN** `Pipeline` は対応する DomainEvent を emit するのみで、`process.stdout.write` / `process.stderr.write` / `stdoutWrite` を直接呼び出さない

#### Scenario: progress.ts が新 event を stderr に出力する

- **GIVEN** ProgressDisplay が EventBus に wire されている
- **WHEN** `pipeline:iteration:start` event が emit される
- **THEN** `[iter N/M] starting <step>\n` が stderr に出力される

#### Scenario: TTY 検出が stderr を参照する

- **GIVEN** `process.stderr.isTTY === false` (stderr がリダイレクトされている)
- **WHEN** heartbeat timer が fire する
- **THEN** `\r` 上書きは使用されず、改行付きの行が出力される
