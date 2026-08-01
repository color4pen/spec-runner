# cross-boundary-invariants Review — slug-occupancy-enforcement — iter 2

## Scope

Reviewed `git diff main...HEAD` (53 files, 7163 insertions / 115 deletions). Iteration 1
findings (001 / 002) were both addressed in the implementation:
- Finding 001 (`cancelAllTerminated` leaving `failed`/`terminated` state files): the transition
  to `canceled` + persist to main checkout was added at `runner.ts:588–608`. ✓
- Finding 002 (`ReopenCommand.prepare()` degraded to JOB_NOT_FOUND for terminal-only slugs):
  terminal-job fallback added at `reopen.ts:119–131`. ✓

---

## Finding 001 — `scanSlugOccupancy` swallows all errors from the worktrees directory as "no worktrees" — fail-open on non-ENOENT I/O failure

**Severity**: medium

### What the new code does

`scanSlugOccupancy` enumerates three candidate state locations for a slug. Location 2 — git
worktrees under `.git/specrunner-worktrees/` — is wrapped in a catch-all:

```typescript
// src/core/occupancy/scan.ts:88-110
try {
  const wtEntries = await fs.readdir(worktreesDir, { withFileTypes: true });
  for (const wtEntry of wtEntries) { ... }
} catch {
  // No worktrees dir → fine
}
```

### The invariant this violates

`design.md` D4 defines the fail-closed contract explicitly:

> Fail-closed (D4): set `unreadable` (with a reason) when a present state cannot be
> parsed/composed (including `JOURNAL_CORRUPTED`) or **enumeration I/O fails (non-ENOENT)**.
> ENOENT (absent) is not unreadable.

`spec.md` § "start guard enforces the slug occupancy invariant":

> The guard SHALL be **fail-closed**: when the slug's state cannot be read (parse failure,
> journal corruption, or non-ENOENT I/O failure), the system MUST refuse rather than assume
> the slug is free.

### The unchanged code whose assumption is broken

`WorktreeManager` (existing, unchanged) creates job worktrees under `.git/specrunner-worktrees/`.
A running job's state lives at `.git/specrunner-worktrees/<wt>/specrunner/changes/<slug>/state.json`.
The implicit assumption of this mechanism is that any state written to a worktree is findable by
readers that enumerate the worktrees directory.

The new guard relies on `scanSlugOccupancy` to see those states. When `.git/specrunner-worktrees/`
exists but becomes inaccessible (e.g., EACCES from a permission change, EIO on an NFS mount), the
catch-all silently skips the entire directory, returns `unreadable = null` with `nonTerminal = []`,
and the guard ALLOWS a new start — breaking the occupancy invariant for any non-terminal job whose
state lives exclusively in the now-unreadable worktrees directory.

### Contrast with `tryReadStateJson`

The individual file-read function correctly distinguishes ENOENT from other errors:

```typescript
// src/core/occupancy/scan.ts:139-143
if (code === "ENOENT") {
  return { entry: null, unreadable: null };
}
return { entry: null, unreadable: `read failure at ${absPath}: ${(err as Error).message}` };
```

The worktrees directory catch catches all errors — not just ENOENT.

### Correct fix

```typescript
} catch (err) {
  const code = (err as NodeJS.ErrnoException).code;
  if (code !== "ENOENT" && !unreadable) {
    unreadable = `worktrees directory enumeration failed: ${(err as Error).message}`;
  }
  // ENOENT = no worktrees dir → fine
}
```

### Evidence lines

- `src/core/occupancy/scan.ts:88-110` — catch-all that swallows all errors from `readdir(worktreesDir)`
- `src/core/occupancy/scan.ts:139-143` — `tryReadStateJson` correctly distinguishes ENOENT vs. other errors
- `design.md` D4 — "enumeration I/O fails (non-ENOENT)" → unreadable
- `spec.md` § start guard — "non-ENOENT I/O failure → MUST refuse"

### Note: flagged in code review

The code reviewer noted this in `review-feedback-002.md` I-001 as an observation ("実運用リスクは低い").
From a cross-boundary perspective, this directly violates the design's fail-closed contract
(D4) and the WorktreeManager's implicit assumption that its created states are findable.

---

## Finding 002 — `scanSlugOccupancy` location 3 reads `.specrunner/local/<slug>/state.json` without the `marker.json` gate — managed cancel leaves a stale non-terminal state that permanently blocks new starts

