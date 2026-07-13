# Tasks: JobStateStore Internal Split

## T-01: Create `JobLocationResolver`

Extract path-resolution logic from `JobStateStore` into `src/store/job-location-resolver.ts`.

- [x] Create `src/store/job-location-resolver.ts`
- [x] Define `JobLocationResolver` class with private fields: `jobId: string`, `repoRoot: string`, `slug?: string`, `stateRoot?: string`, `changeDir?: string`
- [x] Move `isSlugMode()` as a public method
- [x] Move `getEventsPath()` as a public method (same logic, same error message)
- [x] Move `getStateJsonPath()` as a public method (same logic, same error message)
- [x] Import `slugEventsPath`, `slugStateJsonPath` from `../util/paths.js`
- [x] Import `SpecRunnerError`, `ERROR_CODES` from `../errors.js`
- [x] Export `JobLocationResolver` as a named export

**Acceptance Criteria**:
- `src/store/job-location-resolver.ts` compiles with `bun run typecheck`
- All three methods return the same paths as the original private methods in `JobStateStore`

---

## T-02: Create `LegacyStateMigrator`

Extract the pre-split-layout dual-read block from `composeSplitLayout` into `src/store/legacy-state-migrator.ts`.

- [x] Create `src/store/legacy-state-migrator.ts`
- [x] Export function `migrateSteps(foldResult: FoldResult, parsedState: Record<string, unknown>, stateWithoutJournal: Record<string, unknown>): Record<string, StepRun[]>`
- [x] Move the logic from lines 813–825 of `job-state-store.ts` (the `if (foldResult.stepsTotal === 0 && !parsedState["_journal"])` block) verbatim
- [x] Import `FoldResult` from `./event-journal.js`
- [x] Import `StepRun` and `validateJobState` from `../state/schema.js`
- [x] The function returns `foldResult.steps` when no migration is needed, and the legacy-normalized steps when migration is required

**Acceptance Criteria**:
- `src/store/legacy-state-migrator.ts` compiles with `bun run typecheck`
- Legacy path: given a `parsedState` with no `_journal` and a `stateWithoutJournal` with non-empty `steps`, `migrateSteps` returns the `validateJobState`-normalized steps
- Non-legacy path: given a `parsedState` with `_journal` or `foldResult.stepsTotal > 0`, `migrateSteps` returns `foldResult.steps` unchanged

---

## T-03: Create `JobStateProjection`

Extract `composeSplitLayout`, `loadSplitLayout`, and `stateToStateJson` into `src/store/job-state-projection.ts`.

- [x] Create `src/store/job-state-projection.ts`
- [x] Move `SlugInjectOptions` interface (currently at line 73)
- [x] Move `composeSplitLayout` function verbatim, replacing the inline legacy-migration block with a call to `migrateSteps()` from `legacy-state-migrator.ts`
- [x] Move `loadSplitLayout` function verbatim
- [x] Move `stateToStateJson` function verbatim
- [x] Import `migrateSteps` from `./legacy-state-migrator.js`
- [x] Import `JournalCounters` from `./job-journal.js` (type import only)
- [x] Import all other deps: `fs`, `path`, `fold`, `FoldResult`, `FoldCorruption`, `validateJobState`, `JobState`, `RequestInfo`, `changeFolderPath`, `journalCorruptedError`, `describeJournalIssue`
- [x] Export `composeSplitLayout`, `loadSplitLayout`, `stateToStateJson`, `SlugInjectOptions`
- [x] The `NormalizedJobState` type import comes from `./job-state-store.js` — use a type-only import or move the type definition to a shared location if a cycle would result. (Preferred: keep `NormalizedJobState` in `job-state-store.ts` and import it as `import type` from there; TypeScript type-only imports do not create runtime cycles.)

**Acceptance Criteria**:
- `src/store/job-state-projection.ts` compiles with `bun run typecheck`
- No circular import errors (`bun run typecheck` does not report any)
- `composeSplitLayout` and `loadSplitLayout` return identical results to the original functions

---

## T-04: Create `JobJournal`

Extract all persist/append/counter logic from `JobStateStore` into `src/store/job-journal.ts`.

- [x] Create `src/store/job-journal.ts`
- [x] Move `JournalCounters` interface (currently at line 62) as a named export
- [x] Move `writeAllToJournal` function
- [x] Move `buildStepCounts` function
- [x] Define `JobJournal` class with private field `resolver: JobLocationResolver`
- [x] Constructor: `constructor(resolver: JobLocationResolver)`
- [x] Move `persist(state: JobState): Promise<void>` as a public method — replace `this.getStateJsonPath()` / `this.getEventsPath()` / `this.isSlugMode()` with `this.resolver.*`
- [x] Move `appendHistory(state: JobState, entry: HistoryEntry): Promise<JobState>` as a public method
- [x] Move `appendInterruption(record: InterruptionRecord): Promise<void>` as a public method
- [x] Move `appendLineage(record: LineageRecord): Promise<void>` as a public method
- [x] Import `JobLocationResolver` from `./job-location-resolver.js`
- [x] Import `composeSplitLayout`, `stateToStateJson` from `./job-state-projection.js`
- [x] Import `fold`, `appendEventRecord`, `stepRunToRecord`, `historyEntryToRecord`, `InterruptionRecord`, `LineageRecord` from `./event-journal.js`
- [x] Import `detectCounterReversal`, `describeJournalIssue` from `./journal-integrity.js`
- [x] Import `atomicWriteJson` from `../util/atomic-write.js`
- [x] Import `appendHistoryEntry`, `validateJobState`, `JobState`, `StepRun`, `HistoryEntry` from `../state/schema.js`
- [x] Import `SpecRunnerError`, `ERROR_CODES`, `journalCorruptedError` from `../errors.js`
- [x] Import `NormalizedJobState` as a type from `./job-state-store.js`
- [x] Export `JobJournal` and `JournalCounters`

