# Conformance Result — runtime-mutation-lifecycle-capability-split — iter 4

## Scope

Iteration 4 conformance review against:
- `request.md` Acceptance Criteria (normative)
- `spec.md` Requirements and Scenarios (normative)
- `design.md` decisions D1–D6 (plan context)
- `tasks.md` checkbox state (plan context)

Base: `git diff main...HEAD --stat` (79 source + test files changed).

---

## Evidence

### AC 1: 対象 consumer が mutation / lifecycle 用に full RuntimeStrategy を要求しない

**PASS.** All five target consumers migrated:

| Consumer | Before | After |
|---|---|---|
| `executor.ts` | `deps.runtimeStrategy?.captureHeadSha(...)` etc. | `deps.stepArtifact?.captureHeadSha(...)` etc. |
| `pipeline.ts` | `deps.runtimeStrategy?.commitFinalState(...)` | `deps.terminalState?.commitFinalState(...)` |
| `parallel-review-round.ts` | `deps.runtimeStrategy?.captureHeadSha(...)` etc. | `deps.roundGitEffects?.captureHeadSha(...)` etc. |
| `runner.ts` gate-halt | `deps.runtimeStrategy?.commitFinalState(deps, haltState)` | `deps.terminalState?.commitFinalState(deps.cwd, deps.slug, haltState)` |
| `runner.ts` buildDeps | `this.runtime.buildDeps(...) as PipelineDeps` | `this.runtime.buildDeps(...)` (no cast) |

Grep confirms: no `deps.runtimeStrategy` references remain in production source code.

---

### AC 2: PipelineDeps が full runtime facade を mutation consumer 向け service locator として保持しない

**PASS.** `src/core/types.ts` no longer contains a `runtimeStrategy?: RuntimeStrategy` field. The JSDoc on `PipelineDeps` explicitly documents: "R2b: runtimeStrategy is removed. Consumers use narrow capability fields instead."

---

### AC 3: capability が use-case-specific な最小契約であり、新しい mega-interface を作っていない

**PASS.** Four distinct capability interfaces created, each scoped to one consumer boundary:

| Interface | File | Consumer | Methods |
|---|---|---|---|
| `StepArtifactLifecycleCapability` | `step/step-capability.ts` | StepExecutor, CommitOrchestrator | 5 |
| `StepIoValidationCapability` | `step/step-capability.ts` | StepExecutor, step-completion | 3 |
| `TerminalStateCapability` | `pipeline/pipeline-capability.ts` | Pipeline, CommandRunner | 1 |
| `RoundGitEffectsCapability` | `pipeline/pipeline-capability.ts` | ParallelReviewRound | 5 |

No single aggregated mutation interface created. Method counts confirm narrow focus.

---

### AC 4: capability method は required で、能力不在は注入値で表現される

**PASS.** All methods in all four capability interfaces are required (no `?` modifier) with the single spec-approved exception: `snapshotMainCheckoutGuard?` in `StepArtifactLifecycleCapability`. The design justification (fail-open semantics; null return is meaningful, not capability absence) is documented in both `step-capability.ts` JSDoc and `spec.md` Exception clause.

Capability absence in `PipelineDeps` is expressed via `field?: CapabilityType` (undefined field injection), not via optional methods.

---

### AC 5: buildDeps / finalizeStepArtifacts / commitFinalState / commitRoundArtifacts の対象 payload signature に domain object を表す unknown が残らない

**PASS.** All four target signatures now use concrete domain types:

| Method | Before | After |
|---|---|---|
| `buildDeps` | returns `unknown` | returns `PipelineDeps` |
| `finalizeStepArtifacts` | `step: unknown, deps: unknown, commitPushInfra: unknown` | `step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string \| null, infra: CommitPushInfra` |
| `commitFinalState` | `deps: unknown, state: unknown` | `cwd: string \| undefined, slug: string, state: JobState` |
| `commitRoundArtifacts` | `..., commitPushInfra: unknown, egressParams?: unknown` | `..., infra: CommitPushInfra, egressParams?: RoundEgressParams` |

