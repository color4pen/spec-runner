# Design: bite-evidence test-file selection predicate

## Context

The bite-evidence gate (forward strategy: `bug-fix` / `new-feature`) proves that the tests
materialized at the base commit are real (`base-red → candidate-green`) by running each
materialized test file individually in an isolated worktree. The archive floor
(`achieved-assurance`) reuses the same enumeration to (a) run base-red / HEAD-green checks and
(b) verify the materialized test files are blob-frozen between the base commit and the final
archive HEAD.

**The defect.** "Materialized test files" is currently derived by *pipeline-artifact exclusion
only* — there is no predicate that asks "is this a test file?". Every non-`specrunner/`,
non-`.specrunner/` path in the base commit is treated as a test file:

- Gate: `src/core/step/bite-evidence/gate.ts:154-157` filters `changedFilesResult.files` by
  `!isExcludedPath(f)` alone. `isExcludedPath` (`gate.ts:36-38`) only strips `specrunner/changes/`
  and `.specrunner/`. Fixture JSON, `package.json`, implementation helpers (`index.ts`), and
  other-language files (`.rs`) that happened to land in the test-materialize commit are each run
  through the per-file test runner. `bun test package.json` / `bun test foo.rs` exit non-zero at
  **both** base and candidate → `red → red` → the gate reports **`failed`** ("hollow test").
  Because the gate is an empirical re-measurement, resume reproduces the identical result — the
  job is deterministically unrecoverable. Observed on a 0.4.7 TypeScript + Rust project.
- Floor: `src/core/archive/achieved-assurance.ts:265` uses the identical `!isExcludedPath(f)`
  filter. When a non-test file is in the base commit, the legitimate implementation-phase edit of
  that file (base → finalHead) is caught by the blob-freeze diff
  (`achieved-assurance.ts:282`, `diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles)`)
  and mis-reported as **tamper**, leaving `biteEvidence` / `testDerivation` absent.

**A pre-existing doc/impl divergence rides along.** `gate.ts:13` already documents *"no test
files"* under the `strategy-deferred` verdict, but the implementation (`gate.ts:159-165`) returns
**`failed`** for the empty set, and the step comment `gate.ts:76` says *"No materialized test
files → failed"*. The empty-set case must become `strategy-deferred` — "cannot measure" is a
different outcome from "measured and did not bite".

### Verified current-code facts

- `isExcludedPath` and `FORWARD_TYPES` live in `gate.ts` and are imported only by
  `achieved-assurance.ts:21` (`import { isExcludedPath, FORWARD_TYPES }`). No test imports
  `isExcludedPath` directly. No `test-file-selection` module exists yet.
- `VerificationConfig` (`src/config/schema/types.ts:142-163`) declares `commands?`, `coverage?`,
  `scopedTestCommand?`. There is no `scopedTestPatterns`. The zod schema
  (`src/config/schema/validation.ts:264-299`) validates exactly those three keys; unknown keys are
  stripped by the object schema. `nonEmptyString` helper exists at `validation.ts:118`; the
  `array(nonEmptyString(...)).check(minLength(1, ...))` pattern is already used for
  `coverage.include` (`validation.ts:276-279`). Validation failures throw with `code:
  "CONFIG_INVALID"` via `throwFromFirstIssue` (`validation.ts:498-522`).
- `runTestsAtCommit` (`src/core/runtime/local.ts:1032`) executes per file: scoped path
  `sh -c '<scopedTestCommand> <file>'` (`~:1094`), default path `bun test <file>` (`~:1118`),
  bail (`unavailable`) when custom `verification.commands` are present without `scopedTestCommand`.
  This request does **not** touch `runTestsAtCommit`; it only changes *which files* are handed to it.
- Pipeline routing (verified via `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts:36-47`):
  `strategy-deferred → verification` (pass-through), `failed → escalation`. So moving the empty set
  from `failed` to `strategy-deferred` turns the polyglot dead-end into forward progress; whether a
  deferred bite is acceptable at archive remains governed by `minimumAssurance.biteEvidence`.
- Existing gate tests (`gate.test.ts`) and floor tests
  (`tests/unit/core/archive/*-provenance.test.ts`, `achieved-assurance-completeness-*.test.ts`)
  use test-named materialized files (`*.test.ts`, `tests/unit/foo.test.ts`), which match the
  default patterns below and therefore stay selected → remain green.

