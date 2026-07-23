# Tasks: spec-fixer tasks.md writable

## T-01: Expand spec-fixer canon write-set to include tasks.md

- [x] In `src/core/step/spec-fixer.ts` `writes()` (currently returns `design.md` + `spec.md`),
      add `{ path: `${folder}/tasks.md` }` so the scoped-mode permission set and scoped-commit
      staging boundary include tasks.md.
- [x] In `src/core/step/canon-write-scope.ts`, change the D5 `writableByFixer` `spec-fixer`
      entry from `{spec.md, design.md}` to `{spec.md, design.md, tasks.md}`.
- [x] Update the doc comments in `canon-write-scope.ts` that quote the spec-fixer set (the
      "Single source of truth" block and the `writableByFixer` block) to read
      `{spec.md, design.md, tasks.md}`.
- [x] Update the `deriveSpecReviewVerdict` JSDoc in `src/core/step/judge-verdict.ts`, which
      currently states that fixable findings on canon files spec-fixer cannot write
      "(request.md, tasks.md, etc.)" remain escalation — remove `tasks.md` from that
      enumeration and name it among the spec-fixer-writable files (spec.md, design.md,
      tasks.md). Comment-only change; no behavior change in this file.
- [x] Do NOT change the `code-fixer` (∅) or `implementer` (`{tasks.md}`) entries.

**Acceptance Criteria**:
- `SpecFixerStep.writes(state, deps)` returns paths including `spec.md`, `design.md`, and `tasks.md`.
- `buildCanonWriteScope(...).writableByFixer.get("spec-fixer")` contains `spec.md`, `design.md`,
  and `tasks.md`, and excludes `request.md`, `test-cases.md`, and the attestation.
- The TC-029 drift-guard (`writes() ∩ protectedCanonPaths == D5 map entry`) stays green.

## T-02: Name tasks.md as a fixable target in the spec-fixer prompts

- [x] In `src/core/step/spec-fixer.ts`, update the conformance-entry initial message where it
      reads "fix the spec.md or design.md artifact as indicated by the rationale" so it names
      tasks.md as well (e.g. "fix the spec.md, design.md, or tasks.md artifact ...").
- [x] In `src/prompts/spec-fixer-system.ts`, update the Contract / write-set section (input
      "修正対象", output "修正済み", and the `**write-set**` line) so tasks.md is listed among the
      writable artifacts alongside spec.md and design.md.
- [x] Keep the deferred-comment guidance (recorded at the end of design.md) unchanged.

**Acceptance Criteria**:
- The conformance-entry spec-fixer message names tasks.md as a fixable artifact.
- The spec-fixer system prompt write-set / contract section lists tasks.md.
- No new requirement/policy language is introduced beyond naming tasks.md as writable.

## T-03: Migrate spec-review routing tests to the new tasks.md expectation

File: `src/core/step/__tests__/spec-review-fixer-routing.test.ts`

- [x] Update the local `makeCanonScope()` fixture: add `TASKS_MD` to the `spec-fixer` set so it
      mirrors the real `buildCanonWriteScope` (`spec-fixer → {SPEC_MD, DESIGN_MD, TASKS_MD}`).
- [x] TC-013 first sub-test ("fixable finding on tasks.md ... escalates"): change the expectation
      to `needs-fix` (tasks.md is now routable to spec-fixer). Update the describe title/comment
      to reflect "routes to spec-fixer".
- [x] Keep TC-013's test-cases.md sub-test expecting `escalation` (preserved boundary).
- [x] Add a sub-test that drives `deriveStepCompletion` for spec-review with a fixable finding on
      test-cases.md and asserts `verdict === "escalation"` and `escalationReason` contains
      `CANON_FINDING_ESCALATION` and references test-cases.md (satisfies "escalationReason 設定つき"
      for the preserved boundary).
- [x] Verify TC-012 (partition/complement) stays green with the updated fixture; adjust only if
      its inline comments still describe tasks.md as unroutable.

