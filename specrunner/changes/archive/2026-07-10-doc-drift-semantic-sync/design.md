# Design: doc-drift-semantic-sync

## Context

An external review confirmed three drift points where authority documents lag the
implementation. In every case the implementation is correct (正) and the document is stale:

1. **README.md:94** describes custom reviewers as "run serially after `code-review`".
   The implementation runs them as a **parallel fan-out**: `runCoordinatorFanOut`
   (`src/core/pipeline/pipeline.ts:732`) executes pending member steps with
   `Promise.allSettled` (`pipeline.ts:791`). Only commit/push is serialized, via a FIFO
   promise-chain mutex (`src/core/step/executor.ts:92` `commitMutex`; sessions and verdict
   derivation stay concurrent — `executor.ts:90`).

2. **src/core/pipeline/registry.ts:27** says "Standard 12-step pipeline descriptor" and
   **registry.ts:166** says "standard (12-step)". But `STANDARD_DESCRIPTOR.steps` has **13**
   entries (`registry.ts:32-46`). The sibling counts on line 166 — design-only (1-step) and
   fast (9-step) — match `DESIGN_ONLY_DESCRIPTOR.steps.length` (1) and
   `FAST_DESCRIPTOR.steps.length` (9) exactly; only "standard" is wrong.

3. **architecture/domain-model.md:20** states "`version` は常に 1". The implementation types
   `version: 1 | 2` (`src/state/schema.ts:252`); new state writes `2`
   (`src/store/job-state-store.ts:88` via `buildInitialJobState`); version 1 is normalized to
   2 on read (`schema.ts:453-460`, `validateJobState`). domain-model.md itself declares "正確な
   フィールドはコードが正典", so the document must follow the code.

The existing sync test (`tests/unit/docs/readme-pipeline-sync.test.ts`) only checks that README
contains every `STEP_NAMES` value and four required headings. It cannot catch **semantic**
drift — counts, parallelism, schema version numbers. This is the document-level analogue of a
structural gap already seen in this codebase: an architecture test whose grep scope excludes the
very call-sites it is meant to protect. Fixing the three drift points without widening the guard
would let the same class of drift recur. This change therefore bundles the three corrections with
a mechanical guard extension covering the two axes that are uniquely machine-comparable.

## Goals / Non-Goals

**Goals**:
- Correct the three authority documents so their descriptions match the implementation
  (README custom-reviewer execution model; registry "N-step" comments; domain-model `version`).
- Extend the doc-sync test suite to mechanically compare, against implementation-derived truth:
  - (a) each "N-step" number in `registry.ts` comments vs the corresponding
    `descriptor.steps.length` (standard / design-only / fast).
  - (b) the `version` description in `architecture/domain-model.md` vs the schema `version`
    union (`schema.ts`), such that reverting to "常に 1" fails the guard.
- Derive expected values from the implementation (imported descriptors + source regex), never
  from hardcoded literals, so the guard itself cannot silently drift.
- Keep existing tests green without modification.

**Non-Goals**:
- README structural rewrite (backlog B-1, separate line).
- Generalizing semantic doc-matching or widening the guarded document set beyond the two axes.
- Any change to descriptor / schema / pipeline **implementation** — this change touches
  **documents and tests only**.
- A mechanical guard for the serial/parallel prose (see D6).

## Decisions

### D1 — Documents follow the code; implementation is untouched

All three fixes move the document toward the implementation, never the reverse. README:94 is
reworded to describe the parallel fan-out with serialized commit/push; registry comments adopt the
real step counts; domain-model `version` adopts `1 | 2` with the normalization direction.

- **Rationale**: The request and external review establish the implementation as 正. domain-model.md
  explicitly names code as the SoT. Editing code to match stale prose would be a regression and is
  out of scope.
- **Alternatives considered**: Change code to match docs — rejected (implementation is correct;
  scope is docs/tests only).

### D2 — Guard exactly two axes: step count and schema version

The mechanical guard covers only the numeric "N-step" count and the schema `version` number. Prose
semantics (e.g. serial vs parallel) are deliberately excluded (D6).

- **Rationale**: Counts and version numbers are uniquely and unambiguously comparable to a single
  implementation value, so the guard is false-positive-free. Prose semantic matching is brittle and
  its maintenance cost exceeds its benefit.
- **Alternatives considered**:
  - Generate the README section from the descriptor — rejected: README is a human-facing document;
    turning it into a generated artifact harms readability and editing freedom. Verification
    (matching), not generation, is the right tool.
  - Keep "12-step" with a counting note (e.g. count fixers as loop pairs) — rejected: the descriptor
    has 13 entries; a note forces the reader to do mental arithmetic. The honest form is the real
    count.

