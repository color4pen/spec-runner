# Spec Review Result: spec-review-lightweight-mode (iteration 001)

- **verdict**: approved

## Summary

All artifacts (proposal.md, design.md, tasks.md, specs/spec-review-session/spec.md) are internally consistent, accurately reference the current codebase, and cover the request requirements. The Verify/Simplify/Skip taxonomy in D1 aligns with review-standards.md categories. D2's `getMaxTurns` approach is the minimal viable mechanism for runtime-conditional maxTurns without expanding the step-config resolution chain. The delta spec scenarios are testable and cover the key behavioral boundaries (lightweight vs full, config override priority, undefined fallback).

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | design.md:52 | request.md specifies `getMaxTurns(state, deps)` but design simplifies to `getMaxTurns(state)`. This is a valid design choice since only `state.request.type` is needed, but the deviation from the request is implicit. | Add a one-line rationale in D2 noting the `deps` parameter was dropped because `getSpecReviewMode` only requires `state.request.type`. |
| 2 | LOW | completeness | specs/spec-review-session/spec.md | No scenario for `chore` type maxTurns (only `refactoring` is explicitly tested in the Scenario section). tasks.md 5.3 correctly lists both, but the delta spec only has `refactoring` and `new-feature` scenarios. | Add a `chore` scenario to the delta spec for completeness, or note that `refactoring` scenario covers all lightweight types by proxy. |

## Verification Details

### Codebase cross-reference

| Claim in spec | Actual code | Match |
|---|---|---|
| `buildSpecReviewModeInstruction` at line 115-120 | `spec-review-system.ts:115-120` | Exact match |
| `getSpecReviewMode()` call at line 88 | `spec-review.ts:88` | Exact match |
| `SpecReviewStep.maxTurns = 15` | `spec-review.ts:74` | Exact match |
| refactoring/chore = lightweight | `type-config.ts:38,49` | Exact match |
| `step.maxTurns` read only in ClaudeCodeRunner | `agent-runner.ts:115` (sole usage in src/) | Confirmed |
| ManagedAgentRunner does not use maxTurns | No `maxTurns` reference in managed-agent/agent-runner.ts | Confirmed |
| AgentStep has no `getMaxTurns` yet | `types.ts:42-113` | Confirmed |
| TC-006 tests `SpecReviewStep.maxTurns === 15` | `step-model-maxturn-config.test.ts:80-82` | Exact match |
| Resolution chain: config > defaults > stepDefaults | `step-config.ts:54-84` | Exact match |

### Architecture assessment

- D2 (`getMaxTurns` on AgentStep) is additive and backward-compatible. All existing steps that omit `getMaxTurns` fall through to `step.maxTurns` via `?? step.maxTurns`.
- The resolution priority is correct: `getMaxTurns` feeds into `stepDefaults` (priority 3), so config overrides (priority 1-2) remain authoritative.
- No cross-cutting concerns: only ClaudeCodeRunner reads `step.maxTurns`, and ManagedAgentRunner is unaffected.

### Security assessment

No security implications. Changes are internal to prompt construction and turn-limit configuration. No authentication, input validation, or external API surface changes.