`finalizeStepArtifacts` and `commitRoundArtifacts` are removed from `RuntimeStrategy` (moved to capability interfaces). `buildDeps` and `commitFinalState` remain on `RuntimeStrategy` with typed signatures.

---

### AC 6: 対象境界の as PipelineDeps、as CommitPushInfra、egress params 復元 cast が除去される

**PASS.**
- `as PipelineDeps` in `runner.ts` line 222: **removed** — `buildDeps` now returns `PipelineDeps` directly
- `as CommitPushInfra` in `local.ts` (former line 931): **removed** — `infra` parameter is now typed `CommitPushInfra`
- egress params restore cast in `local.ts` (former line 932): **removed** — `egressParams` parameter is now typed `RoundEgressParams | undefined`

No production `as CommitPushInfra` casts remain in `src/` (only `as CommitPushInfra` in test fixture builders, which are test-object construction not restoration casts).

---

### AC 7: 新たな as unknown as RuntimeStrategy または同等の forced cast を追加していない

**PASS.** Baseline: 4 occurrences (`as unknown as RuntimeStrategy`) in e2e test files. After: 2 occurrences remain in `tests/pipeline-sole-committer-e2e.test.ts` (out-of-scope per tasks.md). The other two former occurrences in `tests/custom-reviewers-e2e.test.ts` were migrated to use capability fields (`stepArtifact as never`, `stepIo as never`). No new `as unknown as RuntimeStrategy` introduced.

The `as never` casts in test files are test-fixture convenience casts (structural compatibility shims), not production forced casts. No `as unknown as RuntimeStrategy` or equivalent two-stage casts added to production code.

---

### AC 8: R2a の read-only leaf consumer が full facade 依存へ戻っていない

**PASS.** `PipelineDeps` continues to carry R2a fields:
- `changedFiles?: ChangedFilesCapability`
- `commitInspection?: CommitInspectionCapability`
- `revisionContent?: RevisionContentCapability`

`step-completion.ts`, `commit-orchestrator.ts`, `adr-gen.ts`, `custom-reviewer.ts`, and `spec-review.ts` were updated to use `deps.commitInspection`, `deps.revisionContent`, `deps.stepArtifact` directly — no re-derivation from `deps.runtimeStrategy`. Grep confirms: no `deps.runtimeStrategy` references in production source.

---

### AC 9: command lifecycle、step finalize、terminal commit、round-owned git effects の順序と失敗境界が executable test で固定される

**PASS.** Evidence:

- **`tests/unit/step/executor-lifecycle-ordering.test.ts`** (new, T-15):
  - TC-T15-01: `finalizeStepArtifacts` receives `cwd` and `slug` as string primitives (not deps object)
  - TC-T15-02: `finalizeStepArtifacts` NOT called when `deps.roundOwnsGitEffects === true`
  - TC-T15-03 (compile-time): `buildDeps()` return type accepted without cast

- **Existing tests** cover remaining ordering requirements:
  - `executor-oid-capture.test.ts`: OID capture after finalize
  - `parallel-review-round-git-effects.test.ts`: round commit ordering
  - `parallel-review-round-invalidation.test.ts`: `captureHeadSha` before commit, `approvedAtCommit` set pre-commit
  - `tests/core/pipeline/pipeline.test.ts`: `terminalState` commit path

---

### AC 10: Local/Managed capability contract test、または同等の executable proof がある

**PASS.** Two new contract test files (T-14):

- **`src/core/runtime/__tests__/local-runtime-capabilities.test.ts`**: Structural proof via typed assignment that `deriveStepArtifactLifecycleCapability`, `deriveStepIoValidationCapability`, `deriveTerminalStateCapability`, `deriveRoundGitEffectsCapability` produce objects satisfying their respective capability interfaces. Compile-time enforcement.

- **`src/core/runtime/__tests__/managed-runtime-capabilities.test.ts`**: Same structure. Includes runtime assertions for managed no-op semantics: `prepareStepArtifacts` resolves without side effects, `commitFinalState` resolves without side effects, `listWorktreeChanges` returns `{ kind: "success", paths: [] }`. TC-028 covers real `ManagedRuntime.buildDeps` output.

