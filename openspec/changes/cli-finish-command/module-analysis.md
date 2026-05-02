# module-analysis.md — cli-finish-command

## Path correction notice (read first)

`tasks.md` references paths that do not match the actual codebase. The implementer must reconcile before starting work:

| tasks.md path | Actual codebase path |
|---|---|
| `src/cli/commands/finish.ts` | should be `src/cli/finish.ts` (mirrors `init.ts`, `login.ts`, `run.ts`, `ps.ts`, `doctor.ts`) |
| `src/cli/index.ts` (subcommand router) | actually `bin/specrunner.ts` (single switch) |
| `src/lib/jobs/state.ts` (JobStatus type) | actually `src/state/schema.ts` (`JobStatus` union at line 5) |

This is a **CRITICAL** discovery for spec-review since following tasks.md verbatim would produce a divergent module layout. The architect should clarify in spec-review whether tasks.md or the existing convention wins.

---

## 1. 既存コードパターン一覧

### 1.1 CLI subcommand 配置パターン

Each subcommand lives as a flat top-level file under `src/cli/`:
- `src/cli/init.ts`, `src/cli/login.ts`, `src/cli/run.ts`, `src/cli/ps.ts`, `src/cli/doctor.ts`

`bin/specrunner.ts` is a thin dispatcher with a `switch (command)` over flag-parsed args (lines 48–97). USAGE constant is co-located. There is no `src/cli/index.ts` aggregator.

Each `src/cli/<name>.ts` exports a `runX(...)` async entry that internally calls `process.exit`, plus often a `runXCore(...)` test-friendly variant returning an exit code (see `runRunCore` at `src/cli/run.ts:99`, and `runDoctor` at `src/cli/doctor.ts:77` returning a number).

### 1.2 subprocess wrapper パターン (`gh` / external CLI)

`src/core/pr-create/runner.ts` is the canonical reference:
- Uses `spawn(cmd, args, { cwd, shell: false })` with chunked stdout/stderr collection (`spawnCommand`, lines 39–59).
- Resolves with `{ exitCode, stdout, stderr }` discriminated-union result (no throws on non-zero exit).
- Returns tagged result types (`PrCreateResult` at lines 22–27): `{ status: "created" | "existing-open" | "error", reason: ... }`.
- Uses `--body-file` with a `os.tmpdir()` temp file plus `try/finally` cleanup (`createPr`, lines 100–140) — relevant because finish's archive PR also needs a body.
- Auth-failure hint is appended in `buildGhFailureMessage` (lines 215–221).
- `doctor.ts` separately uses `promisify(execFile)` (`buildExecFile`, lines 60–68) for one-shot commands. Two subprocess idioms coexist.

### 1.3 step composition pattern

`src/core/step/pr-create.ts` (`PrCreateStep`) shows the CLI-resident step pattern: `kind: "cli"`, no agent session, writes a `*-result.md`, exposes `parseResult` for verdict extraction. **`finish` is NOT a pipeline step** (per design Decision 3 — deterministic, no LLM, runs standalone). It should NOT be added to the pipeline `Map` at `src/core/pipeline/run.ts:41`. This is a structural divergence from `pr-create`.

### 1.4 state store pattern

`src/state/store.ts`: `createJobState`, `listJobStates`. Atomic write via `src/util/atomic-write.ts` (`atomicWriteJson`, write-tmp-then-rename). Reads tolerate malformed files (skip + stderr, lines 76–78). State file path: `getJobStatePath(jobId)` → `~/.local/share/specrunner/jobs/<uuid>.json`.

There is **no existing `updateJobState` / `loadJobState` by id** — `listJobStates` is the only read primitive, and persistence is owned by `StepExecutor` for in-pipeline updates. Finish needs both load-by-id and update-by-id.

### 1.5 error taxonomy pattern

