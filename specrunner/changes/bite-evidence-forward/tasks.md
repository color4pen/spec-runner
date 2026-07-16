# Tasks: base/candidate OID capture and forward-strategy BiteEvidence gate

<!--
Design reference: design.md (D1–D8). Spec reference: spec.md.
Order: OID capture (T-01..T-03) → runtime ports (T-04) → gate types/step/wiring
(T-05..T-08) → tamper (T-09) → tests (T-10) → verify (T-11).
All new fields/methods are optional/additive (see design Migration Plan).
-->

## T-01: Add `commitOid` to the step-run schema and journal round-trip

- [ ] Add optional `commitOid?: string` to `StepRun` (`src/state/schema/types.ts`, the
      interface starting at line 172) with a doc comment: the node's commit OID captured after
      `finalizeStepArtifacts`.
- [ ] Add optional `commitOid?: string` to `StepResultInput`
      (`src/state/helpers.ts`) and write it into the constructed `StepRun` in `pushStepResult`
      (spread only when defined, matching the existing `modelUsage` pattern).
- [ ] Add optional top-level `commitOid?: string` to `StepAttemptRecord`
      (`src/store/event-journal.ts`); write it in `stepRunToRecord` (spread when defined) and
      read it back in `fold` when reconstructing each `StepRun` (spread when defined).

**Acceptance Criteria**:
- `commitOid` is present on `StepRun` and `StepAttemptRecord`; absent legacy records fold to
  `undefined` (no throw).
- A StepRun with `commitOid` round-trips through `stepRunToRecord` → `fold` unchanged.

## T-02: Capture the commit OID in the executor and thread it into the success result

- [ ] Add optional `commitOid?: string` to the `kind: "success"` arm of `StepExecutionResult`
      (`src/core/step/commit-orchestrator.ts`).
- [ ] In `runAgentStep` (`src/core/step/executor.ts`), immediately after the
      `finalizeStepArtifacts` block completes (after `await myFinalize`, ~line 446), capture
      `deps.runtimeStrategy ? await deps.runtimeStrategy.captureHeadSha(cwd) : null` and include
      it as `commitOid` in the returned success result. Do not capture in the
      `roundOwnsGitEffects` branch.
- [ ] In `projectSuccess` (`commit-orchestrator.ts`), pass `commitOid: result.commitOid`
      through to `pushStepResult`.

**Acceptance Criteria**:
- After a sequential agent step commits, its recorded `StepRun.commitOid` equals the HEAD OID
  after that step's commit.
- Round (parallel reviewer) members do not set `commitOid`.

## T-03: Resolve base/candidate OIDs from state

- [ ] Add a pure helper (e.g. `resolveBaseCandidateOids(state)` in a new
      `src/core/step/bite-evidence/oids.ts` or a shared step helper) returning
      `{ baseOid: string | null; candidateOid: string | null }` from the latest
      `test-materialize` run's `commitOid` (base) and the latest `implementer` run's
      `commitOid` (candidate). Use `STEP_NAMES.TEST_MATERIALIZE` / `STEP_NAMES.IMPLEMENTER`.

**Acceptance Criteria**:
- Returns the latest run's OID per step; returns `null` for a step with no runs or no
  `commitOid`.

## T-04: Add isolated-execution RuntimeStrategy ports and implementations

- [ ] Add two methods to `RuntimeStrategy` (`src/core/port/runtime-strategy.ts`), optional on
      the port and required on `RealRuntimeStrategy`:
  - `listCommitChangedFiles(oid: string, cwd: string): Promise<ChangedFilesResult>` — files
    changed by commit `oid` vs its first parent.
  - `runTestsAtCommit(oid: string, testFiles: string[], cwd: string, config: SpecRunnerConfig):
    Promise<IsolatedTestResult>` where
    `IsolatedTestResult = { kind: "ran"; results: { file: string; passed: boolean }[] } |
    { kind: "unavailable"; reason: string }`. Define `IsolatedTestResult` as a port DTO.
- [ ] LocalRuntime (`src/core/runtime/local.ts`):
  - `listCommitChangedFiles`: `git diff --name-only <oid>^ <oid>`; exit 0 → success (paths),
    non-zero / spawn error → `unavailable`. Never throws.
  - `runTestsAtCommit`: create a detached isolated worktree at `oid`
    (`git worktree add --detach <tmp> <oid>`), run only `testFiles` through the resolved scoped
    test command (per-file arguments; MUST NOT run the full suite — return `unavailable` if the
    resolved command cannot be scoped to files), collect per-file pass/fail, then remove the
    worktree in a finally-style cleanup. Never throws — return `unavailable` on any failure.
