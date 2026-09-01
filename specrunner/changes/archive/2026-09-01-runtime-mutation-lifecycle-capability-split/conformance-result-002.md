# Conformance Result — Iteration 002

**Change**: runtime-mutation-lifecycle-capability-split (R2b)
**Reviewer**: conformance agent (iteration 2)
**Normative sources**: request.md (Acceptance Criteria) + spec.md (Requirements / Scenarios)
**Plan sources**: design.md (D1–D6), tasks.md (T-01 – T-17) — referenced as context, not conformance gates

---

## Summary

All thirteen Acceptance Criteria and all eleven normative Spec Requirements are satisfied. No blocking findings. Evidence collected across key production files, test files, and architecture documentation.

---

## Evidence Matrix — Acceptance Criteria (request.md)

### AC-1: 対象 consumer が mutation / lifecycle 用に full `RuntimeStrategy` を要求しない

**PASS**

Verified no `deps.runtimeStrategy` references in any of:
- `src/core/step/executor.ts` — uses `deps.stepArtifact`, `deps.stepIo`, `deps.changedFiles`
- `src/core/pipeline/pipeline.ts` — uses `deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)` (lines 399, 623)
- `src/core/pipeline/parallel-review-round.ts` — uses `deps.roundGitEffects.*` throughout
- `src/core/command/runner.ts` — uses `deps.terminalState?.commitFinalState(deps.cwd ?? "", deps.slug, haltState)` (line 322)
- `src/core/step/step-completion.ts` — uses `deps.stepIo.verifyFindingRefs(...)`
- `src/core/step/commit-orchestrator.ts` — uses `deps.stepArtifact.digestArtifacts(...)` and `deps.revisionContent`

The only `runtimeStrategy` identifiers remaining in src/ are:
- Field names inside parameter objects (typed as narrow capabilities): `post-fix-context.ts`, `prior-round-context.ts`, `custom-reviewer-round-context.ts`, `no-op-detect.ts`, `finding-recency.ts`, `commit-orchestrator.ts` — all typed as `CommitInspectionCapability | undefined`, `ChangedFilesCapability`, or `RevisionContentCapability`. These are naming artifacts, not structural dependencies on the full `RuntimeStrategy` facade.

### AC-2: `PipelineDeps` が full runtime facade を mutation consumer 向け service locator として保持しない

**PASS**

`src/core/types.ts` confirms: `runtimeStrategy?: RuntimeStrategy` field is removed. The `RuntimeStrategy` import from `./port/runtime-strategy.js` is gone from types.ts. Replaced by 7 typed capability fields:
- `stepArtifact?: StepArtifactLifecycleCapability`
- `stepIo?: StepIoValidationCapability`
- `terminalState?: TerminalStateCapability`
- `roundGitEffects?: RoundGitEffectsCapability`
- `changedFiles?: ChangedFilesCapability` (R2a, retained)
- `commitInspection?: CommitInspectionCapability` (R2a, retained)
- `revisionContent?: RevisionContentCapability` (R2a, retained)

### AC-3: capability が use-case-specific な最小契約であり、新しい mega-interface を作っていない

**PASS**

Four new capability interfaces confirmed — each scoped to a specific consumer:
- `StepArtifactLifecycleCapability` (5 methods — step artifact lifecycle for StepExecutor)
- `StepIoValidationCapability` (3 methods — I/O validation for StepExecutor / step-completion)
- `TerminalStateCapability` (1 method — terminal commit for Pipeline / CommandRunner gate)
- `RoundGitEffectsCapability` (5 methods — coordinator git effects for ParallelReviewRound)

No single `MutationRuntimeStrategy` mega-interface exists. Each capability is defined in the file that owns the use case (`step-capability.ts`, `pipeline-capability.ts`).

### AC-4: capability method は required で、能力不在は注入値で表現される

**PASS**

