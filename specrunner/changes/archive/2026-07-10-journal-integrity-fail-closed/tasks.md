# Tasks: journal-integrity-fail-closed

## T-01: Add corruption reporting to `fold()`

- [x] In `src/store/event-journal.ts`, export a new interface `FoldCorruption`:
      `{ lineIndex: number; reason: "invalid-json" | "not-an-object"; snippet: string }`
      (`lineIndex` = 0-based index within the committed lines; `snippet` = first ~120 chars of the
      offending line).
- [x] Add an optional field `corruption?: FoldCorruption` to `FoldResult` (absent = clean journal).
- [x] Change the fold algorithm so it distinguishes benign tail-partial from mid-journal corruption:
      - Keep the existing tail handling: drop the last non-empty line ONLY when it fails `JSON.parse`
        (benign partial write). The remaining non-empty lines are the "committed" lines.
      - For each committed line (in order): if `JSON.parse` throws → record corruption
        `{ reason: "invalid-json" }`; else if the parsed value is not a plain object
        (i.e. `null`, an array, or a primitive) → record corruption `{ reason: "not-an-object" }`.
        Record only the FIRST corruption (lineIndex + reason + snippet); do not stop folding.
      - Object records continue to dispatch by `type`; object records with an unknown `type` are
        still ignored (forward compat) and MUST NOT be treated as corruption.
      - Replace the current silent `continue` at the `JSON.parse` catch (was ~189-193) and the
        `typeof !== "object" || null` skip (was ~196) with the corruption-recording logic above.
- [x] Still return best-effort `steps` / `history` (and the existing counts / lineage / lastInterruption)
      built from the valid records even when `corruption` is set.
- [x] Do NOT change `appendEventRecord`, `stepRunToRecord`, or `historyEntryToRecord` (D3 append path
      is out of scope).

**Acceptance Criteria**:
- A mid-journal (non-last) line that fails `JSON.parse` sets `corruption.reason = "invalid-json"` with
  the correct `lineIndex`; valid records are still folded.
- A committed line that parses to an array or a primitive sets `corruption.reason = "not-an-object"`.
- A committed object line with an unknown `type` leaves `corruption` absent (forward compat).
- A single truncated line, or valid records followed by a truncated last line, leaves `corruption`
  absent (tail partial dropped).
- Empty / whitespace-only content leaves `corruption` absent.
- `fold()` never throws for any input string.

## T-02: Create the journal-integrity helper module

- [x] Create `src/store/journal-integrity.ts` exporting:
      - `interface CounterReversal { field: "history" | "step"; step?: string; stored: number; actual: number }`
      - `type JournalIntegrityIssue = { kind: "corrupt-record"; corruption: FoldCorruption } |
        { kind: "counter-reversal"; reversal: CounterReversal }`
      - `detectCounterReversal(stored: { historyCount: number; stepCounts: Record<string, number> },
        fold: FoldResult): CounterReversal | null` — returns the first field where the fold count is
        LESS THAN the stored count: `fold.historyCount < stored.historyCount` → history reversal;
        otherwise the first step `s` in `stored.stepCounts` with `(fold.stepCounts[s] ?? 0) <
        stored.stepCounts[s]` → step reversal. Returns `null` when no counter fell below stored.
      - `describeJournalIssue(issue: JournalIntegrityIssue): string` — a one-line human description
        used for error details and doctor output (e.g. corrupt-record → "corrupt record at line N
        (invalid-json): <snippet>"; counter-reversal → "journal truncated: history count A < recorded
        B" / "journal truncated: step 'x' count A < recorded B").
      - `inspectJournalDir(dir: string): Promise<JournalIntegrityIssue | null>` — read
        `dir/events.jsonl`; if missing (ENOENT) return `null`; `fold()` it; if `corruption` present
        return `{ kind: "corrupt-record", corruption }`; else read `dir/state.json`, parse its
        `_journal` counters (tolerate missing / malformed → skip the reversal check), and return
        `detectCounterReversal(...)` wrapped as `{ kind: "counter-reversal", reversal }` or `null`.
        MUST NOT throw for missing/unreadable files.
- [x] Import `FoldCorruption` / `FoldResult` from `./event-journal.js`.

**Acceptance Criteria**:
- `detectCounterReversal` returns a history reversal when fold history < stored, a step reversal when a
  stored step's fold count is lower, and `null` when every fold count is >= its stored count
  (including fold ahead of stored — crash recovery is not a reversal).
- `inspectJournalDir` returns `null` when the journal file is absent, a `corrupt-record` issue for a
  mid-journal corrupt journal, a `counter-reversal` issue when `_journal` counters exceed the fold,
  and `null` for an intact journal; it never throws on missing/malformed files.

## T-03: Add the `JOURNAL_CORRUPTED` error code and factory

- [x] In `src/errors.ts`, add `JOURNAL_CORRUPTED: "JOURNAL_CORRUPTED"` to `ERROR_CODES`.
- [x] Add `export function journalCorruptedError(eventsPath: string, detail: string): SpecRunnerError`
      with hint text stating the event journal (events.jsonl) is the append-only source of truth that
      must not be hand-edited or truncated, and to restore it from git history (e.g.
      `git restore --source=<good-ref> -- <path>`) before re-running; message
      `Event journal integrity check failed at ${eventsPath}: ${detail}`.
- [x] Do NOT add the code to `EXIT_CODE_MAP` (it defaults to `GENERAL_ERROR` / exit 1, like
      `STATE_FILE_INVALID`).

**Acceptance Criteria**:
- `journalCorruptedError(...)` returns a `SpecRunnerError` whose `code === "JOURNAL_CORRUPTED"`,
  `exitCode === 1`, and whose message contains the events path and detail.

## T-04: Make `load()` / `persist()` fail closed; keep `list()` tolerant

- [x] In `src/store/job-state-store.ts`, split `loadSplitLayout` into:
      - `composeSplitLayout(stateJsonPath, eventsPath, slugInject?): Promise<{ state: NormalizedJobState;
        corruption: FoldCorruption | null }>` — the current body of `loadSplitLayout`, returning the
        composed state AND the fold's `corruption` (does NOT throw on journal corruption; still throws on
        missing/invalid `state.json` exactly as today).
      - `loadSplitLayout(...)` — thin fail-closed wrapper: call `composeSplitLayout`; if `corruption`
        is non-null, `throw journalCorruptedError(eventsPath, describeJournalIssue({ kind:
        "corrupt-record", corruption }))`; otherwise return `state`. `JobStateStore.load()` keeps
        calling `loadSplitLayout` (so `loadStateByJobId` used by resume/finish/cancel stays fail-closed).