- [ ] ManagedRuntime: both methods return `unavailable` (structural: no local worktree).

**Acceptance Criteria**:
- The two methods exist on `RealRuntimeStrategy` (compile-time enforced); managed returns
  `unavailable`.
- `runTestsAtCommit` executes only the provided `testFiles` and removes the isolated worktree;
  it never throws.

## T-05: Add BiteEvidence types and the branch-borne state field

- [ ] Define `BiteEvidenceRecord = { testId: string; strategy: "forward";
      baseResult: "red" | "green"; candidateResult: "red" | "green"; verified: boolean }`
      (e.g. `src/state/schema/types.ts` or a `bite-evidence` module re-exported from schema).
- [ ] Add optional top-level `biteEvidence?: BiteEvidenceRecord[]` to `JobState`.
- [ ] Add a lightweight validation block for `biteEvidence` in `validateJobState`
      (`src/state/schema/operations.ts`), following the `reviewerStatuses` precedent
      (array-of-objects with the expected string/boolean fields; absence is OK).

**Acceptance Criteria**:
- `JobState.biteEvidence` round-trips through `state.json` (present → preserved; absent →
  undefined; legacy files load unchanged).
- `validateJobState` accepts absent/valid `biteEvidence` and rejects a non-array value.

## T-06: Implement the bite-evidence gate decision logic (pure module)

- [ ] Implement a pure gate module (e.g. `src/core/step/bite-evidence/gate.ts`) that, given
      `state`, `deps` (runtimeStrategy, cwd, slug, config), the resolved base/candidate OIDs,
      and the tamper result (T-09), produces `{ verdict: "passed" | "failed" |
      "strategy-deferred"; records: BiteEvidenceRecord[]; reason?: string }`:
  - Non-forward `request.type` (not in `{bug-fix, new-feature}`) → `strategy-deferred`, no
    records.
  - Base or candidate OID absent, or `listCommitChangedFiles` / `runTestsAtCommit` returns
    `unavailable` → `strategy-deferred`, no records (reason records the cause).
  - Tamper mismatch (T-09) → `failed`, no records (reason: tampered).
  - Materialized test files (D8: base-commit changed files minus `specrunner/changes/` and
    `.specrunner/`) empty for a forward job → `failed` (reason: no materialized tests).
  - Otherwise run the materialized files at base and candidate; build one record per file
    (`baseResult` red iff failed, `candidateResult` green iff passed; `verified` iff
    base-red & candidate-green); `passed` iff all verified, else `failed`.

