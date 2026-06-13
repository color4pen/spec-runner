# Regression Gate: resume-context-auto-injection

- **iteration**: 1
- **verdict**: approved

## Scope

- Ran `git diff main...HEAD` and reviewed the branch changes.
- Verified the ledger item against `src/core/step/executor.ts` and the resume-context builder path.
- Ran focused regression tests:
  - `bun test src/core/step/__tests__/executor-resume-context.test.ts tests/unit/core/step/executor.test.ts --runInBand`

## Ledger Verification

### [MEDIUM] Unmatched resume snapshots are not consumed and can be injected into a later step

Status: still fixed.

`StepExecutor` now builds the effective resume prompt from `deps.resumeContext` and `deps.resumePrompt`, then clears both resume-related inputs whenever either is present:

- `deps.resumePrompt = undefined`
- `deps.resumeContext = undefined`

This happens even when `buildResumePrompt()` produces no automatic context because the snapshot step does not match the current agent step. Therefore an unmatched resume snapshot is consumed by the first agent step that sees it and cannot survive to inject stale automatic context into a later matching step.

The focused regression test `StepExecutor resume context consumption > consumes unmatched resume context before a later agent step can see it` covers this exact case and passed.

## Findings

No regressions found.
