# Design: structural CI-presence detection for `job archive --with-merge`

## Context

`job archive --with-merge` records the archive commit on the feature branch, then
waits for the PR's CI checks to resolve before squash-merging. The wait loop
(`src/core/archive/merge-then-archive.ts`) treats a check rollup of `"none"` — no
check runs have appeared on the head commit — as a signal that the repo may have no
CI. After a fixed grace window (`NONE_CHECK_GRACE_MS = 60_000`, line 52) of
continuous `"none"`, it logs *"Assuming CI-less repo; proceeding to merge..."* and
merges (lines 608–625).

This is a **time-based** inference and it is **fail-open**: when GitHub Actions is
slow to schedule (queue congestion, cold start) and the first check run appears
later than 60 s, a repo that *does* have CI is merged with CI unverified. This has
been observed in practice — a merge fired at the 60 s `"none"` grace, and a CI run
went `queued` on the base branch *after* the merge (the repo had CI; scheduling was
merely delayed).

Whether a repo has CI is a **structural** property (the presence of a workflow
definition that triggers on the PR event), not a temporal one. The archive commit
whose CI we wait on is created locally by `runArchiveOrchestrator` and pushed
(`archiveSha = archiveRecordResult.headSha`, line 290); its tree is therefore
inspectable with local git in `recordDir` (line 212). We can decide CI presence
structurally instead of guessing from elapsed time.

Fact anchors (current `src/core/archive/merge-then-archive.ts`):

- L52 `NONE_CHECK_GRACE_MS = 60_000`
- L163 `effectiveTimeoutMs = waitTimeoutMs === undefined ? DEFAULT_MERGE_WAIT_TIMEOUT_MS : waitTimeoutMs`
- L212 `recordDir = noWorktree ? cwd : (worktreePath ?? cwd)`
- L290 `archiveSha = archiveRecordResult.headSha` (type `string | undefined`)
- L608–625 `rollup.state === "none"` grace-exhausted → assume CI-less → `break` → merge

Empirically confirmed local-git behavior (in this repo):

- `git ls-tree <ref> .github/workflows/` (non-recursive) lists immediate blob
  entries as `<mode> blob <sha>\t<path>`; **exit 0 + empty stdout** when the path is
  absent; **exit 128** on a bad ref.
- `git cat-file -p <blobSha>` prints the file body.

## Goals / Non-Goals

**Goals**:

- Decide "does this repo have CI for this PR" structurally, from the archive
  commit's tree, using **only local git** (no added GitHub API calls).
- When CI is present, treat a `"none"` rollup as *checks not yet scheduled* and wait
  **fail-closed** until `mergeWaitTimeoutMs`; escalate on timeout instead of merging.
- Preserve the existing CI-less behavior exactly when the tree has no workflow that
  triggers on `push` / `pull_request`.
- Add no new package dependency; detect triggers at the text level (no YAML parser).

**Non-Goals**:

- Changing `BLOCKED_CHECK_GRACE_MS` (branch-protection lag grace) — unchanged.
- Deciding CI presence from workflow-run history via the GitHub API.
- Changing the default value of `mergeWaitTimeoutMs`.
- Precisely modeling `paths` / `paths-ignore` / branch filters to prove a workflow
  will not fire for *this* PR. A present-but-non-firing workflow is intentionally
  classified CI-present → checks stay `"none"` → timeout escalation (safe side).

## Decisions

### D1 — Detect CI presence structurally from the archive commit's tree, not from elapsed time

The `"none"` grace no longer *concludes* CI-less on its own. When the grace is
exhausted (and the PR is not `BLOCKED`), the orchestrator asks a structural detector
whether the archive commit's tree contains a workflow that triggers on `push` or
`pull_request`. The grace window is retained only as the trigger point for that
decision (and, for CI-less repos, as the same "wait a bit then merge" behavior as
today).

- **Rationale**: CI presence is a property of the repo's `.github/workflows/`
  contents, which is deterministic and immediately observable from the local tree —
  unlike check-run scheduling latency, which is variable and unbounded.
- **Alternatives considered**:
  - *Query workflow-run history via the GitHub API* — rejected: requires extending
    the `GitHubClient` port and adds API calls (violates "no added API calls"), and
    misreads a repo that just added its first workflow (zero run history yet).
  - *Raise the time grace* — rejected: any fixed threshold is still a guess and stays
    fail-open past the threshold.

### D2 — Text-level trigger detection, no YAML parser, biased fail-closed

A workflow file is classified "CI trigger present" if its text contains a `push` or
`pull_request` trigger token. Detection reads the workflow bodies and applies a
token match; it does not parse YAML.

- **Rationale**: The minimal-dependency principle forbids adding a YAML parser for
  this. A text scan is sufficient because the failure mode is asymmetric: a **false
  positive** (treating a non-triggering workflow as CI-present) merely makes the
  orchestrator wait → the overall timeout escalates to an operator (safe); a **false
  negative** (missing a real trigger) would fail-open (unsafe). The matcher is
  therefore tuned to over-detect: it matches `push` and `pull_request` as YAML
  tokens (delimited by whitespace / `[` / `{` / `,` / quotes / `:`), and treats
  `pull_request` as a prefix so `pull_request_target` / `pull_request_review` also
  count. Recommended pattern (implementer may refine while preserving the fail-closed
  bias and the three acceptance cases in D4):

  `/(?:^|[\s,[{'"])push(?:[\s,:\]}'"]|$)|(?:^|[\s,[{'"])pull_request/m`

- **Alternatives considered**:
  - *Parse YAML and read the `on:` mapping exactly* — rejected: adds a dependency,
    against the North-Star of install-and-go minimal deps. The precision gap versus
    a text scan is absorbed by the fail-closed bias.

