# `job` review

Status: **reviewed**  
Verdict: **KEEP namespace**, but split everyday lifecycle commands from operator/maintenance surfaces.

Current subcommands:

```text
start
ls
show
wait
cancel
resume
reopen
attach
archive
prune
stats
```

## User goal

Operate one stateful SpecRunner execution from creation through observation, recovery, completion, and cleanup.

`job` is the strongest noun in the CLI: unlike `request`, every command here acts on repository-owned execution state, worktrees, branches, journals, or archived run data.

## Recommended surface classification

| command | verdict | audience | rationale |
| --- | --- | --- | --- |
| `job start` | KEEP | normal | canonical lifecycle form for starting a job; `run` remains promoted shortcut |
| `job ls` | KEEP | normal | operations view, not a trivial file list; includes lifecycle categorization, stale detection, and optional PR state |
| `job show` | KEEP | normal/operator | detailed state, logs, lineage, journal integrity, and per-step cost |
| `job wait` | KEEP | normal/automation | synchronization primitive for detached execution; blocks until process/job settles and prints the next action |
| `job cancel` | KEEP | normal | lifecycle transition for abandoning one job and cleaning its resources |
| `job resume` | KEEP | normal + advanced operator flags | primary recovery verb after halt/escalation |
| `job reopen` | KEEP but operator-scoped | operator | re-enters an already successful `awaiting-archive` job from an explicitly chosen step; requires rationale |
| `job attach` | KEEP but operator-scoped | repair/operator | imports/materializes a verified remote checkpoint; local-runtime recovery primitive, not everyday execution |
| `job archive` | KEEP | normal | terminal lifecycle/finalization operation, with optional merge orchestration |
| `job prune` | KEEP but maintenance-scoped | operator/maintenance | orphan cleanup; safe dry-run by default |
| `job stats` | KEEP functionality, HOLD placement | reporting | run-level aggregate reporting; decide `job` vs `usage` when the `usage` top-level command is reviewed |

No command should be removed merely because there are eleven. The useful reduction is in **discoverability tiers**, not deleting lifecycle capabilities.

## Findings

### 1. The whole `job` namespace is repository-owned, but repo requirements are declared inconsistently

Today only some subcommands set `requiresRepo: true` (`cancel`, `attach`, `prune`, `stats`). Others rely on preflight, fallback paths, or `process.cwd()`.

That is the wrong level for the invariant. A job has no meaningful existence outside a repository.

**Direction:** the future command spec should allow the parent `job` command to declare a repository requirement inherited by all children. Running `job ls/show/wait/start/resume/...` outside a repo should produce the same unified repo-required error instead of an empty/not-found/path-dependent result.

This also reduces per-subcommand ceremony and makes future job commands correct by default.

### 2. Repo-root resolution debt remains in core lifecycle commands

The July repo-root work explicitly established that internal state must derive from dispatch-time repo root and left a set of `process.cwd()` call sites as follow-up debt.

That debt is visible here:

- `job start` / promoted `run` call `runRun(...)` without supplying the dispatch-resolved repo root, so `runRunCore` falls back to `process.cwd()` for slug lookup and internal paths.
- `job resume` passes `cwd: process.cwd()` and `runResumeCore` uses that value to resolve the job before bootstrap receives `repoRoot`.
- `job reopen` has the same initial job-resolution shape.
- `job archive` is dispatched with `cwd: process.cwd()` and internally treats that value as its repository root.

`job ls`, `job show`, `job wait`, `job cancel`, `job attach`, `job prune`, and `job stats` are already substantially better about receiving the resolved root.

**Direction:** finish the repo-root migration for all repository-owned job state. Preserve invoker cwd only for explicit user-relative file arguments such as `--prompt-file`.

### 3. `job cancel` contains a maintenance operation that is not actually "cancel"

The normal form is coherent:

```text
job cancel <jobId>
```

It transitions one job to canceled and cleans its resources while preserving audit state unless `--purge` is explicitly requested.

But:

```text
job cancel --all-terminated [--yes]
```

targets `failed`, `terminated`, and `canceled` jobs for bulk cleanup. It is not a cancellation transition; those jobs have already stopped. This is historical maintenance functionality living behind the wrong verb.

**Direction:** keep single-job cancel as the public lifecycle command. Move the bulk cleanup behavior to the maintenance surface when that surface is redesigned (likely alongside `prune`), with compatibility handling if needed. Do not keep teaching `cancel --all-terminated` as the preferred interface.

`--purge` may remain an advanced destructive option on a specific cancellation because it modifies the persistence policy of that same lifecycle action.

### 4. `resume` is one command with two levels of UX and should remain that way

Simple recovery is intentionally small:

```text
job resume <slug>
```

