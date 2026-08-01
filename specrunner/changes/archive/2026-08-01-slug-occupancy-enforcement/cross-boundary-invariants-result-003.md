# cross-boundary-invariants Review — slug-occupancy-enforcement — iter 3

## Scope

Reviewed `git diff main...HEAD` (54 files, 7519 insertions / 115 deletions). Focus: invariants
held by **unchanged** code whose implicit assumptions the new behaviour silently breaks.

---

## Iteration 2 Findings Resolution

Both iteration 2 findings were verified as addressed:

### Finding 001 (worktrees catch-all — non-ENOENT errors swallowed)

`scan.ts:108-116` now distinguishes ENOENT from other errors:

```typescript
} catch (err) {
  const code = (err as NodeJS.ErrnoException).code;
  if (code !== "ENOENT" && !unreadable) {
    unreadable = `worktrees enumeration failure at ${worktreesDir}: ${(err as Error).message}`;
  }
}
```

Non-ENOENT failures (EACCES, EIO, etc.) now set `unreadable`, making the guard fail-closed for
inaccessible worktrees directories. ✓

### Finding 002 (location 3 reads managed state.json without marker.json gate)

Option B applied: `cancelSingleJob` (`runner.ts:452-470`) overwrites
`.specrunner/local/<slug>/state.json` with the `canceled` state **before** deleting
`marker.json`, ensuring that `scanSlugOccupancy` location 3 sees a terminal state after normal
cancel:

```typescript
if (typeof obj["jobId"] === "string" && obj["jobId"] === state.jobId) {
  const managedStore = new JobStateStore(jobId, deps.repoRoot, {
    changeDir: path.join(deps.repoRoot, localSidecarDir(slugForMarker)),
  });
  await managedStore.persist(canceledState);
}
```

D6 ordering preserved (persist to state.json → unlink marker.json → guard reads terminal). ✓

---

## New Analysis — Iteration 3

### Walk of key cross-boundary interactions

**Guard ↔ cancelAllTerminated (worktree-owned `failed`/`terminated` jobs)**

`cancelAllTerminated` transitions non-terminal states to `canceled` and persists to the main
checkout (`stateRoot: repoRoot`). For jobs whose canonical state lives only in a worktree
(location 2), the persisted `canceled` entry at location 1 has a newer `updatedAt` than the
stale `failed`/`terminated` entry at location 2. `deduplicateByJobId` in `scan.ts:186-195`
picks the newest entry per jobId, so the `canceled` state wins. Guard allows new starts. ✓

**Guard ↔ cancelSingleJob (managed runtime, purge path)**

For `--purge` cancels, Option B persist runs first (writes `canceled` to location 3), then
the purge block removes `.specrunner/local/<slug>/` entirely — removing the file just written.
Net result: location 3 ENOENT. Guard allows start. Ordering is non-problematic because purge
removes the directory regardless. ✓

**cancelSingleJob ↔ loadStateByJobId (second-cancel recovery for managed Option B failure)**

If Option B persist fails during cancel of a managed job, location 3 still shows a non-terminal
status. The SLUG_OCCUPIED error message names the prior jobId. The user runs `job cancel
<priorJobId>` again. `loadStateByJobId` for managed jobs reads directly from
`.specrunner/local/<slug>/state.json` (step 3, `load-by-job-id.ts:71-76`), which still has the
old `running` state and the correct jobId. The second cancel loads this state, transitions it,
and re-attempts the Option B persist — which is now likely to succeed. This provides a natural
recovery path via the guard's error message hint. ✓

**repairSlugOccupancySidecar ↔ discoverSlugs (doctor repair called when unreadable state
co-exists with a non-terminal job)**

`repairSlugOccupancySidecar` destructures only `{ nonTerminal }` from the scan result,
discarding `unreadable`. If a slug has a corrupted state file at one location (setting
`unreadable`) alongside a valid non-terminal job at another location (setting
`nonTerminal.length === 1`), and the sidecar is mispointed:

1. `specrunner doctor` correctly detects the mismatch (`nonTerminal.length === 1` and
   `sidecarJobId ≠ nonTerminal[0].jobId`) and hints `doctor repair <slug>`.
