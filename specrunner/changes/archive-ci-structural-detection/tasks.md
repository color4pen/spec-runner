# Tasks: structural CI-presence detection for `job archive --with-merge`

## T-01: Add the structural workflow-CI detection module

- [ ] Create `src/core/archive/workflow-ci-detection.ts`.
- [ ] Export an async detection function (suggested name `detectWorkflowCiPresence`)
      taking `{ spawn: SpawnFn; cwd: string; ref: string }` and returning
      `{ present: boolean; reason: "trigger-match" | "no-workflows" | "no-trigger" | "inspection-failed" }`.
- [ ] Enumerate workflow files with `spawn("git", ["ls-tree", ref, "--", ".github/workflows/"], { cwd })`
      (non-recursive). Parse `<mode> blob <sha>\t<path>` lines; keep `blob` entries whose
      path ends in `.yml` / `.yaml`; skip `tree` entries.
- [ ] `git ls-tree` exit ≠ 0 → return `{ present: true, reason: "inspection-failed" }` (fail-closed).
- [ ] exit 0 with no matching workflow blobs → return `{ present: false, reason: "no-workflows" }`.
- [ ] For each candidate blob, read its body with `spawn("git", ["cat-file", "-p", sha], { cwd })`.
      Any read exit ≠ 0 → return `{ present: true, reason: "inspection-failed" }`.
- [ ] Classify a body as CI-triggering when it contains a `push` or `pull_request`
      trigger token, using a text-level matcher (no YAML parser). Bias the matcher to
      over-detect (false positives resolve to the waiting side); treat `pull_request`
      as a prefix so `pull_request_target` / `pull_request_review` also match.
      First matching body → `{ present: true, reason: "trigger-match" }`.
- [ ] Workflows exist but none matched → `{ present: false, reason: "no-trigger" }`.
- [ ] The module MUST NOT import the GitHub client or the archive orchestrator, and
      MUST NOT add any package dependency.

**Acceptance Criteria**:
- `detectWorkflowCiPresence` returns `present: true` for a tree whose
  `.github/workflows/` contains a workflow with a `push` or `pull_request` trigger.
- Returns `present: false, reason: "no-workflows"` when `git ls-tree` yields no
  `.yml` / `.yaml` blobs under `.github/workflows/`.
- Returns `present: false, reason: "no-trigger"` when workflow files exist but none
  contains a `push` / `pull_request` trigger token (e.g. `schedule`-only).
- Returns `present: true, reason: "inspection-failed"` when `git ls-tree` or
  `git cat-file` exits non-zero.
- Detection issues only `git` subprocess calls (via injected `spawn`); no GitHub API
  and no filesystem read outside git.

## T-02: Gate the `"none"`-grace merge on structural CI presence in `merge-then-archive.ts`

- [ ] In `runMergeThenArchive`, add a cached CI-presence variable (computed once,
      reused across poll iterations) alongside `noneGraceStart` (near line 450).
- [ ] In the `rollup.state === "none"` branch, keep the existing `isBlocked`
      branch-protection escalation and the grace-still-running wait unchanged. Only at
      grace-exhausted **and not** `isBlocked`, resolve CI presence:
      if `archiveSha === undefined` → treat as CI-present (fail-closed, D5);
      otherwise call the T-01 detector with `{ spawn, cwd: recordDir, ref: archiveSha }`.
- [ ] CI-less (`present === false`) → preserve today's behavior: emit the CI-less
      "Assuming CI-less repo; proceeding to merge..." log and `break` to merge.
- [ ] CI-present (`present === true`) → do not merge; bound the continued wait by the
      overall deadline: if `effectiveTimeoutMs !== null` and `nowFn() - start >=
      effectiveTimeoutMs`, return a merge-gate escalation (see T-03); otherwise
      `sleepFn(pollIntervalMs)` and `continue` (same shape as the pending path).
- [ ] Use the injected `spawn` (not the transport-auth-wrapped spawn); detection is a
      read-only local inspection.

