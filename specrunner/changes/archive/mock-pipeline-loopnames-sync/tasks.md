# Tasks: mock-pipeline-loopnames-sync

## [x] Task 1: Extract named constants in run.ts

**File**: `src/core/pipeline/run.ts`

Before `createStandardPipeline` function definition, add:

```typescript
/** Loop step names used by the standard pipeline. */
export const STANDARD_LOOP_NAMES: readonly string[] = [
  STEP_NAMES.SPEC_REVIEW,
  STEP_NAMES.VERIFICATION,
  STEP_NAMES.CODE_REVIEW,
];

/** Review → fixer step mapping used by the standard pipeline. */
export const STANDARD_LOOP_FIXER_PAIRS: Readonly<Record<string, string>> = {
  [STEP_NAMES.CODE_REVIEW]: STEP_NAMES.CODE_FIXER,
  [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER,
  [STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER,
  [STEP_NAMES.DELTA_SPEC_VALIDATION]: STEP_NAMES.DELTA_SPEC_FIXER,
};
```

Then update `createStandardPipeline` to use them:

```typescript
// Before (lines 65-71):
loopNames: [STEP_NAMES.SPEC_REVIEW, STEP_NAMES.VERIFICATION, STEP_NAMES.CODE_REVIEW],
loopFixerPairs: {
  [STEP_NAMES.CODE_REVIEW]: STEP_NAMES.CODE_FIXER,
  [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER,
  [STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER,
  [STEP_NAMES.DELTA_SPEC_VALIDATION]: STEP_NAMES.DELTA_SPEC_FIXER,
},

// After:
loopNames: [...STANDARD_LOOP_NAMES],
loopFixerPairs: { ...STANDARD_LOOP_FIXER_PAIRS },
```

**Verification**: `bun run typecheck` passes.

## [x] Task 2: Update buildMockPipeline to import and use constants

**File**: `tests/core/pipeline/pipeline.test.ts`

Add import at the top of the file:

```typescript
import { STANDARD_LOOP_NAMES, STANDARD_LOOP_FIXER_PAIRS } from "../../../src/core/pipeline/run.js";
```

Replace lines 265-266 in `buildMockPipeline`:

```typescript
// Before:
loopNames: ["spec-review", "verification", "code-review", "delta-spec-validation"],
loopFixerPairs: { "delta-spec-validation": "delta-spec-fixer" },

// After:
loopNames: [...STANDARD_LOOP_NAMES],
loopFixerPairs: { ...STANDARD_LOOP_FIXER_PAIRS },
```

**Verification**: `bun run typecheck` passes.

## [x] Task 3: Fix stale TC-063 comment

**File**: `tests/core/pipeline/pipeline.test.ts`

Replace lines 418-421:

```typescript
// Before:
// Note: delta-spec-validation is NOT in loopNames here — only spec-review is the loop.
// This allows spec-review to exhaust normally (SPEC_REVIEW_RETRIES_EXHAUSTED).
// The standard pipeline (createStandardPipeline) includes dsv in loopNames which
// causes dsv to exhaust first when spec-review keeps failing.

// After:
// Note: delta-spec-validation is NOT in loopNames here — only spec-review is the loop.
// This allows spec-review to exhaust normally (SPEC_REVIEW_RETRIES_EXHAUSTED).
// The standard pipeline (createStandardPipeline) does NOT include dsv in loopNames
// (PR #274), so dsv runs as a deterministic non-loop step.
```

## [x] Task 4: Add sanity check test

**File**: `tests/unit/core/pipeline/buildMockPipeline.test.ts` (new)

```typescript
import { describe, it, expect } from "vitest";
import { STANDARD_LOOP_NAMES, STANDARD_LOOP_FIXER_PAIRS } from "../../../../src/core/pipeline/run.js";

describe("STANDARD_LOOP_NAMES", () => {
  it("does not include delta-spec-validation", () => {
    expect(STANDARD_LOOP_NAMES).toEqual(["spec-review", "verification", "code-review"]);
    expect(STANDARD_LOOP_NAMES).not.toContain("delta-spec-validation");
  });
});

describe("STANDARD_LOOP_FIXER_PAIRS", () => {
  it("maps all four review steps to their fixers", () => {
    expect(STANDARD_LOOP_FIXER_PAIRS).toEqual({
      "code-review": "code-fixer",
      "spec-review": "spec-fixer",
      "verification": "build-fixer",
      "delta-spec-validation": "delta-spec-fixer",
    });
  });
});
```

**Verification**: `bun run test -- tests/unit/core/pipeline/buildMockPipeline.test.ts` passes.

## [x] Task 5: Run full test suite

Run `bun run typecheck && bun run test` and confirm all tests pass.

If any existing test fails due to the `loopNames`/`loopFixerPairs` change, diagnose and fix:
- Expected failure mode: a test that assumed dsv is counted as a loop iteration (unlikely based on design review)
- Fix: adjust the test's expected iteration count or verdict to match production behavior

## [x] Task 6: Verify no stale dsv references remain in helper

Run `grep -n "delta-spec-validation" tests/core/pipeline/pipeline.test.ts` and confirm:
- `buildMockPipeline` no longer hardcodes dsv in `loopNames`
- dsv references in step definitions (Map entries) are expected and correct (dsv is still a pipeline step, just not a loop step)
