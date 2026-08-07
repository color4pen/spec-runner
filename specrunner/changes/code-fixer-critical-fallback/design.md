# Design: code-fixer CRITICAL fallback fix

## Context

`src/core/step/code-fixer.ts` builds the user-message for the code-fixer agent through four distinct branches:

| Branch | Location | Current wording |
|--------|----------|-----------------|
| Conformance fix | ~L148 | `Fix all HIGH and CRITICAL severity findings` ✓ |
| Coordinator loop — findings embedded | ~L192 | `Fix all HIGH and CRITICAL severity findings` ✓ |
| **Coordinator loop — fallback (no structured findings)** | **~L219** | **`Fix all HIGH severity findings`** ✗ |
| Standard path — findings embedded | ~L270 | `Fix all HIGH and CRITICAL severity findings` ✓ |
| **Standard path — fallback (no structured findings)** | **~L291** | **`Fix all HIGH severity findings`** ✗ |

The two fallback branches are reached when `collectParallelFixerFindings` returns an empty array (coordinator loop) or `getLatestJudgeFindings` returns null/empty (standard path). In those cases the agent is directed to read the findings from a file path, but the severity instruction omits CRITICAL. CRITICAL > HIGH in the severity hierarchy, so the omission allows the agent to legally ignore CRITICAL findings on those paths.

## Goals / Non-Goals

**Goals**:
- Make the severity instruction identical across all five prompt branches (`Fix all HIGH and CRITICAL severity findings (mandatory)`)
- Lock this contract with a test for every branch so the wording cannot regress independently

**Non-Goals**:
- Deduplicating or restructuring prompt templates across branches (separate effort requiring per-branch contract analysis)
- Touching `spec-fixer` prompt (different severity model, unrelated contract)

## Decisions

### D1 — Text patch only, no structural change

Rationale: the two fallback prompts differ from the findings-embedded prompts only in this one phrase. Changing the wording is atomic and zero-risk. Restructuring the prompts (extracting a shared template, merging branches) requires auditing per-branch behavioural contracts and is explicitly out of scope per the request.

Alternatives considered:
- Extract a shared severity-instruction constant — adds indirection for no runtime benefit; rejected until all five branches share an identical surrounding template.

### D2 — Test all five branches in one describe block

Rationale: a regression in any single branch would break the product invariant. Grouping them in one describe makes the intent ("every branch must include CRITICAL") visible and easy to maintain.

The coordinator-loop fallback path requires a state with:
- `state.reviewers` non-empty (triggers coordinator path)
- `state.steps["custom-reviewers"]` with a `needs-fix` outcome (activates coordinator loop)
- At least one reviewer step with a `needs-fix` outcome (so `getNeedsFixMembers` returns it)
- No structured findings in the reviewer outcome (forces the fallback branch)

The standard-path fallback path is already exercised by the existing `makeStateWithCodeReviewResult` helper (outcome has a `findingsPath` but no inline `findings` array, so `getLatestJudgeFindings` returns null/empty).

## Risks / Trade-offs

- [Risk] Test state construction for the coordinator-loop fallback is complex and tightly coupled to internal state shape. → Mitigation: reuse patterns already established in `executor-no-op.test.ts` which sets up the same coordinator-loop state; keep helpers local to the test describe block.

## Open Questions

None — all decisions are pre-approved by the request.
