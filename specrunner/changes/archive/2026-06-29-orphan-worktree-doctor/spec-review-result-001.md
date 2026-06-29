# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | UX consistency | tasks.md T-03 | `git worktree prune` (step 2) runs unconditionally, including during dry-run. This is a silent mutation in a mode users expect to be read-only. The operation is low-risk (clears only stale refs, no data loss), but deviates from "dry-run = no mutations" semantics. | Guard the `worktreeManager.prune(repoRoot)` call behind `if (force)`. A dry-run already lists orphans from `git worktree list --porcelain`; the ref-cleanup sweep can be deferred to the force path without loss of correctness. |
| 2 | LOW | Missing spec detail | tasks.md T-04 | `PRUNE_USAGE` content is not specified. The tasks mention adding it but leave the string undefined. Implementers must invent the help text without a reference. | Add a `PRUNE_USAGE` example string to tasks.md T-04, mirroring the format used by existing commands (e.g. `CANCEL_USAGE` in `src/cli/cancel.ts`). One sentence is sufficient: usage line + `--force` description. |

## Notes

**Detection correctness**: Verified against the codebase. `JobStateStore.list(repoRoot, { includeArchived: true })` does NOT scan `specrunner/changes/canceled/` (the list loop skips entries named `canceled`), so a partially-canceled job whose worktree survived is correctly classified as orphan rather than protected. The protected set built from `${getJobSlug(state)}-${state.jobId.slice(0, 8)}` reproduces the exact directory name produced by `buildWorktreePath` because `loadSplitLayout` injects `request.slug` from the slug directory name at load time, which is the same slug `buildWorktreePath` uses.

**Security review**: No HIGH/CRITICAL security concerns. The `--force` flag is correctly unrelated to the work-protection guard (guard is a hard floor). All git invocations use `spawnCommand` (not shell-interpolated), so branch-name and worktree-path arguments from `git worktree list --porcelain` cannot inject shell commands. Dry-run default matches the destructive-operation safety norm for local CLI tools.

**Naming alignment**: The tasks ask to align the non-terminal status set with `ACTIVE_STATUSES` from `orphan-sidecars.ts`. Both sets include `running`, `awaiting-resume`, `awaiting-archive`, `failed`, `terminated` — verified against source. Extracting a shared constant (as the tasks suggest "if convenient") is a good call when implementing; it prevents future drift.

**OWASP considerations**: Only locally applicable concern is accidental data destruction (analogous to A01 Broken Access Control). The work-protection guard (`git status --porcelain` + `rev-list --count HEAD --not --remotes`) and the dry-run default address this adequately. The conservative behavior for repos without remote-tracking refs (all history treated as unpushed → skip) is explicitly documented in the design and errs safely.

**Overall assessment**: Design is architecturally sound and consistent with existing patterns (`cancel` runner shape, `orphan-sidecars` philosophy, DI for testability). The two LOW findings are non-blocking; the spec is ready for implementation.