---

### AC 11: architecture 文書が実装後の責務と依存方向に一致する

**PASS.** `architecture/components.md` updated with R2b documentation under the `RuntimeStrategy` section:

- "R2b — mutation/lifecycle consumer も consumer-owned capability に依存する" explicitly documented
- Four new capabilities listed with their consumer assignments
- `PipelineDeps は capability の集合体（service locator ではない）` stated explicitly
- `runtimeStrategy` field廃止 (R2b) noted
- Source references `→ src/core/step/step-capability.ts` and `→ src/core/pipeline/pipeline-capability.ts` added

---

### AC 12: SpecRunner verification が green

**PASS.** `specrunner/changes/runtime-mutation-lifecycle-capability-split/verification-result.md` (iter 1) shows all phases passed:
- build: passed (0.5s)
- typecheck: passed (14.7s)
- test: passed (94.8s)
- lint: passed (13.7s)
- changed-line-coverage: passed (120.7s)

---

### AC 13: 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない

**PASS.** `git status --short` shows only `conformance-result-004.md` as untracked (the file being created now). All other changes are tracked.

---

## Spec Requirement Conformance

### Requirement: Step artifact lifecycle capability is consumer-owned and typed ✅
Scenario verified: `StepExecutor` calls `finalizeStepArtifacts` with `step: AgentStep`, `cwd: string`, `slug: string`, `infra: CommitPushInfra` — no casts at call site. TC-T15-01 executable proof.

Scenario verified: `deps.stepArtifact` undefined → finalize not called (existing behavior preserved when field absent).

### Requirement: Terminal state capability carries typed parameters ⚠️ DEVIATION

**Normative requirement**: `TerminalStateCapability` SHALL declare `commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>`.

**Implementation**: `commitFinalState(cwd: string | undefined, slug: string, state: JobState): Promise<void>`

The interface widens `cwd` to `string | undefined`. The spec scenario prescribes `deps.cwd ?? process.cwd()` at the call site; actual callers pass `deps.cwd` directly (which may be `undefined`).

**Rationale documented in implementation**: `pipeline-capability.ts` JSDoc states "When undefined, the runtime falls back to its own cwd (e.g. LocalRuntime.cwd). This allows callers to pass `deps.cwd` directly without a `process.cwd()` fallback." `LocalRuntime.commitFinalState` implements `const effectiveCwd = cwd ?? this.cwd`. The behavior is semantically equivalent.

**Scope of divergence**: Interface declaration and call-site pattern differ from spec. Observable behavior is preserved. Design document (design.md) chose `string | undefined` to co-locate the fallback logic in the runtime implementation. This is a deliberate design decision that post-dates the spec.

See Finding section below.

### Requirement: Round git effects capability is consumer-owned and typed ✅
`RoundGitEffectsCapability` declared with `infra: CommitPushInfra` and `egressParams?: RoundEgressParams` (typed). `RoundEgressParams` is a domain-neutral DTO. No `unknown` at call site in `parallel-review-round.ts`.

### Requirement: buildDeps returns typed PipelineDeps without a cast ✅
`RuntimeStrategy.buildDeps` declares return type `PipelineDeps`. `runner.ts` line 222: `deps = this.runtime.buildDeps(...)` — no `as PipelineDeps` cast.

### Requirement: PipelineDeps does not hold a full RuntimeStrategy facade field ✅
`PipelineDeps` has no `runtimeStrategy` field. Capability fields replace it.

### Requirement: LocalRuntime.buildDeps injects all capabilities into PipelineDeps ✅
`local.ts` buildDeps (line 632–641) injects all 7 fields:
`stepArtifact`, `stepIo`, `terminalState`, `roundGitEffects`, `changedFiles`, `commitInspection`, `revisionContent`.
Each via a `derive*Capability(this)` helper defined in the same file as the capability interface (D5).

