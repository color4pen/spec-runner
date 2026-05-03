# Implementation Tasks: SpecRunner Directory Rename

## Phase 1: Update source code

### Task 1.1: Update `src/cli/run.ts` CANONICAL_PATTERN

- [x] Open `src/cli/run.ts`
- [x] Locate lines 121-125 (CANONICAL_PATTERN definition and comment)
- [x] Change regex from `/openspec-workflow\/requests\/(?:active|awaiting-merge)\/([^/]+)\/[^/]+\.md$/` to `/^.*\/specrunner\/requests\/active\/([^/]+)\/[^/]+\.md$/`
- [x] Update comment on line 121 to: `// Canonical pattern: specrunner/requests/active/<slug>/request.md`
- [x] Remove comment reference to `awaiting-merge` on line 122

### Task 1.2: Update `src/core/doctor/checks/repo/workflow-structure.ts`

- [x] Open `src/core/doctor/checks/repo/workflow-structure.ts`
- [x] Change line 9 from `const REQUIRED_DIRS = ["active", "awaiting-merge", "merged", "canceled"] as const;` to `const REQUIRED_DIRS = ["active", "merged"] as const;`
- [x] Update comment on line 3 from `openspec-workflow/requests/{active,awaiting-merge,merged,canceled}/` to `specrunner/requests/{active,merged}/`
- [x] Update line 20 path construction from `path.join(ctx.cwd, "openspec-workflow", "requests", dir)` to `path.join(ctx.cwd, "specrunner", "requests", dir)`
- [x] Update line 29 pass message from `"openspec-workflow/requests/ structure is complete"` to `"specrunner/requests/ structure is complete"`
- [x] Update line 35 warn message from `"openspec-workflow/requests/ is missing dirs: ${missing.join(", ")}"` to `"specrunner/requests/ is missing dirs: ${missing.join(", ")}"`
- [x] Update line 36 hint from `"Run 'openspec init' or create the missing directories manually."` to `"Create the missing directories manually."`

### Task 1.3: Update `src/core/finish/resolve-target.ts`

- [x] Open `src/core/finish/resolve-target.ts`
- [x] Update comment on line 9 from `TC-131: awaiting-merge 0 entries → escalation (exit 2)` to `TC-131: active 0 entries → escalation (exit 2)`
- [x] Update comment on line 10 from `TC-132: awaiting-merge 2+ entries → escalation (exit 2)` to `TC-132: active 2+ entries → escalation (exit 2)`
- [x] Update comment on line 11 from `TC-133: cwd under awaiting-merge/<dir>/ → auto-detect` to `TC-133: cwd under active/<dir>/ → auto-detect`
- [x] Update line 27 comment from `/** Base directory for awaiting-merge detection (defaults to cwd). */` to `/** Base directory for active detection (defaults to cwd). */`
- [x] Update line 39 comment from `Priority: slug → --pr → --job → awaiting-merge auto-detect.` to `Priority: slug → --pr → --job → active auto-detect.`
- [x] Locate the `autoDetectFromAwaitingMerge` function (around line 161)
- [x] Rename function from `autoDetectFromAwaitingMerge` to `autoDetectFromActive`
- [x] Update function's JSDoc comment to replace `awaiting-merge` with `active`
- [x] Update the directory scan path from `openspec-workflow/requests/awaiting-merge` to `specrunner/requests/active`
- [x] Update error message on line 202 from `"No request found in awaiting-merge/. Specify <slug>, --pr, or --job."` to `"No request found in active/. Specify <slug>, --pr, or --job."`
- [x] Update error message on line 210 from `"Multiple slugs in awaiting-merge/: ${entries.join(", ")}. Specify <slug>, --pr, or --job."` to `"Multiple slugs in active/: ${entries.join(", ")}. Specify <slug>, --pr, or --job."`
- [x] Update stdout message on line 216 from `"Auto-detected awaiting-merge slug: ${autoSlug}"` to `"Auto-detected active slug: ${autoSlug}"`
- [x] Update line 225 regex from `/openspec-workflow\/requests\/(?:active|awaiting-merge)\/([^/]+)(?:\/|$)/` to `/specrunner\/requests\/active\/([^/]+)(?:\/|$)/`
- [x] Update line 222 function comment from `Detect slug from cwd if it's under openspec-workflow/requests/{active,awaiting-merge}/<slug>/.` to `Detect slug from cwd if it's under specrunner/requests/active/<slug>/.`

### Task 1.4: Update `src/core/finish/move-requests-dir.ts`

