# Design: Evidence Base — decouple bite-evidence baseline from step chronology

## Context

The bite-evidence red→green proof currently resolves two commit OIDs from step
chronology (`src/core/step/bite-evidence/oids.ts:resolveBaseCandidateOids`):

- **base (red)** = latest `test-materialize` run's `commitOid`
- **candidate (green)** = latest `implementer` run's `commitOid`

"base = the worktree tree at that commit" breaks on resume / re-run:

1. **Re-run contamination.** If `test-materialize` runs *after* an earlier
   `implementer`, the whole tree at the test-materialize commit already contains
   implementation, so the tests pass at base — red is unattainable. #991 added
   `detectBaseImplementationContamination` (startedAt total-order) and routed the
   shape to `strategy-deferred` (gate step 3.5, `gate.ts:119-129`) and to
   `baseline unbuildable` fail-closed in the archive floor
   (`achieved-assurance.ts:236-246` P2.5). That is **detection** — the broken job
   loses every path to assurance, it is not repaired.
2. **Operator commit drop-out.** `resume --adopt-commits` appends adopted operator
   commits to the `synthesizedCommits` ledger only (`resume.ts:460-464`); the
   `implementer` run's `commitOid` is unchanged. The gate then green-judges the
   pre-operator tree.

The `oids.ts:55` ponytail marker ("startedAt 全順序に依存。Evidence Base 導入時に
tree 合成へ置換") is the pre-registered forward pointer to this change.

**Root cause.** The baseline is defined by *when* a step committed, not by *what
tree* is the correct reference. Define the reference by construction instead:

```text
Evidence Base = immutable job base (base-branch tree at job start)
              + overlay of the materialized test files (content at candidate)
```

The number/order of `test-materialize` runs no longer affects the Evidence Base's
meaning. Contamination becomes structurally impossible rather than detected-then-refused.

### Relevant current facts (verified in this repo)

- The first entry of the `synthesizedCommits` ledger is the **bootstrap commit**
  (`add request.md for <slug>`), created as the first commit on the feature branch
  on top of the fork point — `workspace-materializer.ts:213-242` (worktree) and
  `local.ts:419-443` (no-worktree run path). `appendSynthesizedCommit` is called
  there before any pipeline step runs. Therefore `synthesizedCommits[0]` is stable,
  branch-borne (survives resume via the journal fold), and its **first parent is
  the immutable fork point** = the base-branch tree at job start. `--adopt-commits`
  appends to the *end* of the ledger, never index 0.
- The runtime already runs scoped tests on an arbitrary commit via a detached
  worktree: `local.ts:runTestsAtCommit` does `git worktree add --detach <tmp> <oid>`,
  symlinks `node_modules`, runs `scopedTestCommand '<file>'` per file, and cleans up.
  `listCommitChangedFiles` / `diffPathsBetweenCommits` are the sibling git primitives.
  Managed runtime returns `unavailable` for all three (no local worktree).
- The archive floor (`deriveAchievedAssurance`) already uses `finalHeadOid`
  (archive HEAD, which reaches operator-adopted commits) as its green candidate;
  its base-red still runs on the test-materialize commit and it shares P2.5 with the gate.
- The gate is a CLI step (`bite-evidence/step.ts`), routes `passed`/`strategy-deferred`
  → verification and `failed`/`error` → escalate, and MUST never throw
  (unexpected error → `strategy-deferred`). `FORWARD_TYPES = {bug-fix, new-feature}`
  is shared with the archive floor.

## Goals / Non-Goals

**Goals**:

- Introduce an Evidence Base abstraction: immutable job base tree + overlay of the
  materialized test files (candidate-time content), resolved identically on first
  run, resume, and re-run regardless of how many times `test-materialize` ran.
- Replace the gate's red side to evaluate on the Evidence Base (not a test-materialize
  commit checkout). Add a runtime port method that runs scoped tests on the synthesized tree.
- Replace the green candidate with the provenance-approved effective branch state
  (branch HEAD reaching pipeline-synthesized + operator-adopted commits), so
  `--adopt-commits` commits are included.
