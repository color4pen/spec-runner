# Conformance Result — optional-github-integration (Iteration 2)

**Verdict**: derived by CLI from typed findings below  
**Checked by**: conformance step (iteration 2)  
**Date**: 2026-09-06

---

## Normative sources reviewed

| Source | Normative weight |
|---|---|
| `request.md` — Acceptance Criteria (13 items) | Primary |
| `spec.md` — Requirements (10) + Scenarios (35) | Primary |
| `design.md` — Decisions D1–D12 | Plan context |
| `tasks.md` — T-01–T-16 checkbox state | Plan context (all ☑) |

---

## Implementation scope

`git diff main...HEAD --stat`: 123 files changed, 8649 insertions(+), 362 deletions(−).  
Key new files: `src/config/github-integration.ts`, `src/state/github-integration.ts`, `src/core/github/integration.ts`, `src/cli/github-composition.ts`, `src/core/pipeline/apply-github-integration.ts`, `src/core/attestation/render-markdown.ts`, `src/core/doctor/checks/repo/git-origin.ts`, and `tests/github-disabled-e2e.test.ts` (506 lines).

---

## Verified items (normative)

### Req 1 — GitHub連携の宣言と既定値

- ✅ `resolveGitHubIntegrationConfig` returns `{ enabled: true }` when `config.github?.enabled` is absent (`src/config/github-integration.ts:33`).
- ✅ `traceGitHubIntegration` returns `source: "project-local"` / `"user-global"` / `"default"` based on which config layer set the value (`src/config/github-integration.ts:42–90`).
- ✅ Config zod schema in `src/config/schema/validation.ts:348` validates `github.enabled` as `optional(boolean(...))` — a string value like `"no"` is rejected via `CONFIG_INVALID`.

### Req 2 — 連携状態を job に固定する

- ✅ `src/state/schema/types.ts` adds `githubIntegration?: { enabled: boolean }` to `JobState` (line 647).
- ✅ `getGitHubIntegration` in `src/state/github-integration.ts:18` returns `state.githubIntegration ?? { enabled: true }` — legacy state (no field) is treated as enabled.
- ✅ `validateJobState` in `src/state/schema/operations.ts:375–422` enforces: absent field → `owner/name` required (legacy = enabled); `enabled === false` → `owner/name` must be absent + `origin` required; `enabled === true` → `owner/name` required.
- ✅ The resolved value is stored to job state at start via `buildInitialJobState` in `src/store/job-state-store.ts`; resume/reopen/archive all read from state, not re-resolving config.

### Req 3 — GitHub 無効 job は GitHub credential と GitHub API に一切触れない

- ✅ `resolveJobGitHubIntegration` in `src/core/github/integration.ts:66–76` skips `resolveToken` entirely when `enabled === false`; only calls `getOriginUrl` + `normalizeOriginIdentity`.
- ✅ `composeGitHubIntegration` in `src/cli/github-composition.ts:62–71` returns `{ githubClient: null, githubToken: undefined }` when disabled; `createGitHubClient` is only called in the `enabled === true` branch.
- ✅ `createTransportAuth({ token: undefined })` → `buildTransportAuthArgs` returns `[]` → no `extraheader` injection (`src/git/transport-auth.ts` unchanged behavior).
- ✅ `src/cli/archive.ts:277–299`: for disabled jobs, the `composeGitHubIntegration` call for token is skipped entirely.
- ✅ The e2e test (`tests/github-disabled-e2e.test.ts:320–353`) spies on `globalThis.fetch` with a throw-on-call mock and asserts zero calls throughout the lifecycle; sets fake `GH_TOKEN` and `GITHUB_TOKEN` env vars that must never be used.
- ✅ B-19 grep test in `tests/unit/architecture/core-invariants.test.ts:1296–1368` enforces that `resolveGitHubToken`/`createGitHubClient` are only called from the two composition seams + allowlist.

### Req 4 — repository identity は汎用 origin と GitHub identity を分離する

