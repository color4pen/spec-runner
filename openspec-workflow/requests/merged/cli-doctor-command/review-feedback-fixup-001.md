## Code Review Result (Fixup)

**Verdict**: approved
**Score**: 8.05 / 10.0 (pass threshold: 7.0)
**Iteration**: fixup-001 (post-merge fixup applied to awaiting-merge state)
**Trend**: improving (+0.15 vs review-feedback-003: 7.90)

### Scope

This is a fixup review limited to the working-tree changes against the `awaiting-merge` HEAD (`de77bcd`). The 22 files in `pipeline-context.md` Fixup Review Scope are the substantive subset. `decisions/code-fixer.md` and `pipeline-context.md` are workflow artifacts and excluded from scoring.

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 8.5 | 0.10 | 0.85 |
| **Total** | | | **8.05** |

> Adjustments vs review-feedback-003: maintainability 7 → 8 (timeout convention unified to `AbortSignal.timeout`, tautology hint strings replaced with reachable commands, dead `existsSync` import removed); testing 8 → 8.5 (TC-040b ancestor-walk + TC-072 malformed-config fail are behavioral assertions on real branches rather than tautology).

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | **PASS** (`bun run build` exit 0) |
| Type Check | **PASS** (`bun run typecheck` exit 0) |
| Lint | N/A (no eslint script in this repo) |
| Tests | **PASS** (621/621 vitest, 81 test files; +2 vs iter-3: TC-040b + TC-072) |
| Security | N/A (security-reviewer disabled in pipeline-context.md) |

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | architecture | src/core/doctor/checks/repo/git-repository.ts:14-15 | `git rev-parse --is-inside-work-tree` is invoked without an explicit `cwd` option, so it runs in the *process* cwd rather than `ctx.cwd`. In production these are equal (`ctx.cwd = process.cwd()` in `src/cli/doctor.ts:101`), but the failure message at line 23 reports `ctx.cwd` as if it were the probed path. If `ExecFileFunction` ever gains a `cwd` option or a future caller mutates `ctx.cwd`, the message and the actual probe will diverge silently. | Optional polish: extend `ExecFileFunction` with `cwd?: string` and pass `{ cwd: ctx.cwd, signal: AbortSignal.timeout(5000) }`. Skippable for this fixup — current production wiring is consistent. |
| 2 | LOW | maintainability | src/core/doctor/checks/storage/jobs-writable.ts:36-65 | The ancestor walk `while (ancestor !== path.dirname(ancestor))` plus the post-loop fail block duplicates the "ancestor not writable" return shape. Read-flow is clear but two return sites carry the same message template. | Optional: extract a single fail return after the loop and let the EACCES branch fall through to it. Skippable — current code is correct and the duplication is intentional for separating "EACCES on a real ancestor" from "walked past root." |
| 3 | LOW | architecture | bin/specrunner.ts:104 (carryover) | `if (process.env["VITEST"] !== "true")` auto-invoke guard remains coupled to a specific test runner env var. | Carryover from review-feedback-003 #1. Still skippable. |
| 4 | LOW | maintainability | src/core/doctor/checks/runtime/openspec.ts (carryover) | `OPENSPEC_TIMEOUT_MS` constant name no longer reflects sole `setTimeout` usage. | Carryover from review-feedback-003 #3. Still skippable. |

No CRITICAL, no HIGH, no MEDIUM in the fixup scope.

### Iteration Comparison

#### Improvements (resolved or strengthened vs review-feedback-003)