**Acceptance Criteria**:
- Returns `passed` + verified records for base-red→candidate-green.
- Returns `failed` for any base-green (hollow) or candidate-red record.
- Returns `strategy-deferred` with no records for non-forward types and unavailable runtimes.
- Executes only the materialized test files (asserted via the fake runtime's recorded calls).

## T-07: Add the bite-evidence CLI step and wire it into the standard pipeline

- [ ] Register `BITE_EVIDENCE: "bite-evidence"` in `STEP_NAMES` and add `"bite-evidence"` to
      `CLI_STEP_NAMES` (`src/kernel/step-names.ts`).
- [ ] Add `biteEvidenceResultPath(slug)` to `src/util/paths.ts`
      (`specrunner/changes/<slug>/bite-evidence-result.md`).
- [ ] Implement `BiteEvidenceStep: CliStep` (`src/core/step/bite-evidence/step.ts` or
      `src/core/step/bite-evidence.ts`):
  - `run()`: resolve OIDs (T-03), run the tamper check (T-09) and the gate logic (T-06), and
    write `bite-evidence-result.md` with `## Verdict: <passed|failed|strategy-deferred>` and a
    fenced JSON block of the records (+ reason). MUST NOT throw for expected fail-closed
    outcomes (they are encoded as the `failed` verdict).
  - `reads()`: `test-cases.md` (+ gitState) as required inputs; `writes()`:
    `biteEvidenceResultPath`.
  - `resultFilePath()` / `parseResult()`: parse the verdict and the records JSON;
    `parseResult` returns `{ verdict, findingsPath, biteEvidence }`.
- [ ] Wire into `STANDARD_DESCRIPTOR` (`src/core/pipeline/registry.ts`): add
      `[STEP_NAMES.BITE_EVIDENCE, BiteEvidenceStep]` between `TEST_MATERIALIZE`/`IMPLEMENTER`
      and `VERIFICATION`, and add `roles[BITE_EVIDENCE] = { role: "gate", phase: "impl" }`.
      Update the "14-step" comment to reflect the new count. Do NOT modify `FAST_DESCRIPTOR`.
- [ ] Update `STANDARD_TRANSITIONS` (`src/core/pipeline/types.ts`): retarget
      `{ IMPLEMENTER, success → BITE_EVIDENCE }`; add `{ BITE_EVIDENCE, passed → VERIFICATION }`,
      `{ BITE_EVIDENCE, "strategy-deferred" → VERIFICATION }`,
      `{ BITE_EVIDENCE, failed → escalate }`, `{ BITE_EVIDENCE, error → escalate }`.

**Acceptance Criteria**:
- The standard pipeline runs `implementer → bite-evidence → verification`; the fast pipeline is
  unchanged.
- Descriptor validation accepts `bite-evidence` (whitelisted CLI step name).
- `parseResult` maps the result file's verdict line to `passed` / `failed` /
  `strategy-deferred`.

## T-08: Reflect BiteEvidence records into branch-borne state

- [ ] Add optional `biteEvidence?: BiteEvidenceRecord[]` to `ParsedStepResult`
      (`src/core/port/step-types.ts`) and to `StepCompletion`
      (`src/core/step/step-completion.ts`); carry `parsed?.biteEvidence` into the returned
      `StepCompletion` (mirroring `pullRequest`).
- [ ] In `commitSuccess` (`src/core/step/commit-orchestrator.ts`), when
      `completion.biteEvidence` is present, reflect it into `state.biteEvidence` (mirroring the
      `completion.pullRequest` reflection).

**Acceptance Criteria**:
- After a forward-strategy gate run, `state.biteEvidence` holds the gate's records and survives
  persist/reload.
- A `strategy-deferred` run does not populate `state.biteEvidence`.

## T-09: Implement the tamper (frozen-hash) check

- [ ] Add a helper (e.g. `src/core/step/bite-evidence/tamper.ts`) that reads the worktree's
      `events.jsonl` (under `changeFolderPath(slug)` within `cwd`), folds it, and extracts the
      `test-case-gen` lineage output hash for `test-cases.md` (the frozen hash). Compute the
      current hash via `deps.runtimeStrategy.digestArtifacts([{ path: <test-cases.md> }], cwd,
      branch)`. Return `{ status: "match" | "mismatch" | "inconclusive" }`: `mismatch` when both
      present and differ; `inconclusive` when the frozen hash is absent; `match` otherwise.
- [ ] The gate (T-06) treats `mismatch` → `failed`; `inconclusive` → proceed with the tooth.

**Acceptance Criteria**:
- Present-and-different hashes → `mismatch` → gate `failed`.
- Absent frozen hash → `inconclusive` → gate still evaluates base/candidate.

## T-10: Tests

- [ ] OID capture + resume: a StepRun with `commitOid` persists and reloads unchanged; base OID
      = latest test-materialize `commitOid`, candidate OID = latest implementer `commitOid`
      (via `stepRunToRecord`/`fold` and `resolveBaseCandidateOids`).
- [ ] Forward pass: fake runtime returns base-fail/candidate-pass → gate `passed`, records with
      `verified: true`, `state.biteEvidence` populated, transition to verification.
- [ ] Hollow rejection: fake runtime returns base-pass for a test → gate `failed`
      (`baseResult: "green"`, `verified: false`), escalate.
- [ ] Candidate-red rejection: base-fail/candidate-fail → gate `failed`.
- [ ] Tamper rejection: fixture `events.jsonl` frozen hash differs from current → gate `failed`.
- [ ] Non-forward defer: `refactoring`/`chore` type → gate `strategy-deferred`, no records, no
      `state.biteEvidence`, transition to verification.
- [ ] Scoped execution: assert the fake runtime's `runTestsAtCommit` was called only with the
      materialized test files (excluding `specrunner/changes/**`) and not with a full-suite
      command.
- [ ] Behavior preservation: standard-pipeline transition wiring for `bite-evidence` exists;
      fast pipeline is unchanged; a runtime fake that omits the new ports defers (no
      regression).

**Acceptance Criteria**:
- Every acceptance criterion in the request maps to at least one passing test.
- Existing pipeline / verification / attach / R3 behavior-preservation tests pass without
  modification.

## T-11: Verify

- [ ] `bun run typecheck` passes.
- [ ] `bun run test` passes.

**Acceptance Criteria**:
- `typecheck && test` are green.
