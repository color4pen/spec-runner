# Spec: verification-surface-skipped-tests

## Requirements

### Requirement: Verification SHALL detect and record skipped tests from the test phase output

In the phase fallback path, the verification runner SHALL best-effort detect the
number of skipped/pending tests reported by the `test` phase output and record
that count on the `test` phase's result. Detection MUST be non-blocking: it MUST
NOT throw, MUST NOT halt the run, and MUST tolerate undetected skips.

#### Scenario: test phase reports skipped tests

**Given** the phase fallback path runs and the `test` script exits 0
**And** its output contains `1 passed | 2 skipped`
**When** verification completes
**Then** the `test` phase result records a skipped count of 2
**And** `verification-result.md` surfaces that a skip was detected

#### Scenario: test phase reports pending tests under a different keyword

**Given** the `test` script exits 0
**And** its output contains `5 passing` and `1 pending`
**When** verification completes
**Then** the `test` phase result records a skipped count of 1

#### Scenario: a summary line carries multiple skip categories

**Given** the `test` script exits 0
**And** its output contains `5 passed | 2 skipped | 1 todo`
**When** verification completes
**Then** the `test` phase result records a skipped count of 3

### Requirement: Verification SHALL distinguish a passed-with-skips result from a clean pass

When skipped tests are detected in the `test` phase, `verification-result.md`
MUST carry a passed-with-skips annotation that is distinguishable from a clean
pass. When no skipped tests are detected, the result MUST remain a clean pass
with no such annotation.

#### Scenario: skips detected → annotation present

**Given** the `test` phase output reports `2 skipped` and the verdict is passed
**When** `verification-result.md` is written
**Then** it contains a passed-with-skips annotation reporting the count
**And** the annotation is placed so downstream readers and humans can see it

#### Scenario: no skips detected → clean pass unchanged

**Given** every test ran and the `test` phase output reports no skip/pending/todo count
**When** `verification-result.md` is written
**Then** it contains no skip annotation and remains a clean pass

### Requirement: Skip detection MUST NOT change the exit-code-based verdict

The pass/fail verdict SHALL be determined solely by phase exit codes and the
existing all-skipped / any-failed logic. A detected skip count MUST NOT alter the
verdict in either direction.

#### Scenario: passing test phase with skips stays passed

**Given** all phases exit 0 and the `test` phase output reports `2 skipped`
**When** verification computes the verdict
**Then** the verdict is `passed`

#### Scenario: failing test phase with skips stays failed

**Given** the `test` phase exits non-zero and its output reports `2 skipped`
**When** verification computes the verdict
**Then** the verdict is `failed`

### Requirement: The existing no-runnable-phases behavior SHALL be unchanged

Skip detection MUST NOT affect the `VERIFICATION_NO_RUNNABLE_PHASES` outcome that
occurs when every phase is skipped.

#### Scenario: all phases skipped remains a no-runnable-phases failure

**Given** no runnable scripts exist so every phase is skipped
**When** verification runs
**Then** the verdict is `failed` with errorCode `VERIFICATION_NO_RUNNABLE_PHASES`
**And** no skip annotation is added

### Requirement: Skip detection SHALL be scoped to the phase fallback path

Skip detection SHALL apply only to the phase fallback path's `test` phase. The
`verification.commands` path MUST be unaffected and MUST NOT gain a skip
annotation.

#### Scenario: commands path is unaffected

**Given** `verification.commands` is configured and its commands exit 0
**When** verification runs via the commands path
**Then** `verification-result.md` contains no skip annotation
