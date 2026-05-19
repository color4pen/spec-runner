# ADR-0005: Spec Authority Lifecycle Unified Prompt Fragment

- **Date**: 2026-05-19
- **Status**: Accepted
- **Issue**: #318

## Context

Three consecutive PRs (#306, #308, #317) produced the same class of defect: agents violated the spec authority lifecycle — the rule that `specrunner/specs/` (authority specs) must never be edited directly; all changes must flow through delta specs and the `mergeSpecsForChange` path invoked at `finish`.

Root cause analysis showed two structural gaps:

1. **Fragment content gap**: `AUTHORITY_SPEC_GUARD` contained only a single MUST NOT sentence ("直接編集してはならない"). Missing were:
   - The classification rules for ADDED / MODIFIED / REMOVED / RENAMED
   - The canonical path for baseline updates (`mergeSpecsForChange` at finish)
   - Writer-side procedure (Read baseline before writing delta)
   - Reviewer-side discipline (never flag "baseline identical to main" as a defect; never request baseline edits)
   - `code-fixer`-specific guard (do not comply with review-feedback that demands direct baseline edits)

2. **Inject gap**: `SPEC_REVIEW` and `CODE_REVIEW` prompts received only `PIPELINE_RULES`, not `AUTHORITY_SPEC_GUARD`. Reviewer agents rendered verdicts without knowing the lifecycle, causing `code-fixer` to act on structurally invalid instructions.

## Decision

### 1. Expand `AUTHORITY_SPEC_GUARD` into a four-section unified fragment

The single MUST NOT line is replaced with a structured fragment covering all roles:

| Section | Target |
|---------|--------|
| MUST NOT (全 agent 共通) | authority spec 直接編集禁止 / PR diff に baseline 編集を含めない / 要求しない |
| 正規経路 | delta spec で表現 / finish 時 mergeSpecsForChange / code-fixer は盲従回避 |
| 書く側の規律 | ADDED/MODIFIED/REMOVED/RENAMED 判断基準 / 先に baseline を Read |
| 見る側の規律 | identical baseline は defect ではない / baseline 編集を要求しない MUST NOT |

A single fragment is used for both writer and reviewer roles. This avoids the management overhead of maintaining two fragments in sync and eliminates the risk of divergence between writer-side and reviewer-side descriptions of the same lifecycle.

### 2. Inject `AUTHORITY_SPEC_GUARD` into reviewer prompts

| Prompt | Before | After |
|--------|--------|-------|
| `IMPLEMENTER` | `[DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]` | unchanged |
| `DESIGN` | `[DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD]` | unchanged |
| `SPEC_FIXER` | `[DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]` | unchanged |
| `CODE_FIXER` | `[DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]` | unchanged |
| `BUILD_FIXER` | `[COMMIT_DISCIPLINE]` | unchanged (spec 触らない) |
| `ADR_GEN` | `[COMMIT_DISCIPLINE]` | unchanged (spec 触らない) |
| `SPEC_REVIEW` | `[PIPELINE_RULES]` | `[PIPELINE_RULES, AUTHORITY_SPEC_GUARD]` |
| `CODE_REVIEW` | `[PIPELINE_RULES]` | `[PIPELINE_RULES, AUTHORITY_SPEC_GUARD]` |

### 3. Structural test guarantee

`fragment-coverage.test.ts` enforces the injection table via `EXPECTED` configuration. The test being green is the structural guarantee that no future prompt edit can silently drop a required fragment.

## Alternatives Considered

### A: Per-prompt injection without fragment expansion

Add the lifecycle rules directly to `spec-review-system.ts` and `code-review-system.ts` as inline prose, without expanding `AUTHORITY_SPEC_GUARD`.

Rejected. Per-prompt prose diverges over time. Writer-side and reviewer-side descriptions of the same lifecycle would need independent maintenance. Past experience (PR #316 patchwork) shows per-prompt fixes do not propagate.

### B: Split into separate `AUTHORITY_SPEC_GUARD_WRITER` and `AUTHORITY_SPEC_GUARD_REVIEWER` fragments

Maintain two fragments: one for implementer/fixer roles, one for review roles.

Rejected. The lifecycle is a single shared model. Splitting it into two fragments introduces the risk that one fragment's definition of "MODIFIED" diverges from the other's. The single-fragment approach makes this impossible.

### C: Move all spec authority rules to base prompt of each agent (remove fragment entirely)

Embed the lifecycle rules in each prompt's base string directly.

Rejected. Injection via `buildSystemPrompt` + `fragment-coverage.test.ts` provides mechanical verification that no prompt is missing the rule. Embedding in base prompts removes this structural guarantee.

### D: Expand fragment and skip `BUILD_FIXER` / `ADR_GEN`

Current decision. `BUILD_FIXER` and `ADR_GEN` do not touch spec files by design; injecting `AUTHORITY_SPEC_GUARD` would add noise without benefit.

## Consequences

- All agents that produce or evaluate spec-touching output now share a single source of truth for the spec authority lifecycle.
- Reviewer agents (`SPEC_REVIEW`, `CODE_REVIEW`) can no longer issue verdicts that are structurally inconsistent with the lifecycle (e.g., "baseline is identical to main → defect").
- `code-fixer` has an explicit guard against complying with review-feedback that demands direct baseline edits.
- `fragment-coverage.test.ts` acts as a regression test: any future prompt that should receive `AUTHORITY_SPEC_GUARD` must be explicitly added to the table.
- Fragment size increases. Accepted tradeoff: unified management outweighs token cost at the per-call level.

## Files Changed

| File | Change |
|------|--------|
| `src/prompts/fragments.ts` | `AUTHORITY_SPEC_GUARD` expanded from 3 lines to 4-section structure |
| `src/prompts/spec-review-system.ts` | `AUTHORITY_SPEC_GUARD` added to fragments array |
| `src/prompts/code-review-system.ts` | `AUTHORITY_SPEC_GUARD` added to fragments array |
| `tests/unit/prompts/fragment-coverage.test.ts` | `SPEC_REVIEW` / `CODE_REVIEW` rows updated in `EXPECTED` |
| `specrunner/changes/spec-authority-lifecycle-unified-prompt/specs/prompt-fragment-registry/spec.md` | Delta spec (MODIFIED: Fragment 集約 export, Inject 漏れの構造的検出) |
