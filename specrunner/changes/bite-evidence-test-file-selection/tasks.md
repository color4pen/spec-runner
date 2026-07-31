# Tasks: bite-evidence test-file selection predicate

<!-- Implementer: read specrunner/changes/bite-evidence-test-file-selection/design.md and spec.md first.
     Do NOT modify .specrunner/config.json.
     Do NOT modify src/core/port/runtime-strategy.ts or src/core/runtime/local.ts
     (no port-signature change and no runTestsAtCommit execution-model change; this request only
      changes WHICH files are handed to runTestsAtCommit).
     Do NOT add any runtime dependency (no glob library). -->

## T-01: Create the shared test-file selection module

- [ ] Create `src/core/step/bite-evidence/test-file-selection.ts` with:
  - `export const DEFAULT_SCOPED_TEST_PATTERNS: readonly string[] = ["**/*.test.*", "**/*.spec.*", "**/*_test.*"]`.
  - `export function isExcludedPath(filePath: string): boolean` — moved verbatim from `gate.ts:36-38`
    (`startsWith("specrunner/changes/") || startsWith(".specrunner/")`). Keep its doc comment.
  - `export function matchesGlob(filePath: string, pattern: string): boolean` — compile `pattern`
    to an anchored `RegExp` per design D3 and test `filePath`:
    - scan left→right; on `*`: if next char is `*` and the char after is `/` emit `(?:.*/)?` and
      consume `**/`; else if next char is `*` emit `.*` and consume `**`; else emit `[^/]*`.
    - any other char: append it regex-escaped (escape ``. * + ? ^ $ { } ( ) | [ ] \``).
    - wrap as `^…$`. (No brace/`?`/char-class support — out of scope.)
  - `export function resolveScopedTestPatterns(config: SpecRunnerConfig | undefined): string[]` —
    return `config?.verification?.scopedTestPatterns` when it is a non-empty array, else a copy of
    `DEFAULT_SCOPED_TEST_PATTERNS`.
  - `export function selectMaterializedTestFiles(files: string[], config: SpecRunnerConfig | undefined): string[]`
    — return `files.filter((f) => !isExcludedPath(f) && patterns.some((p) => matchesGlob(f, p)))`
    where `patterns = resolveScopedTestPatterns(config)`.
  - `import type { SpecRunnerConfig } from "../../../config/schema.js"`.
  - Module MUST NOT import from `gate.ts` (keep it a leaf; avoids a module cycle).
- [ ] In `src/core/step/bite-evidence/gate.ts`: remove the local `isExcludedPath` definition
      (`:36-38`) and instead `export { isExcludedPath } from "./test-file-selection.js"` (preserves
      backward-compatible re-export). Keep `FORWARD_TYPES` in `gate.ts` unchanged.

**Acceptance Criteria**:
- `selectMaterializedTestFiles` excludes `fixtures/data.json`, `package.json`, `src/lib.rs`, and
  `src/feature/index.ts`, and includes `src/foo.test.ts`, `pkg/bar.spec.ts`, `mod/baz_test.ts`
  under default patterns.
- With `scopedTestPatterns: ["**/*.spec.rb"]`, `spec/model_spec.rb` is selected and
  `src/a.test.ts` is not (configured patterns replace the default).
- Pipeline artifacts under `specrunner/changes/` / `.specrunner/` are excluded even if they match a
  pattern.
- `matchesGlob("foo.test.ts", "**/*.test.*")` and `matchesGlob("a/b/foo.test.ts", "**/*.test.*")`
  are both true; `matchesGlob("src/lib.rs", "**/*.test.*")` is false.
- `test-file-selection.ts` does not import `gate.ts`; `typecheck` passes.

## T-02: Unit tests for the selection predicate

