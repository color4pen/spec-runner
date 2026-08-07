# Cross-Boundary Invariants Review — dedup-verified-safe (iteration 2)

**Reviewer**: cross-boundary-invariants  
**Purpose**: Detect implicit invariants of unchanged code silently broken by new behavior.  
**Iteration**: 2  
**Files reviewed**: All changed source files in `src/` for C1-C8; arch-allowlist; event-journal types

---

## Iteration 1 Findings — Status

| Finding | Severity | Resolution | Status |
|---------|----------|------------|--------|
| F1 — Stale comment in job-journal.ts:19 | low | fixable | ✅ FIXED (comment updated to `"JournalCounters — journal 圧縮 record の counters field の shape"`) |
| F2 — design.md D8 diverges from implementation | low | fixable | ✅ FIXED (D8 section updated to document the intentional enrichContext retention decision) |

Both low-severity findings from iteration 1 were addressed in commit `fix: cross-boundary-invariants LOW findings の手当て`.

---

## Iteration 2 Scope

Deepened inspection of areas iteration 1 reviewed at a higher level:

| Focus | What was verified |
|-------|-------------------|
| C5 `_appendRecord` path count | `getEventsPath()` idempotency; `EventRecord` union completeness |
| C6 `failed` shadowing | Correct initialization from `args.failed`; gate-to-gate propagation |
| C6 `phases` mutation | Array passed by reference; mutations visible in return value |
| C4 `process.cwd()` side-effect | When `repoRoot` is `undefined`, `projectLocalPath` is computed but never read |
| C7 `const` vs `let` | No reassignment of `resolvedWorktreePath` after the block in either caller |
| C8 `storedCounters` completeness | All uses deleted together; `_journal` strip (`void _j`) still present |
| `EventRecord` union | All four named append record types are members of the union |
| arch-allowlist delta | Sole new entry (`CWD-finish-resolve-target-di-default`) is for a file outside C1-C8 scope |

---

## Findings

### No new findings in iteration 2.

---

## Invariants Verified (no violation)

### C1: run/job-start handler unification

- `runJobHandler` is a named module-level function; both command entries assign `handler: runJobHandler` — same function reference.
- `positional.name` is per-entry (`"request.md|slug"` / `"slug|file"`), preserving `--help` output.
- `--debug` flag was not in the original flags object for either command; `parsed.flags["debug"]` remains `undefined` → `!!undefined` → `false` in `resolveLogLevel` (unchanged behavior).

### C2: compute*Iteration deletion

- All four deleted functions returned `(state.steps?.[NAME]?.length ?? 0) + 1`.
- `nextIteration(state: JobState, stepName: string)` in `io-iteration.ts` returns the same formula.
- TypeScript confirms the function was already imported in all four files — no new import edges.

### C3: detectPackageManager → findLockfile

- Diff-verified: original phase-1 walk order (lockfile check **before** `.git` stop), LOCKFILE_MAP order, and filesystem-root stop are byte-identical to `findLockfile`'s loop.
- `findLockfile` is synchronous; `detectPackageManager` was synchronous in phase-1 (only phase-2 reads async via `fs.readFile`). No async/sync mismatch introduced.
- The `filename` field returned by `findLockfile` is discarded by the caller; `pm` and `root` are consumed — correct.

### C4: loadConfig delegation

- Original `loadConfig` computed `projectLocalPath` only inside `if (repoRoot)`. `loadConfigWithSourceMetadata` computes `projectLocalPath` unconditionally (the `else` branch uses `process.cwd()`), but the file read remains guarded by `if (repoRoot)`. When `repoRoot` is `undefined`, the path is computed but never used in file I/O.
- `loadConfig` extracts only `.config` — the `projectLocal.path` field (containing the unused `process.cwd()`-based path) is discarded.
- Arch-allowlist entry `CWD-config-store-debt` pre-exists on main and documents this known pattern.
- `configMissingError()` throw path unchanged: `loadConfigWithSourceMetadata` throws when `userGlobalMigrated === null && projectLocalMigrated === null` — same condition as original.

