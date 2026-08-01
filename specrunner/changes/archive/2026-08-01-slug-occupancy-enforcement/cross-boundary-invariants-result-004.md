# cross-boundary-invariants Review — slug-occupancy-enforcement — iter 4

## Scope

Reviewed `git diff main...HEAD` (59 files, 8041 insertions / 436 deletions). Focus: invariants
held by **unchanged** code whose implicit assumptions the new behaviour silently breaks.
Iteration 4 builds on the confirmed fixes and confirmed-clean items from iterations 1–3 and
walks the remaining unexplored paths in the new code.

---

## Iteration 3 Findings Resolution

Both iter 3 low-severity observations remain unchanged in their characterisation:

- **Repair + unreadable co-existence** (UX gap): `repairSlugOccupancySidecar` discards
  `result.unreadable`; if a corrupted state file co-exists with a valid non-terminal job, repair
  returns a "done" message while `assertSlugUnoccupied` still blocks with
  `SLUG_STATE_UNREADABLE`. Guard invariant is intact; message misleads. No code change.
- **`discoverSlugs` skip-on-parse** (scope gap): `JobStateStore.list` silently skips corrupted
  entries, so a slug whose only state file is corrupted is invisible to `doctor`'s occupancy
  check. Guard correctly blocks with `SLUG_STATE_UNREADABLE`. Doctor has no visibility into
  purely-corrupted slugs. No code change; within the scope stated in design.md D4.

---

## New Analysis — Iteration 4

### Walk of key cross-boundary interactions

---

**`cancelAllTerminated` new state-transition step ↔ running-job sidecar (pre-existing, not new)**

The NEW step in `cancelAllTerminated` writes `canceled` to main checkout for `failed`/
`terminated` targets:

```typescript
if (!TERMINAL_STATUSES.has(state.status as JobStatus)) {
  // write canceled state to main checkout (NEW)
}
await fs.rm(path.join(repoRoot, localSidecarDir(slug)), { recursive: true, force: true });
// ^ unchanged: unconditional removal
```

Scenario: slug "foo" has job A (`running`, non-terminal) with sidecar at
`.specrunner/local/foo/liveness.json`; also has job B (`canceled`, terminal). When
`cancelAllTerminated` targets B (already terminal → no new transition step), `fs.rm` removes
`.specrunner/local/foo/` entirely, destroying A's sidecar. `isStaleRunning` for A then sees
an absent sidecar → returns `true`. Inbox would classify A as stale and schedule auto-recovery.

Confirmed **pre-existing** behaviour: the `fs.rm` was unconditional before this diff
(`main`:`runner.ts:523`). `isStaleRunning`'s sidecar-based priority-2 check (`safety.ts`) was
also pre-existing (not in this diff). The new transition step does not worsen this scenario —
it helps by converting `failed`/`terminated` targets to `canceled` (terminal) so the guard
correctly unblocks after bulk cleanup. The unconditional `fs.rm` for `canceled` targets is
unchanged. Noted in `design.md` Open Questions as a candidate follow-up.

---

**`cli/resume.ts` empty `repo` when all jobs are terminal ↔ bootstrap**

After the diff, `resolveJobStateBySlug` returns `null` when all matching jobs are terminal.
`runResumeCore` then builds `repo = { owner: "", name: "" }` and passes it to `bootstrap`.

Confirmed safe: the existing code path (before this diff) produced the identical `repo = …`
fallback when the resolver returned `null` (slug not found). `ResumeCommand.prepare()` calls
`resolveJobStateBySlug` a second time, finds terminal jobs, and throws `PrepareError(1, …)`
before any GitHub API call that would require a valid repo. `bootstrap` succeeds with an empty
repo because it only reads local config during setup. ✓

---

**`ResumeCommand.prepare()` terminal-job fallback ↔ new null return from resolver**

New fallback (lines 110–121):

