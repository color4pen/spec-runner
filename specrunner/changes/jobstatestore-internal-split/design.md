# Design: JobStateStore Internal Split

## Context

`src/store/job-state-store.ts` is 926 lines and carries five distinct concerns in one file:

- **Catalog** — scanning all checkout/worktree/archive/sidecar/managed-marker sources to enumerate job states, and resolving a short prefix to a full UUID (`list`, `listWithSourceDirs`, `resolveId`).
- **Location** — mapping (slug, stateRoot) or changeDir to concrete filesystem paths (`getStateJsonPath`, `getEventsPath`, `isSlugMode`).
- **Journal** — persisting state via delta-append to `events.jsonl` + atomic overwrite of `state.json`, including fresh-write, fast-path, fold-based crash-recovery, and counter management (`persist`, `appendHistory`, `appendInterruption`, `appendLineage`, `writeAllToJournal`, `buildStepCounts`).
- **Projection** — composing a `NormalizedJobState` from a `state.json` skeleton and an `events.jsonl` fold (`composeSplitLayout`, `loadSplitLayout`, `stateToStateJson`).
- **Legacy migration** — dual-read for pre-split-layout state.json files that carry steps inline rather than in the journal (the `if (foldResult.stepsTotal === 0 && !parsedState["_journal"])` block inside `composeSplitLayout`).

The public API (`JobStateStore` class, `buildInitialJobState`, `NormalizedJobState`, `ListedJobEntry`) is used by ~30 files across `src/`. Blast-radius of any public API change would be large; the refactoring keeps the facade surface identical.

## Goals / Non-Goals

**Goals**:
- Introduce five internal components — `JobCatalog`, `JobLocationResolver`, `JobJournal`, `JobStateProjection`, `LegacyStateMigrator` — each in its own file under `src/store/`.
- `JobStateStore` becomes a thin facade that constructs and delegates to these components; all public method signatures and return types stay identical.
- No callers outside `src/store/` need to change.
- `typecheck && test` green after the split.

**Non-Goals**:
- Changing public API surface of `JobStateStore` or any of its static/instance methods.
- Changing persist order, journal truth, location selection rules, or migration semantics.
- Exporting any of the five new internal components from `src/store/index.ts`.
- Introducing optimistic revision, caching, or new observable behaviors.
- Writing net-new tests for the internal components (existing tests continue to exercise them via `JobStateStore`).

## Decisions

### D1: One file per internal component

Five new source files in `src/store/`:
- `job-catalog.ts` — `JobCatalog` class
- `job-location-resolver.ts` — `JobLocationResolver` class
- `job-journal.ts` — `JobJournal` class
- `job-state-projection.ts` — module-level functions (`composeSplitLayout`, `loadSplitLayout`, `stateToStateJson`)
- `legacy-state-migrator.ts` — module-level function (`migrateSteps`)

**Rationale**: file-per-component maximises navigability and keeps each unit of concern independently legible. A single `internals.ts` barrel would reproduce the same co-mingling problem at smaller scale.

**Alternatives considered**: barrel `internals.ts` (rejected — same problem at smaller scale); sub-directory `src/store/internal/` (rejected — unnecessary depth for five files that are closely related and unlikely to grow further).

### D2: Classes for stateful components, functions for stateless ones

`JobCatalog`, `JobLocationResolver`, and `JobJournal` are classes.  
`JobStateProjection` and `LegacyStateMigrator` are modules exporting plain functions (`composeSplitLayout`, `loadSplitLayout`, `stateToStateJson`, `migrateSteps`).

**Rationale**: `JobLocationResolver` holds the four constructor fields (`jobId`, `repoRoot`, `slug?`, `stateRoot?`, `changeDir?`) as instance state — a class is the natural fit. `JobJournal` takes a `JobLocationResolver` and provides the persist/append operations — also instance-oriented. `JobCatalog` groups static-like operations on the repo root; a class with static methods mirrors how `JobStateStore.list()` is currently organized.  
`composeSplitLayout` and `loadSplitLayout` are already pure async functions; wrapping them in a class with static methods adds no value.

**Alternatives considered**: all classes with static methods (rejected — forced wrapping of pure functions is noise); all plain functions (rejected — stateful location/journal logic maps better to class fields than param threading).

### D3: `JournalCounters` type moves to `job-journal.ts`

`JournalCounters` (the `_journal` field structure) is an internal type used only by `persist()` and `composeSplitLayout`. It moves to `job-journal.ts` and is imported by `job-state-projection.ts` for read access during fold/crash-recovery.

**Rationale**: the counter structure is defined by how `persist()` writes it; placing the type with the writer is the authoritative home.

**Alternatives considered**: `job-state-projection.ts` as home (rejected — projection is a reader, not the owner of the schema).

### D4: `JobStateStore` wires components in its constructor

`JobStateStore` constructs a `JobLocationResolver` in its constructor and stores it as a private field. `JobJournal` is also constructed in the constructor from the resolver. Static methods on `JobStateStore` construct a `JobCatalog` inline (or delegate via a module-level call).

**Rationale**: no DI container or factory is needed — construction is deterministic from the same constructor args the class already accepts. Inline construction keeps the facade simple.

**Alternatives considered**: factory function (rejected — adds indirection without benefit); passing pre-constructed components as constructor args (rejected — would change the public constructor signature, which is part of the public API).

### D5: Internal components not re-exported from `src/store/index.ts`

`index.ts` continues to export exactly what it currently exports: `JobStateStore`, `buildInitialJobState`, `NormalizedJobState`, `ListedJobEntry`.

**Rationale**: the five new files are implementation detail. Leaking them through `index.ts` would create accidental coupling.

**Alternatives considered**: exporting for testability (rejected — the existing tests exercise behavior through `JobStateStore`; internal unit tests can import directly from the source file if needed in future).

## Risks / Trade-offs

**[Risk] Import cycle between new files** → Mitigation: dependency graph is a DAG. `LegacyStateMigrator` has no deps on other new files. `JobStateProjection` imports `LegacyStateMigrator` and `event-journal.ts`. `JobJournal` imports `JobStateProjection` and `event-journal.ts`. `JobCatalog` imports `JobStateProjection`. `JobLocationResolver` has no deps on any of the above. `JobStateStore` imports all five. No cycles.

**[Risk] Large mechanical change touches many lines → merge noise, missed edits** → Mitigation: tasks are ordered so each step compiles independently (typecheck after each task). The final task (T-06) wires everything and is the sole integration point.

**[Risk] `stateToStateJson` and `buildStepCounts` are currently private helpers used only in the persist path** → Both move to `job-journal.ts` (their only caller after the split). `stateToStateJson` is also used by `composeSplitLayout`'s callers indirectly through `persist()`; it stays in `job-journal.ts` and `job-state-projection.ts` only imports what it actually needs from `event-journal.ts`.

## Open Questions

None — the scope is mechanically well-defined and all design decisions are resolved.
