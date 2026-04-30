# ADR-20260430: Review-side exit contract: agent-driven push (deviation from openspec-workflow's orchestrator-driven commit)

**Status**: Accepted
**Date**: 2026-04-30
**Deciders**: SpecRunner pipeline team
**Related**: dogfooding-001 RCA, proposal.md review-exit-contract

---

## Context

### Reference implementation: openspec-workflow (claude-code, local execution)

openspec-workflow is the design reference for SpecRunner's pipeline. It operates under **claude-code (local execution)** semantics: the orchestrator and each agent share the same filesystem. In this model, review-side agents (spec-review, code-review) are deliberately **read-only** — they write results to local files and the orchestrator collects and commits them in a separate step. This is why openspec-workflow comments spec-review and code-review as "read-only reviewers."

### SpecRunner: Anthropic Managed Agents (remote workspace)

SpecRunner uses **Anthropic Managed Agents** running in a remote workspace. The orchestrator (running locally or in CI) **cannot access** the agent's workspace. Files written by an agent into its workspace are invisible to the orchestrator unless they are pushed to the origin branch via `git push`.

### The divergence that caused dogfooding-001 failure

When the spec-review and code-review steps were implemented, the "read-only reviewer" comment from openspec-workflow was copied verbatim, resulting in three layers of inconsistency:

| Layer | spec-review | code-review |
|-------|-------------|-------------|
| capability | missing `gitWrite: true` | missing `gitWrite: true` (had `// No capabilities: gitWrite is intentionally absent`) |
| prompt | no push instruction | "MUST commit and push" (contradicted capability) |
| error hint | `spec-review-result.md` (no suffix) | N/A |
| agent behavior | writes file, calls `end_turn`, no push | intended to push but lacked capability |

The executor then called `getRawFile` with the suffix-based path (`spec-review-result-001.md`) and got a 404, triggering `SPEC_REVIEW_RESULT_NOT_FOUND` and escalation.

---

## Decision

**Review-side agents (spec-review, code-review) SHALL use agent-driven push as the result delivery mechanism, identical to propose / fixer / implementer steps.**

Concretely:

1. Both steps declare `capabilities: { gitWrite: true }`.
2. The initial user message for both steps embeds `buildGitPushInstruction(branch)` — the same helper used by propose, spec-fixer, code-fixer, and implementer.
3. The error hint factories (`specReviewResultNotFoundError`, `codeReviewResultNotFoundError`) accept `iteration` as a required argument and compute the 3-digit zero-padded suffix dynamically.
4. Result filenames follow `{step-prefix}-{NNN}.md` convention: `spec-review-result-{NNN}.md` and `review-feedback-{NNN}.md`.
5. Capability comments explicitly state: "review-feedback / spec-review-result file is committed and pushed by the agent. Source code remains read-only (enforced by prompt)."

---

## Consequences

### Positive

- Removes the 3-layer divergence that caused dogfooding-001 escalation.
- All pipeline steps now share a uniform exit contract: write → commit → push → end_turn.
- Error hint messages reference the correct file name at the correct iteration, making debugging actionable.
- The ADR makes the deviation from openspec-workflow explicit and documented, preventing future copy-paste regressions.

### Negative / Trade-offs

- Review agents have `gitWrite: true`, meaning they are technically capable of modifying source code. Mitigation: prompt explicitly instructs "Do NOT modify any source files other than the result file." This is a convention-based (not technical) guard.
- The deviation from openspec-workflow's read-only reviewer model is now permanent for Managed Agents deployments, until a different delivery mechanism is adopted.

### Future alternatives (not selected, but preserved for future consideration)

- **Custom tool returns content**: The review agent could return the result file content via a custom tool call, and the executor commits it locally. This avoids `gitWrite` on the agent but requires new tool design and binary content handling. Deferred as a future refactor option.
- **Local relay**: A relay service bridges orchestrator ↔ agent workspace via a shared store (e.g., S3, database). This is a larger infrastructure change and is out of scope for SpecRunner's current architecture.
- **Orchestrator commit (openspec-workflow model)**: Restore parity with openspec-workflow by using shared filesystem. Requires migrating off Managed Agents entirely. Not planned.

---

## References

- [proposal.md](../../../openspec/changes/review-exit-contract/proposal.md)
- [design.md](../../../openspec/changes/review-exit-contract/design.md)
- `src/core/step/spec-review.ts` — `capabilities: { gitWrite: true }`
- `src/core/step/code-review.ts` — `capabilities: { gitWrite: true }`
- `src/errors.ts` — `specReviewResultNotFoundError(slug, branch, iteration)`, `codeReviewResultNotFoundError(slug, branch, iteration)`
- `src/prompts/git-push-instruction.ts` — `buildGitPushInstruction(branch)` shared helper
