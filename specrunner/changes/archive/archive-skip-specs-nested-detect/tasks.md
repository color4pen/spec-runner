# Implementation Tasks: archive-skip-specs-nested-detect

## Phase 1: Core Detection Logic

- [x] **T1.1**: Add `stat` method to `FinishFs` interface in `src/core/finish/types.ts`
  - Method signature: `stat(path: string): Promise<{ isDirectory(): boolean }>`
  - Add JSDoc comment explaining usage for directory detection

- [x] **T1.2**: Create `isDirectory` helper function in `archive-openspec.ts`
  - Place before `archiveOpenspec` function
  - Signature: `async function isDirectory(path: string, fs: FinishFs): Promise<boolean>`
  - Implementation: try-catch wrapping `fs.stat(path)`, return `stats.isDirectory()`, catch returns `false`
  - Add JSDoc comment

- [x] **T1.3**: Create `hasSpecFiles` helper function in `archive-openspec.ts`
  - Place before `archiveOpenspec` function
  - Signature: `async function hasSpecFiles(specsPath: string, fs: FinishFs): Promise<boolean>`
  - Implementation:
    1. Try-catch wrapper around entire function body
    2. `const entries = await fs.readdir(specsPath)`
    3. Loop through entries, for each entry:
       - `const entryPath = path.join(specsPath, entry)`
       - `const isDirResult = await isDirectory(entryPath, fs)`
       - If `isDirResult === true`:
         - `const specFile = path.join(entryPath, 'spec.md')`
         - `const exists = await fs.exists(specFile)`
         - If `exists === true`, return `true` immediately
    4. After loop, check flat fallback: `return entries.some((e) => e.endsWith('.md'))`
    5. Catch block returns `false`
  - Add JSDoc comment explaining nested-first detection with flat fallback

- [x] **T1.4**: Replace inline detection logic in `archiveOpenspec` function
  - Remove existing try-catch block (lines 42-49 in current code)
  - Replace with: `const hasSpecFilesResult = await hasSpecFiles(specsPath, fs);`
  - Update `archiveArgs` assignment to use `hasSpecFilesResult` instead of `hasSpecFiles`
  - Update success message variable from `withOrWithout` to use `hasSpecFilesResult`

- [x] **T1.5**: Update TC-024/TC-025 code comments in `archive-openspec.ts`
  - Line 4: Change to `TC-024: specs/ has nested/flat .md files → openspec archive <slug>`
  - Line 5: Keep as is `TC-025: specs/ is empty → openspec archive <slug> --skip-specs`
  - Add line 6: `TC-024b: specs/<name>/spec.md (nested) → openspec archive <slug>`
  - Add line 7: `TC-024c: specs/*.md (flat fallback) → openspec archive <slug>`

## Phase 2: Test Infrastructure

- [x] **T2.1**: Update `makeFs` helper in `tests/finish-archive-openspec.test.ts`
  - Add `stat` to the default mock functions
  - Default implementation: `vi.fn().mockResolvedValue({ isDirectory: () => false })`
  - Place after `readdir` in the interface implementation

- [x] **T2.2**: Create helper function `makeNestedSpecsFs` in test file
  - Signature: `function makeNestedSpecsFs(specNames: string[]): FinishFs`
  - Returns FinishFs with:
    - `exists`: returns `true` for change folder and `specs/<name>/spec.md` for names in array
    - `readdir`: returns `specNames` when path ends with `/specs`
    - `stat`: returns `{ isDirectory: () => true }` for paths ending with any name in `specNames`
  - Use this helper to simplify nested fixture setup

- [x] **T2.3**: Create helper function `makeFlatSpecsFs` in test file
  - Signature: `function makeFlatSpecsFs(fileNames: string[]): FinishFs`
  - Returns FinishFs with:
    - `exists`: returns `true` for change folder
    - `readdir`: returns `fileNames` when path ends with `/specs`
    - `stat`: returns `{ isDirectory: () => false }` for all paths
  - Use this helper for flat fallback test fixtures

