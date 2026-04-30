# ADR-20260430: Shared Review Verdict Parser

## Status

Accepted

## Context

Both spec-review and code-review steps need to extract a verdict from a file with the format:
```
- **verdict**: approved | needs-fix | escalation
```

The regex was inline in `spec-review.ts` as `parseSpecReviewVerdict`. With code-review being the second consumer, extraction to a shared location was evaluated.

## Decision: D5 — Extract `parseReviewVerdict` to `src/core/parser/review-verdict.ts`

A new pure function `parseReviewVerdict(content: string): Verdict | null` was extracted to `src/core/parser/review-verdict.ts`.

`parseSpecReviewVerdict` in `spec-review.ts` is kept as a 1-line wrapper that delegates to `parseReviewVerdict`, preserving backward compatibility with all call sites.

**Boundary**: only verdict extraction is shared (the line `- **verdict**: <value>`). Full findings table parsing is NOT shared — spec-review and code-review may diverge in what they need from findings.

**Rationale**:
- Rule of three: existing spec-review (1) + new code-review (2) justifies extraction
- Pure function: no I/O, easily unit-tested in isolation
- Wrapper preserves call site compatibility without renaming or breaking changes
- No circular dependencies: `parser/review-verdict.ts` only imports `Verdict` from `state/schema.ts`

## Consequences

- Single regex definition; changes propagate to both spec-review and code-review
- `parseSpecReviewVerdict` wrapper adds one indirection but zero runtime cost
- Any future review consumer (e.g., security-review) can reuse the same parser
- Findings-table parsing remains per-step (YAGNI — not needed now)