- [x] Open `src/core/finish/move-requests-dir.ts`
- [x] Update comment on line 2 from `Move requests dir from awaiting-merge to merged and commit.` to `Move requests dir from active to merged and commit.`
- [x] Update comment on line 4 from `TC-027: git mv awaiting-merge/<slug> → merged/<slug>` to `TC-027: git mv active/<slug> → merged/<slug>`
- [x] Update comment on line 5 from `TC-028: merged/ exists + awaiting-merge/ absent → skip (idempotent)` to `TC-028: merged/ exists + active/ absent → skip (idempotent)`
- [x] Update comment on line 19 from `Move awaiting-merge/<slug> to merged/<slug> and commit.` to `Move active/<slug> to merged/<slug> and commit.`
- [x] Change line 29-30 from `const awaitingMergePath = path.join("openspec-workflow", "requests", "awaiting-merge", slug);` to `const activePath = path.join("specrunner", "requests", "active", slug);`
- [x] Change line 32-33 from `const mergedPath = path.join("openspec-workflow", "requests", "merged", slug);` to `const mergedPath = path.join("specrunner", "requests", "merged", slug);`
- [x] Update variable name on line 36 from `awaitingExists` to `activeExists`, update path from `awaitingMergePath` to `activePath`
- [x] Update variable name on line 37, keep `mergedExists`
- [x] Update condition on line 40 from `if (mergedExists && !awaitingExists)` to `if (mergedExists && !activeExists)`
- [x] Update message on line 45 from `requests dir already moved to merged/${slug}, skipping.` to `requests dir already moved to merged/${slug}, skipping.` (no change needed, already generic)
- [x] Update condition on line 50 from `if (awaitingExists)` to `if (activeExists)`
- [x] Update line 52 mkdir path from `path.join(cwd, "openspec-workflow", "requests", "merged")` to `path.join(cwd, "specrunner", "requests", "merged")`
- [x] Update line 56 git mv arguments from `["mv", awaitingMergePath, mergedPath]` to `["mv", activePath, mergedPath]`
- [x] Update line 105 success message from `Moved awaiting-merge/${slug} to merged/${slug} and committed.` to `Moved active/${slug} to merged/${slug} and committed.`

## Phase 2: Update tests

### Task 2.1: Update `tests/finish-orchestrator.test.ts`

- [x] Open `tests/finish-orchestrator.test.ts`
- [x] Update line 52 fixture path from `openspec-workflow/requests/awaiting-merge/test-slug` to `specrunner/requests/active/test-slug`

### Task 2.2: Update `tests/finish-ps-integration.test.ts`

- [x] Open `tests/finish-ps-integration.test.ts`
- [x] Update line 170 path from `openspec-workflow/requests/awaiting-merge/${slug}` to `specrunner/requests/active/${slug}`
- [x] Update line 176 path from `openspec-workflow/requests/awaiting-merge/${slug}` to `specrunner/requests/active/${slug}`
- [x] Update line 205 path from `openspec-workflow/requests/awaiting-merge/${slug}` to `specrunner/requests/active/${slug}`
- [x] Update line 213 path from `openspec-workflow/requests/merged/${slug}` to `specrunner/requests/merged/${slug}`

### Task 2.3: Update `tests/finish-adversarial.test.ts`

- [x] Open `tests/finish-adversarial.test.ts`
- [x] Update line 53 path from `openspec-workflow/requests/awaiting-merge/${slug}` to `specrunner/requests/active/${slug}`
- [x] Update line 248 path from `openspec-workflow/requests/awaiting-merge/${slug}` to `specrunner/requests/active/${slug}`

### Task 2.4: Update `tests/finish-resolve-target.test.ts`

- [x] Open `tests/finish-resolve-target.test.ts`
- [x] Update line 44 path from `openspec-workflow/requests/awaiting-merge/readme-update` to `specrunner/requests/active/readme-update`
- [x] Update line 115 path from `openspec-workflow/requests/awaiting-merge/readme-update` to `specrunner/requests/active/readme-update`
- [x] Update line 136 path from `openspec-workflow/requests/awaiting-merge` to `specrunner/requests/active`
- [x] Update line 154 path from `openspec-workflow/requests/awaiting-merge` to `specrunner/requests/active`
- [x] Find TC-131 test case (around line 115-130): update test name and description from `awaiting-merge 0 entries` to `active 0 entries`
- [x] Update TC-131 test to create empty `specrunner/requests/active/` directory instead of `openspec-workflow/requests/awaiting-merge/`
- [x] Find TC-132 test case: update test name and description from `awaiting-merge 2+ entries` to `active 2+ entries`
- [x] Update TC-132 test to create multiple `specrunner/requests/active/<slug>/` directories
- [x] Find TC-133 test case: update test name and description from `cwd under awaiting-merge/<dir>/` to `cwd under active/<dir>/`
- [x] Update TC-133 test to set cwd to `specrunner/requests/active/<slug>/`
- [x] Update all expected error messages in tests from `awaiting-merge` to `active`

### Task 2.5: Update `tests/unit/core/pr-create/body-template.test.ts`

- [x] Open `tests/unit/core/pr-create/body-template.test.ts`
- [x] Update line 19 fixture path from `openspec-workflow/requests/awaiting-merge/test-slug` to `specrunner/requests/active/test-slug`

### Task 2.6: Update `tests/state/job-slug.test.ts`

