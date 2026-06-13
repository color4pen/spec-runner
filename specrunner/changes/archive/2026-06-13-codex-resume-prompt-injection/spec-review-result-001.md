# Spec Review Result

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | Test Coverage | `specrunner/changes/codex-resume-prompt-injection/tasks.md:45` | The request requires the no-`resumePrompt` codex prompt to remain unchanged and asks for that behavior to be fixed by tests, but T-03 only asserts that the prompt does not contain `<resume-context>`. That test would still pass if the implementation changed ordering, added extra blank lines, or otherwise modified the main prompt in the unset case. | Update T-03 to capture the exact baseline prompt for the unset case and assert equality against the pre-change construction. For example, use a fixed `baseMessage`, fixed `additionalInstructions` inputs, `session: {}`, and assert `calls[0].prompt` equals `${baseMessage}\n\n${additionalInstructions}` (plus the completion instruction only when the test intentionally enables `reportTool`). Keep the existing negative `<resume-context>` assertion as a secondary check. |

## Notes

- The implementation design is otherwise appropriately scoped to the codex adapter and shared prompt helper.
- No additional security blocker found. The raw `/resume` text is intentionally injected as operator-provided prompt context; upstream authorization and extraction are explicitly out of scope for this change.