| iter-3 Concern | Resolution in fixup-001 |
|---|---|
| `'specrunner init --resync'` hint pointed at a non-existent flag (latent UX bug; not flagged in iter-3 but surfaced in code-fixer decisions) | `definition-drift.ts` now reads `"Re-run 'specrunner init' to refresh agent definitions."` — verified flag absence in `bin/specrunner.ts` init parser. Test updated (`definition-drift.test.ts:55`) to assert the new substring. |
| `'specrunner gc'` hint pointed at a non-existent subcommand | `old-state-files.ts` now reads `Manually remove old .json files in <jobsDir>` and message clarifies `more than ${GC_THRESHOLD}`. Test updated (`old-state-files.test.ts:26`). |
| `jobs-writable` only walked one level (parent), so new users with a missing `~/.local/share` chain saw a false `fail` | Now walks ancestors recursively until it finds an existing directory or reaches root. New TC-040b test covers `jobs dir + parent ENOENT, grandparent writable → warn`. |
| `git-repository` used `existsSync('.git')` which false-fails when invoked from a sub-directory | Replaced with `git rev-parse --is-inside-work-tree`. Tests rewritten to mock `execFile` instead of `fs.existsSync`. Dead `path` import removed. |
| `runDoctor` directly called `process.exit`, which prevented the `bin/specrunner.ts` outer try/catch from catching it and risked stdout flush loss | `runDoctor` now `Promise<number>` returning the exit code; `bin/specrunner.ts:85` does `process.exit(await runDoctor(...))`. Tests in `doctor-cli.test.ts` rewritten — exit-spy throw-pattern removed in favor of `expect(code).toBe(N)`. Cleaner test design. |
| `loadConfig()` exception was swallowed (`catch {}`), so malformed JSON looked identical to ENOENT downstream | `runDoctor` now captures `err.message` into `configLoadError`, propagated via new `DoctorConfig.loadError?: string`. `config-file-exists.ts` returns a distinct `fail` with the parser error inlined. New TC-072 covers this path. |
| Mixed `{ timeout: 5000 }` + `{ signal: AbortSignal.timeout }` between checks | Unified all four (`bun.ts`, `git.ts`, `github-origin.ts`, `git-repository.ts`) on `AbortSignal.timeout(5000)`. `openspec.ts` and `auth/*` already used signals. |
| `vi.fn()` for `fetch` mock was structurally compatible only by accident with `typeof globalThis.fetch` | Added `as unknown as typeof fetch` cast at the single source `mock-context.ts:52` and at every test-site mock construction. TC-064 also switches to `vi.mocked(mockFetch)` to keep the `Mock<...>` API after the cast. |

#### Regressions

None.

#### Unchanged (LOW carryovers)

| iter-3 Finding | State |
|---|---|
| #1 VITEST env-var coupling | Unchanged. Acceptable. |
| #2 `afterEach` placement in `definition-drift.test.ts` | Still outside `describe`. Vitest hoists; informational. |
| #3 `OPENSPEC_TIMEOUT_MS` naming | Unchanged. Out of fixup scope (file not listed in review-scope). |
| #4 pipeline-integration.test.ts working-tree pollution | Out of scope; pre-existing on main. The stray `openspec/changes/test-slug/pr-create-result.md` reappeared as untracked because the pre-existing mock still defaults to `process.cwd()`. The staged tree is clean — this is a pre-PR concern, not a regression. |

#### Convergence Trend

- Total: 7.05 (iter-1) → 7.45 (iter-2) → 7.90 (iter-3) → 8.05 (fixup-001) → **improving**
- HIGH/CRITICAL count: 1 → 1 → 0 → 0 → **converged**
- All eight fixup decisions in `decisions/code-fixer.md` are mechanically verifiable in the diff and verified by the test suite.

### Summary

- The fixup cleanly addresses every UX-bug and port-purity gap recorded in the iter-2 code-fixer follow-ups: hints now point at reachable commands; timeouts use one convention; `runDoctor` separates exit-code computation from process termination; malformed-config gets a distinct, actionable fail; `jobs-writable` no longer false-fails for new users; `git-repository` works from sub-directories.
- Two new behavioral tests (TC-040b for ancestor walk; TC-072 for malformed-config fail) exercise real branches rather than tautology — both pass. Existing tests for `git-repository`, `doctor-cli`, and the auth checks were rewritten to match the new signatures and types; 621/621 pass.
- Type cast `as unknown as typeof fetch` is the canonical pattern for vi.fn-as-fetch. Centralizing it at `mock-context.ts:52` plus repeating it at every test-site keeps each `vi.fn()` literal type-checked. Slightly verbose but eliminates the structural-compat fragility flagged by code-fixer.
- Verification fully green: build, typecheck, 621 tests pass. No HIGH/CRITICAL findings remain.
- Trend `improving` for 3 consecutive iterations, no regressions, scope-bounded fixup contains no new defects. Approved.

### Recommended Next Action

1. Commit the fixup as a single `fix:` commit (e.g. `fix: address fixup review decisions for cli-doctor-command`). The 22-file diff is cohesive and squashable.
2. Proceed to PR merge. The pre-existing pipeline-integration.test.ts working-tree pollution (Finding #4 carryover) should be tracked in a separate backlog item rather than blocking this PR.
