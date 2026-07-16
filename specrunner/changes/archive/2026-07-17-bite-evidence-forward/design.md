# Design: base/candidate OID capture and forward-strategy BiteEvidence gate (R4 MVP)

## Context

The pipeline has a `test-materialize` step (base commit: tests present, implementation
absent) followed by an `implementer` step (candidate commit: implementation). These two
per-node commits establish a base→candidate boundary, but two things are missing:

1. **The commit OID of each boundary is not recorded anywhere.** `StepRun`
   (`src/state/schema/types.ts`) has no commit-OID field. A downstream gate that wants to
   "run the materialized tests at the base commit and at the candidate commit" has no way to
   address those commits.
2. **No gate proves the tests actually bite.** A test that passes at the base commit (i.e.
   with no implementation) is hollow — it has no tooth. Whether a test is real can only be
   asserted by mechanically executing it at the recorded OIDs: it must be **red at base** and
   **green at candidate**. Agent self-report or "the test passed at candidate" alone cannot
   exclude a hollow test that already passes at base.

This change implements the **forward strategy** only (request types `bug-fix` /
`new-feature`): capture base/candidate OIDs branch-borne, then run a gate that executes the
materialized tests at both OIDs, records a `BiteEvidence` record per test, and fails closed
when a test does not bite. Other category strategies (refactoring mutation, security, config)
are explicitly out of scope (R4-follow-up).

### Relevant current-code facts (verified)

- `StepRun` (`src/state/schema/types.ts:172`) has fields `attempt / sessionId / outcome /
  startedAt / endedAt / modelUsage`; no commit-OID field.
- **Persistence is journal-authoritative.** `stateToStateJson`
  (`src/store/job-state-projection.ts:186`) strips `steps` (and `history`) from `state.json`.
  On load, `composeSplitLayoutFromContent` rebuilds `steps` by folding `events.jsonl`
  (`fold` in `src/store/event-journal.ts`). Therefore any per-step field that must survive
  resume MUST be written into the `StepAttemptRecord` journal record, not only into the
  in-memory `StepRun`. (`modelUsage` is state-only and does NOT survive fold — not a model to
  copy for resume-safe data.)
- Per-node commit: agent steps commit via `runAgentStep` →
  `finalizeStepArtifacts` (`src/core/runtime/local.ts:644`) → `commitAndPush`
  (`src/core/step/commit-push.ts:36`). This block runs at `executor.ts:433` only when
  `!deps.roundOwnsGitEffects` (sequential steps — includes test-materialize and implementer).
  After `await myFinalize` (executor.ts:446) HEAD is the node's commit.
- `RuntimeStrategy.captureHeadSha(cwd)` (`src/core/runtime/local.ts:559`) runs
  `git rev-parse HEAD`; returns null on failure. `reviewer-snapshot.ts` already carries a
  SHA field (`approvedAtCommit`) as precedent for recording commit SHAs in branch-borne state.
- CLI steps (`kind: "cli"`, e.g. `VerificationStep`) run via `runCliStep`
  (`executor.ts:511`); they do NOT commit in the producer — their result file is committed by
  the next agent step's `git add -A`. `parseResult` derives the verdict from the result file.
- The `pr-create` CLI step already reflects structured data into `JobState` via
  `ParsedStepResult.pullRequest` → `StepCompletion.pullRequest`
  (`src/core/step/step-completion.ts:239`) → `commitSuccess` sets `state.pullRequest`
  (`src/core/step/commit-orchestrator.ts:324`). This is the precedent for a CLI step writing a
  branch-borne structured field.
- `test-case-gen` `writes()` = `specrunner/changes/<slug>/test-cases.md`
  (`src/core/step/test-case-gen.ts`). Its `LineageRecord` (events.jsonl) records the output
  with a sha256 hash computed by `digestArtifacts` — the frozen scenario hash and the tamper
  basis. `fold` returns `lineage: LineageRecord[]`.
- Transition table (`src/core/pipeline/types.ts`): `{ IMPLEMENTER, success → VERIFICATION }`
  in `STANDARD_TRANSITIONS`. Custom verdict strings that are not in the `Verdict` union are
  already used in transitions (e.g. `needs-fix:implementer`), so a custom `strategy-deferred`
  verdict string is idiomatic.