### C5: journal append consolidation

- `appendEventRecord(this.resolver.getEventsPath(), record)` appears exactly once (`_appendRecord`). Verified in `job-journal.ts`.
- `getEventsPath()` is a pure function: derives path from construction-time fields (`changeDir` / `slug` + `stateRoot`). Re-computing it per append (vs once per `persist()` call) is equivalent.
- `EventRecord` union: `StepAttemptRecord | TransitionRecord | InterruptionRecord | LineageRecord | OperatorEventRecord | FindingRecencyRecord` — all four named public methods' parameter types are members. Type widening is safe; record type is validated at construction time by callers.
- `_writeAllToJournal` converted from module-level function (took `eventsPath` as arg) to private method (calls `_appendRecord` which calls `getEventsPath()`). Idempotent — no observable change.

### C6: verification runner tail extraction

**`failed` initialization**: `let { failed } = args` creates a local copy of `args.failed` (the post-loop boolean). Gate checks correctly update this local and subsequent gates see updated value — same as original.

**Skip string invariant** (critical): Template `` `_(skipped — previous ${args.skipLabel} failed)_` `` produces:
- `"command"` → `"_(skipped — previous command failed)_"` — matches original `runVerificationCommands` literal ✓
- `"phase"` → `"_(skipped — previous phase failed)_"` — matches original `runVerificationPhases` literal ✓

**`phases` array**: passed by reference; `finalizeVerificationRun` appends gate results to the same array. `VerificationResult.phases` in the return value is this same array — identical to original where the tail code ran in the same scope.

**`coverageSkipNote` scoping**: declared `undefined`; set only in the `args.coverage === undefined` branch. When coverage is defined and the loop has failed, `coverageSkipNote` stays `undefined` (no note emitted) — same as original.

**Early-return path** (`PACKAGE_JSON_SCRIPTS_TAMPERED`): Untouched; calls `writeVerificationResult` directly and returns before `finalizeVerificationRun` is reached. ✓

### C7: worktreePath resolution helper

- `resolvedSlug ?? ""` → falsy `""` when slug is null → `if (!resolvedWorktreePath && slug)` guard in helper is not entered — same semantics as original `if (!resolvedWorktreePath && resolvedSlug)` with `resolvedSlug = null`. ✓
- `const resolvedWorktreePath` (changed from `let`): confirmed by reading `resume.ts:278-` and `reopen.ts:311-` — neither file reassigns `resolvedWorktreePath` after the helper call. The `const` is correct.
- `updatedState` in both callers has `worktreePath?: string | null` and `jobId: string` — compatible with the helper's `state: { worktreePath?: string | null; jobId: string }` parameter type.

### C8: Dead code removal

- `PROBE_SLUG` alias deleted; both call sites (`makeProbe`) now use `VALIDATOR_PROBE_SLUG` directly. Grep confirms no standalone `PROBE_SLUG` in `src/` or `tests/`.
- `storedCounters` and its if-block deleted together. `storedCounters` was used ONLY in the deleted no-op block (condition check with comment-only body). The `_journal` field is still stripped from `parsedState` via `const { _journal: _j, ...stateWithoutJournal }` — the strip behavior is unchanged.
- `JournalCounters` type import removed from `job-state-projection.ts` — no longer needed after `storedCounters` deletion. ✓
- `enrichContext` identity method retained in `spec-review.ts` (existing tests assert its presence). ✓

---

## Evidence

- **Checked**: 8 consolidation areas (C1-C8); `EventRecord` union completeness; `getEventsPath()` purity; `failed` local-copy semantics in `finalizeVerificationRun`; `phases` reference behavior; `coverageSkipNote` scoping; `storedCounters` scope; `const`-vs-`let` safety; arch-allowlist delta; iteration 1 finding resolution
- **Skipped**: 0 in-scope items
- **Unverified**: 0
