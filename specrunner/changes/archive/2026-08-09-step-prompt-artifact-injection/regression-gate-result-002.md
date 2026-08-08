# Regression Gate Result — Iteration 002

## Summary

All 5 findings from the ledger are confirmed fixed. No regressions detected.

---

## Finding Verification

### [MEDIUM] T-05 claude-code テストパターンに prompt キャプチャが欠落

**Status: FIXED**

`src/adapter/claude-code/__tests__/artifact-bundle-injection.test.ts` defines `makeCaptureQueryFnWithPrompt()` (lines 36–58), a new helper that captures `params.prompt` into `capturedQueries[].prompt`. TC-013 uses this to assert that `<bundled-change-artifacts>` and file content reach the claude-code query prompt. The original `makeCaptureQueryFn` (which only captured `params.options`) is not used for these assertions.

### [LOW] T-04(e) が spec.md の OR 条件を片方しかカバーしない

**Status: FIXED**

`tests/unit/adapter/shared/artifact-bundle.test.ts` TC-005 contains two sub-cases:
- Line 140: change folder does not exist → `""`  (e-1)
- Line 150: change folder exists but no input artifacts are present → `""` (e-2)

TC-009 (lines 225–237) additionally pins the same "zero artifacts" path with its own describe block. Both branches of the OR condition are covered.

### [LOW] T-04 に非 ENOENT の per-file エラーのテストケースがない

**Status: FIXED**

TC-010 (lines 243–276) uses `vi.spyOn(fs, "readFile")` to throw an `EACCES` error for `tasks.md` while `design.md` reads normally via the real implementation. It asserts that `design.md` content appears in the bundle and `tasks.md` is absent — covering non-ENOENT per-file skip per D4.

### [MEDIUM] `statSync` が design D4「stat は使わない」に違反している

**Status: FIXED**

`src/adapter/shared/artifact-bundle.ts` contains no `statSync` call. The only filesystem operation is `fs.readFile(..., "utf-8")` wrapped in try-catch. `Grep` for `statSync` in the file returns no matches.

### [LOW] executeTurn がabort時に `streamedResult` を `.catch()` なしで破棄

**Status: FIXED**

`src/adapter/codex/agent-runner.ts` lines 385–390:
```typescript
const streamedResult = thread.runStreamed(prompt, opts);
if (opts.signal?.aborted) {
  streamedResult.catch(() => {});
  throw opts.signal.reason ?? new Error("The operation was aborted");
}
const { events } = await streamedResult;
```
The `.catch(() => {})` suppressor is present before the early throw.

---

## Evidence

- **checked**: 5 (all ledger findings verified in current code)
- **skipped**: 0
- **unverified**: 0
