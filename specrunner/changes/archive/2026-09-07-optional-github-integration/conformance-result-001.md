# Conformance Review — optional-github-integration (Iteration 1)

## Verdict

(Derived by CLI from typed findings below — not stated here.)

---

## Scope

- **Branch**: `feat/optional-github-integration-c0a99891`
- **Baseline**: `git diff main...HEAD` — 122 files changed, 8428 insertions(+), 362 deletions(−)
- **Normative sources**: `request.md` (Acceptance Criteria), `spec.md` (Requirements + Scenarios)
- **Plan sources**: `design.md` (D1–D12), `tasks.md` (T-01–T-16)

---

## Evidence Summary

| Category | Items checked | Skipped | Unverified |
|---|---|---|---|
| Spec Requirements (12) | 12 | 0 | 0 |
| Spec Scenarios (36) | 36 | 0 | 0 |
| Acceptance Criteria (13) | 13 | 0 | 0 |
| **Total** | **61** | **0** | **0** |

---

## Requirement-by-Requirement Verification

### Req: GitHub 連携の宣言と既定値 ✅

**Files examined**: `src/config/github-integration.ts`, `src/config/schema/validation.ts`

- `resolveGitHubIntegrationConfig(config)` returns `{ enabled: config.github?.enabled ?? true }` — absent → true (backward-compatible default). ✅
- `traceGitHubIntegration(loadResult)` checks project-local first, then user-global, then returns `{ enabled: true, source: "default" }`. Correct priority. ✅
- Config validation adds `enabled` as boolean to `github` section — type mismatch (`"no"`) produces `CONFIG_INVALID`. ✅
- Scenarios: "未指定は有効", "project local で無効を宣言する", "不正な型は config error" — all satisfied. ✅

### Req: 連携状態を job に固定する ✅

**Files examined**: `src/state/github-integration.ts`, `src/core/command/pipeline-run.ts`, `src/cli/bootstrap.ts`, `src/state/schema/operations.ts`

- `getGitHubIntegration(state)` returns `state.githubIntegration ?? { enabled: true }` — absent field treated as enabled. ✅
- `PipelineRunCommand.prepare()` records `githubIntegration: { enabled: githubEnabled }` at job start in `bootstrapJob`. ✅
- `bootstrap.ts` accepts `githubEnabledOverride` parameter; resume/reopen/attach/archive paths pass stored value instead of re-resolving config. ✅
- `validateJobState` (legacy absent field): enforces owner/name as if enabled=true — legacy state cannot be silently treated as disabled. ✅
- Scenarios: all three scenarios (start固定, 後からconfig変更, legacy state) satisfied. ✅

### Req: GitHub 無効 job は GitHub credential と GitHub API に一切触れない ✅

**Files examined**: `src/core/github/integration.ts`, `src/cli/github-composition.ts`, `src/core/preflight.ts`, `tests/github-disabled-e2e.test.ts`

- `resolveJobGitHubIntegration` disabled path: calls only `getOriginUrl` and `normalizeOriginIdentity`, not `resolveToken`. ✅
- `composeGitHubIntegration` disabled path returns `null` client and `undefined` token without calling `createGitHubClient`. ✅
- Architecture invariant B-19 enforced in `tests/unit/architecture/core-invariants.test.ts` (grep-based regression guard). ✅
- E2E test sets `GH_TOKEN` / `GITHUB_TOKEN` to fake values and mocks `globalThis.fetch` to throw on any call — verifies 0 GitHub API requests. ✅
- `createTransportAuth` with `undefined` token results in `[]` extraheader args — SSH/credential-helper fallback only. ✅

### Req: repository identity は汎用 origin と GitHub identity を分離する ✅

**Files examined**: `src/state/schema/types.ts`, `src/state/schema/operations.ts`, `src/git/remote.ts`

- `RepositoryInfo` now has `owner?: string`, `name?: string`, `origin?: RepositoryOrigin`. ✅
- `validateJobState` semantic rules:
  - `enabled === false` → `owner`/`name` must be absent, `origin` must be present. ✅
  - `enabled === true` or absent (legacy) → `owner`/`name` must be non-empty strings. ✅
- `normalizeOriginIdentity` strips userinfo from URL, strips scheme/port/trailing-`.git`, lowercases host → `host/path` canonical form + SHA-256 digest. ✅
- Scenarios: "無効 job は GitHub identity を持たない", "credential を state に残さない", "有効 job の identity 必須性は維持される" — all satisfied. ✅

