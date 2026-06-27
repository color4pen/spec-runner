# Spec: reviewer-activation-fail-closed

## Requirements

### Requirement: The activation gate SHALL consult changed-file derivability before evaluating a `paths` condition

The reviewer activation gate in `StepExecutor` MUST determine whether the runtime can
mechanically derive changed files (via `RuntimeStrategy.canDeriveChangedFiles()`)
before evaluating a reviewer's `paths` activation condition. When the predicate returns
`false`, the gate MUST NOT call `listChangedFiles`, and MUST NOT evaluate the `paths`
condition against an empty changed-file list.

`canDeriveChangedFiles()` returning `false` (managed runtime), absent (test fakes), or
`true` (local runtime) MUST be interpreted as: `false` ⇒ non-derivable; absent or
`true` ⇒ derivable.

#### Scenario: managed runtime does not invoke listChangedFiles for a paths reviewer

**Given** a reviewer step with a `paths` activation condition
**And** a runtime whose `canDeriveChangedFiles()` returns `false`
**When** the activation gate runs
**Then** `listChangedFiles` is not called

#### Scenario: local runtime invokes listChangedFiles for a paths reviewer

**Given** a reviewer step with a `paths` activation condition
**And** a runtime whose `canDeriveChangedFiles()` returns `true`
**When** the activation gate runs
**Then** `listChangedFiles` is called to obtain the changed-file list

---

### Requirement: A `paths`-conditioned reviewer SHALL be activated (not silently skipped) when changed files cannot be derived

When changed files cannot be derived and a reviewer declares a `paths` condition, the
gate MUST activate the reviewer and run its agent. It MUST NOT record a `skipped`
verdict for that reviewer on the basis of a `paths` mismatch. The reviewer reviews the
whole change (the `paths` filter is not applied because its inputs are unavailable).
The job MUST NOT be halted by this condition.

#### Scenario: managed runtime activates a paths reviewer instead of skipping it

**Given** a reviewer step with `paths: ["src/auth/**"]`
**And** a runtime that cannot derive changed files (`canDeriveChangedFiles()` is `false`)
**When** the activation gate runs
**Then** the reviewer's agent is invoked
**And** no `skipped` step result with a "no changed files matched paths" reason is recorded for the reviewer

---

### Requirement: `evaluateActivation` SHALL treat non-derivable changed files as activating for a `paths` condition

`evaluateActivation` MUST accept an optional `changedFilesDerivable` fact. When
`changedFilesDerivable` is `false` and a `paths` condition is present, it MUST return
`activated: true` without evaluating the glob match. When `changedFilesDerivable` is
absent or `true`, it MUST evaluate the `paths` condition exactly as before. The
`requestTypes` condition MUST continue to be evaluated before `paths`, independent of
`changedFilesDerivable`.

#### Scenario: paths condition with non-derivable changed files activates

**Given** `cond = { paths: ["src/auth/**"] }`
**And** facts `{ changedFiles: [], requestType: "bug-fix", changedFilesDerivable: false }`
**When** `evaluateActivation(cond, facts)` is called
**Then** the result is `{ activated: true }`

#### Scenario: requestTypes mismatch still skips even when changed files are non-derivable

**Given** `cond = { requestTypes: ["spec-change"], paths: ["src/auth/**"] }`
**And** facts `{ changedFiles: [], requestType: "bug-fix", changedFilesDerivable: false }`
**When** `evaluateActivation(cond, facts)` is called
**Then** the result is `{ activated: false }` with a reason describing the `requestType` mismatch

#### Scenario: derivable changed files with no match still skips (no regression)

**Given** `cond = { paths: ["src/auth/**"] }`
**And** facts `{ changedFiles: ["src/util/helper.ts"], requestType: "bug-fix", changedFilesDerivable: true }`
**When** `evaluateActivation(cond, facts)` is called
**Then** the result is `{ activated: false }` with a reason naming the `paths` globs

#### Scenario: omitted derivability fact defaults to derivable

**Given** `cond = { paths: ["src/auth/**"] }`
**And** facts `{ changedFiles: ["src/util/helper.ts"], requestType: "bug-fix" }` (no `changedFilesDerivable`)
**When** `evaluateActivation(cond, facts)` is called
**Then** the result is `{ activated: false }` (identical to the derivable-true case)

---

### Requirement: `skipReason` SHALL distinguish "changed files not derivable" from "condition did not match"

A reviewer that is recorded as `skipped` with a "no changed files matched paths" reason
MUST have been evaluated against a derivable changed-file list (a genuine condition
mismatch). The non-derivable case MUST NOT produce that `skipReason`; it produces an
activation (the reviewer runs) instead.

#### Scenario: condition-mismatch skip carries a paths-mismatch reason (derivable)

**Given** a reviewer step with `paths: ["src/auth/**"]`
**And** a derivable runtime whose changed files do not match the globs
**When** the activation gate runs
**Then** the reviewer is recorded as `skipped` with a `skipReason` naming the `paths` globs

#### Scenario: non-derivable case produces activation, not a paths-mismatch skip

**Given** a reviewer step with `paths: ["src/auth/**"]`
**And** a runtime that cannot derive changed files
**When** the activation gate runs
**Then** the reviewer is activated (agent invoked) and is not recorded with a "no changed files matched paths" `skipReason`

---

### Requirement: Reviewers without a `paths` condition SHALL be unaffected

A reviewer with no activation condition, or with only a `requestTypes` condition, MUST
behave exactly as before regardless of `canDeriveChangedFiles()`. Such a reviewer's
activation MUST NOT depend on changed-file derivability.

#### Scenario: unconditional reviewer activates on a non-derivable runtime

**Given** a reviewer step with no activation condition
**And** a runtime that cannot derive changed files
**When** the activation gate runs
**Then** the reviewer's agent is invoked (no skip)

#### Scenario: requestTypes-only reviewer is gated solely by request type

**Given** a reviewer step with `requestTypes: ["bug-fix"]` and no `paths`
**And** a runtime that cannot derive changed files
**When** the activation gate runs with request type `bug-fix`
**Then** the reviewer's agent is invoked (activation depends only on request type)
