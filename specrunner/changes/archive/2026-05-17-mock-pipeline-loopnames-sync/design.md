# Design: mock-pipeline-loopnames-sync

## Problem

`buildMockPipeline` in `tests/core/pipeline/pipeline.test.ts` hardcodes:

```typescript
loopNames: ["spec-review", "verification", "code-review", "delta-spec-validation"],
loopFixerPairs: { "delta-spec-validation": "delta-spec-fixer" },
```

Production (`src/core/pipeline/run.ts`) since PR #274:

```typescript
loopNames: [SPEC_REVIEW, VERIFICATION, CODE_REVIEW],  // dsv excluded
loopFixerPairs: {
  CODE_REVIEW: CODE_FIXER,
  SPEC_REVIEW: SPEC_FIXER,
  VERIFICATION: BUILD_FIXER,
  DELTA_SPEC_VALIDATION: DELTA_SPEC_FIXER,
}
```

Two discrepancies:
1. `loopNames`: helper includes `delta-spec-validation`, production does not
2. `loopFixerPairs`: helper has 1 entry (dsv only), production has 4 entries

## Approach

### Named constants in run.ts

Extract `loopNames` and `loopFixerPairs` from inline values in `createStandardPipeline` into exported named constants:

```typescript
export const STANDARD_LOOP_NAMES: readonly string[] = [
  STEP_NAMES.SPEC_REVIEW,
  STEP_NAMES.VERIFICATION,
  STEP_NAMES.CODE_REVIEW,
];

export const STANDARD_LOOP_FIXER_PAIRS: Readonly<Record<string, string>> = {
  [STEP_NAMES.CODE_REVIEW]: STEP_NAMES.CODE_FIXER,
  [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER,
  [STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER,
  [STEP_NAMES.DELTA_SPEC_VALIDATION]: STEP_NAMES.DELTA_SPEC_FIXER,
};
```

`createStandardPipeline` itself uses these constants (no duplication).

### buildMockPipeline imports the constants

Replace hardcoded values with import of `STANDARD_LOOP_NAMES` and `STANDARD_LOOP_FIXER_PAIRS`. This makes drift structurally impossible — both production and test reference the same object.

### Pipeline type constraint

`Pipeline.loopNames` is `private readonly string[]`. The `STANDARD_LOOP_NAMES` type is `readonly string[]`. The Pipeline constructor param accepts `string[]`, so the import needs a spread or cast: `loopNames: [...STANDARD_LOOP_NAMES]`. Same for `loopFixerPairs`: `{ ...STANDARD_LOOP_FIXER_PAIRS }`.

This means the sanity check test cannot do identity comparison (`===`) on the Pipeline instance fields (they're private and spread). Instead, the sanity check directly asserts the exported constants' values.

### Stale comment fix

TC-063 (line 418-421) comment says "The standard pipeline (createStandardPipeline) includes dsv in loopNames" — this is false post-PR #274. Update to reflect current reality.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Extract constants, not refactor buildMockPipeline signature | Minimal change. Adding `loopNames`/`loopFixerPairs` params to buildMockPipeline is out of scope |
| 2 | `readonly` types on exported constants | Prevent accidental mutation; immutable source of truth |
| 3 | Sanity check tests assert constant values, not Pipeline instance fields | `loopNames`/`loopFixerPairs` are `private` on Pipeline — can't access. Testing the constants themselves is sufficient since `buildMockPipeline` imports them |
| 4 | Spread into Pipeline constructor | `readonly string[]` → `string[]` requires spread. Semantically correct (Pipeline owns its copy) |

## Impact on existing tests

All 7 callers of `buildMockPipeline` (TC-060, TC-061, TC-062, TC-065, TC-066×2, TC-068) will run with the corrected defaults. Key changes:

- `loopNames` loses `delta-spec-validation` → dsv iterations no longer counted as loop iterations
- `loopFixerPairs` gains 3 entries (code-review→code-fixer, spec-review→spec-fixer, verification→build-fixer) → fixer dispatch works for all loop steps, not just dsv

These align with production behavior. Tests that depend on dsv being a loop step would break — but review of each TC shows none rely on that assumption (dsv either runs deterministically via transitions or is tested independently in TC-063/TC-069 which use direct `new Pipeline()` construction).

## Files changed

| File | Change |
|------|--------|
| `src/core/pipeline/run.ts` | Extract `STANDARD_LOOP_NAMES`, `STANDARD_LOOP_FIXER_PAIRS` as exported constants; use them in `createStandardPipeline` |
| `tests/core/pipeline/pipeline.test.ts` | Import constants; replace hardcoded values in `buildMockPipeline`; fix stale TC-063 comment |
| `tests/unit/core/pipeline/buildMockPipeline.test.ts` (new) | Sanity check: assert constant values match expected production config |
