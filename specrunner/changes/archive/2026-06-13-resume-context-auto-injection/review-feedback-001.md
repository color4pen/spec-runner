# Code Review Feedback — resume-context-auto-injection — Iteration 1

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|---|---|---|---|---|---|
| 1 | medium | fixable | `src/core/step/executor.ts:299` | `deps.resumeContext` is cleared only when `effectiveResumePrompt` is truthy. When a resume snapshot exists but the first resumed agent step does not match `resumeContext.resumePoint.step`, `buildResumePrompt()` returns `undefined` and the snapshot remains in `PipelineDeps`. If the pipeline later reaches the original `resumePoint.step`, the old automatic context is injected into that later step instead of being one-shot context for the resumed execution. One concrete path is `specrunner resume <slug> --from <different-agent-step>` with no human prompt: `ResumeCommand` still propagates the original snapshot, the first agent step does not consume it, and a later matching step can receive stale automatic context. | Consume the resume snapshot at the first agent step even when it does not produce prompt text, or only propagate a snapshot from `ResumeCommand` when the resolved `startStep` matches the captured `resumePoint.step`. Add a regression test for a mismatched snapshot with no human prompt followed by a matching later step. | yes |

## Test Coverage

The branch covers the must scenarios for plain resume, human-prompt resume, initial non-resume execution, deterministic builder output, and the existing `typecheck && test` verification is recorded as green in `verification-result.md`.

The missing coverage is the negative one-shot case above: a resume snapshot that does not qualify for the first resumed agent step must not survive and inject into a later step.