### D3 — Isolate detection in a new pure module with injected `spawn`

Add `src/core/archive/workflow-ci-detection.ts` exporting a single detection
function that takes an injectable `SpawnFn`, a `cwd` (the `recordDir`), and a git
tree-ish `ref`, and returns a small result object. `merge-then-archive.ts` calls it;
the module imports no GitHub client and no orchestrator.

- **Rationale**: Matches the existing Ports & Adapters / injected-`spawn` style used
  across `src/core/archive/` (e.g. `post-merge-integrity.ts`, `orchestrator.ts`) and
  makes the detector unit-testable in isolation with a keyed fake `spawn`, decoupled
  from the wait-loop's GitHub mocks.
- **Alternatives considered**:
  - *Inline the git calls in the `"none"` branch of `runMergeThenArchive`* —
    rejected: bloats an already large function and couples trigger-parsing tests to
    the whole merge orchestration.

Detection contract (`ref`, `cwd = recordDir`):

1. `spawn("git", ["ls-tree", ref, "--", ".github/workflows/"], { cwd })`.
   - exit ≠ 0 → `{ present: true, reason: "inspection-failed" }` (fail-closed).
   - exit 0, empty stdout → `{ present: false, reason: "no-workflows" }`.
2. Parse `<mode> blob <sha>\t<path>` lines; keep `blob` entries whose path ends in
   `.yml` / `.yaml` (GitHub only reads files directly under `.github/workflows/`, so
   non-recursive listing matches its semantics; `tree` entries are skipped).
   - No such blobs → `{ present: false, reason: "no-workflows" }`.
3. For each candidate blob, `spawn("git", ["cat-file", "-p", sha], { cwd })`.
   - Any read failure (exit ≠ 0) → `{ present: true, reason: "inspection-failed" }`.
   - First body matching the trigger pattern → `{ present: true, reason: "trigger-match" }`.
4. Workflows exist but none matched → `{ present: false, reason: "no-trigger" }`.

### D4 — Wire detection into the `"none"` branch as a fail-closed gate

In the `rollup.state === "none"` branch, when the grace is exhausted and the PR is
not `BLOCKED` (the existing `isBlocked` branch-protection escalation is unchanged),
consult detection (computed once and cached across poll iterations):

- **CI-less** (`present === false`) → keep today's behavior: log the existing
  CI-less message and `break` to merge.
- **CI-present** (`present === true`) → do **not** merge. Bound the continued wait by
  the overall deadline: if `effectiveTimeoutMs !== null` and `now - start >=
  effectiveTimeoutMs`, return a merge-gate escalation (fail-closed timeout);
  otherwise `sleep(pollIntervalMs)` and `continue`, exactly like the pending path.

Three acceptance-defining behaviors this produces:

1. tree with a `push` / `pull_request` workflow → `"none"` past grace → keeps waiting
   → `mergeWaitTimeoutMs` exceeded → **escalation, no merge**.
2. tree with no workflow definition → `"none"` past grace → **merge** (unchanged).
3. tree with only non-`push`/`pull_request` workflows (e.g. `schedule`) → CI-less →
   **merge**.

- **Rationale**: The grace window is preserved as the "give checks a moment to show
  up" delay; the structural decision only replaces the *conclusion* drawn when checks
  still have not shown up. Reusing the deadline/sleep pattern keeps the CI-present
  wait indistinguishable from a genuine pending wait, so `null` (unlimited) and
  finite timeouts behave consistently.

### D5 — `undefined` archiveSha and inspection failure resolve fail-closed

`archiveSha` is `string | undefined` (only `undefined` if `git rev-parse HEAD` failed
during recording — an abnormal record). When `archiveSha` is `undefined`, skip the
git inspection and treat the repo as CI-present (fail-closed). When inspection is
attempted but a git call fails, the detector returns `present: true` (D3).

- **Rationale**: The request states false detections must fall to the waiting side.
  If the head commit cannot be identified or its tree cannot be read, the safe
  conclusion is "assume CI" → wait → timeout → operator, never a silent CI-less
  merge.
- **Alternative considered**: fall back to inspecting `HEAD` in `recordDir` when
  `archiveSha` is `undefined`. Equivalent in the normal case (HEAD *is* the archive
  commit) but adds a branch for a pathological state; rejected in favor of the
  simpler explicit fail-closed rule.

## Risks / Trade-offs

- [Present-but-non-firing workflow (e.g. `paths-ignore` excludes this PR)] →
  classified CI-present, so checks stay `"none"` and the run escalates on timeout
  rather than merging. **Mitigation**: this is the intended safe side and is declared
  out of scope; the operator resolves it manually. Documented so it is not mistaken
  for a regression.
- [`mergeWaitTimeoutMs` set to `null` (unlimited) + CI-present + checks never appear]
  → waits indefinitely. **Mitigation**: this is the explicit meaning of `null`
  (wait forever); the bounded default applies whenever the timeout is left at its
  default. The previous permanent-hang guard of `NONE_CHECK_GRACE_MS` still applies
  to CI-less repos.
- [Text matcher over-detects a token like a job named `push-image`] → fail-closed
  (waits). **Mitigation**: acceptable by design; only affects timing, never
  correctness of the merge gate.
- [Extra local git subprocesses per archive] → two `git` calls (`ls-tree` +
  `cat-file`) only on the CI-less-looking path (grace exhausted with `"none"`), and
  the result is cached across poll iterations. **Mitigation**: detection is lazy and
  runs at most once per job; negligible cost, no network.

## Open Questions

None.
