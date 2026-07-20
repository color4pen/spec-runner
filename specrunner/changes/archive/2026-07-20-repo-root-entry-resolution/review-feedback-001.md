# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|

No blocking findings.

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 8.95

## Summary

All 7 acceptance criteria are satisfied. 544 test files / 7442 tests pass; `tsc --noEmit` and `eslint` are clean; changed-line coverage passes.

### Acceptance-criteria check

| Criterion | Status | Evidence |
|-----------|--------|----------|
| T1 doctor subdir 同値 | ✅ | TC-004/TC-005 in `doctor-repo-root.test.ts`; checks use `ctx.repoRoot ?? ctx.cwd` |
| T2 job stats subdir 同値 | ✅ | TC-006/TC-016 in `job-stats-repo-root.test.ts` |
| T3 request new subdir write-path | ✅ | TC-007/TC-015 in `request-new-repo-root.test.ts` |
| T4 ユーザー入力相対パス | ✅ | TC-008 in `request-new-repo-root.test.ts` |
| T5 歯（ratchet） | ✅ | CWD invariant block in `core-invariants.test.ts`; 46-entry seed in `arch-allowlist.ts` |
| T6 repo 外 doctor 回帰防止 | ✅ | TC-009 in `doctor-repo-root.test.ts` |
| T7 typecheck && test | ✅ | 7442 tests green; tsc + eslint clean |

### Informational observations (no action required)

**OBS-1 — `buildCommandContext` in subcommand path is outside any try/catch**  
File: `bin/specrunner.ts` lines 102–108.  
In the subcommand dispatch branch, `buildCommandContext` is called between two `try/catch` blocks; in the normal command branch (line 148) it is inside the `try` block. If `buildCommandContext` unexpectedly throws in the subcommand path, the exception surfaces as `"Fatal: ..."` via `main().catch(...)` rather than a structured error message. Risk is negligible in practice — `resolveRepoRoot` is designed to return `null` on failure, not throw. No action required in this iteration.

**OBS-2 — `ctx?: CommandContext` requires `!` assertions in `requiresRepo` handlers**  
File: `src/cli/command-registry.ts` lines 344, 696.  
The optional `ctx?` signature is intentional for backward-compatible handlers; `requiresRepo: true` handlers compensate with `ctx!.repoRoot!` and an explanatory comment. The trade-off is a type gap between `requiresRepo` declaration and non-null guarantee. Acceptable for an incremental transition; the follow-up burn-down can introduce a stronger type if desired.

### Positive notes

- Dispatch-time single resolution is implemented in both branches (subcommand and normal), after `--help`/`--version` short-circuits and after the worktree guard — exactly per D1.
- `buildCommandContext` is minimal and injectable (`resolveFn?`), making TC-001/TC-012 fully unit-testable without a real git repo.
- `loadConfigWithOverlay` receives the pre-resolved `repoRoot` (`preResolved` param), eliminating the duplicate `resolveRepoRoot` call that previously existed at `doctor.ts:114`.
- `DoctorContext.repoRoot` is optional — zero churn to the many existing check unit tests that build mock contexts without the field.
- Mutation guards (TC-005, TC-015, TC-016) confirm that reverting each conversion would fail the corresponding must-pass test.
- CWD allowlist seed correctly omits all three converted sites (`command-registry.ts:334`, `command-registry.ts:683`, `doctor.ts:114`) and distinguishes `role-a / role-b / di-default / debt` with comments per D6.
- All scoped-out items (allowlist burn-down, error wording, CI smoke test) are deferred and enumerated in the debt classification.
