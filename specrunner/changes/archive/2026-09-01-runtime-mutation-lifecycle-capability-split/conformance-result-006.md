# Conformance Result — runtime-mutation-lifecycle-capability-split — iter 6

## Summary

All normative items from `request.md` (Acceptance Criteria) and `spec.md` (SHALL/MUST Requirements + Scenarios) are satisfied. Verification is green (build, typecheck, test, lint). No findings.

---

## AC-by-AC Evidence

### AC 1: 対象 consumer が mutation / lifecycle 用に full `RuntimeStrategy` を要求しない

**PASS.**

- `src/core/step/executor.ts`: all mutation calls route through `deps.stepArtifact` (`captureHeadSha`, `prepareStepArtifacts`, `finalizeStepArtifacts`, `digestArtifacts`), `deps.stepIo` (`validateStepInputs`, `validateStepOutputs`), `deps.changedFiles` (`listChangedFiles`, `canDeriveChangedFiles`). No `deps.runtimeStrategy` call for mutations.
- `src/core/pipeline/pipeline.ts` lines 399 and 623: `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)` — no `deps.runtimeStrategy`.
- `src/core/pipeline/parallel-review-round.ts`: all coordinator git-effect calls use `deps.roundGitEffects` (`captureHeadSha`, `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts`, `listChangedFiles`).
- `src/core/command/runner.ts` gate-halt: `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, haltState)` — no `deps.runtimeStrategy`.
- `src/core/step/commit-orchestrator.ts`: uses `deps.stepArtifact?.digestArtifacts(...)` and `deps.revisionContent` directly.
- `src/core/step/step-completion.ts`: uses `deps.stepIo?.verifyFindingRefs(...)`.
- `grep` for `deps.runtimeStrategy` in `src/`: only one match is a comment (`executor-oid-capture.test.ts` comment text), not a production call.

---

### AC 2: `PipelineDeps` が full runtime facade を mutation consumer 向け service locator として保持しない

**PASS.**

`src/core/types.ts`: `PipelineDeps` no longer has `runtimeStrategy?: RuntimeStrategy`. The `import type { RuntimeStrategy }` is removed. The type now declares:
- `stepArtifact?: StepArtifactLifecycleCapability`
- `stepIo?: StepIoValidationCapability`
- `terminalState?: TerminalStateCapability`
- `roundGitEffects?: RoundGitEffectsCapability`
- `changedFiles?: ChangedFilesCapability`
- `commitInspection?: CommitInspectionCapability`
- `revisionContent?: RevisionContentCapability`

---

### AC 3: capability が use-case-specific な最小契約であり、新しい mega-interface を作っていない

**PASS.**

Four separate capability interfaces, each focused on one consumer use case:

| Interface | Methods | Consumer |
|---|---|---|
| `StepArtifactLifecycleCapability` | 5 (incl. 1 optional) | `StepExecutor`, `CommitOrchestrator` |
| `StepIoValidationCapability` | 3 | `StepExecutor`, `step-completion` |
| `TerminalStateCapability` | 1 | `Pipeline`, `CommandRunner` gate-halt |
| `RoundGitEffectsCapability` | 5 | `ParallelReviewRound` |

No mega-interface aggregating all methods. No `MutationRuntimeStrategy` combining all of them. No `Pick<RuntimeStrategy, ...>` patterns.

---

### AC 4: capability method は required で、能力不在は注入値で表現される

**PASS.**

`src/core/step/step-capability.ts` and `src/core/pipeline/pipeline-capability.ts`: all methods are required (no `?` modifier), except for `snapshotMainCheckoutGuard?` which is the explicit single exception documented in spec.md:

> **Exception**: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` SHALL be the sole optional method.

Consumers check field presence (`deps.stepArtifact ?` / `deps.terminalState?.`) not method presence. This is per D6.

---

### AC 5: `buildDeps` / `finalizeStepArtifacts` / `commitFinalState` / `commitRoundArtifacts` の対象 payload signature に domain object を表す `unknown` が残らない

**PASS.**

- `buildDeps`: `RuntimeStrategy.buildDeps(...)` now returns `PipelineDeps` (typed). No `unknown` return.
- `finalizeStepArtifacts`: removed from `RuntimeStrategy` interface. Capability version in `StepArtifactLifecycleCapability` has fully typed signature: `(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra): Promise<void>`.
- `commitFinalState`: removed from `RuntimeStrategy` interface. `TerminalStateCapability.commitFinalState(cwd: string, slug: string, state: JobState)` — typed.
- `commitRoundArtifacts`: removed from `RuntimeStrategy` interface. `RoundGitEffectsCapability.commitRoundArtifacts(..., infra: CommitPushInfra, egressParams?: RoundEgressParams)` — typed.

Zero domain-payload `unknown` in the 4 target signatures (3 removed from port, 1 return type fixed).

---

### AC 6: 対象境界の `as PipelineDeps`、`as CommitPushInfra`、egress params 復元 cast が除去される

**PASS.**

- `runner.ts`: `deps = this.runtime.buildDeps(config, request, slug, workspace)` — no `as PipelineDeps` cast (verified by grep: no match in production).
- `local.ts` `commitRoundArtifacts`: signature is `(stagePaths, cwd, branch, coordinatorName, slug, infra: CommitPushInfra, egressParams?: RoundEgressParams)` — no `as CommitPushInfra` cast.
- `local.ts` `commitRoundArtifacts`: calls `commitScopedPaths(stagePaths, ..., infra, egressParams, ...)` — no egress-params restore cast.
- `local.ts` `finalizeStepArtifacts`: `infra: CommitPushInfra` parameter is directly typed — no cast inside the method body.

Note: `as PipelineDeps` casts in test files (building minimal fake objects for structural compatibility) are test-local, not the "target boundary" casts the AC refers to. The production boundaries are clean.

---

### AC 7: 新たな `as unknown as RuntimeStrategy` または同等の forced cast を追加していない

**PASS.**

Baseline: 4 occurrences in `tests/` (e2e test files only, all out-of-scope per tasks.md).

After:
- `tests/pipeline-sole-committer-e2e.test.ts`: 2 occurrences remain (out-of-scope, explicitly excluded by tasks.md §T-13).
- `tests/pipeline-integration.test.ts` and `tests/custom-reviewers-e2e.test.ts`: occurrences were migrated to use capability fields (`stepArtifact as never`, etc.) — monotone decrease.
- `src/` tree: 0 occurrences of `as unknown as RuntimeStrategy`.

No new forced casts introduced. Monotone decrease from 4 → 2.

---

### AC 8: R2a の read-only leaf consumer が full facade 依存へ戻っていない

**PASS.**

- `src/core/step/no-op-detect.ts`: uses `ChangedFilesCapability` parameter (not `RuntimeStrategy`).
- `src/core/step/scope-check.ts`: uses `ChangedFilesCapability` parameter (not `RuntimeStrategy`).
- `src/core/step/commit-orchestrator.ts`: uses `deps.revisionContent` (not `deriveRevisionContentCapability(deps.runtimeStrategy)`). Uses `deps.stepArtifact?.digestArtifacts(...)`.
- `src/core/step/step-completion.ts`: uses `deps.stepIo?.verifyFindingRefs(...)` (not `deps.runtimeStrategy`).
- R2a capabilities (`changedFiles`, `commitInspection`, `revisionContent`) are injected directly into `PipelineDeps` and accessed as `deps.changedFiles`, `deps.commitInspection`, `deps.revisionContent` — not re-derived from a facade at call sites.

---

### AC 9: command lifecycle、step finalize、terminal commit、round-owned git effects の順序と失敗境界が executable test で固定される

**PASS.**

**Step finalize lifecycle** — `tests/unit/step/executor-lifecycle-ordering.test.ts`:
- TC-T15-01: verifies `finalizeStepArtifacts` receives `cwd` and `slug` as string primitives (not a `deps` object). Inspects call args: `typeof calledCwd === "string"`, `typeof calledSlug === "string"`.
- TC-T15-02: verifies `finalizeStepArtifacts` is NOT called when `deps.roundOwnsGitEffects === true`.
- TC-T15-06: verifies `prepareStepArtifacts` is called before `runner.run()` (shared call-order counter).

**Terminal commit** — `tests/core/pipeline/pipeline.test.ts`:
- Tests cover the `awaiting-archive` terminal transition and verify `terminalState.commitFinalState` is called. Existing pipeline tests migrated to use `terminalState` capability field.

**Round git effects** — `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts`, `parallel-review-round-invalidation.test.ts`:
- `commitRoundArtifacts` called only when `toStage` is non-empty; HEAD capture before fan-out; worktree inspection after fan-out.

**Command lifecycle ordering** — existing tests in `tests/core/provider-readiness-gate.test.ts` and `tests/unit/core/command/runner.test.ts` cover provider readiness before workspace setup.

---

### AC 10: Local/Managed capability contract test、または同等の executable proof がある

**PASS.**

- `src/core/runtime/__tests__/local-runtime-capabilities.test.ts`: TC-T14-01 through TC-T14-04 prove that `deriveStepArtifactLifecycleCapability`, `deriveStepIoValidationCapability`, `deriveTerminalStateCapability`, `deriveRoundGitEffectsCapability` return objects satisfying each interface (compile-time + runtime method-presence assertions).

- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts`: TC-T14-M01 through TC-T14-M06 prove managed no-op semantics:
  - `captureHeadSha` returns `null`
  - `prepareStepArtifacts` resolves without side effects
  - `finalizeStepArtifacts` resolves without side effects (no-op)
  - `commitFinalState` resolves without side effects (no-op)
  - `listWorktreeChanges` returns `{ kind: "success", paths: [] }`
  - `commitRoundArtifacts` resolves without side effects (no-op)
  - TC-028: real `ManagedRuntime.buildDeps` verified to inject all 7 capability fields.

