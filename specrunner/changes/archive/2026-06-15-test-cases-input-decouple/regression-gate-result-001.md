# Regression Gate Result — Iteration 1

- **verdict**: needs-fix

## Findings Status

### [MEDIUM] TC-009 not covered: custom reviewer composition path untested
- **File**: tests/unit/core/command/pipeline-run-input-completeness.test.ts
- **Status**: FIXED ✓
- **Evidence**: Lines 318–400 introduce `describe("TC-009 / T-08-4: ...")` with three test cases:
  1. `prepare()` throws `DescriptorInputCompletenessError` when the composed descriptor has an unsatisfied required read from a custom reviewer step.
  2. `bootstrapJob` is NOT called when the violation gate fires via custom reviewer composition.
  3. `e.violations` includes the custom reviewer step name (`tc009-fake`) and an unsatisfied file path (`design.md` or `tasks.md`).
  
  The test overrides `loadReviewerDefinitions` to return a `fakeReviewerDef`, registers a no-producer base pipeline, and verifies `DescriptorInputCompletenessError` is thrown — exercising the exact composition path described in TC-009.

---

### [LOW] makeCleanDescriptor hardcodes request.md path instead of using requestMdPath()
- **File**: tests/unit/core/command/pipeline-run-input-completeness.test.ts:106
- **Status**: REGRESSION — still present
- **Evidence**: Line 30 imports only `changeFolderPath` from `src/util/paths.js`; `requestMdPath` is not imported. Line 106 still uses the hardcoded template literal:
  ```typescript
  reads: (_state, deps) => [{ path: `specrunner/changes/${deps.slug}/request.md` }],
  ```
  rather than `requestMdPath(deps.slug)`. If the path format returned by `requestMdPath` changes, this test would silently continue to pass while diverging from the real ambient path used in `pipeline-run.ts`.
- **Resolution**: fixable — add `requestMdPath` to the import on line 30 and replace the hardcoded string on line 106 with `requestMdPath(deps.slug)`.

## Required Fix

```diff
-import { changeFolderPath } from "../../../../src/util/paths.js";
+import { changeFolderPath, requestMdPath } from "../../../../src/util/paths.js";
```

```diff
-    reads: (_state, deps) => [{ path: `specrunner/changes/${deps.slug}/request.md` }],
+    reads: (_state, deps) => [{ path: requestMdPath(deps.slug) }],
```
