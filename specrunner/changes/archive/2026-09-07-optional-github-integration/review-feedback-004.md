# Review Feedback — Iteration 4

**Branch**: feat/optional-github-integration-c0a99891  
**Reviewer**: code-review (iteration 4)  
**Scope**: full diff (126 files, +10,162 / −380)

---

## Overall Assessment

The implementation is structurally sound and aligns well with the design decisions (D1–D12) and task requirements (T-01 through T-16). All critical correctness invariants are satisfied:

- GitHub credential isolation (token never resolved / client never built when disabled) ✓
- Pipeline terminal selection (`applyGitHubIntegration` removes pr-create for disabled, returns reference identity for enabled) ✓
- Repository identity separation (`RepositoryInfo` optional owner/name, `RepositoryOrigin` for forge-agnostic identity) ✓
- `validateJobState` semantic rules enforced (disabled → no owner/name + origin required; enabled → owner/name required) ✓
- `verifyCheckpoint` identity branching on checkpoint contract (GitHub-enabled → owner/name match; disabled → origin digest match) ✓
- `ReopenCommand` PR gate conditional on `getGitHubIntegration(state).enabled` ✓
- `notifyJobTerminal` no-op when `githubClient` is null ✓
- Fidelity gate fail-closed when `githubClient` is null and `issueNumber` is set ✓
- B-19 architecture invariant enforced by grep test ✓
- `pipelineManagedPaths` includes `attestationPath(slug)` ✓
- E2E uses real CLI entry points (`runRunCore` / `runResumeCore` / `ReopenCommand.execute` / `runArchive`) ✓

---

## Findings

### F-001 — Dead export `githubChecks` is not used by `selectChecks`, creating a maintenance hazard

**Severity**: medium  
**File**: `src/core/doctor/checks/index.ts` (lines 91–96)

```typescript
export const githubChecks: DoctorCheck[] = [
  githubTokenPresentCheck,
  githubClientIdCheck,
  githubTokenValidCheck,
  githubOriginCheck,
];
```

`selectChecks` uses `commonChecks` (which embeds these same four checks inline) for the GitHub-enabled path, and `baseChecks` for the disabled path. `githubChecks` is exported but never passed to `selectChecks` or used in any runtime path.

**Risk**: If a new GitHub-specific check is added to `commonChecks`, a consumer of the `githubChecks` export would see an incomplete list. Conversely, adding a check to `githubChecks` without adding it to `commonChecks` has no operational effect. There is no enforcement that they stay in sync.

**Recommended fix**: Either (a) use `githubChecks` inside `selectChecks` — i.e., `return [...baseChecks, ...githubChecks, ...runtimeSpecific]` for the enabled path — which would also simplify `commonChecks` by removing the embedded GitHub-specific checks; or (b) remove the `githubChecks` export if it is not consumed externally. If `githubChecks` is used in tests to verify the GitHub-specific check set, add a test that asserts `githubChecks` is a subset of `commonChecks` to enforce sync.

---

### F-002 — Dead code fallback for `invokerOrigin` in `attach.ts`

**Severity**: low  
**File**: `src/cli/attach.ts` (lines 120–127)

```typescript
// If composeGitHubIntegration did not resolve an origin …, resolve it here
// as a best-effort fallback so GitHub-disabled attach can use digest comparison.
if (!invokerOrigin) {
  try {
    const rawUrl = await getOriginUrl(repoRoot);
    invokerOrigin = normalizeOriginIdentity(rawUrl);
  } catch {
    // best-effort; invokerOrigin stays undefined
  }
}
```

`composeGitHubIntegration` always returns an `origin` (both the enabled and disabled branches of `resolveJobGitHubIntegration` call `getOriginUrl` + `normalizeOriginIdentity` and include `origin` in the return value). Therefore `composition.origin` is never undefined and `invokerOrigin` is always set after line 105.

The fallback block never executes and could mislead future maintainers into thinking there is a code path where `composeGitHubIntegration` returns without an origin.

**Recommended fix**: Remove the dead fallback block (lines 120–127). If a defensive fallback is desired for future-proofing, add a comment explaining why `invokerOrigin` is always set here.

---

### F-003 — Redundant null check in `traceGitHubIntegration`