**Severity**: high

### What the new code does

`scanSlugOccupancy` location 3 reads the managed runtime's co-located state directly:

```typescript
// src/core/occupancy/scan.ts:112-119
const localStateJsonPath = path.join(repoRoot, ".specrunner", "local", slug, "state.json");
const localResult = await tryReadStateJson(localStateJsonPath);
if (localResult.entry) {
  allEntries.push(localResult.entry);
}
```

This read is unconditional — it does not check whether `marker.json` exists.

### The unchanged code whose assumption is broken

`job-catalog.ts` section 4 (unchanged) uses `marker.json` as the gate for enumerating managed
runtime jobs:

```typescript
// src/store/job-catalog.ts:205-228
const markerAbsPath = path.join(repoRoot, managedMarkerPath(slug));
try {
  const markerRaw = await fs.readFile(markerAbsPath, "utf-8");
  const marker = JSON.parse(markerRaw) as Record<string, unknown>;
  const markerJobId = typeof marker["jobId"] === "string" ? marker["jobId"] : null;
  if (!markerJobId) continue;   // ← gate: if marker absent → skip → state.json NOT read
  // ...
  const { state } = await composeSplitLayout(markerStateJsonPath, ...);
  tryMerge(state, sourceChangeDir);
} catch {
  // Skip malformed or missing marker  ← marker absence → catch → skip
}
```

The implicit invariant of this existing design: **a managed job is "live" (present in state
listings) if and only if its `marker.json` exists**. Deleting `marker.json` is how a managed
job is removed from all state listings — `job ls`, `resolveJobStateBySlug`, `doctor`, etc.

### The unchanged code that deletes the marker

`cancelSingleJob` (changed only for the jobId-scoped teardown logic; the marker deletion itself
is pre-existing but now includes the jobId check):

```typescript
// src/core/cancel/runner.ts:444-456
const markerAbsPath = path.join(deps.repoRoot, managedMarkerPath(slugForMarker));
try {
  const markerRaw = await fs.readFile(markerAbsPath, "utf-8");
  const markerObj = JSON.parse(markerRaw) as Record<string, unknown>;
  if (markerObj["jobId"] === state.jobId) {
    await fs.unlink(markerAbsPath);   // ← marker deleted; state.json left intact
  }
} catch { /* best-effort */ }
```

`cancelSingleJob` deletes `marker.json` when jobId matches, but does **not** update or delete
`.specrunner/local/<slug>/state.json`. The canceled state is persisted to
`specrunner/changes/canceled/<slug>-<jobId8>/` — a path that `scanSlugOccupancy` never reads.

### The concrete failure path

1. Managed job M runs for slug `my-slug` → `state.json` at
   `.specrunner/local/my-slug/state.json` has `status: "running"` (or `awaiting-resume`).
2. `specrunner job cancel <jobId>` (normal cancel, no `--purge`) succeeds:
   - `marker.json` deleted (jobId matches)
   - `specrunner/changes/my-slug/` moved to `specrunner/changes/canceled/my-slug-<id8>/`
   - `.specrunner/local/my-slug/state.json` **left intact** with `status: "running"`
3. `specrunner job start my-slug` (or `run`):
   - `assertNoDuplicateLiveJob` → `assertSlugUnoccupied` → `scanSlugOccupancy`
   - Location 1 (main checkout): ENOENT (evacuated by cancel)
   - Location 2 (worktrees): ENOENT (managed has no worktrees)
   - Location 3 (managed local): `.specrunner/local/my-slug/state.json` → `status: "running"`
     → `nonTerminal.length = 1` → **guard throws `SLUG_OCCUPIED`**
4. `specrunner job ls` does **not** show the managed job (marker gone → section 4 of
   `job-catalog.ts` skips it)
5. User is stuck: guard says "occupied" but `job ls` shows nothing for the slug. The guard
   message names a `jobId` that `job ls` cannot find. No CLI exit is available without manual
   deletion of `.specrunner/local/my-slug/state.json` or running `cancel --purge`.

### Why the old guard didn't have this problem

The old pid-based guard (`checkDuplicateLiveJob`) read `liveness.json`, not `state.json`.
After normal cancel, `liveness.json` would be deleted (the new T-05 code does this, but the
pre-existing cancel also cleaned up sidecars under `--purge`). Even without explicit cleanup,
the pid in `liveness.json` would be dead → old guard returned "free". The old guard never
read `.specrunner/local/<slug>/state.json`.

