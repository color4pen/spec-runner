# Conformance Result — runtime-mutation-lifecycle-capability-split — iter 5

## Scope

Iteration 5 conformance review. The human decision from iter 4 escalation (option 2: change
implementation to `cwd: string`) is now applied as the normative target. All findings are
checked against this decision.

Base: `git diff main...HEAD --stat` (117 files changed, 9763 insertions, 718 deletions).
Prior result: iter 4 escalated on `TerminalStateCapability.commitFinalState` cwd type (decision-needed).

---

## Evidence

### AC 1–4, 6–13: Carried from iter 4 (no regressions detected)

All ACs that passed in iter 4 continue to pass in iter 5. The specific areas checked for
regressions:

- `deps.runtimeStrategy` — confirmed absent in production source (grep: no matches in src/)
- `as PipelineDeps` cast in runner.ts — confirmed absent
- `as CommitPushInfra` restoration cast — confirmed absent
- R2a capability fields (`changedFiles`, `commitInspection`, `revisionContent`) — confirmed
  present in `PipelineDeps` and used directly by consumers
- Four capability interfaces (`StepArtifactLifecycleCapability`, `StepIoValidationCapability`,
  `TerminalStateCapability`, `RoundGitEffectsCapability`) — confirmed present and narrowly scoped
- Architecture documentation — confirmed updated per iter 4 evidence

---

### AC 5: commitFinalState signature (TARGET OF DECISION)

**FAIL — two related violations**

#### Violation 1: Interface signature (`pipeline-capability.ts:65`)

The spec normative requirement states:

> `TerminalStateCapability` SHALL declare `commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>`

Current implementation:

```ts
// src/core/pipeline/pipeline-capability.ts:65
commitFinalState(cwd: string | undefined, slug: string, state: JobState): Promise<void>;
```

The `TerminalStateSource` helper interface (line 154) also uses `cwd: string | undefined`.
`LocalRuntime.commitFinalState` (local.ts:790) and `ManagedRuntime.commitFinalState`
(managed.ts:389) both declare `cwd: string | undefined` with an internal `?? this.cwd`
fallback.

The human decision (resume note) selects option (2): change the interface to `cwd: string`,
update all three implementations, and update call sites to `deps.cwd ?? process.cwd()`.

#### Violation 2: Call sites (`pipeline.ts:399`, `pipeline.ts:623`, `runner.ts:322`)

The spec scenario prescribes:
> `deps.terminalState.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)`

Current call sites pass `deps.cwd` directly (no `?? process.cwd()` fallback):

```ts
// pipeline.ts:399
await deps.terminalState?.commitFinalState(deps.cwd, deps.slug, state);
// pipeline.ts:623
await deps.terminalState?.commitFinalState(deps.cwd, deps.slug, state);
// runner.ts:322
await deps.terminalState?.commitFinalState(deps.cwd, deps.slug, haltState);
```

When `deps.cwd` is `undefined` (e.g., `makeMinimalDeps()` which does not set `cwd`), these
calls pass `undefined` to a method that, after the fix, will require `string`.

The resume note also identifies the cross-boundary invariant: the current `LocalRuntime.cwd`
fallback (local.ts:791) differs from the `StepContext` contract which falls back to
`process.cwd()`. The fix must align all consumers.

---

### AC 9: Executable test for omitted-cwd terminal publication (MISSING)

**FAIL — missing test**

The resume note requires: "omitted-cwd の terminal publication テストも追加すること."

Current state: `executor-lifecycle-ordering.test.ts` verifies that `finalizeStepArtifacts`
receives `cwd` as a string primitive (TC-T15-01) and that the gate-halt path calls
`terminalState.commitFinalState`. However, no test explicitly verifies that when `deps.cwd`
is `undefined` (omitted), the call site resolves the fallback to `process.cwd()` before
invoking `commitFinalState`.

`pipeline.test.ts` TC-PUB-001 uses `makeMinimalDeps()` (which does not set `cwd`) and checks
that `commitFinalState` is called once, but does not assert the `cwd` argument value.

After the code-fixer applies the `deps.cwd ?? process.cwd()` pattern, a new test should assert:
- When `deps.cwd` is `undefined`, `commitFinalState` is called with `process.cwd()` as the
  first argument.

---

## Spec Requirement Conformance (delta from iter 4)

### Requirement: Terminal state capability carries typed parameters ❌ (not yet fixed)

**Interface**: `commitFinalState(cwd: string | undefined, ...)` — violates `SHALL declare
commitFinalState(cwd: string, ...)`.

**Scenario — Pipeline calls commitFinalState with extracted primitives**: Call sites pass
`deps.cwd` without `?? process.cwd()` fallback — violates prescribed `deps.cwd ?? process.cwd()`
pattern.

**Scenario — CommandRunner gate-halt uses terminalState capability**: Same violation in
`runner.ts:322`.

All other Requirement scenarios pass (unchanged from iter 4).

---

## Files to fix (code-fixer)

1. `src/core/pipeline/pipeline-capability.ts`
   - Line 65: `cwd: string | undefined` → `cwd: string` in `TerminalStateCapability`
   - Line 154: `cwd: string | undefined` → `cwd: string` in `TerminalStateSource`
   - Remove JSDoc "When undefined, the runtime falls back..." (now incorrect)
   - Add JSDoc: "Callers SHALL resolve the fallback before calling: `deps.cwd ?? process.cwd()`"

2. `src/core/runtime/local.ts`
   - Line 790: `async commitFinalState(cwd: string | undefined, ...)` → `async commitFinalState(cwd: string, ...)`
   - Line 791: Remove `const effectiveCwd = cwd ?? this.cwd;` — use `cwd` directly

3. `src/core/runtime/managed.ts`
   - Line 389: `async commitFinalState(_cwd: string | undefined, ...)` → `async commitFinalState(_cwd: string, ...)`

4. `src/core/pipeline/pipeline.ts`
   - Line 399: `deps.cwd` → `deps.cwd ?? process.cwd()`
   - Line 623: `deps.cwd` → `deps.cwd ?? process.cwd()`

5. `src/core/command/runner.ts`
   - Line 322: `deps.cwd` → `deps.cwd ?? process.cwd()`

6. `src/core/runtime/__tests__/local-runtime-capabilities.test.ts`
   - Line 42: `_cwd: string | undefined` → `_cwd: string` in test source fake

7. `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts`
   - Line 58: `_cwd: string | undefined` → `_cwd: string` in test source fake

8. Add test (in `pipeline.test.ts` or `executor-lifecycle-ordering.test.ts`):
   - Verify that when `deps.cwd` is `undefined`, `commitFinalState` receives `process.cwd()` as
     the first argument.

---

## Summary

All 13 acceptance criteria pass except:
- AC 5 (partially): `commitFinalState` interface and call sites deviate from normative spec
  signature (now a fixable finding per human decision)
- AC 9 (partially): missing executable test for omitted-cwd → `process.cwd()` fallback

Both issues are localized to `pipeline-capability.ts`, `local.ts`, `managed.ts`, `pipeline.ts`,
`runner.ts`, and two test files. No structural or architectural issues remain.