### Req: GitHub 無効時の standard / fast は feature branch 出力で完了する ✅

**Files examined**: `src/core/pipeline/apply-github-integration.ts`, `src/core/pipeline/run.ts`, `src/core/resume/resolve-step.ts`, `src/core/command/pipeline-run.ts`

- `applyGitHubIntegration(descriptor, contract)`: enabled → returns `descriptor` unchanged (same reference). disabled → removes `pr-create` from steps/transitions/roles, rewrites `to: "pr-create"` → `to: "end"`. ✅
- Applied in `buildPipelineForJob` and `runPipeline` in correct sequence (`applyScopeConfig` → `applyGitHubIntegration` → `composeReviewerDescriptor`). ✅
- `buildAllowedStepSet` excludes `pr-create` from allowed set when `githubIntegration.enabled === false`. ✅
- `resume --from pr-create` on disabled job: `resolveResumeStep` throws, caught as `PrepareError(exit=2)` — rejected before pipeline start, state unchanged. ✅
- design-only profile: never contained `pr-create` — transformation is identity (no change). ✅
- GitHub-enabled job: `applyGitHubIntegration` returns base descriptor by reference — terminal remains `pr-create`. ✅
- Note: in `PipelineRunCommand.prepare()`, `applyGitHubIntegration` is applied AFTER `composeReviewerDescriptor` (reverse of `run.ts`). This is a minor deviation from D6's stated order, but functionally equivalent because custom reviewers insert before `pr-create` and the removal still works. No normative violation.

### Req: PR が無くても完了成果と証跡の所在が得られる ✅

**Files examined**: `src/core/runtime/local.ts`, `src/core/command/runner.ts`, `src/core/command/run-result.ts`, `src/core/attestation/render-markdown.ts`

- `LocalRuntime.commitFinalState`: when `status === "awaiting-archive"` and `githubIntegration.enabled === false`, writes `attestation.md` via `buildAttestation` + `renderAttestationMarkdown` before staging/commit/push. Write failure is best-effort (warn only, does not block finalize). ✅
- `attestationPath(slug)` added to `pipelineManagedPaths` in `src/util/paths.ts`. ✅
- `handleResult` for disabled `awaiting-archive`: logs `Branch published`, final OID, attestation path (when file exists) — no PR URL or "PR created" message. ✅
- `buildRunResult` for disabled `awaiting-archive`: returns `result: "branch-published"`, `prUrl: null`, additive `branch`/`revision`/`githubIntegration` fields. GitHub-enabled job output unchanged. ✅

### Req: GitHub 無効 job の reopen は PR gate を要求しない ✅

**Files examined**: `src/core/command/reopen.ts`, `src/cli/reopen.ts`, `tests/unit/cli/reopen-github-disabled.test.ts`

- `ReopenCommand.execute()`: `getGitHubIntegration(state).enabled === true` branch runs PR gate (PR recorded + OPEN check). Disabled jobs skip to operator event + transition. ✅
- Status gate (`awaiting-archive` only), `--reason` mandatory, `{ allowReopen: true }` opt-in, journal event before transition: all maintained. ✅
- `src/cli/reopen.ts`: reads job state first; if disabled, skips config load and `composeGitHubIntegrationForJob` — passes `githubClient: null` to `ReopenCommand`. ✅
- GitHub-enabled job with CLOSED PR: rejected with error (existing behavior maintained). ✅

### Req: GitHub 無効 job の archive は Git だけで 1 回で完了する ✅

**Files examined**: `src/cli/archive.ts`, `src/core/archive/plain-archive.ts`

- `runPlainArchive` was already GitHub API independent — record push → archived → cleanup in one invocation. ✅
- `archive.ts`: reads job state to determine `jobGithubEnabled`. Disabled → skips token resolution entirely. ✅
- `--with-merge` / `--merge-wait-ms` rejected for disabled jobs before any state changes (exit 2). ✅
- Push failure: `archived` not set, cleanup not run — existing safety condition unchanged. ✅
- `deleteRemoteBranch: false` preserved — remote branch not deleted. ✅
- Completion guidance for disabled jobs: notes remote branch preserved, manual integration, `archived ≠ merge済み`. ✅

### Req: 別 checkout からの attach は保存済み契約を復元し不一致を拒否する ✅