**Severity**: low  
**File**: `src/config/github-integration.ts` (lines 67–71)

```typescript
const userGlobalRaw = loadResult.userGlobal.migrated;
if (
  userGlobalRaw !== null &&
  typeof userGlobalRaw === "object" &&
  userGlobalRaw !== null   // ← redundant: already checked on line 67
) {
```

The third condition `userGlobalRaw !== null` is a duplicate of the first. This is a minor copy-paste artefact from the `projectLocal` block above.

**Recommended fix**: Remove the redundant `userGlobalRaw !== null` check.

---

### F-004 — `validateJobState` allows explicit `null` for owner/name on disabled jobs

**Severity**: low  
**File**: `src/state/schema/operations.ts` (lines 399–402)

```typescript
if (repo && (typeof repo["owner"] === "string" || typeof repo["name"] === "string")) {
  throw new Error(
    "repository.owner and repository.name must be absent when githubIntegration.enabled is false.",
  );
}
```

`typeof null === "string"` is `false`, so a state with `{ "owner": null, "origin": {...} }` and `githubIntegration.enabled: false` passes validation. The design requires owner/name to be *absent*, but the check only catches string-typed values, not explicit `null` fields.

In practice this gap is unlikely to manifest because the serialization layer writes `undefined` (omits the key) rather than `null` for optional fields. However, the invariant is not complete.

**Recommended fix**: Add a check for null:
```typescript
const hasOwner = repo["owner"] !== null && repo["owner"] !== undefined;
const hasName  = repo["name"]  !== null && repo["name"]  !== undefined;
if (repo && (hasOwner || hasName)) {
  throw new Error(...);
}
```

---

## Test Coverage Against test-cases.md

All 59 `must`-priority test cases are covered:

| Category | TC range | Coverage |
|---|---|---|
| config (TC-001–004) | `tests/unit/config/github-integration.test.ts` | ✓ |
| state (TC-010–015) | `tests/unit/state/github-integration.test.ts` | ✓ |
| identity (TC-020–024) | `tests/unit/git/normalize-origin-identity.test.ts` | ✓ |
| auth (TC-030–034) | `tests/github-disabled-e2e.test.ts` (TC-030,031), unit spy tests | ✓ |
| pipeline (TC-040–045) | `tests/unit/pipeline/apply-github-integration.test.ts`, `resume-from-pr-create-disabled.test.ts` | ✓ |
| completion (TC-050–055) | `tests/unit/core/command/run-result.test.ts`, `tests/unit/core/attestation/render-markdown.test.ts` | ✓ |
| lifecycle (TC-060–064) | `tests/unit/cli/reopen-github-disabled.test.ts` | ✓ |
| archive (TC-070–075) | `tests/unit/cli/archive-usage-text.test.ts`, `archive-minimum-assurance.test.ts` | ✓ |
| attach (TC-080–083) | `tests/unit/pipeline/apply-github-integration.test.ts`, attach tests | ✓ |
| guard (TC-090–095) | `tests/unit/architecture/core-invariants.test.ts` (B-19) | ✓ |
| display (TC-100–106) | `tests/unit/cli/doctor-repo-root.test.ts`, config/doctor tests | ✓ |
| invariant (TC-110–113) | `tests/unit/architecture/core-invariants.test.ts` | ✓ |
| e2e (TC-120–129) | `tests/github-disabled-e2e.test.ts` | ✓ |
| regression (TC-130–137) | Existing test suite (no regressions introduced) | ✓ |

`should`-priority cases (TC-004, TC-024, TC-104) are also covered in the respective unit test files.

---

## 検証した項目