`src/errors.ts`: `SpecRunnerError(code, hint, message)` with factory helpers (`branchNotSetError`, etc.) and a frozen `ERROR_CODES` map (lines 17–38). Run command formats them as `Error: ...\nHint: ...` (`src/cli/run.ts:125–131`).

### 1.6 GitHubClient port shape

`src/core/port/github-client.ts` defines a port with 4 methods: `verifyBranch`, `getRawFile`, `verifyPath`, `verifyTokenScopes`. It is **HTTP/REST**-based (not gh-CLI-based) and concerned with read operations. Implementation in `src/adapter/github/github-client.ts`.

---

## 2. 共通化すべき箇所と理由

### 2.1 `spawnCommand` の抽出 — **reusability**

`spawnCommand` at `src/core/pr-create/runner.ts:39–59` is private. Finish needs the exact same primitive (capture stdout/stderr, propagate `exitCode`) for at least 6 invocations: `gh pr view`, `gh pr merge`, `git fetch`, `git checkout`, `git mv`, `git commit`, `git push`, `gh pr create`, `gh pr merge --auto`, `openspec archive`. Re-implementing it inline in finish would duplicate ~20 lines and split the testability surface.

**Recommendation**: extract to `src/util/spawn.ts` with signature `spawnCommand(cmd, args, opts: { cwd, env?, input?, timeoutMs? })`, returning `{ exitCode, stdout, stderr }`. Update `src/core/pr-create/runner.ts` to import from it. Re-use in all finish subprocess invocations.

Observation root: `src/core/pr-create/runner.ts:39`, future call sites in `src/cli/finish.ts` (tasks 3.1, 4.1, 4.2, 5.1, 5.3, 6.1, 6.3, 7.1, 7.2, 7.3, 7.4).

### 2.2 `gh-failure` message builder の抽出 — **reusability**

`buildGhFailureMessage` at `src/core/pr-create/runner.ts:215–221` performs auth-error hint appending. Finish faces the exact same scenario for every gh invocation.

**Recommendation**: extract to `src/util/gh-error.ts` (or `src/core/gh/error.ts`). Same signature, single source.

### 2.3 PR body temp-file pattern の共通化 — **reusability**

`createPr` (lines 100–140) writes `body` to `os.tmpdir()` then `--body-file`-passes it. Finish's archive PR (task 7.2) needs the same idiom (`gh pr create --title ... --body "Automated archive PR..."`).

**Recommendation**: introduce a thin helper `runGhPrCreate({ title, body, base, head, cwd })` in a shared `src/core/gh/pr.ts` module. Re-implement `createPr` on top of it. The current body content for `pr-create` is dynamic (rendered template); for `finish` archive PR it is a static string. Both can share the temp-file machinery.

### 2.4 state-by-id load helper — **testability + SRP**

Finish must load a state by `jobId` (task 2.2) and update it (task 8.1, 8.3). `src/state/store.ts` has no `loadJobState(jobId)` or `updateJobState(jobId, mutator)` primitives. Inlining `fs.readFile + JSON.parse + validateJobState` in `finish.ts` would couple finish to the storage shape and make state-update testing harder.

**Recommendation**: extend `src/state/store.ts` with two functions:
- `loadJobState(jobId: string): Promise<JobState>` — throws `STATE_FILE_INVALID` on parse failure, throws `JOB_NOT_FOUND` (new error code) on ENOENT.
- `updateJobState(jobId: string, mutator: (state: JobState) => JobState): Promise<JobState>` — read-then-mutate-then-`atomicWriteJson` to enforce atomicity.

This preserves the atomic write protocol (task 8.3) and is symmetric with `createJobState`.

---

## 3. 既存ヘルパー / ユーティリティの活用候補

### 3.1 `atomicWriteJson` — `src/util/atomic-write.ts`

Task 8.3 demands "*.tmp.<random>` → `fs.rename`" — this **already exists** as `atomicWriteJson`. Finish must not re-implement it. The recommended `updateJobState` helper (§2.4) wraps it.

