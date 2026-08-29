# Scale-Tolerance Review — remove-bite-evidence — iter 1

Reviewer: scale-tolerance
Purpose: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを、merge 前に検出する。

---

## Scope

diff stat: 113 files changed, 4961 insertions(+), 10950 deletions(−).

Net effect: large deletion. The change removes the `bite-evidence` pipeline step and all supporting
code. The primary implementation surface examined:

- `src/core/archive/achieved-assurance.ts` — archive floor provenance derivation (narrowed)
- `src/core/archive/merge-then-archive.ts` — archive orchestrator (config param removed)
- `src/core/runtime/local.ts` — LocalRuntime (three methods removed)
- `src/core/port/runtime-strategy.ts` — port interface (three method declarations removed)
- `src/state/schema/operations.ts` — state validation (comment update only)
- `src/store/event-journal.ts` — journal fold (no change)
- `src/core/resume/resolve-step.ts` — legacy alias addition (O(1))
- `src/config/schema/validation.ts` — semantic check addition (O(1))

---

## Evidence

### E-01 — Removed runtime methods were O(N_files × T_test)

Before this change, `deriveAchievedAssurance` called:

- `listChangedFilesBetweenCommits(baseOid, headOid, cwd)` — a git-diff scan over all files changed
  between the Evidence Base OID and HEAD. Cost grows O(N_changed_files) as the branch accumulates
  changes.
- `runTestsOnSynthesizedTree(evidenceBaseRev, files, finalHeadOid)` — creates a temp detached
  worktree, runs each selected test file against a synthesized base tree. Cost is
  O(N_selected_files × T_test_exec) where both factors are unbounded.
- `runTestsAtCommit(finalHeadOid, files)` — creates another temp worktree, runs the same file set
  against HEAD. Same O(N×T) cost.

These three calls formed the archive floor's biteEvidence re-execution path and ran on every
`job archive --with-merge` invocation where `minimumAssurance.biteEvidence` was configured and
the changed files matched a protected path.

All three methods and their ~310-line LocalRuntime implementations are removed by T-07.

After removal, `deriveAchievedAssurance` makes **at most 4 `readFileAtCommit` calls** — 2 for
`specReview` (spec.md@anchor, spec.md@HEAD) and 2 for `testDerivation` (test-cases.md@anchor,
test-cases.md@HEAD). These are constant-count git-blob reads whose cost is O(file_size), bounded.

**Cost change: O(N_changed_files × T_test) → O(1)**

### E-02 — `validateJobState` biteEvidence loop (legacy compat, bounded)

`src/state/schema/operations.ts` lines 306–341 still iterate over `state.biteEvidence` when
present. This was pre-existing code; this change only updates the comment to mark it
`@legacy-read-only`.

Scale properties:
- Loop only executes when `"biteEvidence" in obj` — false for all new jobs (no producer exists).
- For legacy state files: N = number of test files the historical gate selected, bounded at the
  time the job ran and never grows after the feature is removed.
- Called once per state-file load, not on each step or on every archive.

This loop does not represent a growing concern for deployments after this change.

### E-03 — `fold()` in `event-journal.ts` — per-job, bounded

The `fold()` function reads and processes all records in a job's `events.jsonl`. A job that
previously ran the bite-evidence gate will have step-attempt records for `"bite-evidence"` in
its journal. These are handled by the existing `step-attempt` dispatch path — no special case,
no additional scan.

`fold()` is O(N_records) per job. N is bounded by the convergence budget (max step iterations
+ retries). Journal entries from historical bite-evidence runs are simply grouped as another
step name; they do not cause unbounded growth.

Historical bite-evidence journal records do not increase the cost of folding new jobs.

### E-04 — `listPullRequestFiles` call count in merge-then-archive (unchanged, bounded)

`merge-then-archive.ts` calls `listPullRequestFiles` up to twice per archive when both
`protectedPaths` and `minimumAssurance` are configured. This is pre-existing behavior (not
introduced by this change — D5 removed the `config` parameter but did not change the call
structure). Each call retrieves at most 3000 file paths (GitHub API cap); truncation is
detected and escalated.

This is a fixed per-archive cost, not proportional to the number of past archives, PRs, or
jobs. Not a scale-tolerance concern.

### E-05 — New code: `checkRemovedAssuranceDimension` (O(1))

`src/config/schema/validation.ts` adds `checkRemovedAssuranceDimension(raw)` which performs a
single key-presence check on `raw.archive?.minimumAssurance`. This is O(1) regardless of
config size.

### E-06 — New code: `LEGACY_STEP_ALIASES["bite-evidence"]` (O(1))

`src/core/resume/resolve-step.ts` adds `"bite-evidence": STEP_NAMES.VERIFICATION` to a
pre-existing static object. Lookup is O(1) hash-map access.

---

## Cost-change summary

| Surface | Before | After |
|---------|--------|-------|
| Archive bite-evidence provenance | O(N_files × T_test) | removed (O(0)) |
| `listChangedFilesBetweenCommits` at archive | O(N_changed_files) | removed |
| `deriveAchievedAssurance` git calls | O(N_files) + O(1) | O(1) — max 4 `readFileAtCommit` |
| `validateJobState` biteEvidence loop | O(N_records) | O(N_records) (legacy-compat, no new records) |
| `fold()` bite-evidence records | O(N_records) per job | O(N_records) per job (unchanged, bounded) |
| `checkRemovedAssuranceDimension` | n/a | O(1) |
| `LEGACY_STEP_ALIASES` lookup | n/a | O(1) |

---

## Findings

No scale-tolerance findings. This change **reduces** costs on every measured axis. No new
proportional-growth scan, load, or API call pattern is introduced.

---

## Verdict (evidence only — CLI derives verdict from report_result)

All checked items are clean. Evidence supports approval on scale-tolerance grounds.
