# Cross-Boundary Invariants Review — observations-channel — iter 1

- **verdict**: approved

## Scope

`git diff main...HEAD --stat`: 30 files, 2670 insertions, 19 deletions.
Core changes: `src/kernel/`, `src/core/port/`, `src/core/step/`, `src/state/`, `src/prompts/`.

## Invariant Check Results

### I-1: verdict derivation reads only `findings` [PASS]

`deriveJudgeVerdict` / `deriveRequestReviewVerdict` / `collectVerdictAffectingFindings` (`src/core/step/judge-verdict.ts`) take `Finding[]` as their sole input. The executor casts `toolResult as JudgeReportResult` and passes `tr.findings ?? []`; `tr.observations` is never accessed. Structural separation is the enforcement mechanism — `observations` is in a different field, not passed to any verdict function.

### I-2: `collectFindingsLedger` reads only `findings` [PASS]

`src/core/pipeline/findings-ledger.ts:38` casts `toolResult` to `{ findings?: Finding[] }`, reads `.findings`, then calls `collectFixableFindings(findings)`. `observations` is outside the cast type and cannot leak into the ledger. The T-06 test (findings-ledger.test.ts:272-327) confirms this with a `toolResult` containing both fields.

### I-3: fixer injection reads only `findings` [PASS]

`getLatestJudgeFindings` (`fixer-helpers.ts:51`) casts `toolResult` to `{ findings?: Finding[] }` and returns `.findings`. `buildFindingsBlock` takes `Finding[]` as input. `observations` is structurally unreachable.

### I-4: `verifyFindingRefs` reads only `findings` [PASS]

`executor.ts:648`: `collectVerdictAffectingFindings(tr.findings ?? [])` — only findings refs are verified for file existence. Observation file paths are not validated, which is correct by design (observations are informational; a non-existent file path in an observation doesn't affect correctness).

### I-5: backward compat — old `toolResult` without `observations` [PASS]

`parseJudgeReportInput` only sets `result.observations` when the `"observations"` key is present in the input and the parse succeeds. Absence → `undefined`. Test coverage: `report-result-observations.test.ts` verifies all three cases (present/valid, present/invalid, absent).

### I-6: `OBSERVATION_DEFINITION` injection coverage [PASS]

All 5 prompts that inject `DECISION_NEEDED_DEFINITION` also inject `OBSERVATION_DEFINITION`: `code-review-system.ts`, `spec-review-system.ts`, `request-review-system.ts`, `custom-reviewer-system.ts`, `regression-gate-system.ts`. `fragment-coverage.test.ts` pins this.

### I-7: `Observation` has no `resolution` field [PASS]

`Observation` interface in `src/kernel/report-result.ts` structurally lacks `resolution`. `observationSchema` in `report-tool.ts` has no `resolution` field. `collectFixableFindings` filters by `f.resolution === "fixable"` — an `Observation` object can never satisfy this filter even if accidentally passed, because TypeScript would reject the assignment and the field is absent at runtime.

### I-8: event journal verbatim round-trip [PASS]

`stepRunToRecord` and `fold()` both pass `toolResult` verbatim via spread (`...(toolResult !== undefined ? { toolResult } : {})`). `observations` round-trips correctly through `events.jsonl` — the JSON is never re-parsed through a narrower schema. The `StepAttemptRecord.outcome.toolResult` type annotation (`BaseReportResult | null`, line 40) does not include `findings?/observations?`, but this is a pre-existing pattern (same for `findings`) and has no runtime effect because the data is stored and restored as raw JSON objects.

## Findings

### [INFO] `StepAttemptRecord.outcome.toolResult` type annotation is not widened

**File**: `src/store/event-journal.ts:40`

`toolResult?: BaseReportResult | null` — not updated to include `findings?/observations?`, the same as the pre-existing situation for `findings`. The `fold()` reconstruction path and `stepRunToRecord()` both handle `toolResult` verbatim, so `observations` persist correctly at runtime. TypeScript accepts the assignment because `BaseReportResult` is assignable to `BaseReportResult & { findings?: Finding[]; observations?: Observation[] }` (all intersection additions are optional).

This is a pre-existing inconsistency, not introduced by this change. No functional impact.

### [INFO] AC2 buildMessage test does not inject observations into state

**File**: `tests/unit/step/fixer-findings.test.ts:400-409`

`makeStateWithObservations()` builds a `JobState` using `makeStepRun({ findings: [...] })`, which does not add `observations` to `toolResult`. The test "code-fixer buildMessage does not embed observation title" therefore trivially passes regardless of the implementation. The actual invariant is correctly covered by the `getLatestJudgeFindings` test at lines 354-391 (inline `toolResult` with both fields). AC2 is satisfied, but the buildMessage-layer test is weaker than its description implies.

## Summary

All cross-boundary invariants are preserved. The `observations` field is structurally separated from `findings` at every consumption point — verdict derivation, ledger, fixer injection, finding-ref verification. No existing consumer needed modification, and no silent reading of `observations` is possible in any of these paths. The two [INFO] findings are non-blocking.