**Acceptance Criteria**:
- `deriveSpecReviewVerdict(medium fixable on tasks.md)` returns `needs-fix`.
- The transition-table lookup (`spec-review` + `needs-fix` → `spec-fixer`) test remains green.
- test-cases.md fixable finding yields `escalation` with a `CANON_FINDING_ESCALATION` escalationReason.
- request.md fixable finding still yields `escalation` with escalationReason (existing TC-003 green).

## T-04: Update the canon-write-scope unit tests

File: `tests/unit/core/step/canon-write-scope.test.ts`

- [x] TC-019: replace the assertion that spec-fixer's writable set excludes tasks.md with a
      positive assertion that it INCLUDES tasks.md; keep the assertions that request.md and
      test-cases.md are excluded.
- [x] TC-029 spec-fixer sub-test: update the descriptive `it(...)` title from
      `{spec.md, design.md}` to `{spec.md, design.md, tasks.md}`. The assertion body is dynamic
      (compares map vs `writes() ∩ canon`) and stays green.
- [x] Do NOT change TC-017 (code-fixer ∅) or TC-018 (implementer `{tasks.md}`).

**Acceptance Criteria**:
- TC-019 asserts spec-fixer writable `⊇ {spec.md, design.md, tasks.md}` and excludes request.md / test-cases.md.
- TC-029 remains green for all three fixers.

## T-05: Migrate the conformance-path test for tasks.md + fixTarget spec-fixer

File: `tests/unit/core/step/judge-verdict-canon.test.ts`

- [x] Update the local `makeFullCanonScope()` fixture: add tasks.md to the `spec-fixer` set.
- [x] TC-006 second sub-test ("tasks.md fixable ... fixTarget:spec-fixer → escalation"): change
      the expectation to `needs-fix:spec-fixer` (spec-fixer can now write tasks.md). Update the
      describe/comment accordingly (per design D3).
- [x] Keep TC-006 first sub-test (fixTarget:code-fixer → escalation), TC-005 (fixTarget:implementer
      → needs-fix:implementer), and TC-021 (judge/regression path, code-fixer → escalation) green.

**Acceptance Criteria**:
- `deriveConformanceVerdict(tasks.md, fixTarget:spec-fixer, canonScope)` returns `needs-fix:spec-fixer`.
- `deriveConformanceVerdict(tasks.md, fixTarget:code-fixer, canonScope)` still returns `escalation`.
- `deriveConformanceVerdict(tasks.md, fixTarget:implementer, canonScope)` still returns `needs-fix:implementer`.

## T-06: Lock the new writable path in the step-contract test

File: `tests/unit/step/step-io-contracts.test.ts`

- [x] In the "SpecFixerStep reads/writes" block, strengthen the "writes design.md and spec.md"
      case to also assert `paths` contains `${folder}/tasks.md`, pinning the new writable path.

**Acceptance Criteria**:
- The step-io-contracts spec-fixer writes() test asserts tasks.md is a declared output and is green.

## T-07: Record the migrated tests in implementation-notes and run the gate

- [x] Create `specrunner/changes/spec-fixer-tasks-md-writable/implementation-notes.md` enumerating
      every test whose expectation changed for this change:
      - `src/core/step/__tests__/spec-review-fixer-routing.test.ts` — `makeCanonScope` fixture +
        TC-013 (tasks.md → needs-fix) + new test-cases.md escalationReason sub-test.
      - `tests/unit/core/step/canon-write-scope.test.ts` — TC-019 (tasks.md now included) + TC-029 title.
      - `tests/unit/core/step/judge-verdict-canon.test.ts` — `makeFullCanonScope` fixture +
        TC-006 second sub-test (→ needs-fix:spec-fixer).
      - `tests/unit/step/step-io-contracts.test.ts` — spec-fixer writes() strengthened with tasks.md.
- [x] Run `bun run typecheck && bun run test` and confirm green.

**Acceptance Criteria**:
- implementation-notes.md exists and enumerates all tests whose expectations were updated.
- `typecheck && test` are green.
