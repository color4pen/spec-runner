# Code Review Feedback — optional-github-integration (Iteration 2)

**Reviewed by**: code-review step  
**Date**: 2026-09-06  
**Branch**: feat/optional-github-integration-c0a99891  
**Files examined**: 115 changed files (7139 insertions, 354 deletions)

---

## Summary

The implementation correctly separates GitHub credential resolution from git transport, introduces the `github.enabled` config knob and job-state contract, rewrites the pipeline terminal selector (`applyGitHubIntegration`), guards reopen / archive / attach, and adds an e2e fixture. The core invariants (D2 resolution seam, D4 origin normalisation, D5 identity split, D6 descriptor transform, D8 lifecycle gates, D9 dispatch guard, B-19 grep barrier) are all in place.

Two correctness gaps remain before the acceptance criteria are fully met.

---

## Findings

### F-1 · HIGH · `bootstrap.ts` re-derives `github.enabled` from the current config instead of the stored job state (D1 / TC-011 / TC-030 / TC-031)

**File**: `src/cli/bootstrap.ts` line 43  
**Failure scenario**: A job is started with `github.enabled: false` (stored as `githubIntegration: { enabled: false }` in job state). The operator later changes the project config to `github.enabled: true`, then runs `job resume <slug>`. `bootstrap()` calls `resolveGitHubIntegrationConfig(config)` which reads the new config value (`enabled: true`). It then calls `composeGitHubIntegrationForJob({ enabled: true, … })`, which resolves a GitHub token. The resolved token is passed to `createRuntime`, which constructs a `LocalRuntime` with `githubToken` set. The `LocalRuntime` constructor calls `createTransportAuth({ token: githubToken })`, injecting the credential into all subsequent git fetch / push calls — violating TC-030 ("token 解決が 0 件") and TC-031 ("token 注入引数が付かない") for the resumed job.

The design D1 contract is: "resume / reopen / attach / archive は**そのjobの値**を使う。config 変更で既存 job が暗黙に別モードへ移らない。" The unit tests for TC-011 only exercise `getGitHubIntegration` (the pure accessor) but do not exercise the resume CLI path. The e2e fixture (`tests/github-disabled-e2e.test.ts`) runs the pipeline start-to-archive with a constant `github: { enabled: false }` config, so it also does not catch this scenario.

**Relevant code path**:
```
resume.ts → bootstrap(cwd, repo, repoRoot)
  bootstrap.ts:43  resolveGitHubIntegrationConfig(config)   ← reads config, not state
  bootstrap.ts:44  composeGitHubIntegrationForJob({ enabled: githubEnabled, … })
  factory.ts       createRuntime(…, githubClient, …, githubToken)
  local.ts:180     createTransportAuth({ token: githubToken, cwd })   ← token injected
```

**Required fix direction**: `resume.ts` should read `getGitHubIntegration(state).enabled` from the loaded job state and forward it to `bootstrap`. `bootstrap` should accept an optional `githubEnabledOverride: boolean | undefined` parameter; when provided, use it instead of `resolveGitHubIntegrationConfig(config).enabled`. This ensures that the job state is authoritative for all resume/reopen paths, which is what D1 prescribes.

---

### F-2 · MEDIUM · Completion output for GitHub-disabled jobs omits final revision OID and attestation path (TC-051 unimplemented; JSON contract missing D7 additive fields)

**File**: `src/core/command/runner.ts` lines 469-473; `src/core/command/run-result.ts` (interface)  
**Failure scenario**: After a GitHub-disabled job reaches `awaiting-archive`, the human-readable output is:
```
Branch published: <branch>
Pipeline completed (GitHub integration disabled); awaiting archive.
Run 'specrunner job archive <slug>' to archive the job.
```
TC-051 (must) requires "feature branch / **最終 revision** / **証跡パスが表示され** PR URL は現れない". The final revision (the last OID in `state.synthesizedCommits`) and the attestation path (`specrunner/changes/<slug>/attestation.md`) are not displayed. A user completing the pipeline has no on-screen indication of what commit to reference or where the attestation file lives.