Confirmed from `step-capability.ts` and `pipeline-capability.ts`:
- All methods in `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability` are required (no `?` modifier)
- `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard?` is the sole optional method — justified by fail-open semantics (null return means guard unavailable, not capability absent)
- Spec Requirement "Capability methods are required; absence is expressed via undefined field" documented this exact exception

Consumer guards use field check: `deps.stepArtifact ? ... : undefined`, not method-presence chains.

### AC-5: 対象 4 signature の domain payload `unknown` ゼロ

**PASS**

All four target signatures verified:

| Signature | Before | After |
|---|---|---|
| `buildDeps()` return type | `unknown` | `PipelineDeps` (typed in RuntimeStrategy interface, line 391–396) |
| `finalizeStepArtifacts()` | `step: unknown, deps: unknown, commitPushInfra: unknown` | Moved to `StepArtifactLifecycleCapability` with fully typed params |
| `commitFinalState()` | `deps: unknown, state: unknown` | `(cwd: string, slug: string, state: JobState)` in `TerminalStateCapability` and `LocalRuntime` |
| `commitRoundArtifacts()` | `commitPushInfra: unknown, egressParams?: unknown` | `(infra: CommitPushInfra, egressParams?: RoundEgressParams)` in `RoundGitEffectsCapability` and `LocalRuntime` |

`finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` removed from `RuntimeStrategy` port interface and `RealRuntimeStrategy` intersection type. No domain-payload `unknown` remains in these target signatures.

### AC-6: 対象境界の `as PipelineDeps`、`as CommitPushInfra`、egress params 復元 cast が除去される

**PASS**

- `as PipelineDeps` cast: removed from `runner.ts` line 222. `deps = this.runtime.buildDeps(...)` now assigns directly to `PipelineDeps` type without cast.
- `as CommitPushInfra` cast: removed from `local.ts`. `infra: CommitPushInfra` is now typed directly in the capability interface signature.
- Egress params restore cast: removed from `local.ts`. `egressParams?: RoundEgressParams` typed directly.

Remaining `as CommitPushInfra` occurrences are in test fixture builders (not production cast patterns).

### AC-7: 新たな `as unknown as RuntimeStrategy` または同等の forced cast を追加していない

**PASS**

Grep of entire codebase for `as unknown as RuntimeStrategy`:
- `tests/pipeline-sole-committer-e2e.test.ts` lines 381, 538 (2 occurrences)
- Count reduced from baseline 4 to 2 (monotone decrease). `custom-reviewers-e2e.test.ts` and `pipeline-integration.test.ts` were updated to use capability fields.
- Zero occurrences in `src/` production files.

### AC-8: R2a の read-only leaf consumer が full facade 依存へ戻っていない

**PASS**

R2a capabilities are injected as explicit `PipelineDeps` fields in both `LocalRuntime.buildDeps` and `ManagedRuntime.buildDeps`:
- `changedFiles: { canDeriveChangedFiles, listChangedFiles }`
- `commitInspection: deriveCommitInspectionCapability(this)`
- `revisionContent: deriveRevisionContentCapability(this)`

`adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` accept `commitInspection: CommitInspectionCapability | undefined` — no longer `runtimeStrategy: RuntimeStrategy | undefined`. No `deriveCommitInspectionCapability(runtimeStrategy)` call at consumer call sites.

### AC-9: command lifecycle、step finalize、terminal commit、round-owned git effects の順序と失敗境界が executable test で固定される

**PASS**

New test file `tests/unit/step/executor-lifecycle-ordering.test.ts`:
- **TC-T15-01**: `finalizeStepArtifacts` called with `cwd: string` and `slug: string` as primitives (not `deps` object). Assertion: `typeof calledCwd === "string"` and value equals tempDir.
- **TC-T15-02**: `finalizeStepArtifacts` NOT called when `deps.roundOwnsGitEffects === true`.

Additional tests covering round git effects ordering in `parallel-review-round-git-effects.test.ts` (updated), terminal state in pipeline tests.