**Acceptance Criteria**:
- `BLOCKED_CHECK_GRACE_MS` and the `success` / `failure` / `pending` / conflict /
  BLOCKED paths are unchanged.
- The CI-less path emits the same log message and merges as before.
- The CI-present path never calls `mergePullRequest` while the rollup stays `"none"`.
- Detection runs at most once per job (cached), and only on the grace-exhausted,
  non-BLOCKED `"none"` path.

## T-03: Fail-closed timeout escalation for the CI-present `"none"` path

- [ ] When CI is present and the rollup remains `"none"` until `mergeWaitTimeoutMs`
      is exceeded, return an `exitCode: 1` escalation built with `formatEscalation`,
      distinct from the pending-timeout message. It MUST state that a
      `push` / `pull_request` workflow is present but no checks appeared within the
      timeout, that the PR was **not** merged (fail-closed), and provide the
      `specrunner job archive --with-merge <slug>` resume command.
- [ ] Emit an informative "waiting" log for the CI-present `"none"` iterations that
      distinguishes it from both the CI-less assumption and the pending wait.

**Acceptance Criteria**:
- The CI-present timeout returns `exitCode: 1` with an escalation whose text
  identifies it as a CI-expected-but-no-checks merge-gate timeout.
- No merge, no post-merge cleanup, and no `markJobArchived` occur on this path.

## T-04: Tests fixing the three acceptance behaviors and the CI-less regression

- [ ] Unit tests for `workflow-ci-detection.ts` using a keyed fake `SpawnFn`
      (dispatch on `git ls-tree` / `git cat-file`), covering: trigger-match,
      no-workflows, no-trigger (schedule-only), and inspection-failed.
- [ ] In `src/core/archive/__tests__/merge-then-archive.test.ts`, add wait-loop tests
      driving `getCheckStatus` → `"none"` with a keyed `spawn` that returns workflow
      fixtures, asserting:
      (a) push/pull_request workflow → past grace → no merge → `mergeWaitTimeoutMs`
      exceeded → escalation (`exitCode: 1`, `mergePullRequest` not called);
      in at least one such multi-poll-iteration test, assert the detection is
      computed at most once per run: the keyed `spawn` records `git ls-tree`
      invocations and the count is 1 across all poll iterations (spec.md
      Requirement 1 MUST);
      (b) no workflow definition → past grace → merge proceeds (extends/mirrors the
      existing TBG-05 regression, now explicit that detection = CI-less);
      (c) schedule-only workflow → CI-less → merge proceeds;
      (d) `archiveSha === undefined` (runArchiveOrchestrator returns
      `headSha: undefined`) → detector is not invoked (`git ls-tree` spawn count 0)
      → treated as CI-present → past grace → no merge → `mergeWaitTimeoutMs`
      exceeded → escalation (spec.md Scenario 4 case A, D5 fail-closed path).
- [ ] Ensure the existing merge-then-archive tests remain green: the default fake
      `spawn` (empty `git ls-tree` output) yields `no-workflows` → CI-less, so the
      current `"none"` → merge regression (TBG-05) still holds.

**Acceptance Criteria**:
- Each of the three request acceptance behaviors is fixed by a test.
- The schedule-only tree resolves to CI-less in a test.
- The `archiveSha === undefined` fail-closed path (Scenario 4 case A) is fixed by a
  wait-loop test.
- The at-most-once detection invariant (spec.md Requirement 1) is fixed by a spawn
  call-count assertion.
- Pre-existing merge-then-archive tests pass without behavioral changes to their
  expectations.

## T-05: Dependency and verification gate

- [ ] Confirm `package.json` `dependencies` are unchanged (no YAML parser or other
      package added).
- [ ] `bun run typecheck` and `bun run test` are green.

**Acceptance Criteria**:
- `git diff` shows no change to `package.json` `dependencies`.
- `typecheck && test` pass.