- [x] Switch every `list()` call site (sections 1, 1b, 2, 3, 4 in `JobStateStore.list`) from
      `loadSplitLayout(...)` to `composeSplitLayout(...)` and use the returned `.state` (ignore
      `corruption`). This keeps `ps` / `resolveId` / slug resolution surfacing corrupt-journal jobs and
      preserves the existing state.json-corruption skip (composeSplitLayout still throws on invalid
      state.json → caught by the existing try/catch → skipped).
- [x] In `persist()`'s fold path (after `foldResult` is obtained, before the counter recovery):
      - If `foldResult.corruption` → `throw journalCorruptedError(eventsPath, describeJournalIssue({
        kind: "corrupt-record", corruption: foldResult.corruption }))`.
      - Compute `const reversal = detectCounterReversal(existingCounters, foldResult)`; if non-null →
        `throw journalCorruptedError(eventsPath, describeJournalIssue({ kind: "counter-reversal",
        reversal }))`.
      - Remove the `Math.max(...)` on `historyCount` and the `mergeStepCountsMax(...)` on `stepCounts`
        (the max-absorption of below-counter folds). After the reversal check `fold >= stored` holds, so
        set `recoveredCounters = { historyCount: foldResult.historyCount, stepCounts: {
        ...existingCounters.stepCounts, ...foldResult.stepCounts } }`.
      - Delete the now-unused `mergeStepCountsMax` helper.
- [x] Do NOT add counter-reversal detection to `load()` / `composeSplitLayout` (requirement 3 scopes
      reversal fail to `persist`; load only fails closed on corruption). Do NOT change the `persist()`
      fast path (no fold, cursor-only rewrite) or the fresh-write path.
- [x] Import `journalCorruptedError` from `../errors.js` and `detectCounterReversal` /
      `describeJournalIssue` / types from `./journal-integrity.js`.

**Acceptance Criteria**:
- `load()` on a mid-journal-corrupt journal throws `SpecRunnerError` code `JOURNAL_CORRUPTED`; on a
  tail-partial-only journal it succeeds (partial dropped).
- `persist()` on a corrupt journal throws `JOURNAL_CORRUPTED`; on a truncated journal (fold counts
  below stored `_journal`) throws `JOURNAL_CORRUPTED`; on fold-ahead-of-stored (crash recovery) it
  succeeds and appends only the true delta.
- `JobStateStore.list()` still returns a job whose journal is corrupt (not skipped) and still skips a
  job whose `state.json` is invalid.

## T-05: Make `job show` surface corruption without crashing

- [x] In `src/cli/job-show.ts` `printJobState(...)`, after `changeDir` is resolved, call
      `inspectJournalDir(changeDir)`. If it returns an issue: print a clearly delimited banner (e.g. a
      separator line + "⚠ Journal integrity: CORRUPTED — <describeJournalIssue(issue)>" + a hint to
      restore `events.jsonl` from git history) and SKIP the lineage and cost sections. If it returns
      `null`, render lineage / cost exactly as today.