### AC-10: Local/Managed capability contract test、または同等の executable proof がある

**PASS**

- `src/core/runtime/__tests__/local-runtime-capabilities.test.ts`: Compile-time proof via typed assignment + runtime assertions for all 4 capability interfaces. `deriveStepArtifactLifecycleCapability`, `deriveStepIoValidationCapability`, `deriveTerminalStateCapability`, `deriveRoundGitEffectsCapability` each proven to produce typed objects.
- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts`: Same structure plus no-op semantic assertions (e.g. `listWorktreeChanges` returns `{kind:"success", paths:[]}`, `commitFinalState` resolves without side effects). Also includes TC-028: real `ManagedRuntime.buildDeps` exercised with mock HTTP clients to verify all 7 capability fields are non-undefined.

### AC-11: architecture 文書が実装後の責務と依存方向に一致する

**PASS**

`architecture/components.md` updated (lines 170–183) to document:
- `RuntimeStrategy` as "composition root 向け facade" — domain orchestration does not reference it directly
- R2a read-only leaf capabilities listed
- R2b mutation/lifecycle capabilities listed: `StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability`
- `PipelineDeps.runtimeStrategy` documented as "廃止 (R2b)" — not a service locator
- concrete runtimes satisfy capabilities via structural typing; `derive*Capability(this)` helpers bind methods
- Local/Managed behavioral differences confined to concrete runtime/adapter implementations
- Source file cross-references for `step-capability.ts` and `pipeline-capability.ts`

### AC-12: SpecRunner verification が green

**PASS (evidence from PR)**

`verification-result.md` is present in the change folder. Per review instructions, the existing PR evidence is authoritative; test/lint/typecheck are not re-run.

### AC-13: 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない

**PASS**

`git diff main...HEAD --stat` shows 80 changed files, all within the scope of this refactoring (source, test, spec artifacts). No untracked scope-external files observed.

---

## Evidence Matrix — Spec Requirements (spec.md)

### Req: Step artifact lifecycle capability is consumer-owned and typed

**PASS** — `StepArtifactLifecycleCapability` defined in `src/core/step/step-capability.ts` with fully typed `finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra)`. No `unknown` at call site. Scenario "skips finalize when capability absent" — `deps.stepArtifact` checked as field before calling.

### Req: Terminal state capability carries typed parameters

**PASS** — `TerminalStateCapability.commitFinalState(cwd: string, slug: string, state: JobState)` defined in `pipeline-capability.ts`. `pipeline.ts` calls `deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)`. `runner.ts` gate-halt calls `deps.terminalState?.commitFinalState(deps.cwd ?? "", deps.slug, haltState)`. No `PipelineDeps` object forwarded.

### Req: Round git effects capability is consumer-owned and typed

**PASS** — `RoundGitEffectsCapability.commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, slug, infra: CommitPushInfra, egressParams?: RoundEgressParams)` defined in `pipeline-capability.ts`. `parallel-review-round.ts` calls `deps.roundGitEffects?.commitRoundArtifacts(toStage, cwd, branch, coordinatorName, deps.slug, infra, { synthesizedCommits, pushCapability, excludeWorktreePatterns })` with typed `infra`. No `as CommitPushInfra` cast.

### Req: buildDeps returns typed PipelineDeps without a cast

**PASS** — `RuntimeStrategy.buildDeps(config, request, slug, workspace): PipelineDeps` in port interface (line 391–396). `runner.ts` assigns result to `deps: PipelineDeps` without cast.

### Req: PipelineDeps does not hold a full RuntimeStrategy facade field

**PASS** — `PipelineDeps` in `types.ts` has no `runtimeStrategy?: RuntimeStrategy` field. Test fakes can implement only `StepArtifactLifecycleCapability` without providing `bootstrapJob`, `persistJobState`, or `setupWorkspace`.

### Req: LocalRuntime.buildDeps injects all capabilities into PipelineDeps

**PASS** — `local.ts` `buildDeps()` (line 607–645) injects all 7 capability fields: `stepArtifact`, `stepIo`, `terminalState`, `roundGitEffects`, `changedFiles`, `commitInspection`, `revisionContent`. Each derived via the pattern defined in D5.

### Req: ManagedRuntime preserves existing no-op semantics in capabilities

**PASS** — `managed.ts` `buildDeps()` (line 317–348) injects all 7 fields. No-ops confirmed:
- `stepArtifact.prepareStepArtifacts` → no-op
- `stepArtifact.finalizeStepArtifacts` → no-op
- `terminalState.commitFinalState` → no-op
- `roundGitEffects.listWorktreeChanges` → returns `{kind:"success", paths:[]}`
- `roundGitEffects.commitRoundArtifacts` → no-op
Contract tests in `managed-runtime-capabilities.test.ts` verify these semantics.

### Req: Capability methods are required; absence is expressed via undefined field

**PASS** — All capability methods are required (no `?`) in all four interfaces. Exception: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard?` is the sole optional method, justified by fail-open semantics (null return = guard unavailable). Compile-time proof via typed assignment in contract tests.

