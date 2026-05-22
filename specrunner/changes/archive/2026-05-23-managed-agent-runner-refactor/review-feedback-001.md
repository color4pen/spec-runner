# Code Review: managed-agent-runner-refactor — Iteration 1

## Overview

| Item | Result |
|---|---|
| Diff scope | +3086 lines (13 files) |
| `agent-runner.ts` | 633 → 703 lines (+70) |
| `error-helpers.ts` | NEW 89 lines |
| typecheck | ✅ passed |
| test | ✅ 2648/2648 passed |
| must TC coverage | ✅ 48/48 |

---

## Findings

### F-01 — P2: `agent-runner.ts` grew instead of shrinking

**Acceptance criterion**: `agent-runner.ts が縮小している`  
**Actual**: 633 → 703 lines (+70 lines, +11%)

Combined adapter size: 703 + 89 (`error-helpers.ts`) = **792 lines** vs original 633 (+25%).

The diff is +299 / -229 net +70. Primary sources of growth:

1. **Section divider comments** (`// ----------- Stage: Design-style ... -----------` × 4 sections) — ~12 lines added with no content benefit beyond what method grouping already communicates.

2. **`createDesignSession` verbose inline error construction** (L252-259): constructs an `ErrorInfo` object then calls `throwWrappedError`, despite `throwSessionCreateError` being designed exactly for this. See F-02.

3. **`guardCommit` redundant `Object.assign` pattern** (L607-614): creates `errorInfo` identical to `noCommitErr`'s fields, then `Object.assign(noCommitErr, errorInfo)`. The intermediate variable is a no-op — `throwWrappedError({ code: noCommitErr.code, message: noCommitErr.message, hint: noCommitErr.hint }, state)` is equivalent and shorter.

4. **`fetchResultFile` same `Object.assign` pattern** (L641-644): same verbosity issue.

5. **Method-level JSDoc** repeated TC references that already exist in the class-level header — e.g., `TC-020: ctx.branch is passed as branch hint to streamEvents.` inside `streamWithPollingFallback` (L266) when the class header already lists TC-020.

**Suggested fix** (should bring file under ~620 lines):
- Remove or condense the four `// ----` section divider blocks — the method grouping is already visually clear from existing line breaks.
- `guardCommit`: replace `const errorInfo: ErrorInfo = {...}; throwWrappedError(Object.assign(...), state)` with a direct `throwWrappedError({ code: noCommitErr.code, message: noCommitErr.message, hint: noCommitErr.hint }, state)`.
- `fetchResultFile`: same simplification.
- Remove duplicated TC reference comments in individual stage methods (keep them only in the class header).

---

### F-02 — P3: `createDesignSession` does not use `throwSessionCreateError`

Design D3 states `throwSessionCreateError` covers **5 places**; the implementation covers only 4 (all polling-side). `createDesignSession` (L252-259) inlines the identical `SESSION_CREATE_FAILED` pattern:

```typescript
const errorInfo: ErrorInfo = {
  code: "SESSION_CREATE_FAILED",
  message: `Failed to create session: ${errMsg}`,
  hint: "Check your API key and try again.",
};
throwWrappedError(errorInfo, state);
```

The implementation note acknowledges this: *"Design-style error message preserved verbatim: 'Failed to create session: ${errMsg}'"*. The behavior is correct and the comment is honest. This is a deliberate trade-off to preserve the original message (no stepName prefix, unlike the polling path).

The design note for T-03-A says *"stepName を空にするか、元の message をそのまま使う"* — "use original message" is a valid option. If the goal is fully consolidating the pattern, passing `""` as stepName would produce `"Failed to create  session: ..."` (double space — not clean). The only clean path would be extending `throwSessionCreateError` to accept a raw `message` override.

**Suggested fix**: Either document explicitly in `error-helpers.ts` that design-side uses inline (current approach, needs no code change), or extract a `throwDesignSessionCreateError(errMsg, state)` that hardcodes the original message string. Not blocking, but completing the consolidation would remove the remaining inline `ErrorInfo` in the class.

---

### F-03 — Info: New test files contrary to T-05

T-05 specifies *"新規テストは追加しない（構造リファクタで振る舞い不変のため、既存テストがそのまま regression guard になる）"*, yet two new test files were added:

- `tests/adapter/managed-agent/agent-runner.test.ts` (890 lines)
- `tests/adapter/managed-agent/error-helpers.test.ts` (215 lines)

These clearly originate from the `test-case-gen` step executing against `test-cases.md`. All tests pass; the coverage adds value for private stage methods that had no prior unit tests. The discrepancy is a workflow-level inconsistency (T-05 was written before test-case-gen generated the spec), not an implementation defect.

No code change required.

---

## Positive observations

- All regression risks from request.md verified preserved:
  - **Timeout two-stage logic**: `resolveEffectiveTimeout` exactly replicates `timeoutMs > 0 ? timeoutMs : DEFAULT_POLL_TIMEOUT_MS` ✅
  - **Resume fallback 3-stage error handling**: warn → fallback create → fallback send, with correct `"fallback after resume failure"` / `"fallback"` context strings ✅
  - **`sseEndTurn = !needsPollingFallback` follow-up condition**: preserved as caller-side guard in orchestrator ✅
  - **verifyBranch selective catch**: warn for generic, rethrow for GITHUB_TOKEN_EXPIRED ✅
  - **verifyChangeFolder selective catch**: rethrow for CHANGE_FOLDER_NOT_FOUND / GITHUB_TOKEN_EXPIRED, warn for others ✅
  - **`void completedAt`**: present at L410 ✅
- `runDesignStyle` / `runPollingStyle` names and `(ctx: AgentRunContext): Promise<AgentRunResult>` signatures unchanged ✅
- `error-helpers.ts` correctly delegates all throws to `throwWrappedError` / `sessionTerminatedError`; no reimplementation ✅
- `createManagedAgentRunner` / `ManagedAgentRunnerDeps` / `buildManagedGitPushInstruction` untouched ✅
- `executor-helpers.ts` untouched ✅
- Stage extraction structurally complete: design (3 stages) and polling (4 stages) extracted without cross-style unification ✅

---

## Verdict

- **verdict**: needs-fix

**Required fixes before approval**:
1. **F-01**: Reduce `agent-runner.ts` line count so the file is smaller than the original 633 lines. Target: remove section dividers, simplify `guardCommit`/`fetchResultFile` `Object.assign` patterns, and prune duplicated TC reference comments from individual method JSDocs. ~80-line reduction should be achievable without touching any logic.

**Optional (non-blocking)**:
2. **F-02**: Decide whether to complete `throwSessionCreateError` consolidation for the design-side case or leave as-is with a comment. Current inline approach is correct; the only issue is incomplete consolidation.
