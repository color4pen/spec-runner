## MODIFIED Requirements

### Requirement: StepContext is the minimal type for Step method parameters

`src/core/types.ts` SHALL export a `StepContext` interface containing only the fields that Step methods (`buildMessage`, `resultFilePath`, `parseResult`, `run`) actually access:

```ts
export interface StepContext {
  config: SpecRunnerConfig;
  slug: string;
  cwd?: string;
  request: ParsedRequest;
}
```

`PipelineDeps` SHALL extend `StepContext`, adding runtime-specific fields (`client`, `githubClient`, `sleepFn`) that are NOT visible to Step implementations.

`src/core/step/types.ts` SHALL redefine `StepDeps` as an alias for `StepContext` (not `PipelineDeps`):

```ts
export type StepDeps = StepContext;
```

All Step method signatures (`buildMessage(state, deps)`, `resultFilePath(state, deps)`, `parseResult(content, deps)`, `run(state, deps)`) continue to accept `StepDeps` as the second parameter. Because `PipelineDeps extends StepContext`, callers passing `PipelineDeps` remain type-compatible.

Repository origin information (owner/name) is NOT part of `StepContext`. Steps that need repository identity SHALL read it from `state.repository` (the persisted `JobState.repository` field populated at preflight) or invoke `git remote get-url origin` directly from `cwd`. AI prompts SHALL NOT include repository identity as a context variable (the previous `Repository: <owner>/<name>` line in spec-review prompt has been removed; spec-review operates correctly without it).

#### Scenario: StepContext contains only step-relevant fields

- **WHEN** `StepContext` is inspected
- **THEN** it contains exactly: `config`, `slug`, `cwd?`, `request`
- **AND** it does NOT contain `repo`, `client`, `githubClient`, or `sleepFn`

#### Scenario: PipelineDeps extends StepContext

- **WHEN** a `PipelineDeps` value is passed where `StepContext` is expected
- **THEN** TypeScript compilation succeeds (Liskov substitution)
- **AND** `PipelineDeps` retains `client?`, `githubClient`, and `sleepFn?` fields in addition to `StepContext` fields

#### Scenario: StepDeps is aliased to StepContext

- **WHEN** `StepDeps` is resolved by the TypeScript compiler
- **THEN** it resolves to `StepContext` (not `PipelineDeps`)

#### Scenario: ClaudeCodeRunner constructs StepContext without undefined as any

- **GIVEN** `ClaudeCodeRunner.run(ctx)` needs to call `step.buildMessage(state, deps)` and `step.resultFilePath(state, deps)`
- **WHEN** the deps parameter is constructed
- **THEN** the deps object contains only `StepContext` fields (`config`, `slug`, `cwd`, `request`)
- **AND** `grep -r "undefined as any" src/` returns zero matches
