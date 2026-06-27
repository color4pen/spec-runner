# Design: reviewer-activation-fail-closed

## Context

Custom reviewers can declare a `paths` activation condition (e.g. run the `security`
reviewer only when `src/auth/**` changes). The activation gate in
`src/core/step/executor.ts:221-233` evaluates that condition against the list of
files changed since the base branch and skips the reviewer when nothing matches.

The list of changed files is obtained through the runtime seam
`RuntimeStrategy.listChangedFiles(baseBranch, cwd, branch)`:

- **Local runtime** runs `git diff --name-only <base>...HEAD` and returns real paths.
- **Managed runtime** has no local git worktree, so it cannot run `git diff`. Its
  `listChangedFiles` returns `[]` unconditionally (`src/core/runtime/managed.ts:514`),
  and `canDeriveChangedFiles()` returns `false` (`managed.ts:527`).

Because the gate calls `listChangedFiles` directly and never consults
`canDeriveChangedFiles()`, on the managed runtime a `paths`-conditioned reviewer is
evaluated against an empty change set, always reports "no changed files matched
paths", and is **silently skipped**. The recorded `skipReason` says the change did
not match the condition, when in reality the change set could not be derived at all.
A `security` reviewer can disappear without a trace and the PR proceeds as if it had
passed review.

The defect is an **internal inconsistency**. The adjacent scope-check
(`src/core/step/scope-check.ts:49`) faces the identical situation —
`canDeriveChangedFiles() === false` — and handles it **fail-closed**: it short-circuits
before `listChangedFiles` and synthesizes an UNKNOWN decision-needed finding. The
activation gate handles the same situation **fail-open**. Two consumers of the same
seam, in the same file tree, draw opposite conclusions from `[]`.

The contradiction is also written into the code as intent:

- `managed.ts:506-512` documents the `[]` return as
  *"fail-safe: under-activate rather than evaluate against stale or fabricated data."*
- `src/core/port/runtime-strategy.ts:385-387` instructs reviewer-activation consumers
  that they *"MUST NOT reference this predicate — they maintain fail-safe
  (under-activate) via listChangedFiles alone."*

Both statements frame silently dropping a security review as the *safe* outcome,
which contradicts the project's fail-closed escalation invariant and the scope-check
policy. This change reverses that framing.

## Goals / Non-Goals

**Goals**:

- The activation gate consults `canDeriveChangedFiles()` before evaluating a `paths`
  condition. When changed files cannot be derived, a `paths`-conditioned reviewer is
  **not** silently skipped against an empty change set.
- Define and implement a fail-closed behavior for the non-derivable case (see D1).
- `skipReason` for a genuine condition mismatch is no longer overloaded to also mean
  "changed files could not be derived" — the two causes are no longer conflated.
- Reviewers without a `paths` condition (unconditional, or `requestTypes`-only) are
  unaffected.
- Local runtime activation (derivable changed files) does not regress.
- Reframe the managed `listChangedFiles` / port `canDeriveChangedFiles` documentation
  to describe the new fail-closed contract instead of the old "under-activate is
  fail-safe" framing.

**Non-Goals**:

- Implementing real changed-file derivation on the managed runtime (diff without a
  worktree). Out of scope — separate, larger effort.
- Changing scope-check (`scope-check.ts`) — already fail-closed.
- Changing `computeInvalidations` (`reviewer-status.ts`) reviewer-invalidation
  behavior on the managed runtime. Out of scope; preserved unchanged (see D2).
- Other confirmed findings (B-12 grep / doctor / github-client / resume siblings).

## Decisions

### D1: Non-derivable → activate the reviewer (fail-closed by over-activation)

When the runtime cannot derive changed files (`canDeriveChangedFiles() === false`)
and a reviewer declares a `paths` condition, the gate **activates** the reviewer and
runs it. The reviewer reviews the whole change (it does not apply the `paths` filter,
because the inputs to that filter are unavailable). The job is **not** halted.

**Rationale** — "判定できない＝該当しうる" (cannot decide ⇒ may apply): the only safe
direction when a `paths` condition cannot be evaluated is to run the reviewer, never
to drop it. This is the lightest behavior that satisfies "never silently lose a
review", it keeps the managed runtime usable without human intervention on every run,
and it aligns the gate's posture (fail-closed) with scope-check's. Over-activation is
benign: the reviewer's own purpose/criteria already focus it (a `security` reviewer
looks at security regardless of which files it is handed), so running it against the
whole change yields a superset of what the `paths`-scoped run would have covered.

**Alternatives considered**:

- **(rejected) Status quo — treat under-activation as fail-safe.** Silently dropping a
  `security` review is not safe. It contradicts scope-check's fail-closed handling of
  the identical predicate and the project's fail-closed escalation invariant. This is
  the behavior the request exists to remove.
- **(rejected) Escalate like scope-check (synthesize an UNKNOWN decision-needed
  finding).** Maximally consistent with scope-check, but it halts *every* managed run
  that declares a `paths` reviewer, pending a human decision — operationally heavy for
  a condition that is structural to the managed runtime (it would fire on every run,
  not on an anomaly). Scope-check can afford escalation because a scope breach is rare
  and consequential; a `paths` reviewer on managed is the common case. Activation (D1)
  is the better cost/safety trade-off here while remaining strictly safer than the
  silent skip. If operational experience shows over-activation is too costly, this can
  be revisited via the escalation path (the seam — `changedFilesDerivable` as an
  observable fact — supports either policy without further structural change).