## Phase 3: Test Case Updates (TC-024)

- [x] **T3.1**: Update TC-024 to use nested structure (primary test)
  - Replace `makeFs` call with `makeNestedSpecsFs(['cli-finish-command', 'job-state-store'])`
  - Update test description to "calls openspec archive without --skip-specs when specs/ has nested spec.md files"
  - Assertions remain the same (verify `--skip-specs` NOT present)

- [x] **T3.2**: Add TC-024b nested layout test
  - Test name: "TC-024b: nested specs/<name>/spec.md → openspec archive without --skip-specs"
  - Use `makeNestedSpecsFs(['single-spec'])`
  - Verify spawn called with `["archive", "my-feature"]` (no `--skip-specs`)

- [x] **T3.3**: Add TC-024c flat fallback test
  - Test name: "TC-024c: flat specs/*.md → openspec archive without --skip-specs (fallback)"
  - Use `makeFlatSpecsFs(['delta.md', 'base.md'])`
  - Verify spawn called with `["archive", "my-feature"]` (no `--skip-specs`)

## Phase 4: Test Case Updates (TC-025)

- [x] **T4.1**: Update TC-025 first test case (no .md files)
  - Use `makeFs` with:
    - `readdir`: returns `['README.txt']` (no .md extension, not a directory)
    - `stat`: returns `{ isDirectory: () => false }`
  - Description remains "calls openspec archive with --skip-specs when specs/ has no md files"
  - Assertions remain the same (verify `--skip-specs` present)

- [x] **T4.2**: Update TC-025 second test case (empty specs/)
  - Use `makeFs` with `readdir: vi.fn().mockResolvedValue([])`
  - Description remains "calls openspec archive with --skip-specs when specs/ is empty"
  - Assertions remain the same

- [x] **T4.3**: Add TC-025b directory without spec.md test
  - Test name: "TC-025b: directory without spec.md → openspec archive with --skip-specs"
  - Use `makeFs` with:
    - `readdir`: returns `['some-dir']`
    - `stat`: returns `{ isDirectory: () => true }` for `some-dir`
    - `exists`: returns `false` for `some-dir/spec.md`
  - Verify spawn called with `["archive", "my-feature", "--skip-specs"]`

- [x] **T4.4**: Add TC-025c mixed layout test (edge case)
  - Test name: "TC-025c: mixed (1 valid nested + 1 empty dir) → no --skip-specs"
  - Use custom FinishFs:
    - `readdir`: returns `['valid-spec', 'empty-dir']`
    - `stat`: returns `{ isDirectory: () => true }` for both
    - `exists`: returns `true` for `valid-spec/spec.md`, `false` for `empty-dir/spec.md`
  - Verify spawn called WITHOUT `--skip-specs` (at least one spec detected)

## Phase 5: Test Case Comments Update

- [x] **T5.1**: Update test file header comment block (lines 1-8)
  - Line 4: Change to `TC-024: specs/ has nested/flat .md files → openspec archive <slug>`
  - Add line 9: `TC-024b: nested specs/<name>/spec.md → no --skip-specs`
  - Add line 10: `TC-024c: flat specs/*.md fallback → no --skip-specs`
  - Add line 11: `TC-025b: directory without spec.md → --skip-specs`
  - Add line 12: `TC-025c: mixed layout → no --skip-specs (at least one spec)`

## Phase 6: Delta Spec Creation