- ✅ `RepositoryInfo` in `src/state/schema/types.ts:113–132`: `owner?`, `name?` (GitHub API identity, required only when enabled); `origin?: RepositoryOrigin` (forge-neutral, required when disabled).
- ✅ `normalizeOriginIdentity` in `src/git/remote.ts:66–112` strips userinfo, scheme, port, trailing `.git` → canonical `host/path`; SHA-256 digest is stable.
- ✅ `requireGitHubRepository` in `src/state/github-integration.ts:31–51` throws `GITHUB_INTEGRATION_DISABLED` when disabled, `GITHUB_INTEGRATION_REQUIRED` when owner/name absent despite enabled.
- ✅ Unit test `tests/unit/git/normalize-origin-identity.test.ts` (101 lines) verifies that HTTPS/SSH/credential-bearing URLs normalize to the same digest.

### Req 5 — GitHub 無効時の standard / fast は feature branch 出力で完了する

- ✅ `applyGitHubIntegration` in `src/core/pipeline/apply-github-integration.ts`: when `enabled === true`, returns `descriptor` unchanged (reference identity); when `enabled === false`, removes `pr-create` from steps/roles and rewrites transitions to `"end"`.
- ✅ Applied in `src/core/pipeline/run.ts` after `applyScopeConfig` and before `composeReviewerDescriptor`; input is `getGitHubIntegration(jobState)` (not config, preventing implicit migration).
- ✅ `buildAllowedStepSet` in `src/core/resume/resolve-step.ts:39–44` removes `pr-create` from allowed steps when integration is disabled.
- ✅ `resume --from pr-create` is rejected with exit 2 before pipeline starts (confirmed by unit test `tests/unit/pipeline/resume-from-pr-create-disabled.test.ts`).
- ✅ `design-only` descriptor is unaffected (it has no `pr-create` step; `applyGitHubIntegration` is a no-op).
- ✅ Unit test `tests/unit/pipeline/apply-github-integration.test.ts` (158 lines) verifies reference identity for enabled, and correct removal for disabled standard/fast/design-only.

### Req 6 — PR が無くても完了成果と証跡の所在が得られる

- ✅ `LocalRuntime.commitFinalState` in `src/core/runtime/local.ts:888–914` writes `attestation.md` to the change folder when `state.status === "awaiting-archive" && state.githubIntegration?.enabled === false`. Best-effort (failure only warns).
- ✅ `attestationPath(slug)` is in `pipelineManagedPaths(slug)` in `src/core/pipeline/round-git-scope.ts:106` — included in the finalize commit's staged paths.
- ✅ `handleResult` in `src/core/command/runner.ts:467–493` shows `Branch published: <branch>`, final OID, and attestation path (if file exists) instead of PR URL.
- ✅ `buildRunResult` in `src/core/command/run-result.ts:66–96` returns `result: "branch-published"` with `branch`, `revision`, `githubIntegration: { enabled: false }`, and `prUrl: null` for disabled jobs.
- ✅ GitHub-enabled jobs continue to emit `result: "pr-created"` (unchanged).

### Req 7 — GitHub 無効 job の reopen は PR gate を要求しない

- ✅ `ReopenCommand.execute()` in `src/core/command/reopen.ts:136–185`: PR gate (`state.pullRequest?.number` check + GitHub API call) is wrapped in `if (getGitHubIntegration(state).enabled)` — disabled jobs skip it entirely.
- ✅ Status gate (`awaiting-archive` only), `--reason` mandatory, `allowReopen: true` opt-in, operator event append, and transition ordering are all unchanged.
- ✅ `requireGitHubRepository` is used for PR lookup in the enabled branch (line 154).
- ✅ Unit test `tests/unit/cli/reopen-github-disabled.test.ts` verifies: `runReopenCore` does not call `loadConfigWithOverlay` or `composeGitHubIntegrationForJob`, passes `githubClient: null` to `ReopenCommand`.
- ✅ Enabled job with CLOSED PR continues to be rejected (unit test coverage).

### Req 8 — GitHub 無効 job の archive は Git だけで 1 回で完了する