Additionally, design D7 prescribes that `RunResultContract` (used by `--json`) gains `branch`, `revision`, and `githubIntegration` as additive fields so that machine consumers can learn the branch name and final OID without parsing human text. The current interface only added the `branch-published` result kind; all three additive fields are absent. TC-052 only checks `result: "branch-published"` and `prUrl: null`, which are implemented, but D7's contract extension is not.

The `tests/unit/core/command/run-result.test.ts` file has no test for `branch-published`, and the e2e test (`github-disabled-e2e.test.ts` TC-T16-001) asserts `awaiting-archive` status but does not inspect the human-readable or JSON output for branch/revision/attestation fields.

**Required fix direction**:
1. In `handleResult` (runner.ts), after the `"Branch published: …"` line, add:
   - The final commit OID: `state.synthesizedCommits?.at(-1)` (display only when non-null).
   - The attestation path: check if `attestationPath(slug)` exists and display it when present.
2. Add optional `branch?: string`, `revision?: string`, `githubIntegration?: { enabled: boolean }` fields to `RunResultContract`. Populate `branch` from `state.branch`, `revision` from `state.synthesizedCommits?.at(-1)`, and `githubIntegration` from `state.githubIntegration` in `buildRunResult`. Add corresponding tests.

---

## Observations (non-blocking)

### O-1 · LOW · `traceGitHubIntegration` has a redundant null check

**File**: `src/config/github-integration.ts` lines 48–50  
The condition `projectLocalRaw !== null` is checked twice on consecutive lines (once at line 48 and again at line 50 inside the same `if` block). The second check is dead code; `projectLocalRaw` cannot be null inside that scope. Minor readability concern; no correctness impact.

### O-2 · LOW · TC-011 unit test exercises the accessor but not the resume CLI path

**File**: `tests/unit/state/github-integration.test.ts` lines 81-95  
The test correctly verifies that `getGitHubIntegration` reads from the state field. It does not verify that the resume CLI path (`resume.ts` → `bootstrap.ts`) respects the job state's value over the current config — the gap identified in F-1. Fixing F-1 should be accompanied by an integration-level test that simulates a config change between start and resume.

---

## 検証した項目