---

### AC 11: architecture 文書が実装後の責務と依存方向に一致する

**PASS.**

`architecture/components.md` RuntimeStrategy section updated (R2b paragraph):
- "R2b — mutation/lifecycle consumer も consumer-owned capability に依存する": explicitly lists the 4 new capabilities injected via `PipelineDeps`.
- "PipelineDeps は capability の集合体（service locator ではない）": states `PipelineDeps.runtimeStrategy` is abolished.
- "RuntimeStrategy インターフェース自体が `buildDeps(): PipelineDeps` を宣言する": documents the DSM allowlist exception and the removal of `as PipelineDeps` cast.
- "実装: LocalRuntime / ManagedRuntime は RuntimeStrategy (RealRuntimeStrategy) を implements し": confirms Local/Managed behavioral differences confined to concrete runtime.

The five items required by request.md Requirement 8 are all covered:
- ✅ `RuntimeStrategy` is composition root facade
- ✅ Read-only leaf (R2a) and mutation/lifecycle (R2b) capabilities documented
- ✅ `PipelineDeps` is not a service locator
- ✅ Mutation port accepts domain-neutral input only
- ✅ Local/Managed behavior diff confined to concrete runtime

---

### AC 12: SpecRunner verification が green

**PASS.**

`verification-result.md` (iter 1 — the only verification file present, which post-dates all code-fixer iterations):
- build: passed
- typecheck: passed
- test: passed
- lint: passed
- changed-line-coverage: passed

---

### AC 13: 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない

**PASS.**

`git diff main...HEAD --name-only` shows only:
- `architecture/components.md`
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/` (pipeline artifacts)
- `src/core/` (capability interfaces, runtime implementations, consumers, tests)
- `tests/` (test migrations + new lifecycle ordering tests)

No untracked files outside expected scope. All changed files correspond to the touched-file list and design decisions.

---

## Spec Requirements Coverage

| Requirement (spec.md) | Status | Evidence |
|---|---|---|
| StepArtifactLifecycleCapability typed finalizeStepArtifacts | ✅ PASS | `step-capability.ts` interface; `executor.ts` call; TC-T15-01 |
| StepExecutor skips finalize when stepArtifact absent | ✅ PASS | `executor.ts` line 466: `if (!deps.stepArtifact) return` |
| StepExecutor skips finalize when roundOwnsGitEffects | ✅ PASS | `executor.ts` line 458: `if (!deps.roundOwnsGitEffects)`; TC-T15-02 |
| TerminalStateCapability typed commitFinalState | ✅ PASS | `pipeline-capability.ts`; `pipeline.ts` & `runner.ts` call sites |
| CommandRunner gate-halt uses terminalState | ✅ PASS | `runner.ts` line 322 |
| RoundGitEffectsCapability typed commitRoundArtifacts | ✅ PASS | `pipeline-capability.ts`; `parallel-review-round.ts` call |
| buildDeps returns typed PipelineDeps | ✅ PASS | `runtime-strategy.ts` interface; `runner.ts` no cast |
| PipelineDeps no full RuntimeStrategy field | ✅ PASS | `types.ts` |
| PipelineDeps capability fields are narrow (test fake) | ✅ PASS | `local-runtime-capabilities.test.ts`; `managed-runtime-capabilities.test.ts` |
| LocalRuntime.buildDeps injects all 7 capabilities | ✅ PASS | `local.ts` `buildDeps` (all 7 fields present) |
| ManagedRuntime preserves no-op semantics | ✅ PASS | `managed.ts`; TC-T14-M contracts |
| Capability methods required; absence via undefined field | ✅ PASS | No `?` on required methods; sole exception `snapshotMainCheckoutGuard?` documented |
| R2a capabilities injected directly (not re-derived from facade) | ✅ PASS | `step-context-builder.ts` uses `deps.commitInspection`; consumers use `deps.changedFiles`/`deps.revisionContent` |
| adr-gen, custom-reviewer, spec-review accept CommitInspectionCapability | ✅ PASS | All three files updated; `step-types.ts` interface updated |
| Command lifecycle ordering preserved | ✅ PASS | `runner.ts` ordering unchanged; provider-readiness-gate tests |
| Step finalize ordering preserved | ✅ PASS | `executor.ts` ordering; TC-T15-06 (`prepareStepArtifacts` before `runner.run()`) |

---

## Plan Divergences (non-normative)

None observed. All design decisions (D1–D6) and tasks (T-01 through T-17) appear completed per the checked checkboxes in tasks.md.

Minor naming note: internal parameter objects in `prior-round-context.ts`, `finding-recency.ts`, `adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` still use the field name `runtimeStrategy` for internal helper parameters — but the type of that field is now `CommitInspectionCapability | undefined` or `RevisionContentCapability | undefined`. This is a naming-only convention in internal functions, not a type-safety issue, and does not violate any normative requirement (the step-level interface in `step-types.ts` correctly uses `commitInspection: CommitInspectionCapability | undefined`).
