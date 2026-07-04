# Tasks: verification-surface-skipped-tests

## T-01: Add the skip-detection helper

- [x] Create `src/core/verification/skip-detect.ts`.
- [x] Export `detectSkippedTests(output: string): number`.
- [x] Scan `output` with a framework-agnostic, case-insensitive, global regex:
      `/(\d+)\s+(skipped|pending|todo)\b/gi`.
- [x] Sum the first capture group (the number) across all matches and return the
      total. Return `0` when there are no matches.
- [x] Pure function: no I/O, no `bun:*` / `Bun.*`, `node:*` only if anything is
      needed (nothing should be).
- [x] File-level doc comment: this is a best-effort, non-blocking detector whose
      result never affects the verification verdict.

**Acceptance Criteria**:
- `detectSkippedTests("Tests  1 passed | 2 skipped (3)")` → `2`.
- `detectSkippedTests("Tests: 2 skipped, 5 passed, 7 total")` → `2`.
- `detectSkippedTests("5 passing\n1 pending")` → `1`.
- `detectSkippedTests("3 todo")` → `3`.
- `detectSkippedTests("5 passed | 2 skipped | 1 todo")` → `3` (summed).
- `detectSkippedTests("SKIPPED: 4 skipped")` case-insensitive → `4`.
- `detectSkippedTests("all green, 0 skipped")` → `0`.
- `detectSkippedTests("42 tests passed")` (no skip keyword) → `0`.
- `detectSkippedTests("")` → `0`.

## T-02: Add `skippedCount` to `PhaseResult`

- [x] In `src/core/verification/runner.ts`, add an optional field to the
      `PhaseResult` interface: `skippedCount?: number`.
- [x] Doc-comment it as: best-effort count of skipped tests detected in this
      phase's output; present only for the `test` phase in the phase fallback
      path; absent/omitted when not applicable. Never affects the verdict.
- [x] Do not change any other `PhaseResult` field. The field is optional so all
      existing `PhaseResult` constructions and consumers remain valid unchanged.

**Acceptance Criteria**:
- `PhaseResult` compiles with the new optional field.
- No existing `PhaseResult` construction (commands path, integrity failure,
  script phases, test-coverage phase, skipped phases) requires modification to
  compile.

## T-03: Populate `skippedCount` for the test phase in the phase fallback path

- [x] In `runVerificationPhases` (`src/core/verification/runner.ts`), after a
      script phase has run and its `status` computed, when `phaseName === "test"`
      compute the skip count from the phase's combined output
      (`[stdout, stderr].filter(Boolean).join("\n")`) using
      `detectSkippedTests`, and set `skippedCount` on that phase's `PhaseResult`
      when the count is `> 0`.
- [x] Detection MUST run regardless of the test phase's pass/fail status, but
      MUST NOT run for a skipped test phase (no script) — a skipped phase has no
      output and stays as-is.
- [x] Do NOT modify the verdict computation (`allSkipped` / `anyFailed` /
      `errorCode`). It stays byte-for-byte identical.
- [x] Do NOT add detection to `runVerificationCommands` (commands path is out of
      scope) or to any phase other than `test`.

**Acceptance Criteria**:
- When the `test` script exits 0 and its combined output contains `2 skipped`,
  the returned result's `test` phase has `skippedCount === 2`.
- When the `test` script exits non-zero and its output contains `2 skipped`, the
  verdict is still `failed` and the `test` phase still records `skippedCount === 2`.
- When the `test` output contains no skip keyword, the `test` phase's
  `skippedCount` is `undefined`.
- The commands path result never carries `skippedCount`.

## T-04: Surface the skip annotation in `verification-result.md`

- [x] In `writeVerificationResult` (`src/core/verification/runner.ts`), after the
      `## Verdict: <verdict>` heading and its trailing blank line (and before the
      existing `errorCode` block), when **the verdict is `passed`** AND the `test`
      phase has `skippedCount > 0`, emit a single blockquote annotation line
      (plain text, no emoji), e.g.:
      `> Note — passed with skips: N test(s) reported skipped/pending in the \`test\` phase output (best-effort detection). A "passed" verdict does not attest that skipped tests were exercised. See \`## Phase: test\`.`
      followed by a blank line. Use the actual detected count for `N`.