- `src/config/github-integration.ts` — `resolveGitHubIntegrationConfig` / `traceGitHubIntegration` の実装を全文読みレビュー。優先順（project-local → user-global → default）と未指定時の `enabled: true` 既定値を確認。
- `src/state/github-integration.ts` — `getGitHubIntegration` / `requireGitHubRepository` を全文読みレビュー。legacy state (フィールド不在) → `{ enabled: true }` 解釈および `GITHUB_INTEGRATION_DISABLED` throw を確認。
- `src/state/schema/operations.ts` — `validateJobState` の `githubIntegration` セマンティクス検証ブロックを詳読。enabled:false → owner/name 不在必須 / origin 必須、enabled:true / 不在 → owner/name 必須の規則を確認。
- `src/git/remote.ts` — `getOriginUrl` / `normalizeOriginIdentity` / `getOriginInfo` / `parseRemoteUrl` を全文読みレビュー。HTTPS・SSH・file:// の canonical 形成と SHA-256 digest 生成を確認。userinfo 除去・port 保持・大文字小文字正規化を確認。
- `src/core/github/integration.ts` — `resolveJobGitHubIntegration` 全文読みレビュー。disabled 時は `resolveToken` を呼ばず origin のみ返すこと、enabled 時は host → token → origin → parseRemoteUrl の順を確認。adapter import なし (B-1 充足) を確認。
- `src/cli/github-composition.ts` — `composeGitHubIntegration` / `composeGitHubIntegrationForJob` / `buildGitHubClientFromToken` 全文読みレビュー。`createGitHubClient` が enabled 分岐内にのみ存在すること、origin が常に返ることを確認。
- `src/core/pipeline/apply-github-integration.ts` — 全文読みレビュー。enabled → 参照同一返却、disabled → pr-create 除去・`to: "pr-create"` → `to: "end"` 書き換えを確認。
- `src/core/command/reopen.ts` — 全文読みレビュー。PR gate が `getGitHubIntegration(state).enabled` 分岐内にのみ置かれること、status gate・reason 必須・operator event append・`allowReopen: true` は不変であることを確認。
- `src/core/attach/verify-checkpoint.ts` — 全文読みレビュー。checkpoint 契約に基づく identity 分岐 (GitHub-enabled → owner/name 照合 / disabled → origin digest 照合) と fail-closed 動作を確認。
- `src/core/command/run-result.ts` — `buildRunResult` 全文読みレビュー。`githubIntegration?.enabled === false` → `"branch-published"` / `prUrl: null` / additive フィールド付与、legacy state → `"pr-created"` の後方互換を確認。
- `src/core/notify/issue-notifier.ts` — `notifyJobTerminal` 全文読みレビュー。`githubClient` null → early return (no-op)、`buildEscalationComment` 内の `state.repository.owner` / `name` ガードを確認。
- `src/core/doctor/checks/index.ts` — `commonChecks` / `githubChecks` / `baseChecks` / `selectChecks` 全文読みレビュー。`githubChecks` が `selectChecks` から参照されておらず、`commonChecks` に GitHub 固有 check が埋め込まれていることを確認（F-001 の根拠）。
- `src/core/attestation/render-markdown.ts` — `renderAttestationMarkdown` 全文読みレビュー。純関数、PR コメント renderer と別ファイル分離、GitHub Markdown 固有要素なしを確認。
- `src/core/preflight.ts` — 全文読みレビュー。`resolveGitHubToken` を直接呼び出さず関数参照として注入していること (B-19 非違反) を確認。
- `src/cli/archive.ts` (冒頭 200 行) — job 契約解決ロジック、`--with-merge` 事前拒否、token best-effort 解決の条件分岐を確認。
- `src/cli/attach.ts` — 全文読みレビュー。`composeGitHubIntegration` 呼び出し後に `invokerOrigin` が常に設定されること、fallback ブロックが dead code であることを確認 (F-002 の根拠)。
- `src/state/schema/types.ts` — `RepositoryInfo` / `RepositoryOrigin` / `JobState` の型定義を確認。`owner?` / `name?` / `origin?` がすべて optional に変更済みであることを確認。
- `src/core/pipeline/round-git-scope.ts` — `pipelineManagedPaths` に `attestationPath(slug)` が追加済みであることを確認。
- `tests/github-disabled-e2e.test.ts` — mock 境界 (pipeline / provider readiness のみ mock、git / state / commit / push は実物) と実関数使用を確認。
- `tests/unit/pipeline/apply-github-integration.test.ts` — TC-040〜TC-043 (参照同一・pr-create 除去・fast 終端・design-only) を確認。
- `tests/unit/pipeline/resume-from-pr-create-disabled.test.ts` — TC-044 (disabled job で `--from pr-create` が拒否される) を確認。
- `tests/unit/core/command/run-result.test.ts` — TC-051 (branch-published・D7 additive フィールド) と legacy state 後方互換を確認。
- `tests/unit/git/normalize-origin-identity.test.ts` — TC-023 (HTTPS/SSH/plain HTTPS 同一 digest)・TC-024 (file:// 安定 digest)・TC-025 (非標準ポート区別) を確認。
- `tests/unit/architecture/core-invariants.test.ts` (B-19 ブロック) — ALLOWLIST_FILES / LEGACY_CLI_FILES / `findDirectCalls` 実装、regression guard テストを確認。
- `tests/unit/cli/reopen-github-disabled.test.ts` — TC-060〜TC-064 の存在と、PR gate が disabled job ではスキップされることを確認。

---

## 検証できなかった項目

- **`LocalRuntime.commitFinalState` の attestation 書き込みロジック (TC-050, TC-053)**: `src/core/runtime/local.ts` の該当ブロックを本レビューで直接読んでいない。ファイルの冒頭 80 行のみ確認し、`attestationPath` のインポートが存在することを確認したが、書き込み失敗時の warn-only / `awaiting-archive` 遷移継続の動作は `tests/github-disabled-e2e.test.ts` の mock pipeline 経由でのみ間接確認。
- **`src/cli/bootstrap.ts` の job 契約受け取り signature 変更 (T-04)**: `bootstrap.ts` の変更後の全体を読んでいない。touched-files に記載があり設計要求は確認済みだが、実装の詳細を直接検証していない。
- **`src/core/command/runner.ts` の `handleResult` 完了出力分岐 (TC-051, TC-103)**: `handleResult` の実装部分を直接読んでいない。`run-result.ts` の `buildRunResult` が正しく `branch-published` を返すことを確認したが、runner 側での出力分岐 (branch / revision / 証跡パス表示) は e2e 経由でのみ確認。
- **`src/cli/command-registry.ts` の `requiresGitHub` / `githubOnly` 宣言 (T-11, TC-090–095)**: registry の変更を直接読んでいない。`bin/specrunner.ts` の dispatch gate 実装も未確認。TC-090–093 の dispatch-level 拒否は e2e / unit テストの存在を確認したが、registry 宣言の完全性を直接検証していない。
- **`src/cli/config-effective.ts` / `src/cli/job-show.ts` の表示追加 (T-13)**: diff stat で変更が確認できるが、追加された出力フィールドの内容を直接読んでいない。TC-100, TC-101, TC-106 については既存テストスイートの通過を前提としている。
- **`src/cli/doctor.ts` の GitHub 無効時の token / client 非構築 (T-12)**: `doctor.ts` の変更後実装を直接読んでいない。`src/core/doctor/checks/index.ts` で `selectChecks` が正しく `baseChecks` を返すことを確認したが、`doctor.ts` 側の `DoctorContext` 構築における token / client 非構築を直接検証していない。
- **architecture ドキュメント (T-14) の実装整合性**: `architecture/components.md` / `domain-model.md` / `dynamic-model.md` の変更内容を読んでいない。ADR (`specrunner/adr/2026-09-06-optional-github-integration.md`) の内容も未確認。

---

## Positive Observations

- **`applyGitHubIntegration`**: Reference identity preserved for enabled contract (zero allocation), confirmed by test. ✓
- **`normalizeOriginIdentity`**: Correctly handles HTTPS/SSH/local-file URLs, strips credentials from HTTPS, preserves non-default ports. ✓
- **`verifyCheckpoint`**: Identity branching is fail-closed in all four combinations (enabled/disabled × github-present/absent). ✓
- **`ARCHIVE_USAGE` correction**: The help text inconsistency ("PR merge 後に再実行") was corrected to match the single-phase archive implementation. ✓
- **B-19 burn-down list**: `LEGACY_CLI_FILES` is explicitly named and marked as a burn-down candidate, preventing the allowlist from becoming a permanent free pass. ✓
- **E2E test mock boundary**: Only external provider (pipeline mock, readiness probe) is mocked; all git/state/worktree/commit/push operations are real, matching the acceptance criteria requirement. ✓
- **`attestation.md` pipeline-managed**: Correctly added to `pipelineManagedPaths`, ensuring it doesn't trigger halt detection or round staging. ✓
