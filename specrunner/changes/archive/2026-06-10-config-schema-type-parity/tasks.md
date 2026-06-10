# Tasks: config schema ↔ interface type-parity assertions

## T-01: Add the type-only parity assertion module

Create `tests/config/schema-type-parity.test-d.ts` containing **only** `import` / `import type` /
`type` declarations (no runtime statement, no `const`). Every assertion alias name MUST start with
`_` (lint exempts `^_`). The content below is the verified module — reproduce it as-is.

- [x] Create `tests/config/schema-type-parity.test-d.ts` with:
  - `import { configSchema } from "../../src/config/schema.js";`
  - `import type { SpecRunnerConfig, StepExecutionConfig, AgentRecord, ModelEntry, EnvironmentConfig, SpecReviewConfig, PipelineConfig, ProgressConfig, VerificationConfig, VerificationCommand, LogsConfig, ArchiveConfig, GitHubHostConfig } from "../../src/config/schema.js";`
  - `import type { infer as ZodInfer } from "zod/v4-mini";`
  - The `Equal` / `Expect` helpers and `type I = ZodInfer<typeof configSchema>;`
- [x] Top-level whole-object equality with the three representationally-divergent fields separated
      (`steps`, `agents` removed from `I`; `steps`, `agents`, `specFixer` removed from `SpecRunnerConfig`):
  ```ts
  type _Top = Expect<
    Equal<Omit<I, "steps" | "agents">, Omit<SpecRunnerConfig, "steps" | "agents" | "specFixer">>
  >;
  ```
  Add a comment recording why each field is separated (byRequestType recursion / schema-level
  `| null` / interface-only `Record<string, never>` placeholder).
- [x] `steps` entry-level assertions (`byRequestType` excluded both sides, per design D3):
  ```ts
  type InfStepEntry = NonNullable<NonNullable<I["steps"]>[string]>;
  type _StepEntry = Expect<
    Equal<Omit<InfStepEntry, "byRequestType">, Omit<StepExecutionConfig, "byRequestType">>
  >;
  type InfByRtEntry = NonNullable<NonNullable<InfStepEntry["byRequestType"]>[string]>;
  type _ByRtEntry = Expect<Equal<InfByRtEntry, Omit<StepExecutionConfig, "byRequestType">>>;
  ```
- [x] `agents` schema-derived shape assertion:
  ```ts
  type _AgentRecord = Expect<Equal<NonNullable<NonNullable<I["agents"]>[string]>, AgentRecord>>;
  ```
- [x] Remaining sub-interface assertions (diagnostic locality, requirement 3):
  ```ts
  type _Model = Expect<Equal<NonNullable<I["models"]>[string], ModelEntry>>;
  type _Env = Expect<Equal<NonNullable<I["environment"]>, EnvironmentConfig>>;
  type _SpecReview = Expect<Equal<NonNullable<I["specReview"]>, SpecReviewConfig>>;
  type _Pipeline = Expect<Equal<NonNullable<I["pipeline"]>, PipelineConfig>>;
  type _Progress = Expect<Equal<NonNullable<I["progress"]>, ProgressConfig>>;
  type _Verification = Expect<Equal<NonNullable<I["verification"]>, VerificationConfig>>;
  type _VerCmd = Expect<
    Equal<NonNullable<NonNullable<I["verification"]>["commands"]>[number], VerificationCommand>
  >;
  type _Logs = Expect<Equal<NonNullable<I["logs"]>, LogsConfig>>;
  type _Archive = Expect<Equal<NonNullable<I["archive"]>, ArchiveConfig>>;
  type _Github = Expect<Equal<NonNullable<I["github"]>, GitHubHostConfig>>;
  ```
- [x] Do NOT add any runtime value, `export const`, or `export` of a schema sub-`const`. Do NOT add
      a field to `configSchema` or to any interface.

**Acceptance Criteria**:
- `tests/config/schema-type-parity.test-d.ts` exists and contains only type-level declarations.
- `npx tsc --noEmit -p tsconfig.json` exits 0 with the file present (no assertion resolves to `false`).
- Every assertion alias name matches `^_`.
- The module references `z.infer<typeof configSchema>` and `SpecRunnerConfig`, plus dedicated
  assertions for `StepExecutionConfig`, `AgentRecord`, `ModelEntry`, `EnvironmentConfig`,
  `SpecReviewConfig`, `PipelineConfig`, `ProgressConfig`, `VerificationConfig`, `VerificationCommand`,
  `LogsConfig`, `ArchiveConfig`, `GitHubHostConfig`.

## T-02: Remove the superseded partial guard from `schema.ts`

- [x] Delete the `T-05` block in `src/config/schema.ts` (the `_InferredConfig` alias,
      `_SchemaAssertions` type, and the `const _schemaAssert` value — currently lines ~562–589, the
      section under the comment `T-05: compile-time structural assertions`). Remove the now-unused
      `type infer as ZodInfer` import from `zod/v4-mini` **only if** it is no longer referenced
      elsewhere in `schema.ts` (it is the inference helper for that block).
- [x] Make no other edit to `schema.ts` (no schema field change, no interface change).

**Acceptance Criteria**:
- The `_SchemaAssertions` / `_schemaAssert` symbols no longer exist in `src/config/schema.ts`.
- `npx tsc --noEmit -p tsconfig.json` exits 0 after removal.
- No `configSchema` object key and no interface member is added, removed, or changed.

## T-03: Verify acceptance criteria and document the PR verification procedure

- [x] Green baseline: `bun run typecheck`, `bun run test`, and `bun run build` all succeed unchanged.
- [x] Drift-detection (schema side): temporarily add `foo: optional(string())` to `configSchema`,
      run `npx tsc --noEmit`, confirm it FAILS (`_Top` resolves to `false`), then revert. Record the
      exact steps + observed error in the PR description.
- [x] Drift-detection (interface side): temporarily add `foo?: string` to `SpecRunnerConfig`, run
      `npx tsc --noEmit`, confirm it FAILS, then revert. Record in the PR description.
- [x] Dist-invariance: build `dist/` from `main` (baseline) and from this branch; diff the output
      (e.g. `dist/specrunner.js`) and confirm it is byte-identical. Record the command + result in the
      PR description.
- [x] Lint: `bun run lint` passes with `--max-warnings 0` (assertion aliases are `^_`-prefixed).

**Acceptance Criteria**:
- typecheck / test / build / lint are all green on the unchanged branch state.
- A schema-only field addition and an interface-only field addition each make `tsc --noEmit` fail
  (both procedures documented in the PR).
- `dist/` output is identical between `main` and this branch (documented in the PR).