### 3.2 `getJobStatePath` / `getJobsDir` — `src/util/xdg.ts`

For task 2.2 (load by jobId) and task 2.3 (scan jobs/ directory). `listJobStates` already encapsulates the scan; `--slug` resolution can call `listJobStates()` then filter rather than re-implementing directory traversal.

### 3.3 `SpecRunnerError` + `ERROR_CODES` — `src/errors.ts`

For task 9.3 (exit code 1 for execution errors): wrap finish-side failures in `SpecRunnerError` and let the CLI entry print `Error: ... / Hint: ...`. Add new codes (e.g. `JOB_NOT_FOUND`, `JOB_NOT_FINISHABLE`, `OPENSPEC_ARCHIVE_FAILED`, `AUTO_MERGE_UNAVAILABLE`). Argument-parsing errors (task 9.3, exit code 2) should remain plain stderr writes per the existing pattern in `bin/specrunner.ts:65, 95`.

### 3.4 `GitHubClient` port — `src/core/port/github-client.ts`

**Do NOT extend.** Per design Decision 2, finish uses `gh` CLI throughout. The existing port is REST/HTTP, used for branch / file existence checks. Mixing port (read) with subprocess (write) is acceptable because they target different concerns. Adding `mergePullRequest` to the port is explicitly out of scope.

### 3.5 `getLatestStepResult` — `src/state/helpers.ts`

Useful only if finish needs to read the prior `pr-create` step result to recover `branch` / `pullRequest.number` when state.pullRequest is missing. In practice `JobState.pullRequest` (schema.ts:127) is the canonical source — fall back to `getLatestStepResult(state, "pr-create")` only if `state.pullRequest` is absent (legacy state files).

---

## 4. 分割単位の推奨

Recommended module layout for finish (mirrors how `pr-create` and `doctor` are split):

```
src/cli/finish.ts                          # CLI entry: arg parsing, USAGE, exit codes (runFinish + runFinishCore)
src/core/finish/                            # New domain folder
  resolve-target.ts                         # § 2 of tasks.md: jobId / --slug / awaiting-merge resolution
  pr-state.ts                               # § 3: gh pr view spawn + normalizePrState (6 states)
  merge-feature-pr.ts                       # § 4: gh pr merge --squash --delete-branch [--admin]
  archive-openspec.ts                       # § 5: git fetch/checkout + openspec archive subprocess
  move-requests-dir.ts                      # § 6: git mv awaiting-merge → merged + git commit
  archive-pr.ts                             # § 7: git push + gh pr create + gh pr merge --auto + fallback
  job-state-update.ts                       # § 8: archived transition + history append
  escalation.ts                             # § 9: formatEscalation + recommended action strings
  idempotency.ts                            # § 10: skip-if-already-done predicates
  orchestrator.ts                           # Top-level sequencer that composes all of the above
src/util/spawn.ts                           # NEW — extracted spawnCommand (§ 2.1)
src/core/gh/                                # NEW — shared gh helpers
  error.ts                                  # buildGhFailureMessage (§ 2.2)
  pr.ts                                     # runGhPrCreate w/ --body-file temp-file pattern (§ 2.3)
src/state/store.ts                          # EXTENDED — loadJobState, updateJobState (§ 2.4)
src/state/schema.ts                         # EXTENDED — JobStatus union += "archived"
bin/specrunner.ts                           # EXTENDED — case "finish" + flags (--slug, --force, --cleanup-only)
```

### Why this split

