# Cross-Boundary Invariants Review — jobstatestore-internal-split — iter 1

- **verdict**: approved

## Scope

`git diff main...HEAD --stat` shows 5 new source files under `src/store/` and a reduction of ~610 lines in `job-state-store.ts`. No file outside `src/store/` was modified.

---

## Invariants Checked

### 1. Public API surface — `job-state-store.ts` and `src/store/index.ts`

**Check**: All exports from `job-state-store.ts` (`NormalizedJobState`, `ListedJobEntry`, `buildInitialJobState`, `JobStateStore`) and `index.ts` are identical to `main`.

**Result**: Confirmed identical. `index.ts` exports only `JobStateStore` and `NormalizedJobState` — unchanged. All 32 external callers import from `job-state-store.ts` or `index.ts`; none import from the new internal modules.

### 2. `persist()` behavioral equivalence

**Check**: Fresh-write path, fast-path short-circuit, fold-based crash-recovery, counter-reversal rejection, and delta-append order are all preserved verbatim in `JobJournal.persist()`.

**Result**: Implementation is a line-for-line extraction. One cosmetic difference: `existingCounters!.stepCounts` (non-null assertion) replaces `existingCounters.stepCounts` at the fast-path check. The assertion is correct — the null case is guarded by an earlier early-return. No behavioral difference.

### 3. `load()` — `composeSplitLayout` / `loadSplitLayout` equivalence

**Check**: The fail-closed semantics of `loadSplitLayout` (throws `JOURNAL_CORRUPTED` on corruption) and the tolerant semantics of `composeSplitLayout` (returns corruption field, used by list scans) are preserved.

**Result**: Both functions are verbatim copies in `job-state-projection.ts`. `JobStateStore.load()` delegates to `loadSplitLayout` with the same arguments (`getStateJsonPath()`, `getEventsPath()`, slug-inject when `isSlugMode()`).

### 4. `isSlugMode()` / path resolution invariant

**Check**: The condition `!!(slug && stateRoot)` must remain the single truth for choosing between slug-convention paths and changeDir paths.

**Result**: `JobLocationResolver.isSlugMode()` is identical. `JobStateStore.isSlugMode()` now delegates to `this._location.isSlugMode()`. The `load()` call passes `this.slug!` and `this.stateRoot!` only when `isSlugMode()` is true — identical guard as before.

### 5. Legacy migration semantics (`LegacyStateMigrator`)

**Check**: The condition `foldResult.stepsTotal === 0 && !parsedState["_journal"]` must trigger exactly the same legacy-normalize path, returning `validateJobState`-normalized steps from `stateWithoutJournal`.

**Result**: `migrateSteps()` is a verbatim extract of the original inline block. Called from `composeSplitLayout` with the same three arguments (`foldResult`, `parsedState`, `stateWithoutJournal`). Behavior identical.

### 6. `listWithSourceDirs` deduplication and scan order

**Check**: Section ordering (1: active slug, 1b: archive, 2: worktrees, 2b: worktree archives, 3: sidecar supplement, 4: managed markers), `canceled` directory exclusion, and `tryMerge` deduplication (newest `updatedAt` wins) are preserved.

**Result**: `JobCatalog.listWithSourceDirs` is a verbatim copy. The `canceled` guard (`entry.name === "archive" || entry.name === "canceled"`) is present in both section 1 and section 2 scans, matching the original.

### 7. Error propagation paths

**Check**: `STATE_FILE_INVALID` (missing slug+stateRoot+changeDir), `JOURNAL_CORRUPTED` (corrupt record or counter reversal in `persist()` and `loadSplitLayout()`), `JOB_NOT_FOUND` / `AMBIGUOUS_JOB_ID` from `resolveId()` all throw with the same error codes and messages.

**Result**: All throw sites preserved verbatim across `JobLocationResolver`, `JobJournal`, `JobCatalog`, and `job-state-projection.ts`.

### 8. Runtime import graph — no circular dependency

**Check**: The design states the dependency graph is a DAG. There is a structural type-level edge `job-state-projection.ts` → `job-journal.ts` (for `JournalCounters`) alongside the runtime edge `job-journal.ts` → `job-state-projection.ts`. This looks circular at first.

**Result**: The `job-state-projection.ts` → `job-journal.ts` edge is `import type { JournalCounters }`, which TypeScript erases entirely at compile output. The runtime module graph is:

```
job-journal.ts → job-state-projection.ts → legacy-state-migrator.ts
                                          → event-journal.ts
job-catalog.ts → job-state-projection.ts
job-state-store.ts → job-location-resolver.ts
                   → job-journal.ts
                   → job-catalog.ts
                   → job-state-projection.ts (loadSplitLayout)
```

No runtime cycle. `typecheck` and `test` both pass green (verified in `verification-result.md`).

---

## Structural Observations (non-blocking)

**S1 — `stateToStateJson` location differs from design.md risk note**

`design.md` risk section states both `stateToStateJson` and `buildStepCounts` "move to `job-journal.ts`". The implementation (following `tasks.md` T-03) placed `stateToStateJson` in `job-state-projection.ts`, where `job-journal.ts` imports it. `buildStepCounts` is correctly in `job-journal.ts`. The behavioral result is identical; the inconsistency is between design prose and tasks. No invariant violated.

**S2 — Internal functions are now importable outside `JobStateStore`**

`composeSplitLayout`, `loadSplitLayout`, and `stateToStateJson` are now `export function` in `job-state-projection.ts`. Previously they were private module-scope functions inside `job-state-store.ts`. They are not re-exported from `index.ts` (constraint preserved), so the public API boundary holds. No existing caller imports them. The encapsulation leakage is confined to `src/store/`.

**S3 — `NormalizedJobState` re-exported from `job-state-projection.ts`**

`job-state-projection.ts` adds `export type { NormalizedJobState }` as a re-export from `job-state-store.ts`. This creates an additional internal import path for this type. No external code uses it; `index.ts` still exports it from `job-state-store.ts` only. No invariant violated.

---

## Summary

All behavioral invariants of the original `JobStateStore` — persist order, journal truth, location selection rules, migration semantics, error codes, deduplication, and public API surface — are preserved verbatim in the split. The three structural observations (S1–S3) are informational and do not affect any cross-boundary contract. Verification passed (typecheck + test + lint + changed-line-coverage all green).
