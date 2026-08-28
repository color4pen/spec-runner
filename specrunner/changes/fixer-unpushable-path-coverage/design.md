# Design: fixer-unpushable-path-coverage

## Context

The push-capability 2-layer defense (introduced in #1078) protects against committing to paths
that the current environment's token cannot push (e.g. `.github/workflows/**` for GitHub Actions
installation tokens):

- **Layer 1**: A step declares an `outputContracts` entry of `kind: "unpushable-path"` with
  `policy: "follow-up"`. The runtime's `OutputVerificationPolicy` sends exactly one repair
  prompt to the agent asking it to revert or avoid the conflicting change. The infrastructure
  in `step-context-builder.ts` (L125-160) handles the 1-follow-up invariant for any step that
  declares the contract — no per-step logic is required beyond the declaration.
- **Layer 2**: The backstop in `commit-push.ts → commitScopedPaths` calls
  `collectPublishablePaths` and matches against the patterns before any `git add`. A match
  throws `UNPUSHABLE_PATH_BLOCKED` → executor records `awaiting-resume` halt + escalation
  marker.

As of 2026-08-26 (main):

| Step | notice in prompt | `unpushable-path` contract |
|---|---|---|
| `implementer.ts` | ✓ (L284) | ✓ (L267-276) |
| `request-review.ts` | ✓ (L113) | — (reviewer, read-only) |
| `code-fixer.ts` | ✗ | ✗ |
| `spec-fixer.ts` | ✗ | ✗ |

