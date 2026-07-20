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
| tasks.md | ✓ | All 7 task blocks (T-01 through T-07) are marked [x]; no unchecked items |
| design.md | ✓ | D1–D6 implemented faithfully; one minor type deviation (OBS-2, accepted) |
| spec.md | ✓ | All 8 Requirements and their Scenarios are covered by implementation and tests |
| request.md | ✓ | All acceptance criteria T1–T7 satisfied with mutation guards |

---

## Judgment 1 — Tasks complete

All 7 task blocks (T-01 through T-07) have all checkboxes marked `[x]`. No unchecked items. ✓

---

## Judgment 2 — Design decisions implemented

### D1 — Resolve repo root once at dispatch; inject as CommandContext

`src/cli/command-context.ts` exports `CommandContext` + `buildCommandContext(invokerCwd, resolveFn?)`.
`bin/specrunner.ts` calls `buildCommandContext(process.cwd())` in **both** the subcommand path
(line 102) and the normal command path (line 148), after `--help`/`--version` short-circuits
and after the worktree guard — exactly per D1.

Minor deviation: `CommandDef.handler` is typed `ctx?: CommandContext` (optional) rather than
the `ctx: CommandContext` in tasks.md. The design notes "fewer-parameter functions remain
assignable", so the optional signature achieves the same backward-compat goal. Dispatch always
supplies ctx; the handlers that consume it use `ctx!.repoRoot!` with an explanatory comment.
Flagged as OBS-2 in the code review and accepted. ✓

### D2 — requiresRepo + unified out-of-repo error

`CommandDef.requiresRepo?: boolean` added. `repoRequiredError(command)` factory added to
`src/errors.ts` using `NOT_GIT_REPO` code (exit 2) with a hint prescribing `git init` or `cd`.
Dispatch gates `requiresRepo: true` commands before calling the handler. ✓

### D3 — Convert job stats and request new

`job stats` subcommand: `requiresRepo: true` + `runJobStats({ cwd: ctx!.repoRoot!, json })`. ✓  
`request new` subcommand: `requiresRepo: true` + `executeNew(slug, requestType, ctx!.repoRoot!)`. ✓  
Downstream functions (`runJobStats`, `executeNew`) unchanged; their unit tests pass unmodified. ✓

### D4 — doctor: carry repo root in DoctorContext; keep repo-optional

`DoctorContext.repoRoot?: string | null` added (optional — zero churn to existing check mocks). ✓  
`runDoctor` signature: `{ json, repoRoot?, invokerCwd? }`. Uses pre-supplied `repoRoot` when
provided, falls back to `resolveRepoRoot(invokerCwd)`. ✓  
All 9 repo/storage checks converted to `ctx.repoRoot ?? ctx.cwd`:
`repo/git-repository.ts`, `repo/specrunner-project-md.ts`, `repo/workflow-structure.ts`,
`storage/local-state-writable.ts`, `storage/legacy-jobs-dir.ts`, `storage/orphan-sidecars.ts`,
`storage/journal-integrity.ts`, `storage/orphan-worktrees.ts`, `runtime/package-manager.ts`. ✓  
`doctor` retains `requiresRepo: false`. Duplicate `resolveRepoRoot(process.cwd())` at former
line 114 eliminated; resolved `repoRoot` is reused. ✓

### D5 — Preserve worktree semantics

`src/util/repo-root.ts` is unchanged. Dispatch routes through `resolveRepoRoot`, which returns
the enclosing worktree root inside a job worktree — identical to prior behavior. ✓

### D6 — Tooth: process.cwd() in src/ is allowlist-gated

`CWD` invariant block added to `tests/unit/architecture/core-invariants.test.ts`
(TC-010, TC-018, TC-019, TC-020, regression guards). Liveness assertion confirms scan is
non-vacuous. ✓  
`arch-allowlist.ts` seeded with CWD entries covering all remaining `process.cwd()` sites in
`src/`, classified as permanent-legit (role a/b/DI) or debt. The three converted sites
(command-registry.ts:334, :683, doctor.ts:114) are absent from the seed (TC-020 confirms). ✓

---

## Judgment 3 — Spec requirements satisfied

| Requirement | Test Evidence |
|-------------|--------------|
| Repo root resolved once at dispatch | `command-context.test.ts` TC-001/TC-012 |
| Repo-required commands stop outside a repo | `request-new-repo-root.test.ts` TC-003 |
| doctor equivalent from subdir | `doctor-repo-root.test.ts` TC-004/TC-005 (mutation guard) |
| job stats equivalent from subdir | `job-stats-repo-root.test.ts` TC-006/TC-016 (mutation guard) |
| request new targets root drafts | `request-new-repo-root.test.ts` TC-007/TC-015 (mutation guard) |
| User-supplied relative paths resolve against invoker cwd | `request-new-repo-root.test.ts` TC-008 |
| doctor runs outside repo; repo checks report fail | `doctor-repo-root.test.ts` TC-009 |
| process.cwd() in src/ is allowlist-gated | `core-invariants.test.ts` TC-010/TC-018–TC-020 |
| Worktree semantics preserved | resolveRepoRoot unchanged (D5) |

All 8 Requirements and their Scenarios are covered. ✓

---

## Judgment 4 — Acceptance criteria (T1–T7)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| T1 doctor subdir 同値 + 破壊確認 | ✓ | TC-004 (equivalence) + TC-005 (revert-to-cwd fails) |
| T2 job stats subdir 同値 + 破壊確認 | ✓ | TC-006 + TC-016 (revert → 0 runs) |
| T3 request new subdir write-path + 破壊確認 | ✓ | TC-007 + TC-015 (revert nests under subdir) |
| T4 ユーザー入力相対パス回帰防止 | ✓ | TC-008 (validate resolves against invokerCwd) |
| T5 歯（ratchet） | ✓ | TC-010 + regression guards (un-allowlisted = detected) |
| T6 repo 外 doctor 回帰防止 | ✓ | TC-009 (repoRoot:null → completes, git-repository fails) |
| T7 typecheck && test green | ✓ | verification-result.md: 7442/7443 pass, tsc + eslint clean |

---

## Informational observations (non-blocking)

**OBS-1** (`bin/specrunner.ts` lines 102–108): `buildCommandContext` in the subcommand dispatch
path sits between two `try/catch` blocks. An unexpected throw would surface as `"Fatal: …"` rather
than a structured error. Risk is negligible — `resolveRepoRoot` degrades to `null` on failure,
not throw.

**OBS-2** (`command-registry.ts` lines 344, 696): `ctx?` optional signature requires `!`
assertions at the two `requiresRepo: true` call sites. Type gap between declaration and
null-guarantee is a known incremental trade-off; candidates for follow-up burn-down.

Both observations were raised and accepted in `review-feedback-001.md`. No action required.