- ✅ `src/cli/archive.ts:152–160`: `--with-merge` or `--merge-wait-ms` for a disabled job is rejected with exit 2 and a specific error before any state changes.
- ✅ Plain archive path (`jobGithubEnabled === false`): skips `composeGitHubIntegration` entirely; passes `githubToken: undefined` to `runPlainArchive`.
- ✅ `runPlainArchive` in `src/core/archive/plain-archive.ts` already has no GitHub API calls (unchanged); record → archived → cleanup in single invocation.
- ✅ `deleteRemoteBranch: false` is not changed — remote feature branch preserved.
- ✅ Push failure still prevents `archived` and cleanup (existing invariant unchanged).
- ✅ E2e test (`tests/github-disabled-e2e.test.ts:494–502`) verifies: archive exits 0, remote feature branch still exists after archive, and `fetch` spy shows 0 calls.

### Req 9 — 別 checkout からの attach は保存済み契約を復元し不一致を拒否する

- ✅ `verifyCheckpoint` in `src/core/attach/verify-checkpoint.ts:200–244`:
  - GitHub-enabled (or legacy) checkpoints: require `expectedRepo.github.owner/name` match; fail-closed if absent.
  - GitHub-disabled checkpoints: require `state.repository.origin.digest === expectedRepo.origin.digest`; fail-closed if either absent.
- ✅ `src/cli/attach.ts` computes `expectedRepo` from both GitHub identity (when invoker is enabled) and origin identity (always); checkpoint's own contract governs which check runs.
- ✅ E2e test (Machine B): `runAttachVerification` with matching `origin` digest succeeds; restored contract is `githubIntegration.enabled === false`.
- ✅ E2e test (Machine C): wrong `origin` digest → `checkpointNotAttachableError` thrown with `/identity/i` message.
- ✅ Invoker config disabled but checkpoint enabled → GitHub identity required; fail-closed if invoker has no GitHub context (verified by unit test `tests/attach/verify-checkpoint.test.ts`).

### Req 10 — GitHub 専用の操作は副作用の前に拒否される

- ✅ `CommandSpec.requiresGitHub` and `FlagDef.githubOnly` added to `src/cli/command-registry.ts` (lines 82–88, 225–240).
- ✅ Declared: `job start --issue`, `--from-issue` (start/resume/archive), `inbox run` (`requiresGitHub: true`), `archive --with-merge`, `archive --merge-wait-ms`.
- ✅ Dispatch gate in `bin/specrunner.ts:120–150`: when `repoRoot !== null` and command/flag requires GitHub, loads config, checks `resolveGitHubIntegrationConfig`, rejects with exit 2 before handler runs.
- ✅ `managed` × `github.enabled: false`: rejected in `createRuntime` (line 70–76 of `src/core/runtime/factory.ts`) before `PipelineRunCommand.execute()` → `prepare()` → `bootstrapJob`. The `createRuntime` call is in `src/cli/run.ts:90`, before `PipelineRunCommand` is even instantiated.
- ✅ GitHub-independent commands (`job ls`, `job show`, `job cancel`, `doctor`, etc.) unaffected.

### Req 11 — Git の実行保証は GitHub 連携の有無に関わらず維持される