- Standard pipeline shape is defined once in `STANDARD_DESCRIPTOR`
  (`src/core/pipeline/registry.ts`); `FAST_DESCRIPTOR` has no `test-materialize`.
- Step names are whitelisted in `src/kernel/step-names.ts` (`AGENT_STEP_NAMES` /
  `CLI_STEP_NAMES`); `isStandardStepName` gates descriptor validity.
- Optional `RuntimeStrategy` methods (e.g. `listWorktreeChanges`, `commitRoundArtifacts`,
  `snapshotMainCheckoutGuard`) are declared optional on the port and required on
  `RealRuntimeStrategy` — the established pattern for capabilities that test fakes may omit
  but concrete runtimes must implement.
- `validateJobState` (`src/state/schema/operations.ts:95`) returns `raw as JobState` and
  validates known optional fields in place (e.g. `reviewerStatuses`, `mainCheckoutDrift`);
  unknown top-level fields survive. A new top-level `biteEvidence` field follows this pattern.

## Goals / Non-Goals

**Goals**

- Record the base OID (test-materialize commit) and candidate OID (implementer commit)
  branch-borne, surviving resume/checkpoint.
- Add a **forward-strategy** BiteEvidence gate that, for `bug-fix` / `new-feature` jobs,
  executes the materialized tests at the base OID (expect red) and the candidate OID (expect
  green) in isolated worktrees, records a `BiteEvidence` per test, and fails closed on a
  hollow test (base green), a candidate that stays red, or a tampered scenario file.
- Limit base/candidate execution to the **materialized test files only** (no full-suite
  double run).
- For non-forward request types, pass through as `strategy-deferred` without generating
  BiteEvidence and without behavioral regression.
- Preserve all existing pipeline / verification / attach / R3 behavior.

**Non-Goals**

- Other category strategies: refactoring (behavior preservation + mutation), security (attack
  fixtures), config (old-config-fail). R4-follow-up.
- R2 floor / minimumAssurance, R6 fast, R5 provenance / offline verify.
- Branching on profile/assurance values. Strategy is derived from `request.type` only (ADR D2).
- Treating the base OID's red result as a pipeline failure. The base red is intended; it is
  evaluated inside the gate's isolated worktree — the pipeline branch HEAD remains the
  candidate.
- Re-running the gate after `build-fixer` / `code-fixer`. The tooth is established for the
  implementer's candidate; fixer-driven candidate drift re-validation is out of scope.

## Decisions

### D1: Capture commit OID per node and persist it through the events journal

Add an optional `commitOid?: string` to `StepRun`. Capture it in `runAgentStep` immediately
after the `finalizeStepArtifacts` block (executor.ts:446) via
`deps.runtimeStrategy.captureHeadSha(cwd)`, thread it into
`StepExecutionResult` (kind `"success"`), and record it via `projectSuccess` →
`pushStepResult`. Because the state projection strips `steps` and rebuilds them by folding
`events.jsonl`, `commitOid` MUST also be written into `StepAttemptRecord` and read back by
`fold` (and written by `stepRunToRecord`). Base OID = the latest `test-materialize` run's
`commitOid`; candidate OID = the latest `implementer` run's `commitOid`.

- **Rationale**: `captureHeadSha` is the existing seam and HEAD is the node commit right after
  finalize. Recording on every sequential agent node (rather than special-casing two step
  names in the executor) keeps the executor free of pipeline-shape knowledge; the gate reads
  only the two step names it cares about. Journaling the field is the only way it survives
  resume (verified: `steps` are folded from `events.jsonl`, not read from `state.json`).
  Reading "latest run" naturally tracks the candidate across `conformance → implementer`
  re-loops.
- **Alternatives considered**:
  - *Dedicated top-level `state.baseOid` / `state.candidateOid`.* Rejected: would need
    step-name special-casing at capture time and a separate resume story; per-run `commitOid`
    reuses the existing per-step journal and generalizes.
  - *Store OID only in `state.json` (like `modelUsage`).* Rejected: `modelUsage` does not
    survive fold; the resume acceptance criterion would fail.
  - *Derive OIDs at gate time from `git log`.* Rejected: brittle across re-loops and
    non-linear history; the recorded OID is authoritative.

### D2: BiteEvidence gate is a CLI step inserted implementer → bite-evidence → verification (standard pipeline only)