Advanced flags (`--from`, `--prompt`, `--apply-canon`, `--adopt-commits`, `--force`) are operator recovery controls. They do not justify a second command because they all modify the same transition: resuming a halted/awaiting-resume job.

**Direction:** keep one `resume`, but use layered help:

- terse/top help: show the simple form;
- detailed help / `guide escalation`: explain advanced recovery flags.

This is a good example of why command count alone is the wrong optimization target.

### 5. `reopen` and `attach` are legitimate commands but should not compete with everyday lifecycle verbs

`reopen` deliberately crosses a strong boundary: it takes `awaiting-archive` back into pipeline execution, requires `--from` and `--reason`, and fail-closes on PR state.

`attach` verifies a published remote checkpoint OID, materializes the exact verified commit, and then tells the operator to resume. It is a recovery/import operation and currently local-runtime only.

Both are valuable precisely because recoverability is first-class. They should remain commands, but their discoverability should be contextual:

```text
error/halt/guide -> reopen or attach when required
```

rather than making a new user learn them during Quick Start.

A machine-readable command spec therefore needs a visibility/audience dimension such as `normal | operator | maintenance | compatibility`, not just `hidden: boolean`.

### 6. `prune` is well-shaped maintenance behavior

`job prune` is dry-run by default and `--force` performs deletion. It separately reports orphan worktrees and orphan sidecars and protects live/unsafe resources in the underlying runners.

KEEP the behavior and noun for now. Whether maintenance eventually deserves its own top-level namespace should be decided only after the remaining CLI is reviewed; do not invent one solely for this command.

### 7. `archive --merge-wait-ms` silently accepts malformed input

The registry parses with `parseInt` and ignores non-numeric values instead of returning an argument error.

Consequences include:

```text
--merge-wait-ms abc     -> silently ignored
--merge-wait-ms 100abc  -> accepted as 100
```

This is poor CLI behavior because the user asked for an explicit timeout override and receives no indication that the value was rejected/coerced.

**Direction:** numeric flags must validate strictly and fail with `ARG_ERROR` on malformed values. Prefer a typed integer flag in the future command spec so handlers do not reimplement parsing.

### 8. Observation commands are distinct and should not be merged

- `ls` answers "what jobs need attention?" and builds an operations view.
- `show` answers "what happened/is happening in this job?" and includes logs, lineage, integrity, and cost detail.
- `wait` answers "block this shell/agent until this job settles" and returns a status-sensitive exit code plus next action.

They share state but not user intent. Combining them would make the interface worse.

### 9. `stats` is reporting, not lifecycle

`job stats` aggregates all runs for cost, duration, convergence, SDK-measured cost, turns, and outcome. The implementation is coherent and should remain.

Placement is **HOLD** until `usage` is reviewed because the repository currently has two reporting concepts:

```text
job stats
usage ...
```

Do not move it preemptively. First determine whether `usage` is command-invocation accounting while `job stats` is run analytics, or whether the two surfaces should consolidate.

### 10. Help quality does not match the importance of the namespace

Some complex commands have detailed usage (`resume`, `reopen`, `archive`, `prune`), while other important commands (`start`, `cancel`, `wait`, `attach`, `stats`) rely on terse registry/top-help behavior.

The parent `job` namespace also lacks a generated categorized help view.

**Direction:** after command-spec consolidation, `specrunner job --help` should group commands by intent, for example:

```text
Run
  start
  wait

Inspect
  ls
  show

Recover
  resume

Finish
  cancel
  archive

Operator / maintenance
  reopen
  attach
  prune
  stats   # placement pending usage review
```

Operator entries may be shown in a secondary section rather than hidden completely.

## Desired shape

The conceptual public surface is smaller than the raw subcommand count suggests:

```text
specrunner run <request>        # promoted shortcut

specrunner job start <request>
specrunner job ls
specrunner job show <job>
specrunner job wait <slug>
specrunner job resume <slug>
specrunner job cancel <job>
specrunner job archive <slug>
```

Contextual/operator surface:

```text
specrunner job reopen ...
specrunner job attach ...
specrunner job prune ...
```

Reporting placement remains pending:

```text
specrunner job stats
```

## Final verdict

- Namespace: **KEEP**
- Everyday lifecycle: **KEEP `start/ls/show/wait/cancel/resume/archive`**
- Operator recovery: **KEEP but de-emphasize `reopen/attach`**
- Maintenance: **KEEP but de-emphasize `prune`**
- Reporting: **KEEP `stats` functionality; HOLD namespace placement until `usage` review**
- `cancel --all-terminated`: **MOVE away from cancel as the preferred interface**
- Repo ownership: **make inherited `job` invariant instead of per-command opt-in**
- Repo-root debt: **finish migration for start/resume/reopen/archive**
- Argument parsing: **strictly reject malformed numeric flags**
- Help: **generate categorized parent + leaf help from CommandSpec**
