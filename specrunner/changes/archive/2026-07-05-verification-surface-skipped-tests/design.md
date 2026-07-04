# Design: verification-surface-skipped-tests

## Context

The verification step's phase fallback path (`src/core/verification/runner.ts`,
`runVerificationPhases`) runs the target project's `test` package.json script via
`spawnScript`, captures `exitCode` / `stdout` / `stderr`, and sets
`status = exitCode === 0 ? "passed" : "failed"`. The skip count reported by the
test runner is neither read nor recorded.

When a test suite is designed to silently skip integration tests in the absence
of a service dependency (e.g. `describe.skipIf(!hasDb)`), a verification
environment without that dependency exits `0` and is reported as `passed` even
though core behavior (DB constraints, auth, posting, …) was never exercised — a
false green. `typecheck && test` is formally satisfied, but the `passed` verdict
over-attests: it silently equates "all tests ran and passed" with "the runnable
subset passed". Downstream `code-review` may or may not notice, and verification
records nothing about how much was skipped.

Current related behavior:

- `PhaseResult` holds `stdout` but has no skip field; nothing in the runner
  reads skip counts.
- `runner.ts:320-333` (`allSkipped`) fails the run with
  `VERIFICATION_NO_RUNNABLE_PHASES` only when **every phase** is skipped. A
  **partial skip inside the test phase** is invisible.
- `writeVerificationResult` renders a Verdict heading, a Phase Results table, and
  a `## Phase: <name>` section per phase. `extractVerificationFailures`
  (parse-result.ts) parses the table by a positional regex; `body-template.ts`
  links the result file into the PR body.

This change makes skips **visible** so the quality of a `passed` verdict becomes
verifiable. It does **not** change how pass/fail is decided.

## Goals / Non-Goals

**Goals**:

- Best-effort detect the number of skipped tests from the test phase output and
  record it on that phase's result.
- Surface the detected count in `verification-result.md` such that a
  "passed with skips" outcome is distinguishable from a clean pass, for
  downstream consumers (code-review / conformance) and humans.
- Keep the pass/fail verdict determined solely by exit codes — additive surface
  only.

**Non-Goals**:

- Provisioning service dependencies (DB containers, service lifecycle). Out of
  scope by the minimal-deps principle; users can express setup in
  `verification.commands` (e.g. `docker compose up -d db && …`).
- Hard-fail / verdict downgrade on detected skips. A platform-legitimate skip
  must not be mis-blocked; this change surfaces only.
- Skip detection on the `verification.commands` path — this change targets the
  phase fallback path only (commands path is future work).
- Forcing a specific test-runner JSON reporter (invasive; breaks language
  independence).

## Decisions

### D1: Detect skips via a framework-agnostic regex, recorded on `PhaseResult`

Detect skips by scanning the test phase output with a framework-independent
pattern (`/(\d+)\s+(skipped|pending|todo)\b/gi`) and store the resulting count on
a new optional `PhaseResult.skippedCount` field. Detection lives in a small,
independently unit-testable helper (`src/core/verification/skip-detect.ts`),
mirroring how `test-coverage.ts` isolates its pure logic.

- **Rationale**: A regex over human-readable summary lines works across vitest
  (`2 skipped`), jest (`2 skipped`), mocha (`1 pending`), pytest (`2 skipped`),
  etc., with zero dependency on any runner's machine format. An optional field
  is backward compatible with all existing `PhaseResult` consumers.
- **Alternatives considered**: Requiring a JSON reporter (rejected: invasive,
  couples verification to a specific runner, breaks language independence — also
  an explicit request non-goal). Parsing per-runner formats (rejected:
  unbounded maintenance, defeats framework independence).

### D2: Scan the combined test phase output (stdout + stderr), not stdout alone

Feed the detector the same combined `stdout + stderr` text that already gets
rendered into the result's code block, rather than stdout only.

- **Rationale**: The stated goal is *framework-independent* best-effort
  detection. Several widely-used runners (notably **jest**) print their result
  summary to **stderr**, so a stdout-only scan would silently miss them —
  undermining the goal. Combined output maximizes coverage and is consistent
  with what is already surfaced in the result file. This is a refinement of the
  request's illustrative "stdout" wording, not a scope change: detection remains
  best-effort and non-blocking either way.
- **Alternatives considered**: stdout-only, matching the request's literal
  phrasing (rejected: silently misses jest-family runners, contradicting the
  framework-independence goal). *Flagged for spec-review to confirm.*