- [ ] Add `src/core/step/bite-evidence/__tests__/test-file-selection.test.ts` covering, at minimum:
  - fixture JSON / `package.json` / `.rs` / implementation `index.ts` are NOT selected;
    `*.test.ts` / `*.spec.ts` / `*_test.ts` ARE selected (default patterns).
  - `scopedTestPatterns` set replaces the default (a configured pattern selects its target and the
    default-named file is excluded).
  - pipeline-artifact exclusion still applies (matched path under `specrunner/changes/` excluded).
  - a few direct `matchesGlob` cases: `**/` prefix (top-level and nested), `*` non-crossing of `/`,
    literal `.` escaping.

**Acceptance Criteria**:
- All predicate scenarios in spec.md ("selection predicate" + "scopedTestPatterns default/replace")
  are pinned by tests and green.

## T-03: Add and validate the `scopedTestPatterns` config field

- [ ] In `src/config/schema/types.ts`, add `scopedTestPatterns?: string[]` to the
      `VerificationConfig` interface (`types.ts:142-163`) with a doc comment: "Glob patterns that
      identify materialized test files for per-file bite execution. Paired with `scopedTestCommand`.
      When absent, defaults to `**/*.test.*`, `**/*.spec.*`, `**/*_test.*`. Provider-neutral."
- [ ] In `src/config/schema/validation.ts`, add to the `verification` object schema
      (`validation.ts:264-299`), next to `scopedTestCommand`:
      `scopedTestPatterns: optional(array(nonEmptyString("must be a non-empty string."), "must be an array.").check(minLength(1, "must be a non-empty array.")))`
      (mirror the `coverage.include` pattern at `validation.ts:276-279`; `array`, `nonEmptyString`,
      `minLength` are already imported / defined).
- [ ] Do NOT edit `.specrunner/config.json`.

**Acceptance Criteria**:
- `verification.scopedTestPatterns: []` throws with `code: "CONFIG_INVALID"`.
- `verification.scopedTestPatterns: ["**/*.test.ts", 42]` (non-string element) throws with
  `code: "CONFIG_INVALID"`.
- `verification.scopedTestPatterns: ["**/*.test.ts"]` validates and is preserved on the resolved
  config.
- A config without `scopedTestPatterns` validates unchanged (field absent, no default injected at
  the config layer).
- `typecheck` passes.

## T-04: Add validation tests

- [ ] Extend `src/config/__tests__/verification-scoped-command.test.ts` (or add a sibling
      `verification-scoped-patterns.test.ts`) with cases for: empty array → throws `CONFIG_INVALID`;
      non-string element → throws `CONFIG_INVALID`; valid `["**/*.test.ts"]` preserved; field absent
      validates unchanged. Assert on `err.code === "CONFIG_INVALID"` (match the existing project
      convention for these throws).