2. `doctor repair <slug>` calls `repairSlugOccupancySidecar` → re-points sidecar to the
   non-terminal job → returns `"Sidecar re-pointed to <jobId>"`.
3. `specrunner job start <slug>` still fails with `SLUG_STATE_UNREADABLE` because the guard
   checks `result.unreadable !== null` **before** `nonTerminal.length >= 1`.

The repair message implies "done" when an additional blocker remains. This is a UX gap rather
than a correctness bug in the primary guard invariant: the guard remains fail-closed, and
`SLUG_STATE_UNREADABLE` is the correct outcome. The repair correctly fixed the mismatch;
it just does not warn that unreadable state requires manual intervention.

**Severity**: low. Requires a corrupted state file co-existing with a valid non-terminal job
and a sidecar mismatch — an unusual three-way combination. The guard invariant itself is intact.

**doctor discoverSlugs ↔ scanSlugOccupancy coverage for corrupted slugs**

`discoverSlugs` uses `JobStateStore.list`, which silently skips corrupted per-entry states.
A slug whose ONLY state entry is corrupted would not appear in `slugList`, so doctor never runs
the occupancy scan for it. Guard blocks start with `SLUG_STATE_UNREADABLE`, but doctor has no
visibility. For corrupted-only slugs, there is no doctor-guided repair path; manual deletion of
the corrupted file is required.

**Severity**: low. This is a scope gap (doctor specified to detect breaches and sidecar
mismatches, not arbitrary corruption) rather than a broken pre-existing invariant. The guard's
fail-closed behavior is the safety property; doctor is advisory.

---

## Non-findings (scope walk — confirmed clean)

- **`scanSlugOccupancy` dedup by jobId for worktree + main-checkout dual entries**: newest
  `updatedAt` wins; the `canceled` state written by `cancelAllTerminated` or Option B always
  has a newer timestamp than the stale worktree entry. ✓
- **Option B persist for local runtime jobs**: `.specrunner/local/<slug>/state.json` does not
  exist for local runtime jobs (no managed store); `fs.readFile` throws ENOENT → caught → no-op.
  Local runtime cancel path (liveness sidecar deletion + evacuation) is unchanged. ✓
- **`resolveJobStateBySlug` terminal-job fallback in both `ResumeCommand` and `ReopenCommand`**:
  both now have terminal-job fallbacks via `JobStateStore.list` that show the "cannot
  transition" message instead of "Job not found." ✓ (Iter 1 Finding 002, confirmed intact.)
- **Inbox SLUG_OCCUPIED dedup comment**: marker encoding
  `<!-- specrunner:notification kind="slug-occupied" priorJobId="..." version="1" -->` is
  checked against the pre-fetched `commentsByIssue` before posting. Idempotent across periodic
  inbox ticks for the same prior jobId. ✓
- **Progress display halt guidance**: `onPipelineComplete` reads `p.state.status` — `awaiting-archive`
  → archive hint, `awaiting-resume` → resume hint. Other statuses: no hint. ✓
- **Option B + purge ordering**: Option B writes `canceled` to location 3 before marker unlink;
  purge block deletes the entire `.specrunner/local/<slug>/` directory after marker unlink.
  Net result for purge: location 3 ENOENT. No residue. ✓
- **`cancelSingleJob` Option B jobId gate**: only overwrites managed state.json if
  `obj["jobId"] === state.jobId`; foreign managed state is left intact. ✓
- **`cancelAllTerminated` for managed jobs**: transitions non-terminal state to `canceled` and
  persists to main checkout, then `fs.rm(localSidecarDir(slug))` removes the entire managed
  local directory (including any stale state.json). Guard sees terminal at location 1, ENOENT at
  location 3. ✓
- **`repairSlugOccupancySidecar` ambiguous case (≥2 non-terminal)**: throws
  `SLUG_OCCUPANCY_AMBIGUOUS` as specified. Doctor check enumerates candidates for manual cancel.
  Repair refuses to act without a unique target. ✓
- **Inbox pre-check uses `JobStateStore.list` (not scan)**: acknowledged in design D10 as the
  intended approach. The authoritative guard (`assertSlugUnoccupied` via scan) fires regardless.
  The inbox pre-check exists only for the deduped reject-comment path. ✓
