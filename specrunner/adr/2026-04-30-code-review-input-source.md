# ADR-20260430: Code Review Input Source and Output Format

## Status

Accepted

## Context

The code-review step needs to observe the implementation diff to perform a review. Two options were considered:
- **(a) Agent-internal bash**: the agent runs `git diff main...HEAD` internally during its session
- **(b) CLI-side fetch**: the CLI fetches the diff and embeds it in the initial user message

Additionally, the review-feedback output format needed to be decided.

## Decisions

### D1: Review observation via agent-internal `git diff` (Option A)

The code-review agent runs `git diff main...HEAD --stat` and subsequent file reads via bash tools internally. The CLI does not pre-fetch or embed the diff.

**Rationale**:
- Avoids message size blowup from large diffs — agent reads selectively
- `agent_toolset_20260401` includes bash, no extra capability needed
- Symmetric with implementer / build-fixer who also directly observe the worktree
- Mock in tests follows the existing `build-fixer.test.ts` pattern

**Rejected alternative**:
- (b) CLI-side fetch: higher complexity (filter rules, size limits) and message size risk. Deferred for future if selective diff becomes necessary.

### D3: review-feedback format matches spec-review-result format

`review-feedback-NNN.md` uses the same structure as `spec-review-result-NNN.md`:

```markdown
# Code Review Feedback — iteration NNN

- **verdict**: approved | needs-fix | escalation
- **iteration**: NNN

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|

## Summary

<1-3 sentences>
```

**Rationale**:
- Enables `parseReviewVerdict` shared helper (D5) — same regex applies
- Aligns with review-standards.md Findings Format
- Naming: `review-feedback-NNN.md` (3-digit zero-padded), symmetric with `spec-review-result-NNN.md`

## Consequences

- code-review agent requires bash capability to be included in `agent_toolset_20260401`
- Large diffs may require the agent to summarize selectively — mitigated by `--stat` first approach in system prompt
- The shared review-feedback format reduces the need for separate parsers