Add a new `kind: "cli"` step `bite-evidence` (`STEP_NAMES.BITE_EVIDENCE`,
`CLI_STEP_NAMES`). Wire it into `STANDARD_DESCRIPTOR` between `implementer` and `verification`
with role `{ role: "gate", phase: "impl" }`. Retarget the transition
`{ IMPLEMENTER, success → VERIFICATION }` to `→ BITE_EVIDENCE`, and add:
`{ BITE_EVIDENCE, passed → VERIFICATION }`,
`{ BITE_EVIDENCE, "strategy-deferred" → VERIFICATION }`,
`{ BITE_EVIDENCE, failed → escalate }`,
`{ BITE_EVIDENCE, error → escalate }`.
`FAST_DESCRIPTOR` is not modified.

- **Rationale**: A deterministic checkout+run+compare belongs in a CLI step (like
  `verification`), not an agent. Placing it on the `implementer → verification` edge means it
  runs after every implementer completion — including `conformance → implementer` re-loops —
  which is exactly "after the candidate is fixed". The fast pipeline has no `test-materialize`
  (no base OID) and is R6-out-of-scope, so it is left untouched to avoid regression.
- **Alternatives considered**:
  - *Extend the existing `verification` step.* Rejected: mixes full-suite verification with
    isolated base/candidate execution and different verdict semantics; a dedicated node keeps
    concerns and transitions clean.
  - *Run the gate as part of implementer completion.* Rejected: implementer is an agent step;
    embedding deterministic git/test orchestration there is the wrong layer.

### D3: Isolated base/candidate execution lives behind RuntimeStrategy ports; gate decision logic is pure

Add two methods to `RuntimeStrategy`, optional on the port (so existing test fakes are
unaffected) and required on `RealRuntimeStrategy`:

- `listCommitChangedFiles(oid, cwd): Promise<ChangedFilesResult>` — files changed by commit
  `oid` relative to its first parent (local: `git diff --name-only <oid>^ <oid>`; managed:
  `unavailable`). Reuses the existing `ChangedFilesResult` discriminated union.
- `runTestsAtCommit(oid, testFiles, cwd, config): Promise<IsolatedTestResult>` — creates a
  detached isolated worktree at `oid` (`git worktree add --detach`), runs only `testFiles`
  through the resolved scoped test command, returns per-file pass/fail, then removes the
  worktree. Never throws — returns `{ kind: "ran"; results: {file, passed}[] }` or
  `{ kind: "unavailable"; reason }`. Managed: always `unavailable`.

The gate's decision logic (strategy selection, tamper compare, red→green judgement, hollow
detection, deferral) is a pure module that consumes these ports plus `digestArtifacts`.

- **Rationale**: Git-worktree lifecycle and subprocess spawning are runtime concerns already
  owned by `RuntimeStrategy`; keeping them behind the port makes the gate's judgement pure and
  unit-testable with a fake runtime (drive base-red/candidate-green, base-green hollow,
  candidate-red, and unavailable scenarios deterministically without real git). Optional on
  the port / required on `RealRuntimeStrategy` matches the `listWorktreeChanges` precedent:
  concrete runtimes cannot silently skip; test fakes may omit and thereby defer.
- **Alternatives considered**:
  - *One fat `evaluateBiteEvidence(base, candidate)` port method.* Rejected: bakes the
    materialized-file selection policy into the runtime and gives coarser test seams.
  - *Gate spawns git/tests directly.* Rejected: couples domain logic to process/git I/O and
    breaks the ports-and-adapters boundary; not fakeable.

### D4: Strategy is selected from request.type; non-forward and non-isolable runtimes defer

Forward strategy applies iff `request.type ∈ {bug-fix, new-feature}`. Otherwise (spec-change,
refactoring, chore) the gate emits verdict `strategy-deferred`, generates no BiteEvidence, and
routes to `verification`. The gate also defers when it cannot isolate commits — the runtime
returns `unavailable` (managed runtime, or a fake that omits the ports) or the base/candidate
OID is absent. Assurance/profile values are never consulted.

- **Rationale**: ADR D2 fixes strategy = f(request.type). Deferral (not failure) for
  non-forward types and structurally non-isolable runtimes preserves existing behavior; managed
  runtime has no local worktree and already treats worktree-dependent capabilities as
  structural non-goals (`digestArtifacts` → null, `listWorktreeChanges` → empty). Local
  `RealRuntimeStrategy` implements the ports (required at compile time), so a production local
  forward job always enforces the gate — deferral cannot silently fail-open there.
