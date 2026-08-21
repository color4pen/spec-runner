# Design: regression-gate finding provenance carry

## Context

`job resume --wontfix <index>` lets an operator accept a regression-gate finding as
"won't fix". Resolution today works like this (`src/core/decision/wontfix.ts:85-122`):

1. Read the latest regression-gate typed findings (`getLatestJudgeFindings(state, REGRESSION_GATE_STEP_NAME)`), indexed 1-based — this is what the operator selects.
2. Build a reverse index `fingerprint (file|line|title) → Map<stepName, Finding>` from `deriveImplReviewerChain(state)` StepRun findings only.
3. For each selected gate finding, recompute its fingerprint and look it up. On miss → all-or-nothing error, resume exits 2.

Two structural defects make this brittle:

- **Title paraphrase breaks matching.** The regression-gate is an LLM reviewer. When it
  re-reports a ledger finding it rephrases the title (observed: 「〜の範囲が曖昧 …」→
  「〜の範囲が**依然として**曖昧」). Because `findingFingerprint` includes `title`, the
  recomputed fingerprint no longer equals any source finding's fingerprint, so resolution
  misses and the whole resume is rejected (exit 2). Observed error:
  `--wontfix: index 1 finding fingerprint '<file>|<line>|<title>' not found in any reviewer chain step`.

- **spec-review origins are unreachable.** The regression-gate ledger is the union of
  `collectSpecReviewLedger` (all spec-review fixable findings) and `collectFindingsLedger`
  (impl reviewer chain), merged by `dedupeFindings` (`src/core/pipeline/findings-ledger.ts:212-219`).
  But the wontfix reverse index walks only `deriveImplReviewerChain` (code-review + custom
  reviewers). A spec-review-origin ledger finding can therefore never be resolved, even with
  an exact title match — a confirmed bug that title preservation alone would not fix.

The root cause is that identity is **reconstructed from regenerated prose**. The fix is to
**carry provenance from the start** and match on a machine-assigned identifier instead of
LLM-authored text.

Relevant constraints verified in the current tree:

- `JUDGE_REPORT_TOOL` is a singleton; `step-completion.ts:137-140` derives `isJudgeStep` by
  identity (`stepReportTool === JUDGE_REPORT_TOOL`). regression-gate, spec-review, and custom
  reviewers all point `reportTool` at this same object. Changing the gate's report-tool
  identity would break the judge-contract wiring (verdict derivation, ref verification,
  no-tool-call escalation). The tool identity MUST be preserved.
- Findings are persisted through `parseFindings` (`src/core/port/report-result.ts:178-240`),
  which **rebuilds each finding field-by-field**. Any new field is silently dropped unless
  `parseFindings` is taught to capture it (as it already does for `fixTarget` / `origin` /
  `fileMissing`).