### Mechanism of the gap

| Mechanism | Sees managed job after normal cancel? |
|-----------|--------------------------------------|
| `job-catalog.ts` section 4 (`list()`) | No — marker absent → skip |
| `scanSlugOccupancy` location 3 | **Yes** — reads `state.json` directly |
| `resolveJobStateBySlug` | No (uses `list()`) |
| `specrunner job ls` | No (uses `list()`) |
| `assertSlugUnoccupied` guard | **Yes** (uses scan) → **blocks** |

The new scan bypasses the marker-based gate that all other consumer code respects.

### Evidence lines

- `src/core/occupancy/scan.ts:112-119` — location 3 reads `state.json` without marker check
- `src/store/job-catalog.ts:205-228` — section 4 requires `marker.json` to enumerate managed states
- `src/core/cancel/runner.ts:444-456` — deletes `marker.json` on normal cancel; `state.json` untouched
- `src/core/cancel/runner.ts:499-506` — `--purge` removes entire `.specrunner/local/<slug>/` directory
  (workaround: `--purge` avoids the stale-state residue)
- `tests/unit/core/cancel/sidecar-teardown.test.ts:175-184` (TC-029) — only checks `marker.json`
  deletion; does not create or verify `.specrunner/local/<slug>/state.json`

### Minimal fix

In `cancelSingleJob`, after deleting the marker, also overwrite (or delete) the managed local
`state.json` with the canceled state, OR `scanSlugOccupancy` location 3 should gate on
`marker.json` existence before reading `state.json`, consistent with `job-catalog.ts` section 4:

```typescript
// Option A: scan location 3 gates on marker.json (mirrors job-catalog.ts section 4)
const markerPath = path.join(repoRoot, ".specrunner", "local", slug, "marker.json");
try { await fs.access(markerPath); } catch { /* no marker → skip location 3 */ break; }
const localResult = await tryReadStateJson(localStateJsonPath);
```

```typescript
// Option B: cancelSingleJob writes the canceled state back to managed local state.json
const managedLocalStore = new JobStateStore(jobId, repoRoot, {
  changeDir: path.join(repoRoot, ".specrunner", "local", slug),
});
try { await managedLocalStore.persist(canceledState); } catch { /* best-effort */ }
```

Option A is lower-risk (scan is read-only, no new write-path). Option B is more thorough
(keeps the managed local state consistent with the canceled fact).

---

## Non-findings (scope walk)

- **`resolveJobStateBySlug` + managed cancel**: `list()` uses `job-catalog.ts` section 4 gated
  on `marker.json` → returns null for the canceled managed job → `resume`/`reopen` correctly
  fall through to their terminal-job fallback paths. The gap is isolated to `scanSlugOccupancy`.
- **`cancelAllTerminated` managed cleanup**: `cancelAllTerminated` calls
  `fs.rm(localSidecarDir(slug), { recursive: true, force: true })` which removes the entire
  `.specrunner/local/<slug>/` directory including `state.json`. So `cancelAllTerminated` does
  NOT leave stale `state.json` residue — Finding 002 is exclusive to `cancelSingleJob` normal
  cancel.
- **`--purge` cancel for managed**: `--purge` removes the entire `.specrunner/local/<slug>/`
  directory → no residue → guard allows new starts. Only normal cancel (`--purge` absent) is
  affected.
- **Iteration 1 Finding 001 resolution**: `cancelAllTerminated` now transitions
  `failed`/`terminated` → `canceled` and persists to main checkout before sidecar removal. The
  `canceledState.updatedAt` is fresh → dedup by jobId picks the canceled state over any stale
  worktree entry → guard allows start. ✓ Addressed.
- **Iteration 1 Finding 002 resolution**: `ReopenCommand.prepare()` now has a terminal-job
  fallback when `resolveJobStateBySlug` returns null, showing the "cannot reopen" message
  instead of "Job not found". ✓ Addressed.
- **W-001 from code review (isAlive injection)**: `local.ts:913–916` and `managed.ts:601–604`
  now inject `isAlive: (pid) => isProcessAlive(pid ?? 0)` into `assertSlugUnoccupied`. The
  live-pid message branch fires correctly in production. ✓ Addressed.