- Remove the chronology-dependent machinery — `detectBaseImplementationContamination`,
  gate step 3.5, archive-floor P2.5 — and rebuild the archive floor's base-red on
  the Evidence Base so re-run shapes can *earn* assurance.
- Preserve unchanged: `scopedTestCommand`-unset / managed-runtime / non-forward-type
  `strategy-deferred`, `FORWARD_TYPES`, tamper detection, and the gate's never-throw contract.

**Non-Goals** (from request スコープ外):

- Retiring `test-materialize` or folding it into `implementer` (later request).
- Semantic hollow-test detection (mirror tests). red→green 証明力 is unchanged; this
  change only makes its *precondition* independent of chronology.
- Adding a default `scopedTestCommand` or extending config.
- Changing code-review / conformance / verification behavior.

## Decisions

### D1: Job base = first parent of the first synthesized commit

The immutable job base is resolved as `<synthesizedCommits[0]>^` (first parent of the
bootstrap commit). A pure helper (in `oids.ts`) returns this revision expression, or
`null` when the ledger is empty.

- **Rationale (why this, not a new state field).** The fork point is exactly "base
  branch tree at job start". `synthesizedCommits[0]` is already persisted branch-borne
  and folds through resume; a commit's first parent is immutable, so the expression
  resolves to the same tree on first run and every resume/re-run — satisfying the
  resume-invariance requirement with zero new write path and zero schema change. It is
  also more correct than recording "current base-branch OID", which would drift as the
  base branch advances after job start.
- **Alternatives considered.**
  - *New `jobBaseOid` field in job state, written at workspace materialization.* Explicit,
    but adds a schema field plus a new write site to maintain and a legacy-absent branch
    to fail-closed — more surface for the same tree. Rejected as redundant with an
    already-persisted, already-resume-safe anchor.
  - *`origin/<base-branch>` at gate time.* Not job-start; drifts with the base branch and
    is not resume-stable. Rejected.
- **Fail-closed.** Empty/absent ledger → `null` → `strategy-deferred` (gate) /
  dimension absent (floor). Same posture as today's absent base OID.

### D2: Evidence Base red = run scoped tests on (job base tree + candidate test overlay)

Add one generic runtime port method (name e.g. `runTestsOnSynthesizedTree`): given a
base revision, a list of overlay file paths, and an overlay-source OID, it checks out
the base revision into a detached worktree, overwrites each overlay path with that
file's content read from the overlay-source OID, symlinks `node_modules`, runs the
scoped tests per file, and cleans up — returning the existing `IsolatedTestResult` DU.

- **Rationale.** This is the smallest extension of the existing `runTestsAtCommit`
  machinery (detached worktree + node_modules symlink + scoped per-file run + cleanup);
  it reuses the same `scopedTestCommand` precedence, the same never-throw `unavailable`
  contract, and the same managed-runtime stub pattern. The method is deliberately
  *generic* (base rev + file overlay from a rev) and carries no chronology semantics —
  the gate/floor own the policy of what "job base" and "candidate" are.
- **Overlay content = candidate-time content** (`git show <overlaySourceOid>:<path>`),
  per the request's Evidence Base formula. For a new-module test this yields an import
  error at the base tree (red); for an existing-module behavior change it yields an
  assertion failure (red). This 証明力 ceiling (import-error red on new modules) is
  identical to today and explicitly in scope-unchanged.
- **Alternatives considered.** Synthesizing a real git tree object via
  `read-tree` + `update-index` + `write-tree` and checking that out. Equivalent for test
  execution but more plumbing; file-overlay into the detached worktree is simpler and has
  the same observable result. Rejected on laziness.
- **Managed / capability.** Managed runtime returns `unavailable` (no local worktree);
  `RealRuntimeStrategy` requires the method (compile-time), `RuntimeStrategy` keeps it
  optional for test fakes — mirroring `runTestsAtCommit`.