- **Alternatives considered**:
  - *Fail closed on managed.* Rejected: breaks managed forward jobs for a structural
    limitation that the rest of the codebase treats as a non-goal.
  - *Derive strategy from profile/assurance.* Rejected by ADR D2.

### D5: Fail-closed conditions and the BiteEvidence record

Per materialized test file, the gate builds a `BiteEvidence` record:

```
{ testId: string, strategy: "forward",
  baseResult: "red" | "green", candidateResult: "red" | "green",
  verified: boolean }   // verified === (baseResult === "red" && candidateResult === "green")
```

`testId` is the materialized test file path (worktree-relative). The gate verdict is:
- `passed` — every record is `verified`.
- `failed` (fail-closed → escalate) — any test is a **hollow test** (`baseResult === "green"`,
  i.e. passes with no implementation), or a candidate stays **red**
  (`candidateResult === "red"`), or the tamper check fails (D6), or the forward strategy
  applies but no materialized test files are found.
- `strategy-deferred` / `error` per D4 / internal failure.

- **Rationale**: The tooth is exactly base-red→candidate-green executed at the recorded OIDs;
  any deviation means the test is not proving the implementation, so the honest outcome is a
  human escalation, not a silent pass or a fixer loop (no automated fix exists for a hollow
  test). Granularity is per materialized test **file**: the files added by the
  `test-materialize` commit are enumerated deterministically, so per-file red/green is a
  robust MVP tooth. Per-`TC-ID` name-filtered execution is a future refinement.
- **Alternatives considered**:
  - *Accept on candidate-green alone.* Rejected by ADR D3 (misses hollow tests passing at
    base).
  - *Route `failed` to a fixer.* Rejected: no deterministic fix; escalation is correct.

### D6: Tamper check compares the frozen test-cases.md hash from lineage against the current hash

At gate time, read the `test-case-gen` `LineageRecord` from the worktree's `events.jsonl`
(fold), extract the output hash for `test-cases.md` (the frozen scenario hash), and compare it
against the current `test-cases.md` hash computed via `digestArtifacts`. A **mismatch** →
`failed` (fail-closed: the scenario file was edited after the frozen boundary). If the frozen
hash is **absent** (lineage recording is best-effort and may be missing), the tamper check is
inconclusive and is **skipped** — the base/candidate tooth is still enforced.

- **Rationale**: The frozen hash already exists in `events.jsonl` lineage (behavior fixed in
  R3); reusing it avoids a new capture point. `digestArtifacts` produces the same
  `sha256:<hex>` format, so the comparison is apples-to-apples. Failing on a present mismatch
  satisfies the acceptance criterion; skipping on absence avoids false failures from a
  best-effort lineage gap while still enforcing the core tooth.
- **Alternatives considered**:
  - *Capture a durable frozen hash at test-case-gen into a dedicated state field.* Rejected
    for MVP: adds a capture point; the request designates lineage as the tamper basis.
  - *Fail closed when the frozen hash is absent.* Rejected: best-effort lineage gaps would
    block legitimate jobs (regression). The residual fail-open-on-missing-lineage is recorded
    as a Risk.

### D7: BiteEvidence is branch-borne via a top-level state field, reflected through the CLI-step result path

The gate's `run()` writes `bite-evidence-result.md` containing `## Verdict: <verdict>` and a
fenced JSON block of the records (plus a defer/fail reason). `parseResult` extracts the verdict
and the records, returning `ParsedStepResult.biteEvidence`. `deriveStepCompletion` carries it
into `StepCompletion.biteEvidence`, and `commitSuccess` reflects it into a new top-level
`state.biteEvidence: BiteEvidenceRecord[]`. `validateJobState` gets a lightweight validation
block for the field (following `reviewerStatuses`).

- **Rationale**: Mirrors the existing `pullRequest` reflection path for CLI steps — the only
  established mechanism for a CLI step to write structured branch-borne state. A top-level
  field round-trips through `state.json` (top-level fields are preserved by
  `stateToStateJson` / `validateJobState`), so it is resume-safe; it matches
  `reviewerStatuses` / `decisions`. The result file additionally provides the verdict source
  and a human-readable audit artifact committed to the branch.
