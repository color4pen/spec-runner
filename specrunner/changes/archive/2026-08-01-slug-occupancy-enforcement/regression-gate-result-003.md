# Regression Gate Result — Iteration 3

**Change**: slug-occupancy-enforcement  
**Date**: 2026-08-01  
**Findings ledger**: 13 items  
**Regressions found**: 0

---

## Evidence

### [LOW] T-09: onPipelineComplete フォールバック

**File checked**: `specrunner/changes/slug-occupancy-enforcement/spec.md` + `src/cli/progress.ts`

- `spec.md` lines 213–218: "any other status → no Next guidance is printed (the else branch is a no-op)" explicitly added.
- `progress.ts` lines 163–172: `onPipelineComplete` branches on `p.state.status`; comment `// Other statuses → no hint` confirms the else branch is a deliberate no-op.

**Verdict**: FIXED ✓

---

### [LOW] T-08: doctor repair slug バリデーション要件

**File checked**: `specrunner/changes/slug-occupancy-enforcement/tasks.md` + `src/core/occupancy/repair.ts`

- `tasks.md` line 147: "The `slug` argument MUST be validated against `SLUG_REGEX` (consistent with `request-new.ts:24` and `command-registry.ts:417`)".
- `repair.ts` lines 50–56: `SLUG_REGEX.test(slug)` guard throws `REQUEST_MD_INVALID` on mismatch before any I/O.

**Verdict**: FIXED ✓

---

### [CRITICAL] B-001: claimLivenessSidecar 未接続

**File checked**: `src/core/runtime/local.ts` + `src/core/runtime/workspace-materializer.ts` + `src/core/occupancy/claim.ts`

- `local.ts` lines 1432–1451: `writeLivenessSidecar` now calls `claimLivenessSidecar(this.cwd, slug, record, {...})`.
- `workspace-materializer.ts` lines 91, 117, 149, 177: all 4 call-sites remain `await this.host.writeLivenessSidecar(...)` which delegates to `claimLivenessSidecar` via the port.
- `claim.ts`: check-and-claim logic confirmed; non-terminal foreign sidecar throws `SLUG_OCCUPIED`.

**Verdict**: FIXED ✓

---

### [CRITICAL] B-002: inbox 拒否コメントが本番経路で未投稿

**File checked**: `src/core/inbox/run-inbox.ts`

- Lines 379–395: `startJob` default implementation performs occupancy pre-check via `JobStateStore.list()` BEFORE calling `runRunCore`. Non-terminal occupants cause `slugOccupiedError` to throw before `runRunCore` is ever invoked.
- Lines 219–255: Inbox catch block catches `SLUG_OCCUPIED` errors, builds an idempotent reject comment with marker `<!-- specrunner:notification kind="slug-occupied" priorJobId="..." version="1" -->`, and calls `effects.postRejectComment`.
- `JobStateStore.list()` (delegating to `JobCatalog`) scans main checkout + worktrees + local sidecar supplement, so worktree-only occupants are also captured by the pre-check.

**Verdict**: FIXED ✓

---

### [HIGH] B-003: specrunner doctor repair CLI 未登録

**File checked**: `src/cli/command-registry.ts`

- Lines 908–946: `doctor` handler checks `parsed.positionals[0] === "repair"`, reads `parsed.positionals[1]` as slug, and dynamically imports + calls `repairSlugOccupancySidecar`. `repair.ts` is no longer dead code (imported in production path).

**Verdict**: FIXED ✓

---

### [MEDIUM] W-001: resolveJobStateBySlug が try/catch 外 (resume.ts / reopen.ts)

**File checked**: `src/cli/resume.ts` + `src/cli/reopen.ts`

- `resume.ts` lines 47–53: `resolveJobStateBySlug` wrapped in try/catch; logs error message and returns 1 on throw.
- `reopen.ts` lines 58–64: same pattern applied.

**Verdict**: FIXED ✓

---

### [MEDIUM] W-002: --purge skip 時に warning なし + terminal foreign sidecar でも purge ブロック

**File checked**: `src/core/cancel/runner.ts`

- Lines 506–525: foreign jobId lookup now checks `TERMINAL_STATUSES.has(foreignState.status)`. Terminal foreign sidecar → safe to purge (falls through). Non-terminal foreign sidecar → `skipPurge = true` AND `warnings.push(...)` with descriptive message.
- Both sub-findings addressed: warning now emitted, terminal sidecars no longer block purge.

