# Scale-Tolerance Review: job-reopen-from-awaiting-archive

**Reviewer**: scale-tolerance  
**Iteration**: 001  

---

## Scope

Reviewed all files touched by this change that fall within the scale-tolerance observation axes: `src/store/**`, `src/adapter/github/**`, and the new CLI/command files that orchestrate catalog scans and API calls.

Changed files examined:

| File | Role |
|------|------|
| `src/store/event-journal.ts` | `fold()` extended to collect `operatorEvents` |
| `src/store/job-journal.ts` | `appendOperatorEvent` seam added; ENOENT literal updated |
| `src/store/job-state-store.ts` | `appendOperatorEvent` delegated through |
| `src/store/job-state-projection.ts` | Default `FoldResult` literal updated (ENOENT branch) |
| `src/state/lifecycle.ts` | `REOPEN_TRANSITIONS` table, `transitionJob` opts |
| `src/core/command/reopen.ts` | `ReopenCommand.prepare()` — full flow |
| `src/cli/reopen.ts` | CLI bootstrap + `resolveJobStateBySlug` pre-check |
| `src/cli/command-registry.ts` | `reopen` subcommand wiring |

---

## Checked Items

### 1. `fold()` — operator-event collection (event-journal.ts)

`fold()` already performs an O(N) scan of every committed line in `events.jsonl`. The change adds one new branch: `obj["type"] === "operator-event"` pushes the record into `operatorEventRecords`. This is O(1) per record inside the existing O(N) scan — no new I/O, no new traversal. The collected array is ephemeral (returned in `FoldResult`; not persisted to state.json). Over K reopens of a single job, the fold traverses K extra operator-event lines. This is bounded by the reopen count of a single job, not the aggregate archive count.

**Verdict**: no new proportional cost.

### 2. `appendOperatorEvent` (job-journal.ts / job-state-store.ts)

Uses `appendEventRecord` → `fs.appendFile`. Pure O(1) append; no read, no fold. The operator event is written before the lifecycle transition. There is no scan or full-read in this path.

**Verdict**: O(1), not scale-sensitive.

### 3. `persist()` crash recovery fold (job-journal.ts)

When the fast path is not eligible (new events to append), `persist()` reads and folds the full `events.jsonl` (existing behavior). Adding `operator-event` handling in `fold()` contributes O(1) per record to an already-existing O(N) scan. No new file reads introduced.

**Verdict**: additive to pre-existing O(N), not a new scaling axis.

### 4. `operator-event` records in events.jsonl — retention

Each reopen appends one `operator-event` line to the per-job `events.jsonl`. These accumulate with successive reopens. However, `events.jsonl` is an existing append-only file whose other record types (step-attempt, transition, lineage, interruption) have the same "no deletion" property. No new perpetually-growing file is created; records accumulate within an existing journal alongside all other event types. No retention path is required or expected for any journal record type.

**Verdict**: consistent with pre-existing journal semantics. No needs-fix.

### 5. `resolveJobStateBySlug(includeArchived: true)` — CLI layer (reopen.ts:58)

`runReopenCore()` calls `resolveJobStateBySlug(slug, cwd)` to extract `repo.owner` / `repo.name` for `bootstrap()`. This call routes through `JobStateStore.list(repoRoot, { includeArchived: true })` → full catalog scan including the archive directory. The cost is O(active + archived jobs) per invocation.

**Path**: manual command (`job reopen`). Per the reviewer criteria, "手動コマンドが archive 全件を読むのは許容". Not a periodic/tick path.

**Verdict**: acceptable per criteria; pre-existing pattern (mirrored from `src/cli/resume.ts:45`).

### 6. `resolveJobStateBySlug(includeArchived: true)` — core layer (reopen.ts:113)

`ReopenCommand.prepare()` calls `resolveJobStateBySlug(this.slug, cwd)` for state resolution. This is a second full catalog scan (same call) in the same invocation. The pattern is identical to `src/core/command/resume.ts:99`.

**Path**: same manual command invocation. Acceptable per criteria.

**Observation**: two catalog scans (including archive) occur per `reopen` invocation — one in the CLI layer and one inside `prepare()`. As archive grows, each invocation pays this cost twice. This is a pre-existing structural pattern (resume has the same shape), not introduced by this change. The double-scan is noted as an informational observation.

### 7. `JobStateStore.resolveId` fallback (reopen.ts:116–128)

When `resolveJobStateBySlug` returns null (slug not found), `prepare()` falls back to `JobStateStore.resolveId(cwd, this.slug)`, which calls `list(repoRoot, { includeArchived: true })` again. This is a third catalog scan in the worst case (slug-not-found path). However, `reopen` takes a `<slug>` positional argument; the fallback treats the argument as a short Job ID, which is an edge case. The pattern is identical to `ResumeCommand.prepare()`.

**Path**: manual command, edge case path. Not a periodic path.

**Verdict**: acceptable per criteria.

### 8. GitHub API — `getPullRequest` (reopen.ts:171–182)

Single endpoint call: `GET /repos/{owner}/{repo}/pulls/{number}`. Returns one PR object. No pagination required. O(1) API call per reopen invocation. Rate limit consumption is minimal (one read endpoint per command).

**Verdict**: not scale-sensitive.

### 9. Periodic paths — exit-guard, inbox tick

Inspected `src/core/lifecycle/exit-guard.ts` (imports unchanged by this change) and `src/core/inbox/` (not modified). No `reopen` logic is wired into any periodic execution path. The reopen command is strictly manual.

**Verdict**: no periodic-path regression.

### 10. New files per reopen — fan-out / retention

No new files or directories are created by the reopen operation itself. The operator-event record is appended to the existing per-job `events.jsonl`. The pipeline re-run that follows will create new iteration-numbered artifacts (`*-result-NNN.md`) — but this is the pre-existing iteration mechanism, not introduced by this change, and the files are bounded per job by the number of iterations.

**Verdict**: no new unbounded artifact growth.

---

## Summary

| Item | Axis | Path | Assessment |
|------|------|------|-----------|
| `fold()` operator-event branch | per-job journal size | on-demand (crash recovery / query) | OK — additive to pre-existing O(N) scan |
| `appendOperatorEvent` | — | manual command | OK — pure O(1) append |
| `persist()` crash recovery | per-job journal size | persist call | OK — no new I/O |
| Catalog scan × 2 per invocation | active + archived jobs | manual command | OK per criteria; pre-existing pattern |
| `resolveId` fallback catalog scan | active + archived jobs | manual command, edge case | OK per criteria |
| GitHub API `getPullRequest` | O(1) | manual command | OK |
| No periodic path additions | — | — | OK |
| No new unbounded file creation | — | — | OK |

No needs-fix findings. One informational observation noted (double catalog scan per invocation, pre-existing in resume).