- [x] In `runJobShow(...)` UUID branch, extend the existing `catch` so that when the error is a
      `SpecRunnerError` with `code === ERROR_CODES.JOURNAL_CORRUPTED`, it prints the same corruption
      banner (built from the error's message + hint) instead of the generic error path, and returns `0`
      (does not throw / crash). Leave the existing `JOB_NOT_FOUND` / `ENOENT` / generic handling intact.
- [x] Keep the slug branch using `JobStateStore.list()` (now tolerant per T-04) and the UUID branch
      using `loadStateByJobId` — do NOT change these calls (existing job-show tests mock them).
- [x] Import `inspectJournalDir` (and its issue type as needed) from `../store/journal-integrity.js`;
      `ERROR_CODES` is already imported.

**Acceptance Criteria**:
- `job show` for a job whose journal is corrupt does not throw and prints a message stating the event
  journal is corrupted; lineage / cost sections are suppressed for that job.
- `job show` for a healthy job prints the existing header / lineage / cost output unchanged (probe
  returns `null` when files are absent or the journal is intact — existing job-show tests stay green).

## T-06: Add the `journal-integrity` doctor check

- [x] Create `src/core/doctor/checks/storage/journal-integrity.ts` following the orphan-worktrees
      factory pattern: export `createJournalIntegrityCheck(overrideScan?)` and a default
      `journalIntegrityCheck` (name `"journal-integrity"`, category `"storage"`, `required: false`).
- [x] Define the scan type and a default `scanJournalIntegrity({ repoRoot }): Promise<Array<{ location:
      string; slug: string; issue: JournalIntegrityIssue }>>` that enumerates job change dirs and calls
      `inspectJournalDir(dir)` on each, collecting non-null issues. Enumerate:
      - active: `repoRoot/specrunner/changes/<slug>` (skip dir names `archive` and `canceled`),
      - worktrees: `repoRoot/.git/specrunner-worktrees/*/specrunner/changes/<slug>` (same skips),
      - archive: `repoRoot/specrunner/changes/archive/*`.
      Use `node:fs` directly in the default scan (the override is for tests), mirroring how
      `scanOrphanWorktrees` is injected. `ctx.cwd` is the repoRoot.
- [x] Check behavior: no findings → `pass` ("No corrupt event journals found"). Findings → `fail` with a
      message of the count, `details` listing each `location` + `describeJournalIssue(issue)`, and a hint
      to restore the affected `events.jsonl` from git history. Wrap the scan in try/catch and return
      `pass` on scan I/O errors (defensive, consistent with other storage scan checks — corruption is a
      real fold finding, not a scan error).
- [x] Register the check in `src/core/doctor/checks/index.ts`: import it, add it to the storage section
      of `commonChecks`, and add it to the re-export block (so `allChecks` includes it).

**Acceptance Criteria**:
- With an injected scan returning findings, the check returns `status: "fail"` and details naming the
  affected job location(s) and issue.
- With an injected scan returning no findings (or an empty repo), the check returns `status: "pass"`.
- A scan that throws resolves to `pass` (does not corrupt doctor's exit code).
- `allChecks` still satisfies the existing doctor suite (>= 17 checks, all 7 categories present).

## T-07: Tests

- [x] `tests/store/event-journal.test.ts` (or a co-located test): pin the new `fold()` contract —
      mid-journal `invalid-json` corruption reported (with valid records still folded), `not-an-object`
      corruption for array/primitive committed lines, unknown object `type` NOT corruption (forward
      compat), tail-partial-only NOT corruption, empty/missing NOT corruption.
- [x] Unit tests for `src/store/journal-integrity.ts`: `detectCounterReversal` (history reversal, step
      reversal, no-reversal incl. fold-ahead), and `inspectJournalDir` (absent journal → null, corrupt →
      corrupt-record, truncated `_journal` → counter-reversal, intact → null, never throws).
- [x] `tests/store/job-state-store.test.ts` (and/or `tests/store/event-journal.test.ts`): a corrupt
      journal makes `load()` and `persist()` throw `SpecRunnerError` code `JOURNAL_CORRUPTED`; a
      tail-partial journal loads successfully; a truncated journal (stored `_journal` > fold) makes
      `persist()` throw `JOURNAL_CORRUPTED`; a fold-ahead journal (crash recovery) still persists without
      duplicate appends; `list()` still surfaces a corrupt-journal job.
- [x] `tests/unit/cli/job-show.test.ts`: `job show` on a corrupt journal prints a corruption notice and
      does not throw (mock `loadStateByJobId` to reject with a `JOURNAL_CORRUPTED` SpecRunnerError for the
      UUID path, and/or drive `printJobState` with a real changeDir containing a corrupt `events.jsonl`
      for the slug/probe path). Existing job-show tests remain unchanged and green.
- [x] A doctor test for `createJournalIntegrityCheck` with an injected scan: findings → `fail`, no
      findings → `pass`, throwing scan → `pass`.
- [x] Confirm (via grep) that no existing test pins the old mid-journal silent-skip contract; update ONLY
      such a test if found. Do not modify unrelated existing tests.

**Acceptance Criteria**:
- All acceptance-criteria scenarios in `spec.md` are pinned by tests, including forward-compat, empty /
  missing journal, tail-partial tolerance, corruption fail-closed, truncation fail-closed, doctor
  reporting, and job-show non-crash corruption display.

## T-08: Verify the build

- [x] Run `bun run typecheck` and `bun run test`; ensure both are green (including all pre-existing
      tests, unchanged unless they pinned the old silent-skip contract).

**Acceptance Criteria**:
- `bun run typecheck` passes.
- `bun run test` passes.