### Req: R2a read-only capabilities injected directly, not re-derived from facade

**PASS** — `adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` all accept `commitInspection: CommitInspectionCapability | undefined` directly. No `deriveCommitInspectionCapability(runtimeStrategy)` call at consumer sites. `commit-orchestrator.ts` uses `deps.revisionContent` directly.

### Req: Command lifecycle ordering is preserved after capability split

**PASS** — `runner.ts` ordering maintained: `assertProviderReadiness` → `prepare()` → `setupWorkspace` → `buildDeps` → `registerCleanup` → `runPipeline`. `buildDeps` returns typed `PipelineDeps` with all capabilities. Observable lifecycle semantics unchanged.

### Req: Step finalize lifecycle ordering is preserved

**PASS** — `executor.ts` confirms ordering:
1. `deps.stepArtifact?.snapshotMainCheckoutGuard` (line 326)
2. `deps.stepArtifact?.captureHeadSha` (line 334)
3. `deps.stepArtifact?.prepareStepArtifacts` (line 339)
4. Agent run
5. `deps.stepArtifact?.finalizeStepArtifacts` (line 467) — guarded by `!deps.roundOwnsGitEffects` (line 458)
TC-T15-01 and TC-T15-02 enforce these invariants as executable tests.

---

## Plan Divergences (design.md / tasks.md)

No significant plan divergences found. All design decisions (D1–D6) were implemented as specified. The naming artifact of `runtimeStrategy` as a field name in internal parameter objects (post-fix-context.ts, prior-round-context.ts, etc.) is not a plan divergence — the type in all cases is the narrow capability interface.

---

## Metrics (Post-implementation)

| Metric | Baseline (R2a) | After R2b |
|---|---|---|
| `src/core/port/runtime-strategy.ts` lines | 875 | ~880 (grew due to type-only import + doc updates; 3 methods removed, doc added) |
| `unknown` tokens in runtime-strategy.ts (target signatures) | 8 (4 signatures × 2 domain params avg) | 0 |
| `as PipelineDeps` in production | 1 | 0 |
| `as CommitPushInfra` in production | 1 | 0 |
| Egress params restore cast in production | 1 | 0 |
| `as unknown as RuntimeStrategy` (all files) | 4 | 2 (monotone decrease) |
| `PipelineDeps.runtimeStrategy` production references | multiple | 0 |
| Mutation capability full-interface consumers | 5+ | 0 |
| New capabilities introduced | 0 | 4 (StepArtifactLifecycleCapability, StepIoValidationCapability, TerminalStateCapability, RoundGitEffectsCapability) |
| Local/Managed contract test files | 0 | 2 |

---

## Verdict Input

All normative items verified PASS. Zero blocking findings.
