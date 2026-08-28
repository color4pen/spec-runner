# Regression Gate Result — Iteration 1
# fixer-unpushable-path-coverage

**Date**: 2026-08-28
**Branch**: fix/fixer-unpushable-path-coverage-6e140dad

---

## Verification Method

Ran `git diff main...HEAD --name-only` to enumerate all changed files, then read the
relevant source files and test file to verify each ledger finding against the current code.

---

## Changed Files (source-relevant)

- `src/core/step/fixer-helpers.ts` — added `buildUnpushablePathContracts` helper
- `src/core/step/code-fixer.ts` — added `outputContracts` + `capabilityNotice` injection
- `src/core/step/spec-fixer.ts` — added `outputContracts` + `capabilityNotice` injection
- `src/core/step/executor.ts` — executor gate now filters out `unpushable-path` contracts
- `src/core/step/__tests__/fixer-push-capability.test.ts` — new test file (29 `it()` calls)
- `tests/unit/step/unpushable-path-escalation.test.ts` — TC-014 updated to reflect new gate semantics
- `specrunner/changes/fixer-unpushable-path-coverage/tasks.md` — minimum test count updated to 18
- `specrunner/changes/fixer-unpushable-path-coverage/test-cases.md` — TC-022 / TC-023 added

---

## Finding-by-Finding Verification

### [1] MEDIUM — T-04 acceptance criteria minimum test count (14 vs 16) — `ae205ab6`

**Status: FIXED**

The current `tasks.md` (T-04 Acceptance Criteria) reads:
> "At minimum 18 tests covering: 4 helper tests + 6 code-fixer tests + 8 spec-fixer tests"

The checkbox list counts: 4 helper + 6 code-fixer + 8 spec-fixer = **18**, which matches the
declared minimum. No discrepancy remains. The test file has 29 `it()` calls — above the minimum.

---

### [2] LOW — spec-fixer conformance branch TCs missing — `c8e316a3`

**Status: FIXED**

`test-cases.md` now includes:
- **TC-022**: spec-fixer conformance branch initial entry includes push capability notice
- **TC-023**: spec-fixer conformance branch continuation includes push capability notice

Both are implemented in `fixer-push-capability.test.ts` (lines 725–751) as 4 sub-tests
(initial with/without capability, continuation with/without capability).

---

### [3] MEDIUM — TC-015 unimplemented — `45fe8acf`

**Status: FIXED**

TC-015 is implemented in `fixer-push-capability.test.ts` (lines 563–653) as a `describe` block
with 4 sub-tests:

1. `CodeFixerStep.outputContracts` declares `unpushable-path` contract with `policy: "follow-up"`
2. Layer 1: unpushable-path violation generates a follow-up prompt at attempt 1
3. One-follow-up invariant: at attempt ≥ 2, violations are filtered → null → no second follow-up
4. Layer 2 wiring: null pushCapability returns `[]` (symmetric guard)

The chain from `CodeFixerStep.outputContracts` (contract declaration) through Layer 1 (follow-up
prompt generation) through the one-attempt invariant to Layer 2 (backstop) is tested.

---

### [4] HIGH — Self-commits prevent fixer follow-up from clearing unpushable paths — `ad3aa563`

**Status: FIXED**

`executor.ts` lines 413–424 now filter out `unpushable-path` contracts before passing to
`validateStepOutputs`:

```ts
const allContracts = buildAllOutputContracts(step, state, deps)
  .filter((c) => c.kind !== "unpushable-path");
```

Comment confirms the rationale: self-commits remain visible in `git rev-list` until
`commitAndPush`'s `git reset --mixed` normalization; checking unpushable-path in the executor
gate would produce false-positive halts. Layer 2 (post mixed-reset) is the correct backstop.

Layer 1 follow-up still fires via the adapter's `OutputVerificationPolicy`, which reads
`step.outputContracts` independently of the executor gate.

The old code block that routed `unpushable-path` violations to `awaiting-resume` halt in the
executor gate has been removed (executor.ts diff lines −12 to −30).

---

### [5] HIGH — Self-commit workaround removes code-fixer's Layer 1 repair path — `0f199239`

**Status: FIXED**

`CodeFixerStep.outputContracts` is now declared (code-fixer.ts lines 83–85):

```ts
outputContracts(_state: JobState, deps: StepDeps): OutputContract[] {
  return buildUnpushablePathContracts(deps);
},
```

`SpecFixerStep.outputContracts` is likewise declared (spec-fixer.ts lines 84–86).

Both fixer steps now declare the `unpushable-path` contract so Layer 1 follow-up fires via the
adapter's `OutputVerificationPolicy` when either fixer touches a declared unpushable path.
Uncommitted edits to an unpushable path will receive a follow-up prompt before Layer 2 backstop.

---

## Conclusion

All 5 ledger findings are resolved in the current code. No regressions detected.