**Files examined**: `src/core/attach/verify-checkpoint.ts`, `src/core/attach/orchestrator.ts`

- `verifyCheckpoint` now takes `expectedRepo: { github?: {owner,name}; origin?: RepositoryOrigin }`. ✅
- Identity verification dispatches on checkpoint's `githubIntegration.enabled`:
  - GitHub-enabled (or legacy absent): requires `expectedRepo.github` present and `owner/name` match — fail-closed if absent. ✅
  - GitHub-disabled: requires `stateOrigin.digest === expectedRepo.origin.digest` — fail-closed if either absent. ✅
- Invoker config having `enabled: false` cannot bypass GitHub identity check for a GitHub-enabled checkpoint. ✅
- On mismatch: throws `checkpointNotAttachableError` — no local state (worktree/sidecar/job state) created. ✅

### Req: GitHub 専用の操作は副作用の前に拒否される ✅

**Files examined**: `bin/specrunner.ts`, `src/cli/command-registry.ts`, `src/core/runtime/factory.ts`

- `CommandSpec.requiresGitHub` and `FlagDef.githubOnly` added to registry. ✅
- Declarations: `start --issue`, `--from-issue` on start/resume/archive, `inbox run`, `archive --with-merge`, `archive --merge-wait-ms`. ✅
- Dispatch gate in `bin/specrunner.ts` (T-11): loads config, checks `resolveEffectiveRequiresGitHub` and `findActiveGitHubOnlyFlags` — exits 2 before handler if disabled. ✅
- managed × GitHub disabled: `createRuntime` throws `GITHUB_INTEGRATION_UNSUPPORTED_RUNTIME` — before job state/worktree creation (B-8 preserved). ✅
- Non-GitHub commands (`job ls`, `show`, `wait`, `stats`, `usage`, etc.): unaffected. ✅

### Req: Git の実行保証は GitHub 連携の有無に関わらず維持される ✅

- `applyGitHubIntegration` only removes `pr-create` and its transitions — git transport, commit/push, worktree, egress check, synthesizedCommits ledger are all unchanged. ✅
- E2E test verifies step commits are made to feature branch, archive preserves remote branch. ✅

### Req: 表示と診断が実装の連携状態と一致する ✅

**Files examined**: `src/cli/config-effective.ts`, `src/cli/job-show.ts`, `src/core/command/pipeline-run.ts`, `src/cli/doctor.ts`, `src/core/doctor/checks/index.ts`

- `config effective`: `traceGitHubIntegration` provides `{enabled, source}` — shown in both human and JSON output. ✅
- `job show`: displays `GitHub: enabled/disabled` with legacy annotation when field absent. ✅
- Start log: `PipelineRunCommand.prepare()` logs `GitHub integration: enabled/disabled` at job creation. ✅
- `doctor`: `selectChecks(runtime, githubEnabled)` returns `baseChecks` (no token/API/github-origin checks) when disabled; adds `gitOriginCheck` for generic origin presence. Disabled notice prepended to output. ✅
- README / docs / guide updated with configuration examples, command table, and "GitHub非依存 ≠ Git非依存" distinction. ✅

---

## Acceptance Criteria Assessment

| AC | Status | Notes |
|---|---|---|
| AC-1: non-GitHub fixture start→halt/resume→complete→archive | ✅ | E2E test covers; bare origin fixture with github.enabled:false |
| AC-2: use real CLI paths + existing CommandRunner, no new orchestrator | ❌ FAIL | See Finding F-1 below |
| AC-3: zero GitHub API calls even when credentials in environment | ✅ | E2E fetch spy asserts 0 calls; GH_TOKEN set to fake value |
| AC-4: worktree/step-commit/OID-binding/staging safety maintained | ✅ | applyGitHubIntegration touches only pr-create |
| AC-5: PR-less archive possible; branch/revision/attestation location shown | ✅ | handleResult + attestation.md + branch-published result |
| AC-6: reopen → resume additional modification | ⚠️ PARTIAL | Reopen separately tested (unit); resume after reopen not in full CLI e2e |
| AC-7: attach --branch restores contract; mismatched checkpoint rejected | ✅ | verifyCheckpoint + E2E TC-T16-005/006 |
| AC-8: archive completes in one call; push failure safe; no auto-merge | ✅ | plain-archive unchanged; E2E TC-T16-004 |
| AC-9: GitHub-only options rejected before side effects | ✅ | Dispatch gate + managed gate |
| AC-10: config change does not migrate existing jobs; legacy → enabled | ✅ | getGitHubIntegration + validateJobState |
| AC-11: GitHub-enabled job behavior and safety checks unchanged | ✅ | applyGitHubIntegration identity on enabled; PR gate preserved |
| AC-12: config effective/job show/doctor/README/guide/architecture match | ✅ | All verified above |
| AC-13: internal verification maintained; evidence available | ✅ | Pipeline steps unchanged; attestation on branch |