- ✅ Worktree creation, step commit/push, commit OID ledger (`synthesizedCommits`), egress check are all in `LocalRuntime` which is unchanged for these paths.
- ✅ `createTransportAuth({ token: undefined })` → no extraheader injection (same behavior as before).
- ✅ E2e test verifies: worktree created, bootstrap + checkpoint + finalize commits pushed, `synthesizedCommits` ledger populated, fetch spy shows no extraheader calls (local file:// remote doesn't need auth headers).

### Req 12 — 表示と診断が実装の連携状態と一致する

- ✅ `config effective`: `traceGitHubIntegration` included in output (`src/cli/config-effective.ts:70, 83`).
- ✅ `job show`: `getGitHubIntegration(state)` shown with source annotation for legacy state (`src/cli/job-show.ts:127–131`).
- ✅ `doctor`: `selectChecks(runtime, githubEnabled)` in `src/core/doctor/checks/index.ts:148–158` returns `baseChecks` (no GitHub token/client/origin checks) when disabled; `gitOriginCheck` replaces `githubOriginCheck`.
- ✅ Architecture: B-19 added to `architecture/model.md:98`, `architecture/conformance.md:53`, `architecture/components.md:190–192`. `architecture/domain-model.md` and `architecture/dynamic-model.md` updated.
- ✅ `architecture/divergence-status.md` updated (line 9).
- ✅ `docs/configuration.md` has `github.enabled` documentation.
- ✅ README has "Optional GitHub Integration" section (lines 170–209) with config example, support table, and "GitHub non-dependency ≠ Git non-dependency" callout.

---

## Findings

### Finding 1 (Medium) — E2e fixture does not exercise `job reopen` via real CLI path

**Spec reference**: request.md AC2: "上記fixtureは `job start` / `job resume` / `job reopen` / `job archive` の実CLI経路と既存CommandRunnerを通して成立させる。別のorchestratorやprobeを新設して成立させることは不可"; AC6: "GitHub無効jobをreopenしてから別操作のresumeで追加修正できる"

**Observed**: `tests/github-disabled-e2e.test.ts` exercises `runRunCore` → `runResumeCore` → `runArchive` on a bare non-GitHub origin fixture. The `job reopen` step is entirely absent from this fixture. The acceptance criterion explicitly lists `job reopen` as one of the four CLI operations that the e2e fixture must demonstrate through real CLI paths. The only reopen test on the GitHub-disabled path is `tests/unit/cli/reopen-github-disabled.test.ts`, which mocks `ReopenCommand` entirely — it does not exercise `ReopenCommand.execute()` against a real git repository with real state transitions.

**Failure scenario**: The e2e fixture does not demonstrate that `job reopen <slug>` transitions `awaiting-archive → awaiting-resume` without a PR gate on a non-GitHub origin fixture; and that a subsequent `job resume` can continue from the reopened state. AC6 ("GitHub無効jobをreopenしてから別操作のresumeで追加修正できる") remains unverified through a real git fixture.

**Note**: `ReopenCommand.execute()` itself is implemented correctly and tested in other unit tests. The gap is the missing integration in the e2e fixture required by AC2/AC6.

---

### Finding 2 (Low) — README.md command reference describes archive as requiring a re-run after PR merge

**Spec reference**: request.md AC12: "config effective / job show / doctor / README / guide / architectureが実装と一致する"; spec.md Req 8 (archive completes in a single invocation without querying GitHub).

**Observed**: `README.md` line 243:
```
specrunner job archive <slug>              Push archive record; re-run after PR merge to complete teardown
```
This description says "re-run after PR merge to complete teardown", which was the old two-phase archive description. The implementation is single-phase: one call to `runPlainArchive` performs record push → archived → cleanup. The `ARCHIVE_USAGE` text in `src/cli/archive.ts:354–361` was correctly updated to reflect the single-phase model. The README command reference table was not updated.

**Failure scenario**: A user reading the README command reference is told that archiving requires a second run after PR merge, which is incorrect. This misrepresents the single-phase archive implementation for both GitHub-enabled and GitHub-disabled paths.

---

## Plan divergences (non-findings)

- **T-16 design intent vs. e2e scope**: The tasks.md checkbox for T-16 is checked, and the test does exercise `runRunCore` / `runResumeCore` / `runArchive` / attach verification. The missing reopen step is a normative gap (AC2/AC6), not merely a plan divergence — hence reported as Finding 1 rather than a plan note.
- **B-19 legacy callers**: `tests/unit/architecture/core-invariants.test.ts:1337–1348` acknowledges a `LEGACY_CLI_FILES` burn-down list for pre-B-19 callers in GitHub-only commands. These are GitHub-only commands guarded by T-11 and are not reachable for GitHub-disabled jobs. Consistent with design intent.
- **attestation.md in both enabled and disabled jobs**: Design left this as an Open Question (design.md §Open Questions). Current implementation writes attestation only for disabled jobs. No spec normative requirement violated.

---

## Evidence

| Category | Count |
|---|---|
| Normative items checked | 47 |
| Normative items skipped | 0 |
| Items unverified (insufficient implementation access) | 0 |