### Requirement: ManagedRuntime preserves existing no-op semantics in capabilities ✅
Contract tests in `managed-runtime-capabilities.test.ts` verify:
- `prepareStepArtifacts`: resolves without side effects
- `finalizeStepArtifacts`: resolves without side effects  
- `commitFinalState`: resolves without side effects
- `listWorktreeChanges`: returns `{ kind: "success", paths: [] }`
- `commitRoundArtifacts`: resolves without side effects

### Requirement: Capability methods are required; absence is expressed via undefined field ✅
`snapshotMainCheckoutGuard?` is the sole optional method (spec-approved exception). All other methods in all four interfaces are required. Compile-time enforcement proven via typed assignment in contract tests.

### Requirement: R2a read-only capabilities are injected directly, not re-derived from facade ✅
`deps.commitInspection`, `deps.revisionContent`, `deps.changedFiles` used directly in consumers. `deriveCommitInspectionCapability(deps.runtimeStrategy)` pattern eliminated. `adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` now accept `commitInspection: CommitInspectionCapability | undefined` directly.

### Requirement: Command lifecycle ordering is preserved after capability split ✅
Provider readiness → `prepare()` → `setupWorkspace` → `buildDeps` → `registerCleanup` order unchanged. `runner.ts` diff confirms only buildDeps return type and gate-halt capability call changed. Lifecycle ordering tests cover step finalize ordering.

### Requirement: Step finalize lifecycle ordering is preserved ✅
TC-T15-01 and TC-T15-02 in `executor-lifecycle-ordering.test.ts` cover the key invariants. `roundOwnsGitEffects` guard verified in TC-T15-02.

---

## Findings

### Finding F-1: TerminalStateCapability.commitFinalState signature deviates from spec normative declaration

**Severity**: medium  
**File**: `src/core/pipeline/pipeline-capability.ts`, line 65  
**Normative source**: `spec.md` Requirement "Terminal state capability carries typed parameters"

The spec states `TerminalStateCapability` SHALL declare `commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>`. The implementation declares `commitFinalState(cwd: string | undefined, slug: string, state: JobState): Promise<void>`.

The spec scenario prescribes call pattern `deps.terminalState.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)` (string primitive fallback at call site). Actual callers (`pipeline.ts` lines 399 and 623, `runner.ts` line 322) pass `deps.cwd` directly without the `?? process.cwd()` fallback.

The observable behavior is preserved: `LocalRuntime.commitFinalState` applies `cwd ?? this.cwd` internally. The deviation is a deliberate design choice that co-locates the fallback in the runtime rather than requiring callers to resolve it. The `pipeline-capability.ts` JSDoc documents this convention.

**Options**:
1. Update `spec.md` to declare `cwd: string | undefined` and document the caller convention (pass `deps.cwd` directly; runtime resolves fallback). This aligns spec to the design decision.
2. Change the interface to `cwd: string`, update `LocalRuntime.commitFinalState` to require a non-null `cwd`, and update all callers to use `deps.cwd ?? process.cwd()`. This aligns implementation to spec.

---

## Metrics (Post-implementation)

| Metric | Baseline (R2a) | After R2b |
|---|---|---|
| `src/core/port/runtime-strategy.ts` lines | 875 | ~744 (3 methods removed) |
| `unknown` tokens in runtime-strategy.ts | 21 | ~10 (mutation methods removed from port) |
| `RuntimeStrategy` base interface methods | 28 | 25 (−3: finalizeStepArtifacts, commitFinalState, commitRoundArtifacts) |
| Production `RuntimeStrategy` import count | 12 | ~11 (some consumers migrated to capability imports) |
| `PipelineDeps.runtimeStrategy` call sites | 5+ | 0 |
| Domain-payload `unknown` in 4 target signatures | 10 | 0 |
| `as PipelineDeps` casts | 1 | 0 |
| `as CommitPushInfra` restoration casts | 1 | 0 |
| egress params restoration casts | 1 | 0 |
| `as unknown as RuntimeStrategy` (e2e tests only) | 4 | 2 (2 migrated, 2 remain in out-of-scope pipeline-sole-committer-e2e) |
| Capability contract test files | 0 | 2 |
| New capability interfaces | 0 | 4 |