- [x] **T6.1**: Create delta spec file `openspec/changes/archive-skip-specs-nested-detect/specs/cli-finish-command/spec.md`
  - Use MODIFIED directive for archive Requirement section
  - Update Scenario "archive with specs" (currently mentions `.md files`):
    - WHEN: "openspec/changes/<slug>/specs/<spec-name>/spec.md exists for at least one spec-name (nested convention) OR specs/<slug>/*.md exists (flat fallback)"
    - THEN: remains "openspec archive <slug> called without --skip-specs"
    - Add NOTE: "Nested convention is checked first; flat layout is fallback for backward compatibility"
  - Update Scenario "archive without specs" (currently mentions `specs/ empty`):
    - WHEN: "openspec/changes/<slug>/specs/ directory is empty OR contains only directories without spec.md files"
    - THEN: remains "openspec archive <slug> --skip-specs called"

- [x] **T6.2**: Add header metadata to delta spec
  - Include spec name: `cli-finish-command`
  - Include modification type: `MODIFIED`
  - Include delta date: `2026-05-03`
  - Include reason: "Align archive auto-detection with openspec nested delta spec convention"

## Phase 7: ADR Creation

- [x] **T7.1**: Create ADR file `openspec-workflow/adr/ADR-20260503-archive-skip-specs-nested-detect.md`
  - **Header**: Title, Date (2026-05-03), Status (accepted)
  - **Context**: 
    - Describe flat detection problem
    - Explain nested convention (`specs/<spec-name>/spec.md`)
    - Mention drift exposure (PR #64, manual recovery PR #66)
    - Note that spec and code were aligned but both wrong relative to convention
  - **Decision**:
    - Nested-first detection with flat fallback (design D1)
    - Add `stat` to FinishFs for directory detection (design D4)
    - Delta spec MODIFIED approach (design D2)
  - **Alternatives Considered**:
    - Alt 1: Nested-only (no fallback) — why not: no evidence flat layouts exist, but removing fallback requires exhaustive audit; fallback is low-cost insurance
    - Alt 2: Configurable detection via flag — why not: over-engineering, auto-detection meets all use cases
    - Alt 3: Keep status quo — why not: systemic drift continues
  - **Consequences**:
    - Positive: Prevents drift, aligns with convention, self-validating (this change archives correctly)
    - Negative: Additional fs calls (perf minor), fallback code maintenance
    - Risks: Flat layouts in wild (mitigated by fallback), test complexity (mitigated by helper functions)
  - **Related**:
    - PR #64 (specrunner-dir-rename, exposed drift)
    - PR #66 (manual drift recovery)
    - Request: openspec/changes/archive-skip-specs-nested-detect/

## Phase 8: Validation

- [x] **T8.1**: Run type checking
  - Execute: `bun run typecheck`
  - Verify: No type errors, especially around new `FinishFs.stat` method

- [x] **T8.2**: Run linting
  - Execute: `bun run lint`
  - Verify: No lint errors in modified files

- [x] **T8.3**: Run full test suite
  - Execute: `bun test`
  - Verify: All tests pass, including new TC-024b/c and TC-025b/c

- [x] **T8.4**: Run specific test file
  - Execute: `bun test tests/finish-archive-openspec.test.ts`
  - Verify: All 7 test cases pass (original 4 + 3 new)

- [x] **T8.5**: Manual E2E validation preparation
  - Verify this change folder has nested delta spec at `specs/cli-finish-command/spec.md`
  - Document expected behavior: when this change is archived via `specrunner finish`, the command should call `openspec archive archive-skip-specs-nested-detect` WITHOUT `--skip-specs`
  - Note: Actual E2E execution happens in verification phase, not implementer phase

## Notes for Implementer

- **Type safety**: `FinishFs.stat` return type must match Node.js `fs.Stats` subset (only `isDirectory()` method needed)
- **Error handling**: All new helper functions must be wrapped in try-catch; missing files/directories should return `false`, not throw
- **Test isolation**: Each test case should use independent FinishFs mocks; avoid shared state
- **Backward compatibility**: Flat fallback ensures zero breaking changes; detection order matters (nested must be checked first)
- **Self-referential validation**: This change itself contains nested delta spec; when archived, it validates the new detection logic works correctly