### D3: Materialized test-file *set* is still identified from the latest test-materialize commit

The set of paths to overlay/execute is `listCommitChangedFiles(latestTestMaterializeOid)`
filtered by `selectMaterializedTestFiles` — unchanged. Only the *base tree* role of that
commit is removed.

- **Rationale.** `test-materialize` may write only test files (responsibility table), so
  its commit diff is the materialized-test set. The set's *meaning* is chronology-independent
  (it is "the materialized tests"); we read the base tree from D1 and the content from D2's
  candidate, so no implementation from the test-materialize commit's tree can leak in. This
  keeps `resolveBaseCandidateOids` in place (still resolving the materialize/base OID), so
  its pinning tests stay green.
- **Known residual (Risk R1).** When `test-materialize` runs more than once and a later run
  changes only a subset of test files, the latest-commit diff lists only that subset — a
  pre-existing limitation of the set-identification mechanism, not introduced here and out of
  this request's scope.

### D4: Green candidate = effective branch HEAD, not the implementer commit OID

The gate resolves the candidate as the branch HEAD (`captureHeadSha(cwd)` — already on the
port) and runs green via `runTestsAtCommit(headOid, testFiles)`; the same HEAD supplies the
overlay-source OID for D2's red side. The archive floor's candidate stays `finalHeadOid`
(already HEAD-equivalent at archive).

- **Rationale.** "Provenance-approved reachable tree" = branch HEAD. Operator commits adopted
  via `--adopt-commits` are real commits on the branch, so HEAD includes them automatically;
  the stale `implementer.commitOid` does not. Whether HEAD contains *only* approved commits is
  already enforced elsewhere — the adopt gate rejects un-adopted publish-range commits at resume
  (`resume.ts:459-484`) and the egress backstop re-checks at push. Bite-evidence must not
  duplicate that enforcement; it evaluates the approved reachable tree.
- **Alternatives considered.** Update `implementer.commitOid` on adopt. Rejected: adopt is a
  provenance act, not an implementer re-run; overwriting a step's recorded OID would corrupt the
  chronology other consumers read, and still couples candidate to a step record instead of the
  branch tree.
- **Fail-closed.** `captureHeadSha` → `null` → `strategy-deferred`.

### D5: Remove chronology detection; rebuild archive-floor base-red on the Evidence Base

Delete `detectBaseImplementationContamination` (`oids.ts:45-72`), gate step 3.5
(`gate.ts:119-129`), and archive-floor P2.5 (`achieved-assurance.ts:236-246`). In the
archive floor, replace the base-red execution `runTestsAtCommit(baseOid)`
(`achieved-assurance.ts:441-463`) with `runTestsOnSynthesizedTree(jobBaseRev, testFiles,
finalHeadOid)`; keep the blob-freeze anchor (b) and scenario-freeze (c) on the
test-materialize / test-case-gen commits unchanged; keep HEAD-green (f) on `finalHeadOid`.

- **Rationale (検出より構成).** With the Evidence Base, base cannot contain implementation by
  construction, so the detector is dead weight — and keeping it is double bookkeeping. Removing
  P2.5 *without* moving base-red to the Evidence Base would not fix anything: a contaminated
  test-materialize tree would simply fail base-red instead of P2.5, still denying the re-run job
  assurance. The archive floor must build base-red on the Evidence Base for a re-run shape to
  earn assurance — this is the substance of the change, mirrored across gate and floor.
- **Alternatives considered.** Keep P2.5 as a belt-and-braces guard alongside the Evidence Base.
  Rejected: with contamination structurally impossible, the guard can only fire on false
  positives or dead paths — two sources of truth for one invariant.

### D6: Preserve all strategy-deferred / tamper / type / never-throw invariants

Order the gate so the deferring short-circuits (non-forward type, tamper mismatch → failed,
absent materialize OID, absent job-base ref, runtime capability missing, empty test-file
selection) run **before** HEAD capture and any test execution. `FORWARD_TYPES`, the tamper
check, the managed / `scopedTestCommand`-unset `unavailable` → `strategy-deferred` mapping, and
the never-throw wrapper are unchanged.