### D3: Aggregate detected counts by summing all pattern matches

`detectSkippedTests` sums the numeric group of every match in the scanned text
and returns `0` when there are none.

- **Rationale**: A single summary line legitimately carries multiple skip
  categories (e.g. `5 passed | 2 skipped | 1 todo`), which must sum to `3`.
  Summing captures this directly.
- **Alternatives considered**: max / last-match (rejected: undercounts
  multi-category summaries). Accepted residual risk: a runner that echoes its
  summary twice would double-count — rare, and tolerable for a best-effort,
  non-blocking signal (see Risks).

### D4: Scope detection to the phase fallback path's `test` phase only

Detection runs only for the phase whose name is `test` in `runVerificationPhases`.
The commands path (`runVerificationCommands`) and every other phase
(build / typecheck / lint / security / test-coverage) are untouched.

- **Rationale**: Matches the request scope exactly. Limiting to the `test` phase
  avoids false positives from unrelated phases (e.g. a lint tool printing
  "N skipped"). The commands path has no notion of a "test" phase and is
  explicitly deferred.
- **Alternatives considered**: Scanning every phase (rejected: false-positive
  surface, out of scope). Detecting on the commands path now (rejected:
  explicit request non-goal).

### D5: Surface as an annotation under the Verdict heading; leave the table unchanged

When the verdict is `passed` and the `test` phase's `skippedCount > 0`,
`writeVerificationResult` emits an annotation line directly under the
`## Verdict:` heading (a "passed-with-skips" / warning note carrying the count).
The existing Phase Results table header and columns are left **unchanged**. When
the verdict is `passed` and no skip is detected, no annotation is written.

The annotation is scoped to a **passed** verdict: its purpose is to qualify a
green result (a false green where a `passed` over-attests). On a `failed`
verdict the run already surfaces the failure directly, so the "passed-with-skips"
note would be self-contradictory and adds no signal — it is therefore suppressed.
This is display gating (verdict → whether the note is shown) and is distinct from
D6: the skip count still never influences the verdict itself. `skippedCount` is
recorded on the `test` `PhaseResult` regardless of pass/fail (D6); only the
surfaced annotation is gated on passed.

- **Rationale**: The annotation is the most visible surface (top of file, and
  it flows into the PR body link that downstream reads). Keeping the table
  header intact preserves the positional `extractVerificationFailures` regex and
  keeps existing structure assertions (e.g. the `| # | Phase | Status |
  Duration | Exit Code |` header check) green. Omitting the annotation on a
  clean pass keeps clean passes byte-identical to today. Gating on a passed
  verdict keeps the annotation wording accurate and matches the spec's
  annotation scenario ("the verdict is passed").
- **Alternatives considered**: Adding a "Skipped" column to the Phase Results
  table (rejected: risks the positional parser and breaks existing table-shape
  tests). A separate top-level section (acceptable, but a verdict-adjacent note
  is more prominent and cheaper).

### D6: The verdict is never a function of skip count

`skippedCount` is purely additive metadata. The verdict continues to be computed
from exit codes and the existing `allSkipped` / `anyFailed` logic, byte-for-byte.

- **Rationale**: This is the invariant that keeps the change non-blocking and
  prevents mis-blocking platform-legitimate skips (an explicit non-goal of
  hard-fail). Verdict logic is not touched.

## Risks / Trade-offs

- [Risk] Regex false negatives (a runner whose skip wording isn't matched) →
  a skip goes unrecorded. **Mitigation**: Best-effort by design; detection never
  affects the verdict, so a miss degrades gracefully to today's behavior.
- [Risk] Regex false positives (a digit-plus-keyword string in test output that
  isn't a skip summary) → an over-reported count. **Mitigation**: Non-blocking;
  the annotation is advisory and never changes pass/fail. Scoping to the `test`
  phase (D4) limits exposure.
- [Risk] Repeated summary lines double-count (D3). **Mitigation**: Accepted as
  rare; the number is advisory, not a gate.
- [Trade-off] Combined stdout+stderr scanning (D2) slightly widens the input
  vs. the request's literal "stdout", chosen to actually achieve
  framework-independence. Called out explicitly for spec-review.

## Open Questions

- Should the commands path gain equivalent skip detection later? (Deferred by
  scope; noted for a future request.)
- Should a future iteration let projects opt into gating on skip count (e.g. a
  configurable threshold)? Explicitly out of scope now; this change stays at
  visibility.