| 対象 | ファイル / 箇所 | 結果 |
|---|---|---|
| D1 job-state authority — reopen / archive | `reopen.ts` が `getGitHubIntegration(state)` を参照、`archive.ts` が `jobGithubEnabled` をstate から取得 | ✅ |
| D1 job-state authority — resume | `resume.ts` → `bootstrap.ts:43` が `resolveGitHubIntegrationConfig(config)` を使用 | ❌ **F-1**: config を再読み込み |
| D2 resolution seam | `src/config/github-integration.ts`, `src/core/github/integration.ts`, `src/cli/github-composition.ts` | ✅ |
| D3 auth/client isolation | `github-composition.ts` の `composeGitHubIntegration` / `composeGitHubIntegrationForJob` | ✅ |
| D4 remote.ts split | `getOriginUrl`, `normalizeOriginIdentity`, `getOriginInfo`（既存 GitHub 専用を維持） | ✅ |
| D5 identity split | `state/schema/operations.ts` `validateJobState` の enabled/disabled 相互排他検証 | ✅ |
| D6 descriptor transform | `apply-github-integration.ts`: enabled → 参照同一、disabled → pr-create 除去 | ✅ |
| D7 completion contract — branch-published result | `run-result.ts` `buildRunResult`: `githubDisabled` 判定で `"branch-published"` を返す | ✅ |
| D7 completion contract — additive fields | `RunResultContract` に `branch` / `revision` / `githubIntegration` フィールド | ❌ **F-2**: 未追加 |
| D7 human-readable output — branch | `runner.ts` `handleResult`: `Branch published: ${state.branch}` を表示 | ✅ |
| D7 human-readable output — 最終 revision / 証跡パス | `runner.ts` `handleResult` の disabled パス | ❌ **F-2**: OID・attestation path 未表示 |
| D8 reopen PR gate | `reopen.ts`: `getGitHubIntegration(state).enabled` で分岐 | ✅ |
| D8 archive --with-merge guard | `archive.ts`: job state から `jobGithubEnabled` を読み事前拒否 | ✅ |
| D9 dispatch guard | `bin/specrunner.ts` の `githubOnly` フラグ検査、`command-registry.ts` の `requiresGitHub` 宣言 | ✅ |
| D10 doctor check selection | `doctor/checks/index.ts`: `selectChecks(runtime, githubEnabled)` | ✅ |
| D11 managed rejection | `factory.ts`: managed × disabled → `GITHUB_INTEGRATION_UNSUPPORTED_RUNTIME` | ✅ |
| B-19 grep barrier | `tests/unit/architecture/core-invariants.test.ts` | ✅ |
| TC-001–TC-004 config resolution | `tests/unit/config/github-integration.test.ts` | ✅ |
| TC-010–TC-015 state contract | `tests/unit/state/github-integration.test.ts` | ✅ (accessor 単体のみ、CLI 統合パス未検証) |
| TC-023–TC-024 origin normalisation | `tests/unit/git/normalize-origin-identity.test.ts` | ✅ |
| TC-030–TC-034 auth non-injection | `tests/github-disabled-e2e.test.ts` (constant-config fixture) | ✅ (config 変更シナリオは F-1 の未テスト範囲) |
| TC-040–TC-045 pipeline descriptor | `tests/unit/pipeline/apply-github-integration.test.ts` | ✅ |
| TC-044 resume --from pr-create guard | `tests/unit/pipeline/resume-from-pr-create-disabled.test.ts` | ✅ |
| TC-050 attestation.md in terminal commit | `src/core/runtime/local.ts` `commitFinalState` の attestation 生成パス | ✅ |
| TC-051 completion output completeness | `runner.ts` `handleResult` disabled パス | ❌ **F-2**: revision / 証跡パス未表示 |
| TC-052 --json branch-published | `run-result.ts` `buildRunResult` | ✅ (`branch-published` / `prUrl:null` は実装済み) |
| TC-060–TC-064 reopen lifecycle | `tests/unit/cli/reopen-github-disabled.test.ts` | ✅ |
| TC-070–TC-075 archive lifecycle | `src/cli/archive.ts`、`tests/unit/cli/archive-usage-text.test.ts` | ✅ |
| TC-080–TC-083 attach checkpoint | `src/core/attach/verify-checkpoint.ts`、attach テスト群 | ✅ |
| TC-090–TC-095 guard pre-rejection | `command-registry.ts`、`bin/specrunner.ts` | ✅ |
| TC-100–TC-106 display / doctor | `doctor.ts`、`config-effective.ts`、`job-show.ts` | ✅ |
| TC-110–TC-113 architecture invariants | `tests/unit/architecture/core-invariants.test.ts` | ✅ |
| E2E full lifecycle | `tests/github-disabled-e2e.test.ts` | ✅ (constant-config のみ) |
| `traceGitHubIntegration` 重複 null チェック | `src/config/github-integration.ts:50` | ⚠ O-1: 冗長コード（機能影響なし） |

---

## 検証できなかった項目

| 項目 | 理由 |
|---|---|
| TC-011 の CLI 統合パス（config 変更後 resume）| `tests/unit/state/github-integration.test.ts` の TC-011 は `getGitHubIntegration` 単体のみをテストする。`resume.ts` → `bootstrap.ts` の実際のフローが config 変更後に job state の値を優先するかを検証するテストが存在しない。F-1 の修正と合わせて integration test の追加が必要。 |
| `--json` 出力に `branch` / `revision` / `githubIntegration` フィールドが含まれるか | `RunResultContract` インターフェースにこれらのフィールドが未追加のため、テストする対象が存在しない。F-2 の修正後に TC-052 相当のテストを追加する必要がある。 |
| attestation path の human-readable 出力 | `handleResult` の disabled パスに attestation path の表示ロジックが未実装のため、実際の出力を確認できなかった。F-2 の修正後に確認する。 |
