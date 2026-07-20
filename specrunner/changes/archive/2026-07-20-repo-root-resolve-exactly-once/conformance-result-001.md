# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | All T-01 through T-08 checkboxes marked [x] |
| design.md | ✓ | D1–D7 all implemented as specified |
| spec.md | ✓ | All Requirements and Scenarios satisfied |
| request.md | ✓ | T1–T5 acceptance criteria all pass |

## Scope

38 files changed (3 564 insertions, 330 deletions).
Key areas: `src/cli/` handler conversions, `tests/unit/architecture/` invariants, ADR identifier fix.

## Design decisions (D1–D7)

| ID | Decision | Verified |
|----|----------|---------|
| D1 | Handlers receive root via `CommandContext`; registry handlers touch `ctx` | ✓ `command-registry.ts` passes `ctx!.repoRoot!` to each converted handler |
| D2 | Repo-required commands use `requiresRepo: true`; bespoke error branches removed | ✓ `init`, `inbox run`, `job prune`, `job cancel`, `job attach`, `inbox`, `job stats` all declare `requiresRepo: true`; no per-handler `resolveRepoRootOrFail` |
| D3 | Repo-optional commands consume `ctx.repoRoot ?? ctx.invokerCwd`; no re-resolution | ✓ `job-show.ts`, `config-effective.ts`, `bootstrap.ts` have no `resolveRepoRoot` calls |
| D4 | `ps.ts` keeps its DI fallback; production caller supplies root | ✓ exactly one non-comment `resolveRepoRoot` reference at the `opts.repoRoot ??` DI seam |
| D5 | Grep invariant in `core-invariants.test.ts` with fixed `RESOLVE_REPO_ROOT_ALLOWED_FILES` | ✓ TC-003 (confinement), TC-004 (no `show-toplevel`), TC-005 (liveness), TC-015 (regression guards) all present |
| D6 | Burn down four CWD allowlist entries | ✓ `CWD-init-git-spawn`, `CWD-job-show-root-resolve`, `CWD-inbox-debt`, `CWD-config-effective-di-default` absent; `CWD-ps-root-resolve` and `CWD-job-show-print-default` retained |
| D7 | Replace four `B-13` references in ADR with `CWD`/`T-05` identifier | ✓ `grep B-13` in the ADR returns no matches |

## Acceptance criteria

### T1 — Subdir equivalence
- `tests/unit/cli/repo-root-exactly-once.test.ts` implements TC-011, TC-012, TC-009, TC-014 via static-analysis and structural tests.
- Full suite (561 test files, 7 666 tests) green. **PASS**

### T2 — Exactly-once tooth
- `RESOLVE_REPO_ROOT_ALLOWED_FILES` exported from `arch-allowlist.ts` with exactly 4 entries.
- `core-invariants.test.ts` has the confinement/no-direct-resolution/liveness/regression-guard block.
- Regression guards (TC-015): synthetic `resolveRepoRoot` in `inbox.ts` or `cancel.ts` → violation detected; synthetic match in `ps.ts` → suppressed. **PASS**

### T3 — Allowlist shrinkage
- Four CWD entries removed; none added; total CWD entry count strictly decreased. **PASS**

### T4 — Identifier uniqueness
- `grep B-13` in the ADR returns no output.
- `resolveRepoRoot` in `src/cli/*.ts` (non-test) is confined to the 4 allowed files; `show-toplevel` in `src/cli/` is empty. **PASS**

### T5 — typecheck && test green
- build: passed, typecheck: passed, test: 561 files / 7 666 tests passed, lint: passed, changed-line-coverage: passed. **PASS**