### D3 — Expected values are derived from the implementation, not hardcoded

- Axis (a): the test **imports** `STANDARD_DESCRIPTOR`, `DESIGN_ONLY_DESCRIPTOR`,
  `FAST_DESCRIPTOR` from `registry.ts` and uses `descriptor.steps.length` as the source of truth.
- Axis (b): the test **regex-extracts** the `version: 1 | 2` union from `schema.ts` source, parses
  the allowed version set, and treats its maximum as the current write version.

- **Rationale**: If the count or version changes in code, the truth the test compares against moves
  with it — the guard tracks the implementation instead of becoming a second thing to keep in sync.
- **Alternatives considered**: Hardcode `13 / 1 / 9` and `2` in the test — rejected: this
  reintroduces exactly the drift the change is trying to eliminate, one layer down.

### D4 — Comparison method: text regex, following the grep-drift-guard convention

The guard reads the **document / comment text** and matches "N-step" and version claims with
regexes, mirroring `tests/grep-no-step-name-hardcode.test.ts` (read source as string, assert with
regex). Axis (a) additionally imports the descriptors (D3) purely to obtain `steps.length` — this is
stable exported pipeline data, not a step-name literal, so it does not violate the grep guard's
"no hardcoded step-name" spirit.

- **Rationale**: Requirement 4 mandates following the existing grep-style drift-guard convention.
  Document text has no runtime representation, so regex over the file is the only option there; for
  the descriptor side, the exported constant is the cleanest truth source.
- **Alternatives considered**: Parse the TS AST — rejected as heavier than the established
  regex-over-text convention for a two-axis guard.

### D5 — New test file, existing drift guards untouched

The two new axes go in a new file `tests/unit/docs/doc-drift-sync.test.ts`.
`readme-pipeline-sync.test.ts` and all other existing tests are left unchanged.

- **Rationale**: The README STEP_NAMES/heading guard is README-specific; the new axes concern
  `registry.ts` and `architecture/domain-model.md`. A sibling file keeps each guard's scope legible
  and satisfies the "既存テスト無変更で green" acceptance criterion directly. The README:94 reword
  keeps the literal `code-review` token, so the existing README guard stays green with no edit.
- **Alternatives considered**: Extend `readme-pipeline-sync.test.ts` — rejected: it would broaden a
  README-named file to cover unrelated documents and would mean editing an existing test file.

### D6 — Skip the mechanical parallelism (serial/parallel) check

Requirement 5 leaves the serial/parallel guard to design judgment. This change **does not** add one.

- **Rationale**: The parallelism is expressed by `Promise.allSettled` inside `runCoordinatorFanOut`
  and the `commitMutex` serialization — there is no single machine-readable flag to compare a
  document sentence against. A keyword regex asserting README contains "parallel" and not "serially"
  is brittle: it produces false positives on unrelated prose and false negatives on legitimate
  rewording, precisely the failure mode the architect ruled out when limiting the guard to the two
  crisp axes. The README:94 prose is still corrected in T-01; it is simply verified by review rather
  than machine-guarded.

## Risks / Trade-offs

- [Risk] The `version` union regex over `schema.ts` breaks if the union formatting changes
  (e.g. `1 | 2 | 3` or reflowed) → **Mitigation**: make the regex tolerant of whitespace and an
  arbitrary number of `N` members, and compare against the parsed set. Adding version 3 simply
  widens the allowed set — the doc must then mention it, which is the intended drift signal, not a
  false failure.
- [Risk] The domain-model `version`-claim segment extraction (from `` `version` `` up to the first
  `。`) could mis-scope if the wording is restructured → **Mitigation**: T-03 fixes the clause shape
  (the `version` claim leads the bullet and both union members appear before the first `。`); the
  test documents the expected clause shape in a comment.
- [Risk] Axis (a)'s label→descriptor mapping covers only the three known pipelines; a future fourth
  pipeline would be unguarded until its comment is added → **Mitigation**: the guard asserts each of
  the three known descriptors has at least one matching labeled "N-step" mention, so an existing
  annotation cannot be silently deleted. A fourth pipeline is out of scope.
- [Trade-off] The README parallelism prose stays unguarded (D6) → **Accepted**: the two guarded axes
  cover the higher-frequency, unambiguous drift classes; prose is left to review to avoid brittle
  false signals.

## Open Questions

None blocking.