- [x] Gate the annotation on a `passed` verdict. The annotation's purpose is to
      qualify a *passed* result (a false green). When the verdict is `failed`, the
      failure is already surfaced directly, so no annotation is written even if
      `skippedCount > 0`. This is display gating (verdict → annotation), which does
      not couple the verdict to the skip count (D6 is unaffected: skip count still
      never influences the verdict). Matches spec.md's annotation scenario, which
      is scoped to "the verdict is passed".
- [x] When the verdict is `passed` and no `test` phase `skippedCount > 0` exists,
      write nothing extra — the output stays byte-identical to today's clean-pass
      output.
- [x] Do NOT change the `## Verdict:` heading line itself, the Phase Results
      table header (`| # | Phase | Status | Duration | Exit Code |`), the table
      columns, or the per-phase `## Phase:` section structure. The annotation is
      an added line only.

**Acceptance Criteria**:
- With a `passed` verdict and a `test` phase `skippedCount` of 2, the written
  `verification-result.md` contains the annotation text including the number `2`.
- With a `failed` verdict, no passed-with-skips annotation is written even when the
  `test` phase `skippedCount > 0`.
- With no detected skips, `verification-result.md` contains no annotation and the
  clean-pass structure is unchanged.
- The Phase Results table header string
  `| # | Phase | Status | Duration | Exit Code |` is still present unchanged.
- `## Verdict: passed` / `## Verdict: failed` still match `/^## Verdict: (passed|failed)$/m`.

## T-05: Unit tests for the skip detector

- [x] Create `tests/unit/core/verification/skip-detect.test.ts`.
- [x] Cover every case listed in T-01's Acceptance Criteria (vitest, jest, mocha,
      pytest-style summaries; multi-category summing; case-insensitivity;
      `0 skipped`; no-keyword; empty string).
- [x] Give each test a TC ID in its name/comment (e.g. `it("TC-01: ...")`) so the
      verification test-coverage phase can grep it.

**Acceptance Criteria**:
- `bun run test` passes for the new file with all listed cases green.

## T-06: Unit tests for runner integration and surfacing

- [x] Extend `tests/unit/core/verification/runner.test.ts` (or add a sibling test
      file) following its existing mock conventions (`vi.mock("node:child_process")`,
      `makeMockChild`, `runTestCoveragePhase` mock).
- [x] Add cases mapped to the acceptance criteria:
  - Test phase exit 0 with `2 skipped` in stdout → verdict `passed`, `test`
    phase `skippedCount === 2`, and `verification-result.md` contains the
    passed-with-skips annotation with `2`.
  - Test phase exit 0 with no skip keyword → verdict `passed`, `test` phase
    `skippedCount` undefined, and `verification-result.md` contains no
    annotation (clean pass).
  - Test phase exit non-zero with `2 skipped` in output → verdict `failed`
    (exit-code decided), `skippedCount === 2` still recorded, and
    `verification-result.md` contains NO passed-with-skips annotation (annotation
    is gated on a passed verdict).
  - Skip appearing in `stderr` (not stdout) is detected (locks the combined
    stdout+stderr decision, D2).
- [x] Do NOT modify existing test cases (TC-005..TC-042). They must stay green
      unchanged.

**Acceptance Criteria**:
- All new cases green; all pre-existing verification runner tests remain green
  without edits.

## T-07: Guard the commands path and no-runnable-phases invariants

- [x] Add/confirm a test asserting the commands path result carries no
      `skippedCount` and `verification-result.md` from the commands path has no
      skip annotation (may extend `tests/unit/verification/runner-commands.test.ts`).
- [x] Confirm the existing `VERIFICATION_NO_RUNNABLE_PHASES` test (all phases
      skipped → failed) still passes unchanged and produces no skip annotation.

**Acceptance Criteria**:
- Commands-path tests green with no skip annotation/field.
- `VERIFICATION_NO_RUNNABLE_PHASES` behavior verified unchanged.
- `bun run typecheck && bun run test` is green.
