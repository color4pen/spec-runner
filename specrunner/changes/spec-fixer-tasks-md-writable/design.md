# Design: spec-fixer tasks.md writable

## Context

spec-review derives its verdict from the canon write scope: a fixable finding on a
canon file that the effective fixer can legally write becomes `needs-fix` (routed to that
fixer); a fixable finding on a canon file the fixer cannot write becomes `escalation`
(CANON_FINDING_ESCALATION, operator stop). The classification is data-driven — the pure
functions `deriveSpecReviewVerdict` / `selectRoutableCanonFindings` /
`selectUnroutableCanonFindings` read the write set from a `CanonWriteScope`; they contain
no per-file special-casing.

The spec round's one and only fixer is spec-fixer (`specReviewEffectiveFixer` always
returns `spec-fixer`). Its declared write set is `{spec.md, design.md}`. tasks.md is a
protected canon file (`protectedCanonPaths` includes it) but is absent from spec-fixer's
write set, so every fixable spec-review finding on tasks.md is classified unroutable and
escalates — even though tasks.md is a design-step-generated peer artifact of spec.md /
design.md, and even though spec-review already reads tasks.md to judge consistency. The
result is a structural asymmetry: the round can point at a tasks.md defect but no member of
the round can fix it. In practice these are transcription-type findings (test-plan
reinforcement, carrying an already-decided design point into tasks.md) and are the single
most frequent canon-escalation cause.

The write set for spec-fixer is declared once and consumed at three synchronization points:

- `src/core/step/spec-fixer.ts` `writes()` — the scoped-mode permission set. It feeds the
  agent workspace tool guard (`createWorkspaceToolGuard` reads `scope.declaredWritePaths`)
  and the scoped-commit staging boundary (`findScopedCommitViolations`).
- `src/core/step/canon-write-scope.ts` — the D5 explicit map (`writableByFixer`), adopted
  to avoid an import cycle between verdict derivation and the fixer step modules.
- `tests/unit/core/step/canon-write-scope.test.ts` TC-029 — a drift-guard that asserts
  `writes() ∩ protectedCanonPaths` equals the D5 map entry.

The spec-review routing infrastructure already exists and is wired
(`SpecReviewStep.judgeVerdictFn = deriveSpecReviewVerdict`;
`step-completion.ts` builds the scope via `buildCanonWriteScope` and reuses the same
resolver for the escalationReason). No verdict logic is missing — only the write-set data
excludes tasks.md.

## Goals / Non-Goals

**Goals**:

- Add tasks.md to spec-fixer's canon write set so spec-review fixable findings on tasks.md
  route to spec-fixer (severity-independent) and converge inside the spec round.
- Keep the three synchronization points (writes(), D5 map, drift-guard) mutually consistent.
- Preserve the escalation boundary for request.md / test-cases.md / attestation.
- Update the spec-fixer prompt (conformance entry and system-prompt contract) to name
  tasks.md as a fixable target.
- Migrate the existing tests that encoded "tasks.md escalates" to the new expectation and
  enumerate them in implementation-notes.

**Non-Goals**:

- No change to implementer's tasks.md write (checkbox updates).
- No change to the verdict-derivation logic (`deriveSpecReviewVerdict` /
  `deriveConformanceVerdict` / the effective-fixer resolvers) — behavior changes purely via
  the expanded write-set data.
- No change to the write boundary of request.md / test-cases.md / attestation.
- No change to spec-review finding coverage / completeness.

## Decisions

### D1: Change routing by expanding the write set only — no verdict-logic edit

tasks.md routing flips from escalation to needs-fix by adding tasks.md to spec-fixer's
declared write set at its three synchronization points. `deriveSpecReviewVerdict` already
derives routable/unroutable from `CanonWriteScope.writableByFixer`, so the verdict function,
the effective-fixer resolvers, and the transition table are untouched.

- Rationale: the verdict layer is intentionally data-driven so that write-boundary changes
  are expressed as data, not code. Editing the derivation would duplicate the boundary in a
  second place and invite drift. Why expand data, not logic: the boundary already has one
  authoritative representation (the write set) — widening it is the minimal, drift-proof edit.
- Alternatives considered:
  - A dedicated tasks.md fixer — rejected (see D4).
  - Special-casing tasks.md inside `deriveSpecReviewVerdict` — rejected: it would encode the
    boundary a second time, contradicting the single-source design and the drift-guard.

### D2: Synchronize all three write-set declaration points plus the prompt

The write set is declared at three points that the drift-guard binds together; the prompt is
a fourth, human-facing declaration of the same boundary. All four are updated together:

1. `spec-fixer.ts` `writes()` adds `${folder}/tasks.md` (permission + staging).
2. `canon-write-scope.ts` D5 map `spec-fixer` entry becomes `{spec.md, design.md, tasks.md}`
   (and the module doc comments that quote `{spec.md, design.md}`).
3. The drift-guard (TC-029) stays green automatically because both (1) and (2) move together;
   only its descriptive title needs to read `{spec.md, design.md, tasks.md}`.
4. spec-fixer prompt: the conformance-entry user message
   (`spec-fixer.ts` — "fix the spec.md or design.md artifact") and the system-prompt
   write-set / contract section (`prompts/spec-fixer-system.ts`) name tasks.md.

- Rationale: the permission layer (writes()) and the routing layer (D5 map) are two faces of
  one boundary; changing one without the other either lets spec-fixer route a finding it
  cannot physically write, or blocks a write it is authorized to route. The drift-guard exists
  precisely to catch that skew, so both must move in one commit.
- Alternatives considered: updating only the D5 map (routing) without writes() (permission) —
  rejected: spec-fixer would be routed a tasks.md finding but the workspace tool guard /
  scoped-commit check would then reject the write, converting a would-be fix into a failure.

### D3: The conformance path inherits the widened boundary as a data-driven consequence

The conformance path resolves the effective fixer from `finding.fixTarget`
(`conformanceEffectiveFixer`). Because it reads the same `writableByFixer` map, a fixable
conformance finding on tasks.md with `fixTarget: spec-fixer` now derives
`needs-fix:spec-fixer` instead of escalation, while `fixTarget: code-fixer` still escalates
(code-fixer writes no canon) and `fixTarget: implementer` still derives
`needs-fix:implementer`. This is intended: if spec-fixer can legally write tasks.md, routing a
tasks.md fix to it converges in-pipeline regardless of which round surfaced the finding.

- Rationale: the request explicitly notes the conformance `needs-fix:spec-fixer` routing
  "naturally follows the write-set expansion". Suppressing this to preserve the old
  conformance behavior would reintroduce the special-casing D1 rejects.
- Consequence: the existing conformance-path test that asserted "tasks.md + fixTarget
  spec-fixer → escalation" changes to `needs-fix:spec-fixer` and is enumerated in
  implementation-notes.

### D4: Do not create a separate tasks.md fixer

- Rationale: the spec round is structurally single-fixer (spec-fixer); tasks.md is a design-
  step-generated peer of spec.md / design.md. A second fixer would fragment the round, add a
  transition/loop-pair, and duplicate the write-scope machinery for no behavioral gain over
  widening the existing fixer's boundary by one file.
- Alternatives considered: status quo (tasks.md escalates) — rejected: it keeps the most
  frequent operator stop for transcription-type findings and violates the "a request
  converges autonomously" contract.

### D5: Migrate existing tests to the new expectation; do not weaken the boundary tests

Tests that encoded "tasks.md is unroutable / escalates" are updated to the new spec, and the
tests that pin the preserved boundary (request.md / test-cases.md / attestation escalation)
are kept and strengthened with an escalationReason assertion for test-cases.md.

- Rationale: the boundary that moved (tasks.md) and the boundary that is preserved
  (request.md / test-cases.md / attestation) must both be pinned so a future regression in
  either direction is caught. Enumerating the migrated tests in implementation-notes makes the
  expectation change auditable.

## Risks / Trade-offs

- [Risk] Updating `writes()` (routing/permission) but not the D5 map, or vice versa →
  Mitigation: the TC-029 drift-guard fails on any skew between the two; both are edited in T-01
  and verified by `typecheck && test`.
- [Risk] Silently widening the escalation boundary beyond tasks.md (e.g. accidentally granting
  request.md / test-cases.md) → Mitigation: TC-019 keeps asserting request.md / test-cases.md
  are excluded from spec-fixer's set; TC-003 and the new test-cases.md escalationReason
  assertion keep those files on the escalation path.
- [Risk] The conformance-path behavior shift (D3) is missed as an "unexpected" test failure →
  Mitigation: it is called out here and in tasks.md, and the affected test is migrated
  deliberately and listed in implementation-notes.
- [Trade-off] tasks.md is now writable by both implementer (checkbox updates) and spec-fixer
  (spec-round corrections). The per-fixer D5 map permits overlapping ownership by design; no
  single-writer invariant exists, and each fixer only writes tasks.md within its own round.

## Open Questions

None.