## Goals / Non-Goals

**Goals**:

- Introduce a single test-file selection predicate = *artifact-excluded* **AND**
  *test-pattern-matched*, shared by the gate and the floor via import structure (no duplication).
- Add config `verification.scopedTestPatterns?: string[]` (glob) with a safe zero-config default
  `["**/*.test.*", "**/*.spec.*", "**/*_test.*"]`, validated as a non-empty array of non-empty
  strings (violations → `CONFIG_INVALID`).
- Implement glob matching with a bounded, self-contained translator (no new runtime dependency).
- Change the empty-selection gate verdict from `failed` to `strategy-deferred`, and align the
  `gate.ts:76` comment with the already-correct `gate.ts:13` doc.
- Scope the floor's blob-freeze / tamper check to test files only, so implementation-phase edits of
  non-test files in the base commit are no longer mis-flagged as tamper.
- Document the field (default + purpose) in `docs/configuration.md`.

**Non-Goals**:

- Polyglot multi-runner execution (per-language `runTestsAtCommit`, cargo, etc.). Pattern-mismatch
  files are *excluded*; running non-JS tests is a future request.
- Changing `test-materialize`'s prompt / output contract (no agent-declared test-file manifest —
  rejected below).
- Changing the meaning or level of the `minimumAssurance` floor.
- Changing `runTestsAtCommit`'s execution model (isolation / per-file), or the `RuntimeStrategy`
  port signature.

## Decisions

### D1: Selection lives in a `runner ↔ config` declaration with a safe default

`verification.scopedTestPatterns?: string[]` sits next to `scopedTestCommand`. The shape of files
that a per-file runner can execute is a property of the runner the repo declares, so the repo is
the correct owner of the pattern set. The default `["**/*.test.*", "**/*.spec.*", "**/*_test.*"]`
keeps zero-config JS/TS repos working with no config.

- **Rationale**: mechanical, repo-declared derivation is auditable and can't be narrowed by an
  agent mid-job. Pairing patterns with the runner keeps the "what can be scoped-run" knowledge in
  one place.
- **Alternatives considered**:
  - *test-materialize declares a test-file manifest the gate consumes* — **rejected**: the agent's
    self-report becomes the gate's own input; narrowing the manifest silently bypasses the check
    (fail-open). Mechanical pattern derivation is strictly more trustworthy.
  - *Hard-coded patterns, no config* — **rejected**: naming conventions differ per repo; polyglot /
    non-standard repos re-hit the defect with no escape hatch.

### D2: One shared predicate module, imported by both consumers

Create `src/core/step/bite-evidence/test-file-selection.ts` exporting the single selection
function `selectMaterializedTestFiles(files, config)`. Both `gate.ts` and `achieved-assurance.ts`
import and call it. `isExcludedPath` moves into this module (its only external importer,
`achieved-assurance.ts`, switches to `selectMaterializedTestFiles` and no longer needs it
directly); `gate.ts` re-exports `isExcludedPath` for backward compatibility. `FORWARD_TYPES` stays
in `gate.ts` (an orthogonal strategy concern, already shared).

- **Rationale**: a single function shared by import is the strongest available guarantee that the
  gate and the floor select the *same* set. The acceptance criterion "single implementation shared
  via import structure" is met literally.
- **Alternatives considered**:
  - *Add the predicate to `gate.ts` and have the new logic import `isExcludedPath` back from
    `gate.ts`* — **rejected**: `gate.ts` would then import the predicate while the predicate imports
    from `gate.ts`, an avoidable module cycle. A leaf module with no back-edge to `gate.ts` is
    cleaner and keeps `gate.ts` focused on verdict logic.
  - *Duplicate the filter in both files* — **rejected**: the defect is precisely that the two
    filters were the same by copy; they must be the same by construction.

### D3: Bounded glob translation to `RegExp`, no dependency

`matchesGlob(path, pattern)` compiles the glob to an anchored `RegExp`. Translation rules,
left-to-right, escaping all regex metacharacters except `*`:

- `**/` (globstar + slash) → `(?:.*/)?` — zero or more leading directory segments (so
  `**/*.test.*` matches both `foo.test.ts` and `a/b/foo.test.ts`).
- `**` (not followed by `/`) → `.*` — crosses `/`.
- `*` → `[^/]*` — a single segment, does not cross `/`.
- any other char → literal (regex-escaped).
- the whole pattern is anchored `^…$`.

This covers the three defaults and reasonable custom patterns (`tests/**/*.spec.ts`) without
re-implementing full glob semantics (no brace expansion, no `?`, no character classes).

- **Rationale**: request scopes matching to "`**/` prefix and `*` suffix/mid-string" — a regexp
  translation of exactly these tokens is small, total, and testable.
- **Alternatives considered**:
  - *`picomatch` / `minimatch`* — **rejected**: violates the minimal-dependency North Star for a
    need this narrow.
  - *`endsWith`-only suffix check* — **rejected**: cannot express `**/*_test.*` (suffix on the
    basename, arbitrary extension) or directory-scoped custom patterns.

### D4: Empty selection → `strategy-deferred` (not `failed`)

After selection, an empty set means "no measurable tooth", which is `strategy-deferred` —
consistent with the existing DU that separates "cannot measure" (deferred) from "measured, did not
bite" (failed). This aligns the implementation with the already-correct `gate.ts:13` doc; the
`gate.ts:76` comment is updated to match. `failed` remains reserved for an actual base/candidate
measurement that fails to bite (hollow or unfixed) and for tamper mismatch.

- **Rationale**: routing-correct (deferred → verification pass-through, so the polyglot job
  progresses instead of dead-ending); the archive floor still decides whether a deferred bite is
  acceptable via `minimumAssurance.biteEvidence` — the floor's meaning is unchanged.
- **Alternatives considered**: *keep `failed`* — **rejected**: it conflates "nothing to measure"
  with "measurement failed", and makes the polyglot case unrecoverable by construction.

### D5: Floor tamper/base-red/HEAD-green scope narrows to test files automatically

`achieved-assurance.ts:265` swaps its filter to `selectMaterializedTestFiles`. Because
`materializedTestFiles` now excludes non-test files, the blob-freeze diff
(`diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles)`) no longer includes them,
so implementation-phase edits of non-test files in the base commit cannot be read as tamper.
Test-file edits remain in scope and are still detected. When selection yields the empty set the
existing fail-closed path (dimension absent) is unchanged — the floor governs.

- **Rationale**: reusing the shared predicate fixes both the false-tamper and the gate false-fail
  from a single change; no floor-specific special-casing.

### D6: Validation mirrors the existing non-empty-array-of-non-empty-strings pattern

`scopedTestPatterns: optional(array(nonEmptyString(...), "must be an array.").check(minLength(1,
"must be a non-empty array.")))` in the `verification` schema. `[]` fails `minLength(1)`; a
non-string element fails `nonEmptyString`; both surface as `CONFIG_INVALID`.

- **Rationale**: symmetric with `coverage.include`; `[]` would otherwise silently mean "match
  nothing" and re-create the empty-selection surprise at config load rather than at the gate.

## Risks / Trade-offs

- **[Risk] The default `**/*_test.*` also matches non-JS `_test.*` files** (e.g. a Go/Rust file
  named `mod_test.rs`), which would then be handed to the JS/TS runner and fail. → **Mitigation**:
  such repos declare `scopedTestPatterns` for their real test shape; Rust's idiomatic tests are
  inline `#[cfg(test)]` or `tests/*.rs` (not `_test` suffix), so the reported TS+Rust case is not
  hit by the defaults. Documented in `docs/configuration.md`.
- **[Risk] Behavior change for a job whose base commit legitimately contained only non-test
  files** — previously `failed`, now `strategy-deferred`. → **Mitigation**: intended (requirement
  3); the archive floor still gates acceptance. No existing test fixes the old empty→failed
  behavior, so nothing regresses.
- **[Risk] Regex translation edge cases** (patterns with regex metacharacters). →
  **Mitigation**: all non-`*` characters are regex-escaped; unit tests pin `.`, `/`, and the three
  defaults.

## Open Questions

None. All design forks were resolved in the request's "architect 評価済みの設計判断".