- [x] Open `tests/state/job-slug.test.ts`
- [x] Update line 119 test path from `openspec-workflow/requests/active/my-feature/request.md` to `specrunner/requests/active/my-feature/request.md`
- [x] Update line 122 test path from `openspec-workflow/requests/active/my-feature/request.md` to `specrunner/requests/active/my-feature/request.md`
- [x] Locate test case for `awaiting-merge` alternation (around line 129)
- [x] **Delete** the test case that validates `openspec-workflow/requests/awaiting-merge/<slug>/request.md` pattern matching
- [x] Verify remaining tests only validate `specrunner/requests/active/<slug>/` pattern

## Phase 3: Create delta specs

### Task 3.1: Create `specs/cli-commands/spec.md` delta spec

- [x] Create file `openspec/changes/specrunner-dir-rename/specs/cli-commands/spec.md`
- [x] Copy the relevant section from `openspec/specs/cli-commands/spec.md` (around line 170)
- [x] Modify the delta spec to change the repo check requirement from `openspec-workflow/requests/{active,awaiting-merge,merged,canceled}/` to `specrunner/requests/{active,merged}/`
- [x] Document that `REQUIRED_DIRS` should be `["active", "merged"]` exactly
- [x] Add a header explaining this is a delta spec for the `specrunner-dir-rename` change

### Task 3.2: Create `specs/cli-finish-command/spec.md` delta spec

- [x] Create file `openspec/changes/specrunner-dir-rename/specs/cli-finish-command/spec.md`
- [x] Copy the relevant sections from `openspec/specs/cli-finish-command/spec.md` (lines 14, 15, 41)
- [x] Modify section 4-a (line 14) to: `cwd is under specrunner/requests/active/<dir>/ → <dir> is slug`
- [x] Modify section 4-b (line 15) to: `specrunner/requests/active/<dir>/ has exactly 1 entry → <dir> is slug`
- [x] Remove all references to `awaiting-merge` from scenarios
- [x] Update line 41 scenario description to use `specrunner/requests/active/`
- [x] Add a header explaining this is a delta spec for the `specrunner-dir-rename` change

### Task 3.3: Create `specs/job-state-store/spec.md` delta spec

- [x] Create file `openspec/changes/specrunner-dir-rename/specs/job-state-store/spec.md`
- [x] Copy the relevant sections from `openspec/specs/job-state-store/spec.md` (lines 220, 235, 239)
- [x] Modify line 220 to reference `specrunner/requests/active/<slug>/` instead of `openspec-workflow/requests/active/<slug>/`
- [x] Modify line 235 to update the canonical layout description to `<repo>/specrunner/requests/active/<slug>/request.md`
- [x] Remove the statement about `awaiting-merge/` paths being valid invocation points
- [x] Modify line 239 scenario to use `specrunner run specrunner/requests/active/readme-status-section/request.md`
- [x] Update the CANONICAL_PATTERN regex definition to match `specrunner/requests/active/<slug>/` only (no `awaiting-merge` alternation)
- [x] Add a header explaining this is a delta spec for the `specrunner-dir-rename` change

## Phase 4: Verification

### Task 4.1: Verify no old path references remain

- [x] Run `grep -rn "openspec-workflow/requests" src/` and verify **0 results**
- [x] Run `grep -rn "openspec-workflow/requests" tests/` and verify **0 results**
- [x] Run `grep -rn "openspec-workflow/requests" openspec/specs/` and verify **0 results**
- [x] Run `grep -rn "awaiting-merge" src/` and verify **0 results**
- [x] Run `grep -rn "awaiting-merge" tests/` and verify **0 results**
- [x] Run `grep -rn "canceled" src/` and verify **0 results**
- [x] Run `grep -rn "canceled" tests/` and verify **0 results**

### Task 4.2: Verify openspec-workflow dev tooling is untouched

- [x] Run `ls -la openspec-workflow/` and verify `adr/`, `instincts/`, `learned-patterns.md`, `review-lessons.md`, `constraints.md` are present and unmodified
- [x] Run `git status openspec-workflow/` and verify no unstaged changes to dev tooling files

### Task 4.3: Run build and tests

- [x] Run `bun run build` and verify it passes with no errors
- [x] Run `bun test` and verify all tests pass

## Phase 5: Final checks

- [x] Verify all files in `openspec/changes/specrunner-dir-rename/` are created: `proposal.md`, `design.md`, `tasks.md`, and 3 delta specs
- [x] Review the delta specs to ensure they accurately reflect the changes to the original specs
- [x] Verify that `REQUIRED_DIRS` in `src/core/doctor/checks/repo/workflow-structure.ts` is exactly `["active", "merged"] as const`
- [x] Verify that `CANONICAL_PATTERN` in `src/cli/run.ts` matches `specrunner/requests/active/<slug>/<filename>.md` without `awaiting-merge` alternation
- [x] Verify that `src/core/finish/move-requests-dir.ts` performs `git mv` from `active/<slug>/` to `merged/<slug>/`
