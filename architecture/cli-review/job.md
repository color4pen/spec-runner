# `job` review

Status: **reviewed**  
Verdict: **KEEP namespace**, with everyday lifecycle commands separated from operator/maintenance surfaces.

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

`job` is the strongest lifecycle noun in the CLI. Every command here acts on repository-owned execution state, worktrees, branches, journals, or run history.

## Surface classification

| command | verdict | audience |
| --- | --- | --- |
| `job start` | KEEP | normal |
| `job ls` | KEEP | normal |
| `job show` | KEEP | normal/operator |
| `job wait` | KEEP | normal/automation |
| `job cancel` | KEEP | normal |
| `job resume` | KEEP | normal + advanced operator flags |
| `job reopen` | KEEP, de-emphasize | operator |
| `job attach` | KEEP, de-emphasize | repair/operator |
| `job archive` | KEEP | normal |
| `job prune` | KEEP, de-emphasize | maintenance |
| `job stats` | KEEP under `job` | reporting/run analytics |

The useful reduction is in discoverability tiers, not deleting lifecycle capability.

## Findings

### 1. `job` should own the repo requirement as a parent invariant

Only some leaves currently declare `requiresRepo: true`; others rely on preflight, fallback logic, or `process.cwd()`.

A job has no meaningful existence outside a repository.

**Direction:** future CommandSpec should support inherited `requiresRepo: true` on the `job` parent so all children fail consistently outside a repo.

### 2. Repo-root migration is incomplete

Internal job state must derive from dispatch-resolved repo root. Remaining debt exists in core paths including `start`, `resume`, `reopen`, and `archive`, which still pass or fall back to `process.cwd()` in places.

Preserve invoker cwd only for explicit user-relative file arguments such as `--prompt-file`.

### 3. `job cancel --all-terminated` is maintenance hidden behind the wrong verb

`job cancel <jobId>` is coherent: cancel one live job and clean its resources.

`job cancel --all-terminated` instead bulk-cleans already stopped `failed` / `terminated` / `canceled` jobs. That is maintenance, not cancellation.

**Direction:** keep single-job cancel. Move bulk terminated cleanup toward the maintenance surface alongside `prune`; keep compatibility only if needed.

### 4. `resume` should stay one command

Simple recovery:

```text
job resume <slug>
```

Advanced recovery flags such as `--from`, `--prompt`, `--apply-canon`, `--adopt-commits`, and `--force` all modify the same transition and do not justify separate commands.

Use layered help instead: simple form in normal help, advanced controls in detailed help / `guide escalation`.

### 5. `reopen` and `attach` are legitimate operator commands

`reopen` intentionally crosses a strong lifecycle boundary by taking an `awaiting-archive` job back into execution and requires explicit `--from` and `--reason`.

`attach` imports/materializes a verified remote checkpoint before recovery.

Both are valuable because recoverability is first-class, but they should be reached contextually through errors/guide rather than competing with everyday verbs in Quick Start.

### 6. `prune` is correctly maintenance-oriented

`job prune` is dry-run by default and `--force` performs cleanup. Keep it, but present it as maintenance rather than normal lifecycle.

### 7. `archive --merge-wait-ms` validates too loosely

Handler-local `parseInt` means malformed values can be silently ignored or partially accepted (`100abc` -> `100`).

**Direction:** numeric flag types belong in CommandSpec and malformed values should fail with `ARG_ERROR` before the handler.

### 8. `ls`, `show`, and `wait` are distinct

- `ls`: what jobs need attention?
- `show`: what happened/is happening in this job?
- `wait`: block until this job settles and return status-sensitive next action.

Do not merge them just because they all inspect state.

### 9. `job stats` stays under `job`

The `usage` review resolves the prior placement HOLD.

```text
job stats
  -> run analytics: duration / convergence / cost / turns / outcome

usage
  -> resource accounting: model / token / step cost
```

The cost column overlaps, but the user questions and source data differ. Keep `job stats` under `job`; keep `usage` top-level. Do not merge them into one oversized report.

### 10. Help needs intent-based layering

The parent namespace should eventually render categorized help from CommandSpec, for example:

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

Analytics
  stats
```

## Desired everyday shape

```text
specrunner run <request>        # promoted shortcut

specrunner job start <request>
specrunner job ls
specrunner job show <job>
specrunner job wait <slug>
specrunner job resume <slug>
specrunner job cancel <job>
specrunner job archive <slug>
specrunner job stats
```

Contextual/operator surface:

```text
specrunner job reopen ...
specrunner job attach ...
specrunner job prune ...
```

## Final verdict

- Namespace: **KEEP**
- Everyday lifecycle: **KEEP `start/ls/show/wait/cancel/resume/archive`**
- Operator recovery: **KEEP but de-emphasize `reopen/attach`**
- Maintenance: **KEEP but de-emphasize `prune`**
- Reporting: **KEEP `stats` under `job`**
- `cancel --all-terminated`: **MOVE away from cancel as preferred interface**
- Repo ownership: **make inherited `job` invariant**
- Repo-root debt: **finish migration for start/resume/reopen/archive**
- Argument parsing: **strict typed numeric flags**
- Help: **generate categorized parent + leaf help from CommandSpec**