- **Rationale.** Requirement 5 fixes these behaviors. Ordering the defers first also keeps the
  short-circuit tests (empty selection, tamper, non-forward, absent OID) green without touching
  their fakes.
- **Alternatives considered.** Capture HEAD up front and defer later. Rejected: needless I/O and
  churn to the short-circuit tests' fakes.

### D7: Test enumeration (acceptance criterion 4)

Full list of tests that pinned the removed/changed mechanism and must be updated, with rationale.
Anything not listed is unchanged and must stay green.

**Update — gate (mechanism: red → Evidence Base, candidate → HEAD):**

| File | What changes | Why |
|------|--------------|-----|
| `src/core/step/bite-evidence/__tests__/gate.test.ts` | TC-003/004/005/008/030: route base-red through the new synthesized-tree fake; supply `captureHeadSha` + `synthesizedCommits` on state; green stays `runTestsAtCommit(HEAD)`. **TC-007 (strip-test-authority) re-run shape flips from `strategy-deferred` to `passed`** (acceptance 1). TC-008 (strip) hollow base-green → still `failed` via Evidence Base. | Red mechanism and candidate definition changed; the re-run shape #991 deferred now earns assurance. |
| `src/core/step/bite-evidence/__tests__/gate-empty-selection.test.ts` | TC-010/TC-011: same fake migration (base via synthesized tree, green via HEAD). | Same mechanism change. |

Unchanged in those files (stay green): TC-022 (absent base OID), TC-007 (non-forward), TC-031
(non-forward no records), TC-006 / TC-014 (tamper mismatch), TC-009 (empty selection defer),
TC-032 (`checkTamperStatus`) — all short-circuit before the red/green run (D6 ordering).

**Update — archive floor (mechanism: P2.5 removed, base-red → Evidence Base):**