**Verdict**: FIXED ✓

---

### [MEDIUM] W-003: running + alive guard メッセージが誤り

**File checked**: `src/core/occupancy/guard.ts`

- Lines 57–66: `const isAlive = deps?.isAlive;` and `if (prior.status === "running" && isAlive !== undefined && isAlive(prior.pid))` → throws wait/cancel message for running+alive, and falls through to `slugOccupiedError` (which includes resume/cancel guidance) for all other cases.

**Verdict**: FIXED ✓

---

### [MEDIUM] isAlive not wired in production

**File checked**: `src/core/runtime/local.ts` + `src/core/runtime/managed.ts`

- `local.ts` lines 913–916: `await assertSlugUnoccupied(repoRoot, slug, { isAlive: (pid) => isProcessAlive(pid ?? 0) })`.
- `managed.ts` lines 601–605: same injection pattern with `isProcessAlive`.

**Verdict**: FIXED ✓

---

### [MEDIUM] inbox pre-check が scanSlugOccupancy でなく JobStateStore.list() を使用

**File checked**: `src/core/inbox/run-inbox.ts` + `src/store/job-catalog.ts`

- Lines 382–395: pre-check uses `JobStateStore.list(repoRoot)` before calling `runRunCore`.
- `job-catalog.ts` lines 98–115: `JobCatalog.list()` scans worktrees (`.git/specrunner-worktrees/*/specrunner/changes/*/state.json`), matching `scanSlugOccupancy`'s location-2 coverage. The claimed narrower scope does not exist in practice.
- The core gap (exception swallowed by `runRunCore`) is resolved by the pre-check position.

**Verdict**: FIXED ✓

---

### [HIGH] cancelAllTerminated が failed/terminated state ファイルを残置

**File checked**: `src/core/cancel/runner.ts`

- Lines 619–641: loop over `targets` now transitions non-terminal states (`failed`/`terminated`) to `canceled` via `transitionJob` + `store.persist` before removing the sidecar directory. Comment explains rationale: "state-based occupancy guard does not block new starts after bulk cleanup".

**Verdict**: FIXED ✓

---

### [MEDIUM] ReopenCommand が terminal-only slug に 'Job not found' を表示

**File checked**: `src/core/command/reopen.ts`

- Lines 112–154: when `resolveJobStateBySlug` returns `null`, falls back to `JobStateStore.list(cwd, { includeArchived: true })` filtered to the same slug. If terminal jobs exist, logs the status gate message ("has status '...' and cannot be reopened. Only 'awaiting-archive' jobs are eligible for reopen.") and throws `PrepareError` — not `JOB_NOT_FOUND`.

**Verdict**: FIXED ✓

---

### [MEDIUM] scanSlugOccupancy が worktrees の全エラーを ENOENT 扱いで swallow

**File checked**: `src/core/occupancy/scan.ts`

- Lines 108–116: catch block inspects `(err as NodeJS.ErrnoException).code`. ENOENT only → safe to ignore. Non-ENOENT → `unreadable = "worktrees enumeration failure at ..."` which causes the guard to refuse start (fail-closed). Comment: "D4: only ENOENT (directory absent) is safe to swallow."

**Verdict**: FIXED ✓

---

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | LOW | T-09 spec.md fallback missing | FIXED |
| 2 | LOW | T-08 tasks.md slug validation missing | FIXED |
| 3 | CRITICAL | B-001 claimLivenessSidecar not wired | FIXED |
| 4 | CRITICAL | B-002 inbox reject comment not posted | FIXED |
| 5 | HIGH | B-003 doctor repair CLI not registered | FIXED |
| 6 | MEDIUM | W-001 resolveJobStateBySlug outside try/catch | FIXED |
| 7 | MEDIUM | W-002 purge warning missing + terminal blocks | FIXED |
| 8 | MEDIUM | W-003 guard running+alive wrong message | FIXED |
| 9 | MEDIUM | isAlive not wired in production | FIXED |
| 10 | MEDIUM | inbox pre-check scope narrower than scanSlugOccupancy | FIXED |
| 11 | HIGH | cancelAllTerminated leaves non-terminal state files | FIXED |
| 12 | MEDIUM | ReopenCommand misleading 'Job not found' | FIXED |
| 13 | MEDIUM | scanSlugOccupancy swallows non-ENOENT errors | FIXED |

All 13 findings confirmed fixed. No regressions detected.
