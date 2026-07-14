# Design: request-review fact-check attestation

## Context

The `design` step spends a large share of pipeline execution cost on repository
exploration. Part of that exploration is a **re-verification of current-code
assertions** (`src/prompts/design-system.ts:44-60`): before designing, the design
agent re-reads/greps every `file:line` / symbol / path assertion in the request to
confirm it matches reality, halting (`ok:false`) on mismatch.

The `request-review` step already performs the *same* fact-check earlier in the
pipeline (`src/prompts/request-review-system.ts:38-53`, "Step 2: Code Assertion
Fact-Check"): it scans the whole request for the same class of assertions, verifies
them with Read/Grep, and records `severity: high` findings on mismatch. Because
`request-review` is positioned directly before `design`, and `request.md` is not
modified between them (except when a human edits it during a needs-discussion
escalation), the design-side re-verification of unchanged assertions is duplicated
exploration.

`request-review` writes its result to a findings file and reports findings via its
report tool (`src/prompts/request-review-system.ts:125-166`), but leaves no
machine-readable manifest of *what code state it verified*. If it emits such a
manifest — an **attestation** binding the reviewed `request.md` content to the
assertions it verified — then `design` can skip re-verifying identical assertions
whenever `request.md` is provably unchanged, cutting exploration cost while keeping
drift detection intact.

This change introduces that attestation as a new step-to-step data contract between
`request-review` and `design`.

## Goals / Non-Goals

**Goals**:

- `request-review` emits a fact-check attestation artifact into the change folder
  recording: the content hash of the reviewed `request.md`, a flag that code
  assertions were verified, and the list of verified relevant paths / symbols.
- `design` reads the attestation and, when the current `request.md` content hash
  matches the attestation's hash, skips re-verifying the recorded assertions
  (verifying only in-scope assertions that are not recorded).
- When the hash does not match (request edited after review) or no attestation
  exists, `design` re-verifies all in-scope assertions exactly as it does today.
- The attestation reduces exploration only; it does not change any verdict or stop
  outcome of `request-review` or `design`.
- The attestation is a change-folder file artifact; the job state schema is not
  changed.

**Non-Goals**:

- `design` model routing (per-request-type model assignment) — decided separately.
- Making the `conformance` step conditional.
- Removing the double-injection of the request body into the `design` prompt.
- Extending the mechanism to the managed runtime as a hard guarantee (managed
  degrades to today's full re-verification — see D7).

## Decisions

### D1: The attestation is a change-folder file artifact, not job state

The attestation is written to `specrunner/changes/<slug>/request-review-attestation.json`,
alongside the other per-change artifacts (request-review-result, spec, design,
tasks). It is not added to `JobState` / `StepRun`.

- **Rationale**: it is handled like every other change-folder artifact, so no state
  schema change and no migration are needed, and it cannot collide with pipeline
  metrics or other state mutations. It travels with the branch, so it is available
  to `design` in the same worktree.
- **Alternatives considered**: storing the attestation (or its hash) as a typed
  field on `StepRun`/state. Rejected — it forces a schema change/migration for data
  that is only needed transiently by the very next step and is naturally a file.

### D2: Skip is gated on content-hash equality only

`design` skips re-verifying recorded assertions **only** when the current
`request.md` content hash equals the hash recorded in the attestation.

- **Rationale**: the hash gate preserves drift detection. If `request.md` was edited
  after review, the hashes differ and `design` re-verifies everything, so no
  assertion can silently pass on a stale review.
- **Alternatives considered**: dropping the design-side fact-check entirely (skip
  always). Rejected — it loses the ability to detect drift when `request.md` is
  edited after review. Skipping is confined to the hash-match case.

### D3: `request-review` (agent) writes the attestation; the hash is CLI-computed and injected

The CLI computes the `request.md` content hash deterministically and injects it into
the `request-review` initial message. The `request-review` agent writes the
attestation file after completing Step 2, copying the injected hash verbatim and
filling in the assertions it verified.

- **Rationale**: this is runtime-neutral. In both local and managed runtimes the
  agent already authors and commits change-folder files, so no new executor,
  runtime-strategy, or report-tool surface is required. The trust-critical decision
  is not delegated to the agent (see D4), and the whole mechanism is **fail-safe**:
  any malformed, missing, or hash-mismatched attestation causes `design` to
  re-verify all assertions (D2), so a bad attestation costs performance, never
  correctness.
- **Alternatives considered**: having the CLI write the attestation file directly
  via a new executor/runtime-strategy seam. Rejected — it is invasive (new port
  method + executor branch) and works only in the local runtime (managed has no
  local worktree to write into), while providing no correctness benefit over D3
  given the fail-safe property and D4.

### D4: The skip / re-verify decision is a CLI-deterministic gate in `design`

The comparison "does the current `request.md` hash match the attestation?" and the
resulting directive are computed by CLI code in `DesignStep.enrichContext` (a pure
evaluation over the attestation JSON and the current `request.md`), not by the
design agent. `enrichContext` sets a field on `DynamicContext`; the design initial
message injects a directive built from it; the agent only follows the directive.

- **Rationale**: the safety-critical gate stays deterministic and unit-testable
  ("verify, don't trust" — the CLI does not rely on the agent to judge freshness).
  The agent judges nothing freshness-related.
- **Alternatives considered**: letting the design agent read the attestation and
  decide freshness itself. Rejected — an LLM string comparison is neither reliable
  nor unit-testable, and it would move the drift gate out of the CLI.

### D5: Both sides hash the `request.md` file content, using node:crypto SHA-256

The generation side and the consumption side both compute the hash over the bytes of
`specrunner/changes/<slug>/request.md` (not an in-memory parsed snapshot), using the
existing `createHash("sha256")` pattern (`src/core/attestation/build-attestation.ts`).
The hash string is prefixed (`sha256:<hex>`), mirroring existing hashing utilities.

- **Rationale**: hashing the same source on both sides guarantees the two hashes are
  comparable regardless of any parser normalization of the request body. No new
  dependency (node:crypto is a Node API, not a Bun API).
- **Alternatives considered**: hashing the in-memory parsed request (`request.content`)
  on the generation side. Rejected — it risks disagreeing with the consumption side
  if parsing normalizes bytes, silently disabling the optimization.

### D6: The verified-assertions list is advisory; `design` still verifies unrecorded assertions

When the attestation is valid (hash match), `design` skips the recorded assertions
but still verifies any in-scope assertion present in `request.md` that is **not** in
the recorded list.

- **Rationale**: the real gate is hash-equality plus `request-review`'s
  (CLI-derived) approval. The list only guides *which* assertions to skip; treating
  it as exhaustive would trust an agent-authored list. Verifying unrecorded
  assertions keeps the "verify, don't trust" posture with negligible cost (when the
  hash matches, the content is identical, so the unrecorded set is normally empty).
- **Alternatives considered**: trusting the list as exhaustive and skipping all
  fact-check on hash-match. Rejected — it fully trusts an agent-authored manifest.

### D7: Managed runtime degrades gracefully to current behavior

Attestation generation and consumption depend on local file reads in
`enrichContext` (read `request.md`, read the attestation). In the managed runtime
there is no local worktree, so those reads fail and are swallowed (the existing
`enrichContext` degradation pattern used by build-fixer / spec-review). The result:
managed jobs produce/consume no attestation and `design` re-verifies all assertions
exactly as today.

- **Rationale**: no managed-runtime regression, and the exploration-cost saving
  lands on the local runtime path where the cost is incurred.
- **Alternatives considered**: forcing managed support now. Rejected — out of scope
  and would require a managed file-write channel; degradation is behavior-preserving.

### D8: The attestation write is a declared, non-gated output

`RequestReviewStep.writes()` declares the attestation path with `verify: false`, so
the produced-output contract gate does not treat a missing attestation as a halt.

- **Rationale**: gating attestation existence would introduce a new
  `request-review` stop path (halt when the agent omits the file), changing the
  step's observable stop behavior. Declaring it non-gated keeps the data-flow
  explicit while preserving verdict/stop behavior (fail-safe covers absence).
- **Alternatives considered**: gating it with a produced contract. Rejected —
  violates the "observable stop behavior unchanged" acceptance criterion.

### D9: The pure attestation logic lives in a dedicated module

A new module (`src/core/factcheck-attestation.ts`) holds the attestation type,
the hashing helper, the JSON build/parse helpers, the freshness evaluation, and the
design directive builder — all pure functions with no I/O. A path helper
(`factCheckAttestationPath`) is added to `src/util/paths.ts`. `DynamicContext`
(`src/git/dynamic-context.ts`) gains additive optional fields to carry the injected
hash (generation) and the evaluation result (consumption).

- **Rationale**: it mirrors the existing pure-function layout of
  `src/core/attestation/` and `src/core/step/judge-verdict.ts`, isolates the
  testable "経路" from prompts and steps, and keeps the name distinct from the
  existing run-attestation module (`src/core/attestation/`, a different concept).
- **Alternatives considered**: reusing `src/core/attestation/`. Rejected — that
  module is the run/PR attestation (journal hash, gates, cost); overloading it would
  conflate two unrelated concepts.

## Risks / Trade-offs

- [Reduced defense-in-depth] `design` no longer independently re-checks assertions
  when the hash matches, so a fact-check error made by `request-review` is no longer
  caught a second time by `design`. → **Mitigation**: skipping is gated on
  hash-equality *and* on `request-review` having approved (the pipeline only reaches
  `design` on approval); identical content means any real mismatch would already
  have surfaced as a `high` finding at review. This is the explicit intent of the
  change (removing duplicated verification), and drift after review is still caught
  (D2).

- [Agent-authored artifact] The agent could write a malformed, incomplete, or
  wrong-hash attestation. → **Mitigation**: fail-safe — parse failure, absence, or
  hash mismatch all route `design` to full re-verification (D2/D3). No unsafe skip
  is possible.

- [Prompt drift changing behavior] Editing the `request-review` / `design` prompts
  could unintentionally alter verdict/stop behavior. → **Mitigation**: prompt
  changes are strictly additive; the directive only narrows exploration. Existing
  substring-based prompt tests remain green, and a new scenario pins verdict/stop
  invariance.

- [Hash source mismatch] Hashing different sources on each side would make hashes
  never match, silently disabling the optimization. → **Mitigation**: D5 fixes both
  sides to hash the `request.md` file bytes.

## Open Questions

- Should attestation generation later be made CLI-authoritative (deterministic file
  write via an executor seam) for a stronger existence guarantee? Deferred — the
  fail-safe property makes the agent-written approach sufficient for now, and the
  local/managed split argues against a local-only executor seam.
- Should managed runtime gain first-class attestation support later? Deferred; it
  currently degrades to today's behavior with no regression.