```typescript
const allStates = await JobStateStore.list(cwd, { includeArchived: false });
const terminalForSlug = allStates.filter((s) => getJobSlug(s) === this.slug);
if (terminalForSlug.length > 0) {
  logError(`Job '${this.slug}' has status '${terminalState.status}', cannot transition to 'running'.`);
  throw new PrepareError(1, …);
}
```

Both `resolveJobStateBySlug` (inside the command) and the fallback use `JobStateStore.list` on
the same `cwd`. For "terminal-only slug" the resolver returns `null`, and the fallback finds the
terminal jobs — consistent. The user sees a clear status message instead of "job not found". ✓

---

**`ReopenCommand.prepare()` non-terminal non-`awaiting-archive` state from new resolver**

`resolveJobStateBySlug` now returns any non-terminal job. For a slug occupied by a `running` or
`awaiting-resume` job, the reopen status gate (`state.status !== "awaiting-archive"`) correctly
fires `PrepareError(1, …)`. For `awaiting-archive` (the only eligible status), the gate passes —
same path as before the diff. ✓

---

**`assertSlugUnoccupied` live-pid vs. dead-pid message routing ↔ inbox dedup marker**

The guard uses `SlugOccupiedError` directly for `running + alive` and `slugOccupiedError`
factory for all other non-terminal cases. Both produce `code === SLUG_OCCUPIED` and expose
`priorJobId` / `priorStatus` as typed properties on `SlugOccupiedError`.

The inbox catch block accesses these via:
```typescript
const errAny = err as { code?: string; priorJobId?: string; priorStatus?: string } & Error;
```

`SlugOccupiedError extends SpecRunnerError extends Error`, so `priorJobId` and `priorStatus`
are accessible via the cast. The dedup marker encodes `priorJobId`, which is stable across
inbox cycles for the same occupant. ✓

---

**`cancelSingleJob --purge` dual gate ↔ foreign non-terminal sidecar**

```typescript
if (!skipPurge) {
  await fs.rm(path.join(deps.repoRoot, localSidecarDir(slugForMarker)), …);
}
// Purge canonical change folder too
if (!skipPurge) {
  await fs.rm(path.join(deps.repoRoot, changeFolderPath(slugForMarker)), …);
}
```

Both the sidecar-dir removal and the canonical change-folder removal are gated on `!skipPurge`.
`skipPurge` is set to `true` when the sidecar belongs to a different non-terminal job. Both
operations are skipped together, leaving the live job's sidecar dir and its change folder
intact. ✓

---

**`claimLivenessSidecar` `getJobStatus` parameter vs. outer closure**

In `local.ts:1446`:
```typescript
getJobStatus: async (repoRoot: string, _s: string, foreignJobId: string) => {
  const states = await JobStateStore.list(repoRoot);
  const match = states.find((st) => st.jobId === foreignJobId);
  return match?.status ?? null;
},
```

Uses the lambda's own `foreignJobId` parameter, not any outer `jobId` variable. Lookup is
correct. ✓

In `repair.ts` default `claimSidecar`:
```typescript
getJobStatus: async (r, _s, jobId) => {
  const { JobStateStore } = …;
  const states = await JobStateStore.list(r);
  const match = states.find((st) => st.jobId === jobId);
  return match?.status ?? null;
},
```