---

## Findings

### F-1 (High) — AC-2 violated: E2E fixture bypasses CLI entry points

**Normative source**: request.md Acceptance Criteria §2

> 上記fixtureは `job start` / `job resume` / `job reopen` / `job archive` の実CLI経路と既存CommandRunnerを通して成立させる。別のorchestratorやprobeを新設して成立させることは不可

**Observation**: `tests/github-disabled-e2e.test.ts` drives the pipeline via:
- `buildPipelineForJob()` + `pipeline.run()` directly (bypasses `runRunCore` / `PipelineRunCommand.execute()`)
- `runPlainArchive()` (core function, bypasses `runArchive()` CLI entry)
- `runAttachVerification()` (core function, not the CLI attach handler)

The reopen path is tested only via `tests/unit/cli/reopen-github-disabled.test.ts`, which mocks `ReopenCommand` and therefore does not exercise `ReopenCommand.execute()`.

The requirement explicitly requires the test to go through `runRunCore` / `runResumeCore` / `ReopenCommand.execute()` / `runArchive` — the actual CLI-level functions that carry token resolution, config loading, and dispatch-level GitHub gate logic. By using lower-level primitives, the E2E does not verify that:
1. `runRunCore` correctly skips GitHub token resolution when disabled (AC-3 is verified separately, but not through the CLI path)
2. `runResumeCore` correctly reads `githubIntegration` from stored state and passes `githubEnabledOverride`
3. The `--from pr-create` rejection occurs through the real `ResumeCommand.prepare()` path with actual state loading
4. The full `reopen → resume` lifecycle (AC-6) passes through real CLI handlers

**Failure scenario**: A regression in `runRunCore` or `runResumeCore` that re-enables token resolution for disabled jobs would not be caught by the current E2E fixture, even though it would violate AC-3 and the core requirements.

---

## Plan Divergences (informational, not findings)

- **D6 order in `pipeline-run.ts`**: `applyGitHubIntegration` is applied after `composeReviewerDescriptor` in `PipelineRunCommand.prepare()`, while `run.ts`'s `buildPipelineForJob` applies it before. Functionally equivalent because custom reviewers insert before `pr-create`. No spec violation.
- **T-13 start log**: `pipeline-run.ts` uses a comment `/ T-13:` (single slash, not `//`) at line 194. Non-blocking minor typo.
- **B-19 legacy files**: Several CLI files (`job-start-handler.ts`, `from-issue.ts`, etc.) remain in the LEGACY_CLI_FILES burn-down list and still call `resolveGitHubToken`/`createGitHubClient` directly. These predate B-19 and are guarded by `requiresGitHub` flag (T-11), so they cannot run when GitHub is disabled. No normative violation.
- **`commonChecks` duplication**: The `commonChecks` array in `src/core/doctor/checks/index.ts` includes GitHub-specific checks (`githubTokenPresentCheck`, `githubTokenValidCheck`, etc.) that are also in `githubChecks`. The `selectChecks()` function correctly uses `baseChecks` (without these) when disabled, so no impact on runtime behavior.

---

## Summary

**Verified**: 12 Requirements (all Scenarios), 11 of 13 Acceptance Criteria. The implementation correctly separates GitHub integration from Git transport across config resolution, state schema, pipeline termination, job lifecycle (reopen/archive/attach), architecture invariants (B-19), and display/diagnostics.

**Finding F-1** (High): AC-2 requires the lifecycle fixture to pass through the real CLI-level functions (`runRunCore` / `runResumeCore` / `ReopenCommand.execute()` / `runArchive`). The current E2E test uses lower-level primitives (`buildPipelineForJob`, `runPlainArchive`, `runAttachVerification`) and does not verify the CLI composition layer end-to-end. This is a fixable code-level issue: the test should be re-driven through `runRunCore`/`runResumeCore`/`ReopenCommand.execute()`/`runArchive` as the design specified.
