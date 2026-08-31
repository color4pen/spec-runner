# Regression Gate Result — Iteration 7

**Branch**: refactor/runtime-mutation-lifecycle-capability-split-71d6a83e  
**Date**: 2026-08-31  
**Ledger items checked**: 25

---

## Evidence Summary

| # | Severity | File | Status |
|---|----------|------|--------|
| 1 | MEDIUM | spec.md:108 | ✅ FIXED — exception clause for `snapshotMainCheckoutGuard` added at line 110 |
| 2 | LOW | tasks.md:204 | ✅ FIXED — note added: "only a single `?.` is needed because `verifyFindingRefs` is a required method" |
| 3 | LOW | tasks.md:139 | ✅ FIXED — line 139 now reads "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`" |
| 4 | HIGH | runtime-strategy.ts:394 | ✅ FIXED — `buildDeps` signature now declares `): PipelineDeps;` (line 400); `import type { PipelineDeps }` added at line 36 |
| 5 | HIGH | runner.ts:222 | ✅ FIXED — line 222 is now `deps = this.runtime.buildDeps(config, request, slug, workspace);` with no `as PipelineDeps` cast |
| 6 | MEDIUM | pipeline-capability.ts:92 | ✅ FIXED — `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts` are all required (no `?`); JSDoc confirms D6 compliance |
| 7 | HIGH | runtime-strategy.ts:21 | ✅ FIXED — duplicate of #4; return type is `PipelineDeps` |
| 8 | HIGH | runner.ts:222 | ✅ FIXED — duplicate of #5; no cast |
| 9 | HIGH | local.ts:161 | ✅ FIXED — `_latestBuiltDeps` removed; replaced by `_currentConfig`/`_currentRequest` stable fields; `CommitPushInfra.pushCapability?: PushCapability \| null` added at commit-push.ts:95 |
| 10 | MEDIUM | pipeline-capability.ts:92 | ✅ FIXED — duplicate of #6; methods required |
| 11 | LOW | iteration-display.test.ts:102 | ✅ FIXED — no `runtimeStrategy: undefined` in iteration-display.test.ts, pipeline-one-shot-resume.test.ts, spec-review-fixer-routing.test.ts, or implementer-recovery.test.ts |
| 12 | HIGH | runner.ts:222 | ✅ FIXED — duplicate of #5; no cast |
| 13 | HIGH | runtime-strategy.ts:21 | ✅ FIXED — duplicate of #4; return type is `PipelineDeps` |
| 14 | MEDIUM | executor-lifecycle-ordering.test.ts:260 | ✅ FIXED — TC-T15-05 now calls through the port interface (`fake.buildDeps(...)`) and the assignment `const deps = fake.buildDeps(...)` requires no cast; proves the port interface compiles with the typed return |
| 15 | LOW | iteration-display.test.ts:102 | ✅ FIXED — duplicate of #11 |
| 16 | HIGH | runtime-strategy.ts:388 | ✅ FIXED — `buildDeps` returns `PipelineDeps`; runner.ts cast removed; TC-T15-05 correctly describes behavior |
| 17 | MEDIUM | components.md:175 | ✅ FIXED — line 175 now correctly states "`RuntimeStrategy` インターフェース自体が `buildDeps(): PipelineDeps` を宣言する" and notes `runner.ts` requires no `as PipelineDeps` cast |
| 18 | MEDIUM | executor-lifecycle-ordering.test.ts:267 | ✅ FIXED — TC-T15-05 title now reads "RuntimeStrategy.buildDeps() returns PipelineDeps directly; no cast needed in domain code (DSM §3 via allowlist)"; comment block updated accordingly |
| 19 | MEDIUM | executor-lifecycle-ordering.test.ts:130 | ✅ FIXED — TC-T15-06 added at line 222+; uses `prepareArtifactsSpy = vi.fn()` and a `callOrder` counter to assert `prepareStepArtifacts` is invoked before `runner.run()` |
| 20 | LOW | step-types.ts:63 | ✅ FIXED — no `runtimeStrategy` references found in step-types.ts; `no-op-detect.ts` uses `changedFiles` parameter and comments correctly reference `deps.changedFiles` |
| 21 | LOW | local-runtime-capabilities.test.ts:42 | ✅ FIXED — `makeTerminalStateSource()` now declares `commitFinalState(_cwd: string, _slug: string, _state: JobState)`, matching the interface |
| 22 | LOW | local-runtime-capabilities.test.ts:42 | ✅ FIXED — duplicate of #21; `managed-runtime-capabilities.test.ts` likewise corrected |
| 23 | MEDIUM | pipeline.ts:399 | ✅ FIXED (specific claim) — no empty-string argument is passed; call sites now use `if (deps.cwd)` guard |
| 24 | MEDIUM | local.ts:791 | ✅ FIXED — `commitFinalState` adapter uses its `cwd` parameter (`const effectiveCwd = cwd`), not `this.cwd` |
| 25 | MEDIUM | pipeline.ts:399 | ⚠️ **REGRESSION** — see below |

---

## Regression Detail

### Finding 25: Optional cwd causes terminal publication to be skipped

**File**: `src/core/pipeline/pipeline.ts` (lines 399, 624) and `tests/core/pipeline/pipeline.test.ts:758`  
**Provenance ref**: `eda3048d`

**Evidence**:

`pipeline.ts` line 399:
```ts
if (deps.cwd) {
  await deps.terminalState?.commitFinalState(deps.cwd, deps.slug, state);
}
```

`pipeline.ts` line 624:
```ts
if (state.status === "awaiting-resume" && deps.cwd) {
  await deps.terminalState?.commitFinalState(deps.cwd, deps.slug, state);
}
```

`runner.ts` line 322–323:
```ts
if (deps.cwd) {
  await deps.terminalState?.commitFinalState(deps.cwd, deps.slug, haltState);
}
```

`pipeline-capability.ts` `TerminalStateCapability` interface JSDoc says:
> "@param cwd - Working directory (worktree root). Call sites must supply `deps.cwd ?? process.cwd()` — the interface requires a resolved string."

But none of the call sites supply the `process.cwd()` fallback. When `deps.cwd` is absent, all three call sites skip `commitFinalState` entirely.

`tests/core/pipeline/pipeline.test.ts` line 758 explicitly locks in this skip behavior:
```ts
it("omitted deps.cwd → commitFinalState is NOT called (no process.cwd() fallback in src/)", async () => {
  // ...
  expect(commitFinalStateSpy).toHaveBeenCalledTimes(0);
});
```

The test comment cites "TC-010 / TC-016: CWD allowlist cannot grow without explicit governance approval" as justification, but this contradicts the interface documentation that says call sites must supply the `?? process.cwd()` fallback. The `tasks.md` line 223 also specifies the replacement should be `deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)`, not `if (deps.cwd) { ... }`.

**Impact**: When `deps.cwd` is absent, the canonical terminal state is persisted locally but no remote checkpoint/finalize commit is published, silently breaking attach/resume expectations.

---

## Checked / Skipped / Unverified

- **Checked**: 25 ledger items
- **Skipped**: 0
- **Unverified**: 0