`jobId` here is the third lambda parameter (the foreign job's ID), not a closure capture. ✓

---

**`duplicate-slug-guard.ts` deletion ↔ remaining references**

The file is deleted. A grep of `src/` confirms zero remaining references to
`checkDuplicateLiveJob`, `duplicateLiveJobError`, and `DUPLICATE_LIVE_JOB`. The removal is
clean. ✓

---

**`SLUG_OCCUPANCY_AMBIGUOUS` exit-code mapping**

`SLUG_OCCUPANCY_AMBIGUOUS` is absent from `EXIT_CODE_MAP` (`errors.ts:19-34`).
`SpecRunnerError` constructor falls through to the default:
```typescript
this.exitCode = exitCode ?? EXIT_CODE_MAP[code] ?? EXIT_CODE.GENERAL_ERROR;
```
→ exits with `GENERAL_ERROR` (1), matching design D8. ✓

---

**`doctor repair <slug>` positionals parsing**

`flag-parser.ts` collects all non-flag tokens into `positionals[]`
(line 127: `positionals.push(arg)`). The command `specrunner doctor repair my-slug` produces
`positionals = ["repair", "my-slug"]`. Handler checks `positionals[0] === "repair"` and reads
`slug = positionals[1]`. SLUG_REGEX validation is delegated to `repairSlugOccupancySidecar`.
Two-positional parsing is correct. ✓

---

**`repairSlugOccupancySidecar` compact JSON in `writeSidecar` ↔ all sidecar readers**

`repair.ts` `defaultClaimSidecar` writes sidecar with `JSON.stringify(rec)` (compact, no
indent), while `LocalRuntime.writeLivenessSidecar` uses `JSON.stringify(rec, null, 2)` (pretty).
All sidecar readers use `JSON.parse(raw)` which accepts both forms. No reader depends on
whitespace. Functional correctness is unaffected; cosmetic inconsistency only. ✓

---

**`cancelSingleJob` Option B persist → managed marker unlink ordering ↔ guard window**

Between evacuation (step 1) and managed-state overwrite (step 5), locations 1 and 2 are
ENOENT (evacuated / worktree removed). Location 3 still holds the pre-cancel non-terminal
state. `scanSlugOccupancy` would block any concurrent start during this window. After step 5
writes `canceled` to location 3, the guard correctly unblocks. The ordering `persist →
unlink` is preserved (step 5 before step 6). No new window. ✓

---

**Inbox pre-check `JobStateStore.list` ↔ `SLUG_STATE_UNREADABLE` gap**

When `scanSlugOccupancy` detects `unreadable` (e.g., corrupted `state.json`), `JobStateStore.list`
silently skips that entry. The inbox pre-check (D10) finds no non-terminal occupant and calls
`runRunCore`. `assertSlugUnoccupied` fires `SLUG_STATE_UNREADABLE`; `runRunCore` catches and
returns exit 1; `startJob` resolves without throwing; inbox logs the issue as "started".

Confirmed **pre-existing**: before D10, `startJob` called `runRunCore` directly with no
pre-check. `runRunCore` swallowed all errors (including from the old pid-based guard), returned
exit 1, and the inbox already marked the issue as "started". D10 adds `SLUG_OCCUPIED` comment
propagation but does not change the swallowing behaviour for other error codes. This is an
acknowledged limitation in design D10: the authoritative guard fires regardless; the comment
path is best-effort for the named code only. No new violation. ✓

---

## Non-findings (confirmed clean in iteration 4)

| Area | Conclusion |
|------|------------|
| `cancelAllTerminated` new transition step | Helps guard; does not worsen pre-existing sidecar collateral |
| `cli/resume.ts` empty `repo` after null return | Pre-existing "slug not found" path; `ResumeCommand` exits before using repo |
| `ReopenCommand` with non-`awaiting-archive` non-terminal | Status gate fires correctly |
| `assertSlugUnoccupied` live-pid vs. other routing | Both paths produce `SlugOccupiedError` with `priorJobId`; inbox dedup correct |
| `cancelSingleJob --purge` dual `!skipPurge` gate | Both removals gated together |
| `claimLivenessSidecar getJobStatus` parameter identity | Correct in both `local.ts` and `repair.ts` |
| `duplicate-slug-guard.ts` removal | No remaining references in `src/` |
| `SLUG_OCCUPANCY_AMBIGUOUS` exit code | Defaults to `GENERAL_ERROR` (exit 1) per design D8 |
| `doctor repair` positionals | Two-positional `["repair", slug]` parsed correctly |
| Sidecar compact vs. pretty JSON | All readers use `JSON.parse`; format-independent |
| Option B persist → unlink ordering | No new concurrent-start window introduced |
| Inbox `SLUG_STATE_UNREADABLE` gap | Pre-existing swallow behaviour; not a new violation |