- **SRP / cohesion**: each `src/core/finish/<step>.ts` corresponds 1:1 to a single tasks.md section (§3 ↔ pr-state.ts, §4 ↔ merge-feature-pr.ts, etc.). One concern per file mirrors the doctor checks pattern (`src/core/doctor/checks/`).
- **testability**: each module accepts injected dependencies (a `Spawn` function type and a `Fs` boundary) — the same pattern used by `DoctorContext` (`src/core/doctor/types.ts:32-58`). Subprocess wrappers must NOT call `spawn` directly inside the finish module; they take a `spawn: SpawnFn` parameter so unit tests can stub.
- **coupling**: `orchestrator.ts` is the single composition root that wires the 7 step modules together. It is the only file that owns ordering. Each step module is unaware of the others — same shape as `runChecks(checks, ctx)` in `src/core/doctor/runner.ts:13`.
- **readability**: a single 600-line `finish.ts` would be impossible to review; 7 ~80-line files map directly to the design's 6 normalized states + escalation philosophy.

### Anti-recommendations (to NOT do)

- **Do NOT add `FinishStep` to `src/core/pipeline/run.ts`**. Finish is invoked manually via CLI after the pipeline ends; making it a pipeline step would conflate two lifecycles (per-job pipeline vs. post-merge cleanup).
- **Do NOT re-use `PrCreateStep`'s result file pattern (`*-result.md`)** for finish output. Finish writes to stdout (escalation block); per design Decision 3 there is no LLM consumer and no `parseResult` need.
- **Do NOT extend `GitHubClient` port** (per design Decision 2).

---

## 5. Risks

| # | Risk | Axis | Severity | Observation root |
|---|------|------|----------|------------------|
| 1 | tasks.md path convention diverges from actual codebase (`src/cli/commands/finish.ts` vs `src/cli/finish.ts`, `src/lib/jobs/state.ts` vs `src/state/schema.ts`). Implementer following tasks verbatim creates a parallel module tree | cohesion | HIGH | `openspec/changes/cli-finish-command/tasks.md:3,5` vs `src/cli/run.ts`, `src/state/schema.ts` |
| 2 | `spawnCommand` is private to `pr-create/runner.ts`; without extraction, finish duplicates the primitive in 9+ call sites. Two subprocess idioms (`spawn` in pr-create, `promisify(execFile)` in doctor) already coexist, increasing entropy | reusability | HIGH | `src/core/pr-create/runner.ts:39`, `src/cli/doctor.ts:60` |
| 3 | gh JSON schema drift — `mergeStateStatus` field set is GitHub-internal. Without a typed schema and safe-default fallback (per Decision 7), parser will throw on unknown values | testability | MEDIUM | tasks.md §3.4; design.md "Risks" §1 |
| 4 | `git mv` interrupted mid-operation leaves `awaiting-merge/<slug>/` and `merged/<slug>/` partially populated. Finish must check both paths in idempotency gate (task 6.2 + 10.2) | testability | MEDIUM | tasks.md §6.1, §10.2; design.md "Risks" §3 |
| 5 | `state.status === "running"` gate (task 8.4) — unclear whether finish should wait or immediately reject. Inline-spawning of long subprocesses while another `specrunner run` mutates the same state file produces atomic-write race | coupling | MEDIUM | tasks.md §8.4; `src/state/store.ts:42` (no file lock) |
| 6 | Subprocess wrappers tightly coupled to PATH (`gh`, `git`, `openspec`). Test suite cannot exercise them without either a stub `spawn` injection point or shell mocking. Without injectable `SpawnFn`, unit tests degrade to integration tests requiring real binaries | testability | HIGH | `src/core/pr-create/runner.ts` has no test for `spawnCommand` itself |
| 7 | `JobStatus` extension to `"archived"` is a breaking type change for any consumer that exhaustively switches on the union (e.g., `formatJobRow` in `src/cli/ps.ts:33`). TypeScript will catch this but only if every consumer is exhaustive | consistency | MEDIUM | `src/state/schema.ts:5`, `src/cli/ps.ts:39` |
| 8 | `bin/specrunner.ts` flag parsing is hand-rolled per command (run.ts uses `--timeout=`, doctor.ts uses `--json`). Finish needs `--slug=`, `--force`, `--cleanup-only` — ad-hoc parsing scales poorly. No shared parser exists | maintainability | LOW | `bin/specrunner.ts:50,70,83` |
| 9 | `openspec` CLI is a third subprocess dependency newly introduced by finish (not currently used by any other command). Doctor command doesn't probe it. Failure mode "openspec not on PATH" produces a confusing error | testability | MEDIUM | tasks.md §5.3; no `openspec` reference in `src/core/doctor/checks/` |
| 10 | Finish has no obvious place to be re-invoked when a partial-state escalation is recovered. Resume relies on idempotency gates (task 10), but there is no log/audit trail of what was skipped vs. executed in a given run. stdout-only is fine for human, but worsens debugging | maintainability | LOW | tasks.md §10; design.md "Risks" §3 |