When `code-fixer` (or `spec-fixer`) touches a workflow file, Layer 1 is silently skipped and
Layer 2 fires immediately — halting the job with no repair opportunity. Run 33017611147 (#1083)
is a concrete example of this failure: a code-review finding directed code-fixer to modify a
workflow file; code-fixer had no notice or contract, committed the file, and hit
`UNPUSHABLE_PATH_BLOCKED`. The implementer in the same run succeeded because it had both layers.

The shared utility file `fixer-helpers.ts` is already imported by both `code-fixer.ts` and
`spec-fixer.ts`, making it the natural extension point for any new fixer-shared logic.

## Goals / Non-Goals

**Goals**:
- `code-fixer` and `spec-fixer` declare the `unpushable-path` output contract so Layer 1 fires
  before Layer 2 when they touch a declared unpushable path.
- `code-fixer` and `spec-fixer` inject the push capability notice in every message variant so
  the agent can avoid unpushable paths pre-emptively.
- Contract-building logic is shared via a single helper added to the existing `fixer-helpers.ts`
  (no new file, no new abstraction layer).
- Layer 2 backstop (`UNPUSHABLE_PATH_BLOCKED`) is preserved as the final defense and is not
  modified.
- All existing `implementer` / `request-review` behaviors remain unchanged.
- typecheck, test, and architecture tests pass.

**Non-Goals**:
- Resolving the GitHub Actions token workflow-push restriction (GitHub platform constraint).
- Completing findings that require editing unpushable paths (operator-apply is the correct path).
- Injecting the notice into reviewer steps (read-only; no writes).
- Modifying `step-context-builder.ts`, `output-verify.ts`, or `commit-push.ts` — the
  infrastructure already supports any step that declares the contract.
  (`executor.ts` is not covered by this non-goal: its output-contract gate was adjusted
  during implementation — see D6, documented retrospectively.)

## Decisions

### D1: Place the shared contract-building helper in `fixer-helpers.ts`, not a new file

**Rationale**: `fixer-helpers.ts` is already the designated shared utility for fixer steps —
imported by both `code-fixer.ts` and `spec-fixer.ts`. Adding `buildUnpushablePathContracts`
here avoids duplication without introducing a new module or abstraction layer. Requirement 3
explicitly names `fixer-helpers` as the permissible extension point.

**Alternatives considered**:
- Duplicate the 6-line contract block inline in each step (same structure as `implementer.ts`).
  Rejected: two separate copies of identical logic diverge over time.
- New shared file (e.g. `push-capability-step-helpers.ts`). Rejected: requirement 3 forbids
  new abstraction layers; `fixer-helpers.ts` is the correct home.

### D2: Import `renderPushCapabilityNotice` directly from `push-capability.ts` in each step

**Rationale**: `renderPushCapabilityNotice` is a general-purpose rendering function, not
fixer-specific. Re-exporting it from `fixer-helpers.ts` would add indirection with no benefit
and deviate from the existing pattern where `implementer.ts` imports it directly. Each step that
needs it imports from the canonical source.

**Alternative considered**: Re-export from `fixer-helpers.ts` for a single import in each step.
Rejected: misleading co-location; the function is domain-neutral.

### D3: Append capability notice to all message variants, including continuation messages

**Rationale**: Each `buildMessage` call is the opening turn of a new or resumed agent session.
The push constraint is environment-level and must be visible on every entry so the agent cannot
proceed without the warning. `implementer.ts` follows this exact pattern (capabilityNotice
appended to both initial and recovery/continuation messages). The capability notice string is
empty when `pushCapability` is null, making the append unconditional and safe.

**Alternative considered**: Inject notice only on first (non-continuation) entry. Rejected:
agent context may not retain the prior warning after a long session or session reattachment.

### D4: Include spec-fixer in the fix despite its restricted write scope

**Rationale**: `spec-fixer.ts` is constrained by system prompt and `writes()` to
`specrunner/changes/<slug>/` — paths that cannot match `.github/workflows/**`. In practice the
`unpushable-path` contract evaluates to no violations for spec-fixer under current patterns.
However: (1) the requirement explicitly includes spec-fixer; (2) uniform coverage is preferable
for correctness; (3) the contract is inexpensive (pure in-memory pattern matching); (4) future
expansions of spec-fixer's write scope would be protected automatically.

**Alternative considered**: Skip spec-fixer since no practical violation can occur. Rejected:
explicit requirement; inconsistent coverage.

### D5: No changes to the escalation path — existing infrastructure is sufficient

When a fixer's follow-up prompt does not resolve the violation:
1. `step-context-builder.ts` limits the unpushable-path follow-up to exactly one attempt
   (attempt ≥ 2: violations filtered out → null prompt → adapter breaks the loop).
2. Layer 2 backstop fires on the subsequent commit attempt → `UNPUSHABLE_PATH_BLOCKED` →
   `awaiting-resume` halt + escalation marker in the issue.

This is the same infrastructure used by `implementer`. No new escalation code is needed; the
fixer steps need only to declare the contract.

### D6: Exclude `unpushable-path` contracts from the executor's output-contract gate (retrospective)

Documented retrospectively per operator decision (issue #1086 escalation, decision 1 =
option 2). The implementation also modified `src/core/step/executor.ts`, which the original
plan did not list as a target.

**Change**: the executor's output contract gate now filters `kind: "unpushable-path"`
contracts out of `buildAllOutputContracts(...)` before validation
(`.filter((c) => c.kind !== "unpushable-path")`), and the gate's dedicated branch that routed
persistent unpushable-path violations to an `awaiting-resume` halt was removed.

**Rationale (correctness improvement)**: the gate runs BEFORE `commitAndPush`'s
`git reset --mixed` normalization. Agent self-commits are still visible in `git rev-list` at
that point, so evaluating unpushable-path contracts in the gate produced false-positive halts
when the agent had self-committed an unpushable path that the follow-up had already resolved.
Layer 2 (`commitAndPush → collectPublishablePaths`) runs AFTER the mixed reset and evaluates
the final publishable state, making it the correct halt point. Layer 1's one-shot follow-up
prompt is unaffected: the adapter's `OutputVerificationPolicy` reads `step.outputContracts`
independently of this gate.

**Observable behavior preserved**: persistent violations still halt with
`UNPUSHABLE_PATH_BLOCKED` → `awaiting-resume` + escalation marker. The halt is raised solely
by Layer 2 (`UnpushablePathBlockedError` from `commit-push.ts`, converted to the
awaiting-resume halt in `executor.ts`'s finalize error handling via `makeUnpushablePathHalt`).

## Risks / Trade-offs

**[Risk] Multiple return paths in `code-fixer.buildMessage` must all be patched**

`code-fixer.ts` has 8 distinct return paths across three routing branches (conformance /
coordinator loop / normal) × two sub-paths each (continuation / initial), plus a coordinator
fallback. Missing a single return site means the capability notice is silently absent for that
variant.

**Mitigation**: Unit tests must cover each routing branch for the notice. The implementer
pattern of computing `capabilityNotice` once at the top of `buildMessage` and appending it at
every return site provides a mechanical checklist (grep for `return ` in `buildMessage`).

**[Risk] New dependency on `port/output-contract.ts` in `fixer-helpers.ts`**

`fixer-helpers.ts` currently imports from `step-names.ts`, `state/schema.js`,
`kernel/report-result.js`, and `pipeline/reviewer-chain.js`. Adding `port/output-contract.js`
is a new intra-core dependency.

**Mitigation**: `output-contract.ts` is a pure port DTO with no reverse dependency on
`fixer-helpers.ts`. No import cycle is possible. `import type` prevents any runtime overhead.

## Open Questions

None. The infrastructure supporting Layer 1 is already complete; this change is a mechanical
extension of contract and notice coverage to two additional steps using one new shared helper
function in an existing file.