**Acceptance Criteria**:
- All four validation scenarios from spec.md ("validated as a non-empty array of non-empty
  strings") are pinned and green.

## T-05: Wire the gate to the shared predicate and defer the empty set

- [ ] In `src/core/step/bite-evidence/gate.ts`, replace the filter at `:154-157` with
      `const materializedTestFiles = selectMaterializedTestFiles(changedFilesResult.files, config)`
      (import `selectMaterializedTestFiles` from `./test-file-selection.js`).
- [ ] Change the empty-set branch at `:159-165` from `verdict: "failed"` to
      `verdict: "strategy-deferred"`, updating the `reason` to state that no changed file matched the
      test-file selection (so this is "unmeasurable", not "failed").
- [ ] Update the step comment at `:76` ("No materialized test files → failed") to read
      "strategy-deferred". Confirm the verdict doc at `:10-13` still reads correctly: `:13` already
      lists "no test files" under `strategy-deferred` — leave it, or tighten wording to "no matching
      test files". Do NOT change the `failed`/`passed` descriptions at `:11-12`.

**Acceptance Criteria** (gate verdict tests, added to `gate.test.ts` or a sibling):
- selection empty (base commit changed only non-test files) → `strategy-deferred`, empty records.
- base-red → candidate-green (`*.test.ts`) → `passed` with a verified record.
- base-red → candidate-red → `failed`.
- tamper mismatch → `failed` (unchanged).
- All pre-existing `gate.test.ts` cases stay green (their materialized files are `*.test.ts` and
  match the default).
- `typecheck` passes.

## T-06: Wire the floor to the shared predicate

- [ ] In `src/core/archive/achieved-assurance.ts`, replace the filter at `:265`
      (`changedFilesResult.files.filter((f) => !isExcludedPath(f))`) with
      `selectMaterializedTestFiles(changedFilesResult.files, config)`.
- [ ] Update the imports at `:21`: import `FORWARD_TYPES` from `../step/bite-evidence/gate.js` and
      `selectMaterializedTestFiles` from `../step/bite-evidence/test-file-selection.js`. Remove the
      now-unused `isExcludedPath` import. Update the enumeration doc at `:92` to say
      "listCommitChangedFiles(baseOid) + selectMaterializedTestFiles filter".
- [ ] No change to the blob-freeze call at `:282`, base-red at `:429`, or HEAD-green at `:452`:
      they already operate over `materializedTestFiles`, which is now correctly narrowed.

**Acceptance Criteria** (floor tests, added to `tests/unit/core/archive/`):
- base commit contains a `*.test.ts` file AND a non-test file (`src/feature/index.ts`); the non-test
  file is reported as changed base→finalHead while the test file is byte-identical, base-red, and
  HEAD-green → NO tamper, `biteEvidence` achieved. The fake `diffPathsBetweenCommits` MUST honor its
  `paths` argument (return only the intersection of an "edited files" set with `paths`) so that
  narrowing `materializedTestFiles` actually removes the non-test file from the diff.
- base commit contains a `*.test.ts` file that differs base→finalHead → tamper reported,
  `biteEvidence` absent (test-file edit is still caught).
- All pre-existing floor / achieved-assurance tests stay green (their materialized files are
  test-named).
- `typecheck` passes.

## T-07: Guard the single-implementation-shared-via-imports invariant

- [ ] Add a structural test (e.g. `src/core/step/bite-evidence/__tests__/shared-selection-imports.test.ts`)
      that reads the source text of `gate.ts` and `achieved-assurance.ts` and asserts:
  - both import `selectMaterializedTestFiles` from `test-file-selection` (module specifier ending in
    `test-file-selection.js`);
  - neither file contains its own path-exclusion + glob duplication (e.g. no local
    `function isExcludedPath` body in `achieved-assurance.ts`, and `gate.ts` only re-exports it).

**Acceptance Criteria**:
- The test fails if either consumer stops importing `selectMaterializedTestFiles` from the shared
  module or re-introduces a local selection filter.

## T-08: Document `scopedTestPatterns`

- [ ] In `docs/configuration.md`, under `## Verification`, add a short subsection
      "### verification.scopedTestPatterns — bite-evidence test file selection" stating: the default
      `["**/*.test.*", "**/*.spec.*", "**/*_test.*"]`; that patterns select which materialized files
      are run per-file during bite evidence; that it pairs with `scopedTestCommand` to define the
      per-file bite execution target set; that patterns fully replace the default when set; and a
      one-line note that polyglot / non-standard-naming repos should override it. Use the simple glob
      semantics from design D3 (no full-glob claims).

**Acceptance Criteria**:
- `docs/configuration.md` documents the default and purpose (per requirement 5). No other docs
  section is broken.

## T-09: Full verification and dependency guard

- [ ] Run `bun run typecheck` and `bun run test`; both green. The only pre-existing expectation
      permitted to change is any test that pinned the old empty-set→`failed` behavior — none is known
      to exist; if one surfaces, update it and attribute the change to requirement 3 (empty →
      strategy-deferred).
- [ ] Confirm `git diff` shows NO change to `package.json` / lockfile (no new runtime dependency),
      `.specrunner/config.json`, `src/core/port/runtime-strategy.ts`, or `src/core/runtime/local.ts`.

**Acceptance Criteria**:
- `bun run typecheck` passes.
- `bun run test` passes.
- No new runtime dependency; `.specrunner/config.json`, the runtime-strategy port, and `local.ts`
  are unchanged in the diff.
