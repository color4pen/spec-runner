# Review Feedback — managed-agent-runner-refactor (Iteration 2)

## Verdict

- **verdict**: approved

## Summary

All F-01 required fixes from iteration 1 are resolved. The file is now 618 lines (below the original 633), section dividers and `Object.assign` redundancy are removed, all regression-prone areas are preserved exactly, and `bun run typecheck && bun run test` are green (2648/2648).

## Findings

### [info] F-01 resolved: agent-runner.ts now smaller than original

Previous required fix (reduce below 633 lines) is addressed. The new file is 618 lines vs 633 original — section dividers gone, `guardCommit`/`fetchResultFile` `Object.assign` patterns replaced with direct inline literals, duplicated TC references removed from individual method JSDocs. Combined adapter size is 618 + 89 (`error-helpers.ts`) = 707 lines vs 633 original (+12%), which is expected for a vertical extraction refactor.

### [info] F-02 design-side SESSION_CREATE_FAILED: inline approach retained

`createDesignSession` (line 211–218) still constructs `ErrorInfo` inline instead of using `throwSessionCreateError`. This was flagged as non-blocking in iteration 1. The behavior is correct — the design-side message is `"Failed to create session: ${errMsg}"` (no stepName), intentionally different from polling-side. The comment in the method JSDoc explicitly documents this asymmetry. No change required.

### [info] branch: state.branch ?? undefined — type correctness fix

The new code passes `branch: state.branch ?? undefined` to `createSession` in the polling paths (lines 483, 505) where the original passed `branch: state.branch` (`string | null`). The `createSession` input type accepts `branch?: string` (not `string | null`). This is a type correctness improvement, not a behavioral regression — `null` and `undefined` are both absent values for an optional param at runtime in JS.

### [info] void completedAt placement

The original code had `void completedAt; // used in error path above` positioned after all error paths in the success flow. The new code at line 360 places `void completedAt` after `fetchResultFile` in the success path, before `logVerbose`. The variable is still declared (line 342) and referenced (line 360), keeping the lint-suppression intent intact. No behavioral regression.

## Regression-Prone Area Verification

| Area | Status | Evidence |
|---|---|---|
| Timeout fallback two-stage logic | PRESERVED | `resolveEffectiveTimeout` at line 114: `resolved.timeoutMs && resolved.timeoutMs > 0 ? resolved.timeoutMs : DEFAULT_POLL_TIMEOUT_MS` — exact match to original condition |
| Resume fallback double-catch | PRESERVED | `createOrResumePollingSession` lines 467–520: warn → fallback create → `throwSessionCreateError(..., "fallback after resume failure")` → fallback send → `throwSendMessageError(..., "fallback")` — distinct error codes/messages maintained |
| sseEndTurn follow-up condition | PRESERVED | `runDesignStyle` line 172: `if (sseEndTurn && shouldRunFollowUp(...))` — polling-fallback path returns `sseEndTurn: false` from `streamWithPollingFallback`, blocking follow-up; polling path line 352 uses `shouldRunFollowUp` only (no sseEndTurn check) |
| Design verify selective catch | PRESERVED | `verifyDesignArtifacts` lines 296–319: `verifyBranch` warns for all except GITHUB_TOKEN_EXPIRED; `verifyChangeFolderViaPort` rethrows only CHANGE_FOLDER_NOT_FOUND / GITHUB_TOKEN_EXPIRED |
| void completedAt | PRESERVED | Line 360 references `completedAt` declared at line 342 |

## Test Coverage Check

All must-priority TCs from test-cases.md are covered:

- TC-01-01 through TC-01-10 (error-helpers): covered in `tests/adapter/managed-agent/error-helpers.test.ts`
- TC-02-01, TC-02-02, TC-02-06, TC-02-09, TC-02-10 (shared helpers + follow-up conditions): covered in `tests/adapter/managed-agent/agent-runner.test.ts`
- TC-03-01 through TC-03-10, TC-03-12 (design stages): covered
- TC-04-01 through TC-04-17 (polling stages): covered
- TC-05-01 (typecheck): green — `tsc --noEmit` exits 0
- TC-05-02 (test): green — 2648/2648 passed
- TC-05-04, TC-05-05, TC-05-06, TC-05-07 (structural/contract): covered

TC-05-03 (line count reduction): `agent-runner.ts` is 618 lines, down from 633 original and down from the 703 in iteration 1. Meets the acceptance criterion (shrinkage from 633). The aspirational ~350-line goal is not met (this is marked "should" in test-cases.md), but the vertical extraction approach inherently adds method signatures and JSDoc, making sub-400 lines impossible while preserving all behavior.

## Notes

- `throwSendMessageError` message logic correctly differentiates "initial message to" (no context) vs "message to" (with context) via `context ? "message to" : "initial message to"` — matches original verbatim messages at original lines 436 and 471.
- `executor-helpers.ts` is unchanged (verified: `throwWrappedError` / `attachStateAndRethrow` untouched).
- `createManagedAgentRunner`, `ManagedAgentRunnerDeps`, `buildManagedGitPushInstruction` are all unchanged.
- Stage extraction is structurally complete: design (3 stages) and polling (4 stages) extracted without cross-style unification, consistent with Design D1.