- **Alternatives considered**:
  - *Committed result file only (no state field).* Rejected: harder to assert in unit tests
    and less useful to downstream R5 provenance; the state field is the idiomatic sink.
  - *New events.jsonl record type.* Rejected: heavier (new fold arm) than reusing the
    top-level-field + pullRequest-reflection pattern.

### D8: Materialized test files = base commit's changed files minus change-folder artifacts

Enumerate the materialized test files from the base OID via
`listCommitChangedFiles(baseOid, cwd)`, excluding paths under `specrunner/changes/` and
`.specrunner/` (the `git add -A` commit also stages `state.json` / `events.jsonl` /
`test-cases.md`). The remainder is the set of test files `test-materialize` wrote. Both base
and candidate runs execute only this set.

- **Rationale**: `test-materialize` writes only test files; the non-meta files in its commit
  are the materialized tests. Restricting execution to this set satisfies the cost constraint
  (no full-suite double run) and defines "which tests to run" deterministically without
  parsing TC-IDs.
- **Alternatives considered**:
  - *Run the whole suite twice.* Rejected by ADR (cost explosion).
  - *Map TC-IDs from test-cases.md to files.* Deferred: the base-commit diff already yields
    the exact materialized files; TC-ID name-filtering is a later refinement.

## Risks / Trade-offs

- [Risk] **Inserting a node between implementer and verification changes the transition
  table.** → Mitigation: only `STANDARD_DESCRIPTOR` is touched; the retargeted edge plus four
  new rows are additive. `composeReviewerDescriptor` tests filter by specific step names
  (unaffected). Any full-run test with a non-forward type sees `strategy-deferred` passthrough;
  any full-run test whose fake runtime omits the new ports also defers — behavior preserved.
- [Risk] **`commitOid` must be journaled or resume loses it.** → Mitigation: the field is
  threaded through `StepAttemptRecord` + `stepRunToRecord` + `fold`, with an explicit
  persist→reload round-trip test.
- [Risk] **Best-effort lineage may lack the frozen hash, so the tamper check can be
  inconclusive (fail-open on tamper when lineage is missing).** → Mitigation: the base/candidate
  tooth is still enforced when the tamper check is skipped; hardening frozen-hash durability is
  R4-follow-up / R5. Documented in D6.
- [Risk] **Per-file granularity can mask a hollow sub-case** (a file that is red at base for
  one case but contains another case that passes at base). → Mitigation: acceptable MVP tooth;
  per-TC-ID execution is a documented future refinement (D5/D8).
- [Risk] **Scoped test-command resolution is framework-dependent.** → Mitigation: encapsulated
  entirely inside `runTestsAtCommit` (LocalRuntime) with per-file arguments; the gate logic is
  independent of the command shape. See Open Questions.
- [Risk] **Isolated worktrees leak on crash.** → Mitigation: `runTestsAtCommit` removes the
  worktree in a finally-style cleanup and never throws (returns `unavailable`); a temp path is
  used per run.

## Open Questions

- **Scoped test-command resolution.** `runTestsAtCommit` must invoke only the given test files.
  The MVP resolves the project test command and appends the file paths (most runners —
  vitest/jest/bun/pytest — accept file positionals). If a project's test script cannot take
  file arguments, the run should return `unavailable` (defer) rather than run the full suite.
  Whether to introduce an explicit `tests.command` template (with a `{files}` placeholder) is
  left to the implementer to decide within `runTestsAtCommit`; it must not run the full suite.
- **Accumulation vs. replacement of `state.biteEvidence` across implementer re-loops.** MVP
  replaces with the latest gate run's records. Whether to accumulate keyed by
  `testId + candidateOid` is deferred.

## Migration Plan

All new fields are optional and additive:
- `StepRun.commitOid?`, `StepAttemptRecord.commitOid?`, `StepResultInput.commitOid?`,
  `StepExecutionResult(success).commitOid?`, `ParsedStepResult.biteEvidence?`,
  `StepCompletion.biteEvidence?`, `JobState.biteEvidence?`. Legacy state files (absent fields)
  load unchanged; `fold` treats absent `commitOid` as `undefined`.
- New `RuntimeStrategy` methods are optional on the port (existing fakes unaffected) and
  required on `RealRuntimeStrategy` (LocalRuntime + ManagedRuntime implement them).
- The new `bite-evidence` step is added to the standard pipeline only. No rollback data
  migration is required; removing the step would only require reverting the descriptor edits.
