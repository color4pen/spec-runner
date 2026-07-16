# Regression Gate Result — Iteration 1

- **verdict**: approved
- **date**: 2026-07-16
- **branch**: change/test-materialize-boundary-0273f484

## Summary

All 4 findings from the previous review are confirmed fixed. 64 tests across the two relevant test files pass with 0 failures.

## Finding Verification

### [HIGH] AC-3 — commit tree: *.test.ts ≥1, src/*.ts = 0
- **File**: tests/unit/step/test-materialize-boundary.test.ts
- **Status**: ✅ Fixed
- **Evidence**: `TC-F1` test (lines 856–1006) initialises a real git repo, runs `executor.execute(TestMaterializeStep)` with a mock agent that writes only `tests/unit/feature.test.ts`, then asserts `git diff HEAD~1 HEAD --name-only` contains ≥1 `*.test.ts` and 0 `src/*.ts` implementation files. Test passes.

### [LOW] AC-1 — test-case-gen lineage: test-cases.md sha256 non-null hash (LOW, from executor.commit.test.ts)
- **File**: tests/unit/step/test-materialize-boundary.test.ts
- **Status**: ✅ Fixed
- **Evidence**: `TC-A1` test (lines 642–776) uses a custom `RuntimeStrategy.digestArtifacts` that computes real `sha256:` hashes from disk. After `executor.execute(TestCaseGenStep)`, it reads `events.jsonl` via `fold()` and asserts `lineage[0].step === "test-case-gen"` and `lineage[0].outputs` contains `test-cases.md` with `hash` matching `/^sha256:[0-9a-f]{64}$/`. Test passes.

### [HIGH] TC-001 must — test-case-gen lineage sha256 hash lock
- **File**: tests/unit/step/test-materialize-boundary.test.ts
- **Status**: ✅ Fixed
- **Evidence**: Same `TC-A1` test as above satisfies this finding. The test is distinct from the mock-based TC-001 in `executor.commit.test.ts` — it uses the real `digestArtifacts` path and asserts non-null `sha256:<hex>` for `test-cases.md`.

### [LOW] TC-025 (should) — TC ID freeze note in test-case-gen system prompt
- **File**: tests/prompts/test-case-gen-system.test.ts
- **Status**: ✅ Fixed
- **Evidence**: Three assertions in `describe("TC-025: ...")` (lines 206–218) verify the prompt contains:
  - `"frozen scenario IDs"` ✅ (src/prompts/test-case-gen-system.ts L160)
  - `"must NOT renumber or reassign"` ✅ (L161)
  - `"stable grep anchors"` ✅ (L161)

## Test Run

```
bun test tests/unit/step/test-materialize-boundary.test.ts tests/prompts/test-case-gen-system.test.ts

64 pass
0 fail
117 expect() calls
Ran 64 tests across 2 files. [214ms]
```

Typecheck also clean (`tsc --noEmit` exits 0).