| File | What changes | Why |
|------|--------------|-----|
| `src/core/archive/__tests__/achieved-assurance.test.ts` | Replace the "contaminated baseline (re-run shape)" test: the re-run shape is now **buildable**; assert base-red is derived on the Evidence Base (add `synthesizedCommits`, provide the synthesized-tree fake) rather than asserting `baseline unbuildable` + no-I/O. | P2.5 removed; re-run earns assurance. |
| `tests/unit/core/archive/achieved-assurance-test-file-selection.test.ts` | Base-red fake → synthesized-tree method; add `synthesizedCommits[0]` to states asserting `biteEvidence` achieved. | base-red mechanism moved off the test-materialize commit. |
| `tests/unit/core/archive/achieved-assurance-revision-binding-unit.test.ts` | Same fake migration; base-red-unavailable cases now exercise the synthesized-tree method. | Same. |
| `tests/unit/core/archive/achieved-assurance-revision-binding-integration.test.ts` | Same; real-config base-unavailable (`scopedTestCommand` absent) asserted via synthesized-tree unavailability (#848 anti-regression preserved). | Same. |
| `tests/unit/core/archive/achieved-assurance-completeness-unit.test.ts` | Base-red fake → synthesized-tree; TC-020 (HEAD-green unavailable) stays on `runTestsAtCommit(finalHeadOid)`. | base-red mechanism moved; HEAD-green unchanged. |
| `tests/unit/core/archive/achieved-assurance-completeness-integration.test.ts` | Same as completeness-unit; TC-026 real-config anti-regression preserved. | Same. |
| `tests/unit/core/archive/merge-then-archive-floor-provenance.test.ts` | Base-red fake → synthesized-tree; #848 / hollow / unavailable anti-regressions preserved (fail-closed unchanged). | base-red mechanism moved off the test-materialize commit. |
| `src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts` | Real-git repo: add the bootstrap commit as `synthesizedCommits[0]`; jobBase = its parent; drive gate + floor base-red on the Evidence Base. Add integration proving (a) a re-run shape earns assurance and (b) first-run vs resume resolve to the **same** Evidence Base tree. | Real-runtime end-to-end coverage of the new mechanism (acceptance 1 & 2). |

**New tests:**

- `src/core/runtime/__tests__/` (new file, or added to `bite-evidence-isolated-exec.test.ts`):
  `runTestsOnSynthesizedTree` against a throwaway git repo — base tree + overlay of candidate
  test content runs red; worktree/symlink cleanup; non-existent rev → `unavailable`; managed → `unavailable`.
- `gate.test.ts`: **acceptance 3** — a state with an operator-adopted commit reachable at HEAD but
  *after* the implementer commit; assert the candidate/green run uses the HEAD OID (adopted commit
  included), not `implementer.commitOid`.
- `oids` unit: **acceptance 2** — `resolveEvidenceBaseRev(state)` returns the same ref for a
  first-run state and a resume/re-run state (extra test-materialize/implementer runs + operator
  commits appended to the ledger) because `synthesizedCommits[0]` is unchanged.

**Verified unrelated — NOT changed** (matched a grep for `contamination`/`predates` incidentally,
in comments/other domains): `tests/unit/config/schema.test.ts`, `tests/cli-run-verdict.test.ts`,
`tests/core/usage/pricing.test.ts`, `tests/unit/architecture/invariant-catalog-parity.test.ts`,
`tests/unit/core/command/job-stats-cross-slug.test.ts`,
`src/core/resume/__tests__/apply-canon-provenance.test.ts`,
`src/core/port/__tests__/request-review-legacy-compat.test.ts`.

**Preserved functions/methods — pinning tests stay green:**
`src/core/step/bite-evidence/__tests__/oid-capture.test.ts` (`resolveBaseCandidateOids` kept for
the base/materialize OID under D3), `bite-evidence-isolated-exec.test.ts`,
`bite-evidence-scoped-exec.test.ts`, `diff-paths-between-commits.test.ts`,
`read-file-at-commit.test.ts` (all test unchanged runtime methods).

## Risks / Trade-offs

- **[R1] Multi-run test-file-set identification** → D3 still reads the *latest* test-materialize
  commit diff for the set of paths; a partial re-materialize lists only its subset. → Mitigation:
  pre-existing limitation, unchanged behavior, out of scope; documented so it is not mistaken for a
  regression, and closed later when `test-materialize` folds into `implementer`.
- **[R2] Overlay-by-file-write vs true tree object** → writing candidate content into the detached
  base worktree is not a git-tracked tree. → Mitigation: equivalent for test *execution* (the only
  consumer); freeze/tamper guarantees continue to live in the archive floor's blob-freeze (b) and
  scenario-freeze (c), which are unchanged.
- **[R3] HEAD as candidate could reach an un-approved commit** if an agent self-committed. →
  Mitigation: the adopt gate (resume) and egress backstop (push) already reject un-adopted
  publish-range commits fail-closed; bite-evidence relies on that boundary rather than re-checking it.
- **[R4] red 証明力 on new modules is import-error-level** → Mitigation: explicitly unchanged
  (architect note); this request makes red's *precondition* chronology-independent, not stronger.
- **[R5] Broadened archive-floor test surface** → moving base-red touches every `biteEvidence`-floor
  test. → Mitigation: inherent to fixing the substance (construction, not detection); D7 bounds the
  list, and preserved semantics keep the anti-regression (#848 / hollow / unavailable) assertions intact.

## Open Questions

- None blocking. R1 (partial re-materialize set identification) is noted as a pre-existing,
  out-of-scope limitation; if it ever needs closing, do it in the follow-up that folds
  `test-materialize` into `implementer`.

## Migration Plan

- **Legacy jobs** without a `synthesizedCommits` ledger (pre-bootstrap-ledger state) → job-base ref
  resolves to `null` → `strategy-deferred` (gate) / dimension absent (floor). Same fail-closed
  posture as today's absent base OID; no data migration required.
- **Rollback**: revert is code-only (no persisted schema change), because D1 derives the job base
  from existing ledger data rather than a new field.