### D2: Encode derivability as an observable fact on `evaluateActivation`, defaulting to derivable

`evaluateActivation` gains an optional `changedFilesDerivable?: boolean` field on
`ActivationFacts`. The gate computes it from
`deps.runtimeStrategy?.canDeriveChangedFiles?.() !== false` and passes it in. Inside
`evaluateActivation`, the `paths` branch checks `changedFilesDerivable === false`
first and returns `activated: true` (D1) before attempting any glob match.
`requestTypes` is still evaluated **before** `paths` (unchanged order), so a
`requestTypes` mismatch still skips deterministically even on the managed runtime —
request type is always known and does not depend on changed-file derivation.

The field is **optional and defaults to "derivable"** (`true`) when absent. This keeps
the activation policy where it already lives — one pure, deterministic, fully unit-
testable function — instead of leaking `step.activation.paths` inspection into the
executor. It also leaves the other caller of `evaluateActivation`,
`computeInvalidations` in `reviewer-status.ts` (which does not pass the field),
**byte-for-byte unchanged**: absent ⇒ derivable ⇒ existing path-matching behavior.
Reviewer invalidation on the managed runtime is out of scope and must not shift.

**Rationale** — Keeping `evaluateActivation` pure and feeding it the runtime fact
follows the module's stated design ("the decision is made from observable facts, not
LLM judgment"). The default-derivable rule is what isolates the change to the
activation gate and prevents accidental coupling into invalidation.

**Alternatives considered**:

- **(rejected) Branch in the executor on `canDeriveChangedFiles()` and force-activate
  there.** Requires the executor to inspect `step.activation.paths` to know whether the
  `paths` condition is the reason for activation, duplicating policy that belongs in
  `evaluateActivation` and splitting the decision across two modules.
- **(rejected) Make `changedFilesDerivable` required.** Would force a change to the
  `computeInvalidations` call site and every test fixture, risking an out-of-scope
  behavior shift in reviewer invalidation. Optional + default-derivable confines the
  change.

### D3: Short-circuit the `listChangedFiles` call when non-derivable

When `changedFilesDerivable` is `false`, the gate does **not** call `listChangedFiles`
at all (the result would be a structural `[]` and is unused once D1 activates). This
mirrors scope-check, which also skips `listChangedFiles` on the non-derivable branch,
and makes "the gate did not consult a fabricated empty list" an observable, testable
property (the seam method is provably not invoked on the managed runtime).

**Rationale** — Avoids feeding a known-empty, known-meaningless list into the decision
and keeps the two consumers of the seam structurally parallel.

### D4: Reframe the contradicting documentation

`managed.ts:506-512` (the `listChangedFiles` "fail-safe: under-activate" comment) and
`runtime-strategy.ts:385-387` (the `canDeriveChangedFiles` "reviewer activation
consumers MUST NOT reference this predicate" note) are updated to state the new
contract: the activation gate **does** consult `canDeriveChangedFiles()`, and the
non-derivable case activates the reviewer (fail-closed) rather than skipping it. The
managed `[]` return is documented as a structural limitation (no worktree), explicitly
**not** as "fail-safe under-activation".

**Rationale** — Stale, prescriptive comments that assert the opposite of the live
behavior are an active hazard: a future contributor reading "MUST NOT reference this
predicate" would re-introduce the defect. The documentation must be corrected as part
of the same change. (This decision is the subject of the requested ADR — it reverses a
previously deliberate decision.)

## Risks / Trade-offs

**[Risk] Managed runs now execute `paths` reviewers that were previously skipped.**
A `paths`-conditioned reviewer that used to be recorded as `skipped` (and treated as a
pass-through approval) will now run on every managed job, consuming a reviewer session
/ budget and possibly returning `needs-fix` or `escalation`. → **Mitigation**: This is
the intended correction — the previous "approval" was unearned. The cost is bounded
(one reviewer loop per declared `paths` reviewer) and only affects the managed runtime,
where the worktree-less constraint is the root cause. If the cost proves excessive, D2
leaves the escalation policy (alternative in D1) reachable without structural change.

**[Risk] Over-activation reviews files outside the declared `paths`.**
The reviewer sees the whole change rather than only the `paths`-matched subset. →
**Mitigation**: Acceptable and explicitly within the request's accepted design. The
reviewer's purpose/criteria focus it regardless of the file set; reviewing a superset
is strictly safer than skipping. No reviewer relies on `paths` to *scope its content*
— `paths` only gates *activation*.

**[Risk] Regression in local-runtime activation or in reviewer invalidation.**
→ **Mitigation**: `changedFilesDerivable` defaults to derivable, so the local gate path
(`canDeriveChangedFiles() === true`) and the `computeInvalidations` call site (field
absent) keep their exact current code paths. Locked by regression tests (T-05, T-06).

## Open Questions

None blocking. D1 (activate) is the recommended direction and is implemented here; the
escalation alternative remains reachable through the same seam should spec-review or
operational experience call for it.
