# Tasks: doc-drift-semantic-sync

> Scope guard: documents and tests only. Do NOT edit `src/core/pipeline/registry.ts` step
> definitions, `src/state/schema.ts`, `src/store/job-state-store.ts`, or any pipeline
> implementation. Only comment text (registry), document prose (README / domain-model), and new
> test files change.

## T-01: Correct README custom-reviewer execution model

**File**: `README.md` (line 94, "Extending the Review Chain" → Custom reviewers bullet)

- [ ] Replace the phrase "run serially after `code-review`" with an accurate description of the
  parallel fan-out model. Target wording (implementer may refine, must stay accurate):
  "…validated at job start, and run as a **parallel fan-out** after `code-review` — member reviewers
  execute concurrently, with only their commit/push serialized (FIFO mutex). Scoped with `paths`
  globs and `requestTypes`."
- [ ] Keep the literal token `code-review` in the sentence (the existing README drift guard asserts
  README contains every step name; do not break it).
- [ ] Do not restructure any other part of README (README rewrite is out of scope / backlog B-1).

**Acceptance Criteria**:
- The custom-reviewers bullet no longer claims serial execution and describes the parallel fan-out
  with serialized commit/push, matching `runCoordinatorFanOut` (`Promise.allSettled`,
  `pipeline.ts:791`) and `commitMutex` (`executor.ts:92`).
- `tests/unit/docs/readme-pipeline-sync.test.ts` remains green with no modification (all
  `STEP_NAMES` values and the four required headings are still present).

---

## T-02: Correct registry "N-step" comments to the real step counts

**File**: `src/core/pipeline/registry.ts` (comments only — lines 27 and 166)

- [ ] Line 27: change "Standard 12-step pipeline descriptor." → "Standard 13-step pipeline
  descriptor." (`STANDARD_DESCRIPTOR.steps` has 13 entries).
- [ ] Line 166: change "standard (12-step)" → "standard (13-step)". Leave "design-only (1-step)"
  and "fast (9-step slim with scope)" unchanged (already correct).
- [ ] Change comments only — do NOT touch the `steps` arrays, transitions, roles, or any code.

**Acceptance Criteria**:
- Both "N-step" mentions for the standard pipeline read "13-step"; design-only reads "1-step" and
  fast reads "9-step".
- No non-comment lines in `registry.ts` are modified (`git diff` shows only comment text changes).

---

## T-03: Correct domain-model.md `version` invariant

**File**: `architecture/domain-model.md` (line 20, JobState 不変条件 bullet)

- [ ] Replace "`version` は常に 1。" with a description matching the schema. Target wording
  (implementer may refine, must stay accurate and keep the trailing `status` clause intact):
  "`version` は `1 | 2`（新規 state は 2、旧 version 1 は read 時に 2 へ normalize）。`status` は
  `JobStatus` の列挙内（validateJobState が強制）。"
- [ ] The `version` clause MUST lead the bullet and BOTH union members (`1` and `2`) MUST appear
  before the first `。` (the axis-(b) guard extracts the clause up to the first `。`).
- [ ] Do not remove the existing "正確なフィールドはコードが正典" SoT note (line 21).

**Acceptance Criteria**:
- The `version` invariant describes `1 | 2` with the 1→2 normalization direction and new-state
  value 2, matching `schema.ts:252` / `schema.ts:453-460` / `job-state-store.ts:88`.
- No other invariant or clause on the line is altered.

---

## T-04: Add registry step-count drift guard (axis a)

**File**: `tests/unit/docs/doc-drift-sync.test.ts` (new)

- [ ] Import the three descriptors from `../../../src/core/pipeline/registry.js`:
  `STANDARD_DESCRIPTOR`, `DESIGN_ONLY_DESCRIPTOR`, `FAST_DESCRIPTOR`.
- [ ] Read `src/core/pipeline/registry.ts` source as a string (resolve via
  `path.resolve(process.cwd(), "src/core/pipeline/registry.ts")`, consistent with the docs test
  directory).
- [ ] Define a label→descriptor table and, for each pipeline, a label-anchored regex that captures
  the `N` in its "N-step" mentions, e.g.:
  - standard: `/Standard\s+(\d+)-step/g` and `/standard\s*\((\d+)-step\)/g`
  - design-only: `/design-only\s*\((\d+)-step\)/g`
  - fast: `/fast\s*\((\d+)-step/g`
- [ ] For each pipeline: collect ALL captured numbers from the registry source, assert at least one
  match exists, and assert every captured number equals that descriptor's `steps.length`. Derive the
  expected value from `descriptor.steps.length` — do NOT hardcode 13 / 1 / 9.
- [ ] Follow the drift-guard convention of `tests/grep-no-step-name-hardcode.test.ts` (read source
  text, assert with regex).

**Acceptance Criteria**:
- With registry comments reading 13-step / 1-step / 9-step and the descriptors at 13 / 1 / 9, the
  guard passes.
- Editing the standard comment back to "12-step" makes the guard fail (comparison is against
  `STANDARD_DESCRIPTOR.steps.length`, not a literal) — this fail-on-drift property is fixed by the
  assertion structure.
- Removing a pipeline's "N-step" annotation makes the guard fail (the "at least one match" assertion).

---

## T-05: Add domain-model version drift guard (axis b)

**File**: `tests/unit/docs/doc-drift-sync.test.ts` (same new file, second describe block)

- [ ] Read `src/state/schema.ts` source and regex-extract the `version` union, tolerant of
  whitespace and an arbitrary number of members, e.g. capture the run after `version:` up to `;`
  (`/version:\s*([\d\s|]+);/`), split on `|`, and parse into a numeric set (allowed versions).
  Do NOT hardcode `[1, 2]`.
- [ ] Read `architecture/domain-model.md` source and extract the `version` clause: the substring
  from `` `version` `` up to the first `。` (document the expected clause shape in a comment).
- [ ] Assert the extracted `version` clause contains the string form of EVERY allowed version member
  (so with union `1 | 2` the clause must mention both `1` and `2`). Reverting to "`version` は常に 1"
  omits `2` and fails.
- [ ] Follow the same read-source-text + regex convention.

**Acceptance Criteria**:
- With `schema.ts` declaring `version: 1 | 2` and domain-model.md describing `1 | 2`, the guard
  passes.
- Reverting the domain-model `version` clause to "`version` は常に 1" makes the guard fail (the
  clause omits version 2 present in the parsed schema union) — this fail-on-drift property is fixed
  by the assertion structure.
- The allowed version set is parsed from `schema.ts` source, not hardcoded.

---

## T-06: Verify the full green gate

- [ ] Run `bun run typecheck` — passes.
- [ ] Run `bun run test` — passes, including the new `doc-drift-sync.test.ts` and the unmodified
  existing tests.

**Acceptance Criteria**:
- `typecheck && test` is green.
- No existing test file was modified to make the suite pass (only `doc-drift-sync.test.ts` is added;
  README / registry.ts / domain-model.md carry only the documentation corrections from T-01…T-03).