---

## 6. Recommended refactors

### Before implementation (preconditions for clean implementation)

1. **R1 (HIGH, reusability)**: Extract `spawnCommand` from `src/core/pr-create/runner.ts:39` to `src/util/spawn.ts`. Update pr-create to import. This is a low-risk pure move; existing pr-create tests should pass unchanged.
2. **R2 (HIGH, cohesion)**: Reconcile tasks.md path inconsistencies in spec-review. Either patch tasks.md to match actual paths, or document a convention migration as a separate concern. Implementer should not silently reinterpret.
3. **R3 (MEDIUM, testability)**: Add `loadJobState(jobId)` and `updateJobState(jobId, mutator)` to `src/state/store.ts` before finish.ts depends on them. Ship with unit tests covering ENOENT, parse failure, and atomic write.

### During implementation (apply within finish module)

4. **R4 (HIGH, testability)**: All finish modules MUST take `spawn: SpawnFn` and `fs: FinishFs` (mirroring `DoctorContext`). The CLI entry (`src/cli/finish.ts`) is the only place that binds them to real Node modules. This makes every step module unit-testable without spawning real processes.
5. **R5 (MEDIUM, reusability)**: Move `buildGhFailureMessage` to `src/core/gh/error.ts`. Move temp-file `--body-file` PR creation to `src/core/gh/pr.ts:runGhPrCreate`. Refactor pr-create to use it. Both finish and pr-create benefit.
6. **R6 (MEDIUM, SRP)**: Keep `orchestrator.ts` purely a sequencer (no business logic — only ordering, error mapping to `SpecRunnerError`, and idempotency gate dispatch). Each `<step>.ts` module owns its own logic and returns a typed result that the orchestrator branches on.
7. **R7 (LOW, readability)**: Define a typed `NormalizedPrState` union in `src/core/finish/pr-state.ts` exporting `OPEN_MERGEABLE | OPEN_BEHIND | OPEN_CONFLICTS | OPEN_CHECKS_FAILING | MERGED | CLOSED` as a literal union, plus a const array for exhaustive-switch test verification.

### Deferred (post-implementation, separate change)

8. **R8 (MEDIUM, maintainability)**: Introduce a shared CLI flag parser in `bin/specrunner.ts` (or `src/cli/_args.ts`). Out of scope for this change but the n+1 ad-hoc parsers will compound.
9. **R9 (MEDIUM, testability)**: Add an `openspec` PATH check to `src/core/doctor/checks/` once finish ships. Doctor currently knows about `gh` / `git` but not `openspec`.

---

## 7. Notes (Out-of-Scope observations not actioned)

- **extensibility**: not evaluated. Whether the 6-state normalization will accommodate future GitHub `mergeStateStatus` values is a forward-looking concern outside the mechanical-axis remit.
- **deployment independence**: not evaluated.
- **security boundary**: gh CLI handles auth via OAuth token in its own keychain. No new secret surface introduced; out of mechanical-axis scope.
- **business domain boundary**: the boundary between "pipeline lifecycle" (run) and "post-merge cleanup" (finish) is a domain decision documented in design.md Decision 3 and is respected by the layout above.