**Acceptance Criteria**:
- `src/store/job-journal.ts` compiles with `bun run typecheck`
- No circular import errors
- `JobJournal.persist()` delegates correctly to `composeSplitLayout` for the fold and `stateToStateJson` for serialization

---

## T-05: Create `JobCatalog`

Extract the static list/resolveId methods from `JobStateStore` into `src/store/job-catalog.ts`.

- [x] Create `src/store/job-catalog.ts`
- [x] Define `JobCatalog` class with a single static method `listWithSourceDirs(repoRoot: string, opts?: { includeArchived?: boolean }): Promise<ListedJobEntry[]>` — move the full body of `JobStateStore.listWithSourceDirs` verbatim
- [x] Add static method `list(repoRoot: string, opts?: { includeArchived?: boolean }): Promise<JobState[]>` — delegates to `JobCatalog.listWithSourceDirs`
- [x] Add static method `resolveId(repoRoot: string, prefix: string): Promise<string>` — move the full body of `JobStateStore.resolveId` verbatim
- [x] Import `composeSplitLayout` from `./job-state-projection.js`
- [x] Import `listLocalSidecars` from `./local-job-index.js`
- [x] Import `ListedJobEntry` as a type from `./job-state-store.js`
- [x] Import `JobState` as a type from `../state/schema.js`
- [x] Import all path utilities (`slugStateJsonPath`, `slugEventsPath`, `changeFolderPath`, `parseArchiveDirName`, `managedMarkerPath`, `localSlugStateJsonPath`, `localSlugEventsPath`) from `../util/paths.js`
- [x] Import `SpecRunnerError`, `ERROR_CODES`, `ambiguousJobIdError` from `../errors.js`
- [x] Export `JobCatalog`

**Acceptance Criteria**:
- `src/store/job-catalog.ts` compiles with `bun run typecheck`
- No circular import errors
- `JobCatalog.listWithSourceDirs` returns identical results to the original static method

---

## T-06: Wire internal components into `JobStateStore`

Update `job-state-store.ts` to delegate to the five new internal components.

- [x] Add private field `private readonly _location: JobLocationResolver` — constructed in constructor from `jobId`, `repoRoot`, `opts`
- [x] Add private field `private readonly _journal: JobJournal` — constructed in constructor from `this._location`
- [x] Replace body of `getEventsPath()` with `return this._location.getEventsPath()`
- [x] Replace body of `getStateJsonPath()` with `return this._location.getStateJsonPath()`
- [x] Replace body of `isSlugMode()` with `return this._location.isSlugMode()`
- [x] Replace body of `load()` with `return loadSplitLayout(...)` call — or delegate via `this._journal`; use `loadSplitLayout` imported from `job-state-projection.ts`
- [x] Replace body of `persist(state)` with `return this._journal.persist(state)`
- [x] Replace body of `appendHistory(state, entry)` with `return this._journal.appendHistory(state, entry)`
- [x] Replace body of `appendInterruption(record)` with `return this._journal.appendInterruption(record)`
- [x] Replace body of `appendLineage(record)` with `return this._journal.appendLineage(record)`
- [x] Replace body of static `JobStateStore.listWithSourceDirs(...)` with `return JobCatalog.listWithSourceDirs(...)`
- [x] Replace body of static `JobStateStore.list(...)` with `return JobCatalog.list(...)`
- [x] Replace body of static `JobStateStore.resolveId(...)` with `return JobCatalog.resolveId(...)`
- [x] Remove all private helper functions now moved to other modules (`composeSplitLayout`, `loadSplitLayout`, `stateToStateJson`, `writeAllToJournal`, `buildStepCounts`)
- [x] Remove all types/interfaces now moved to other modules (`JournalCounters`, `SlugInjectOptions`)
- [x] Remove unused imports from `job-state-store.ts`
- [x] Add imports for `JobLocationResolver`, `JobJournal`, `JobCatalog`, `loadSplitLayout`
- [x] Verify no new imports are added to `src/store/index.ts` (public API surface unchanged)

**Acceptance Criteria**:
- `bun run typecheck` exits 0 with no errors
- `bun run test` exits 0 with all existing tests green
- `src/store/index.ts` exports are identical to before this change
- `JobStateStore` public method signatures are identical to before this change
- No caller outside `src/store/` requires any change