- `DispositionDecisionRecord` (`src/state/schema/types.ts:302-321`) and the persisted
  `decisions` array format must not change shape (backward-compat requirement, established by
  #1022). Disposition machine-respect keys on `step` + `findingKey`.
- Gate findings still carry real `file` / `line` values from the ledger; `step-completion.ts`
  ref-verification (`verifyFindingRefs`) checks that `file` exists. Provenance carry must not
  disturb this.

## Goals / Non-Goals

**Goals**:

- Attach a machine-derived provenance ref to every regression-gate ledger entry, carried
  through the LLM re-report so the origin survives title/rationale paraphrase.
- Resolve `--wontfix <index>` → source finding via the carried ref, with zero dependence on
  the gate's regenerated title/rationale.
- Cover every ledger-contributing step (spec-review + impl reviewer chain) in the wontfix
  provenance index, so spec-review-origin findings can be disposed against their origin.
- Keep the persisted `decisions` format and DispositionDecisionRecord shape unchanged; keep
  all-or-nothing exit 2 for invalid index / unresolvable provenance.

**Non-Goals**:

- Redesigning `computeFindingKey` or the ledger fingerprint identity formula (scope-out —
  carrying provenance is the intended replacement for prose matching).
- Changing verdict-side disposition respect (step-completion filter groups) — unchanged.
- Changing the regression-gate FIXED / STILL-PRESENT verdict logic — unchanged.
- Merging with the sibling artifact-provenance work (bite-evidence tamper, #1036) — separate
  request; only the "carry provenance from the start" principle is shared.

## Decisions

### D1: Carry an opaque provenance ref; stop reconstructing identity from prose

The linkage from a gate-reported finding back to its origin SHALL be an explicit
machine-assigned token carried on the ledger, not a value recomputed from the gate's
regenerated fields.

- **Rationale**: title paraphrase is a single point of failure for `findingFingerprint`
  matching; one LLM rewording breaks resolution and rejects the whole resume. An opaque token
  that the machine assigns and the LLM only transports removes the dependency on regenerated
  text entirely. This is the request's stated main line ("由来を最初から運ぶ").
- **Alternatives considered**:
  - *Match gate→ledger on `file|line` only (drop title from the compare)* — rejected: still
    string matching, ambiguous when several findings share a location, and scope-out forbids
    redesigning the fingerprint identity formula. Does not fix spec-review coverage.
  - *Preserve the gate title verbatim via prompt contract only* — rejected: the request states
    verbatim preservation is unenforceable for an LLM, and it still leaves the spec-review
    reverse-index gap unaddressed.

### D2: Mechanism = gate echoes the ref (additive typed schema) + machine validation at resolution

The ref SHALL be surfaced to the gate in the ledger block and echoed back as an additive,
optional finding field; `--wontfix` resolution machine-validates that the echoed ref resolves
to a ledger-contributing step, failing all-or-nothing (exit 2) otherwise.

- **Rationale**: `--wontfix <index>` indexes the gate's **reported regressions** — a subset the
  LLM selected in an arbitrary order — so the machine cannot know which ledger entries the gate
  flagged without the gate communicating it. Some LLM-carried linkage is therefore unavoidable.
  The request explicitly permits the prompt-echo path *if* enforced by typed schema + machine
  validation. Making the linkage an opaque token (not prose) and validating it resolves means a
  mis-copied or omitted ref fails **closed** (exit 2, zero records) — exactly the all-or-nothing
  guarantee required, never a wrong disposition.
- **Alternatives considered**:
  - *Pure machine-side correspondence with no echo, by re-pointing `--wontfix` at the
    deterministic ledger instead of the gate findings* — rejected: it changes operator-facing
    index semantics (operators would select from the full ledger, including entries the gate did
    not flag as regressed), and the acceptance criteria ("gate が title を言い換えて再報告した
    finding への `--wontfix`") explicitly target the gate-reported finding. The gate's report is
    what the operator sees in the escalation.
  - *Introduce a dedicated `REGRESSION_GATE_REPORT_TOOL`* — rejected: `isJudgeStep` is an
    identity check on the `JUDGE_REPORT_TOOL` singleton; a new tool would require executor
    changes and re-wiring the judge contract. Keeping the singleton is far less invasive (D5).

### D3: Derive the ref from the finding's stable identity, not from ledger position

The provenance ref SHALL be a deterministic function of the originating finding's stable
fingerprint (file, line, title), e.g. a short stable hash — NOT a positional index into the
ledger (L1, L2, …).

- **Rationale**: the ledger's membership and order change across resumes — `collectFindingsLedger`
  applies `filterUndecidedFindings`, so once a finding is disposed the ledger shrinks and any
  positional numbering shifts, invalidating refs the gate already echoed. A ref derived from the
  finding's own identity is invariant to membership/order and can be recomputed identically at
  resume time from the same source findings.
- **Alternatives considered**:
  - *Positional `L{n}` ids* — rejected: fragile under dedup / disposition membership changes as
    above.
  - *Use the full `file|line|title` fingerprint string as the ref* — viable but verbose and
    error-prone for the LLM to echo verbatim; a short stable hash of that fingerprint is easier to
    transport reliably while remaining deterministic and recomputable. The exact encoding is an
    implementation detail; it MUST be deterministic and collision-resistant.

### D4: Build the wontfix provenance index over ALL ledger-contributing steps

The `--wontfix` provenance index SHALL be constructed by walking spec-review StepRuns AND the
impl reviewer chain StepRuns (the same source sets that feed `computeRegressionLedger`), keying
each source finding by its provenance ref → set of `(stepName, actualFinding)`.

- **Rationale**: this directly fixes the confirmed spec-review-origin bug — the ledger merges
  spec-review findings but the old reverse index ignored them. Sourcing the index from the same
  step sets that build the ledger guarantees every ledger entry has a resolvable origin.
- **Alternatives considered**:
  - *Keep impl-chain-only and rely on title fixes* — rejected: this is the exact defect being
    fixed; spec-review origins would remain unreachable.
  - *Reuse `computeRegressionLedger` output directly for the index* — the dedup keeps only the
    first-occurrence finding and loses per-step attribution; the index must preserve one entry per
    source step (see TC-004 "one record per source step"), so it walks the source StepRuns rather
    than the deduped ledger.

### D5: Additive-only schema; preserve the JUDGE_REPORT_TOOL singleton and record shape

The provenance ref SHALL be added as an optional field on the shared `Finding` type and the
`report_result` finding schema, captured by `parseFindings`. The echo *instruction* is scoped to
the regression-gate prompt (not the shared tool description). The `DispositionDecisionRecord`
shape and persisted `decisions` format are unchanged.

- **Rationale**: additive-optional keeps every existing finding consumer (report tool, display,
  ledger, spec-review, code-review, conformance) working unchanged, satisfying backward compat.
  Because `parseFindings` rebuilds findings field-by-field, the ref must be explicitly captured
  there (mirroring `fixTarget` / `origin` / `fileMissing`) or it would be dropped and never
  persisted. Scoping the echo instruction to the gate prompt avoids polluting spec-review /
  code-review tool descriptions with a field they never use, while the schema field remains shared
  and harmless. The disposition record still stores only `step` + `findingKey` (+ snapshot), so no
  persisted-format change and the machine-respect filters keep matching as before.
- **Alternatives considered**:
  - *Add the ref to the DispositionDecisionRecord as a new required field* — rejected:
    unnecessary and would risk the backward-compat contract; provenance only needs to survive from
    ledger to resolution, after which the existing `step`+`findingKey` record is sufficient.

### D6: `--wontfix` continues to index the gate's reported findings

The operator's `<index>` SHALL continue to select from the latest regression-gate typed findings
(unchanged input semantics). Only the resolution mechanism (ref instead of recomputed fingerprint)
and the index breadth (all ledger-contributing steps) change.

- **Rationale**: preserves the operator mental model — they select from the regressions the gate
  reported in the escalation — and matches the acceptance criteria phrasing. Minimizes behavioral
  surface area.
- **Alternatives considered**: re-pointing the index at the ledger — already rejected under D2.

## Risks / Trade-offs

- **[Risk] The gate omits or mis-copies the provenance ref.** Then the affected `--wontfix`
  index cannot resolve. → **Mitigation**: the ledger block presents each ref prominently and the
  gate prompt instructs verbatim echo of the ref on every reported regression; resolution fails
  **closed** (all-or-nothing exit 2, zero records) so a garbled ref can never produce a wrong
  disposition. Failing closed is the required behavior for unresolvable provenance, so this is a
  safe degradation, not a correctness hazard. (Strengthening the gate verdict to reject
  ref-less fixable findings is out of scope — FIXED/STILL-PRESENT logic is frozen.)

- **[Risk] Ref collision** — two distinct origin fingerprints hash to the same ref. →
  **Mitigation**: derive the ref from the full fingerprint with a sufficiently wide,
  collision-resistant encoding; a collision would only fold two origins onto one ref, and both
  would still be legitimate ledger origins (producing one record per source step). Document the
  encoding as deterministic and wide.

- **[Risk] Ledger recomputed at resume differs from the gate-time ledger.** → **Mitigation**:
  no ledger-contributing StepRun executes between the gate's last run and the wontfix resume (the
  gate is not in its own reviewer chain), and refs are identity-derived (D3), so the provenance
  index recomputed at resume assigns the same refs the gate saw.

- **[Trade-off] Reliance on LLM transport of the token.** Accepted per the request's sanctioned
  echo path; bounded by fail-closed machine validation (D2).

## Open Questions

- None blocking. The exact ref encoding (short hash vs. namespaced string) is left to the
  implementer within the D3 constraints (deterministic, collision-resistant, easy to echo).
- Whether to also strengthen the gate verdict to escalate when a fixable finding lacks a
  resolvable ref is intentionally deferred (out of scope: gate verdict logic is frozen).
