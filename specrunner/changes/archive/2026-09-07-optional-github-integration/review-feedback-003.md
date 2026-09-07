# Code Review Feedback — iteration 003

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| ファイル | 確認内容 |
|---|---|
| `specrunner/changes/optional-github-integration/design.md` | D1〜D12 の設計決定と実装の対応を確認 |
| `specrunner/changes/optional-github-integration/tasks.md` | T-01〜T-16 のタスクチェックリストと受け入れ基準を確認 |
| `specrunner/changes/optional-github-integration/test-cases.md` | TC-001〜TC-137 全 62 件の "must" シナリオと実装・テストの対応を確認 |
| `src/config/github-integration.ts` | `resolveGitHubIntegrationConfig` / `traceGitHubIntegration` の実装を確認（TC-001〜TC-004） |
| `src/state/github-integration.ts` | `getGitHubIntegration` / `requireGitHubRepository` の実装を確認（TC-012, TC-015） |
| `src/state/schema/operations.ts` | `validateJobState` の githubIntegration 意味規則実装を確認（TC-013, TC-014） |
| `src/git/remote.ts` | `getOriginUrl` / `normalizeOriginIdentity` / `getOriginInfo` の実装を確認（TC-023, TC-024） |
| `src/core/github/integration.ts` | `resolveJobGitHubIntegration` の B-1 準拠と disabled/enabled 分岐を確認（TC-030） |
| `src/cli/github-composition.ts` | `composeGitHubIntegration` / `composeGitHubIntegrationForJob` / `buildGitHubClientFromToken` を確認 |
| `src/core/pipeline/apply-github-integration.ts` | `applyGitHubIntegration` の参照同一性 (enabled) と descriptor 変換 (disabled) を確認（TC-040〜TC-043） |
| `src/core/command/reopen.ts` | PR gate の githubIntegration 契約分岐を確認（TC-060, TC-062, TC-063） |
| `src/core/attach/verify-checkpoint.ts` | T-10 契約分岐 (GitHub identity / origin digest) を確認（TC-080〜TC-082） |
| `src/core/attach/orchestrator.ts` | `runAttachVerification` の expectedRepo 型と fetch ��� verify 順序を確認 |
| `src/core/command/run-result.ts` | `buildRunResult` の `"branch-published"` / `"pr-created"` ��岐を確認（TC-052, TC-054） |
| `src/core/attestation/render-markdown.ts` | `renderAttestationMarkdown` 純関数の実装を確認（TC-050） |
| `src/cli/archive.ts` | `runArchive` の契約解決・`--with-merge` 事前拒否・`ARCHIVE_USAGE` 文字列を確認（TC-073, TC-075） |
| `src/errors.ts` | `GITHUB_INTEGRATION_DISABLED` / `GITHUB_INTEGRATION_REQUIRED` / `GITHUB_INTEGRATION_UNSUPPORTED_RUNTIME` を確認 |
| `bin/specrunner.ts` | dispatch gate の `requiresGitHub` 判定・exit 2 を確認（TC-090, TC-093） |
| `tests/github-disabled-e2e.test.ts` | TC-T16-001〜TC-T16-006 の実装を確認（TC-120〜TC-129） |
| `tests/unit/git/normalize-origin-identity.test.ts` | TC-023, TC-024 の単体テスト実装を確認 |
| `tests/unit/pipeline/apply-github-integration.test.ts` | TC-040〜TC-043 の単体テスト実装を確認 |
| `tests/unit/cli/reopen-github-disabled.test.ts` | TC-060, TC-063 の単体テスト実装を確認 |
| `tests/unit/cli/archive-usage-text.test.ts` | TC-075 の実装を確認 |
| `tests/unit/architecture/core-invariants.test.ts` | B-19 の不変条件テスト実装を確認（TC-110〜TC-113） |
| `src/core/preflight.ts` | GitHub 連携解決の core seam 経由を確認 |

---

## 検証できなかった項目

- `src/core/runtime/local.ts` の `commitFinalState` における attestation 書き込み実装（TC-050, TC-053）は��������都合で詳細読込を省略した���ただし `render-markdown.ts` および `paths.ts` への `attestationPath` 追加は確認した。
- `src/cli/attach.ts` の invoker / checkpoint 契約分離の全行（TC-080, TC-082）は orchestrator 側のみ確認した。
- `src/core/doctor/checks/index.ts` の GitHub 無効時検査切り替え（TC-102, TC-105）は grep による構造確認のみ。

---

## Findings 詳細

### F-1: E2E テストが TC-120 "must" シナリオを確定的に検証しない

**ファイル**: `tests/github-disabled-e2e.test.ts` 429行目

resume 実行後のパイプライン完了アサーションが以下の形になっている:

```typescript
expect(["awaiting-archive", "awaiting-resume"]).toContain(completeState.status);
```

`awaiting-resume`（= パイプライン未完了）も許容しているため、PR 非��存の `awaiting-archive` 完了という本機能の中�� "must" シナリオ（TC-120, TC-T16-001）が確定的には検証されない。`MINIMAL_CONFIG` に `implementer` エージェント定義しか含まれず、`code-review` 等の後続ステップで `fakeAgent` が返��� `implementer-result.md` の内容が `parseResult` に通らない場合、パイプラインが再び `awaiting-resume` に止まっても本アサーションは通過してしまう。  

T-16 AC の「start → halt/resume → 完了 → archive が�� GitHub origin・credential 不要の fixture 上で成立する」を満たすためには、`completeState.status` が `"awaiting-archive"` であることを `toBe` で断言する必要がある。またそ���ためには `fakeAgent` が全ステップで適切な結果ファイルを出力するか、pipeline を implementer の次の verification ～ end まで到達させる mock ��計が必要になる。

---

### F-2: `ARCHIVE_USAGE` ヘルプテキストが plain archive の GitHub 必須性を誤記している

**ファイル**: `src/cli/archive.ts` 355行目

```
Plain archive (without --with-merge): pushes an archive record commit to the feature branch,
transitions the job to archived status, and removes the worktree — all in a single run.
Requires GitHub integration to be enabled (a merged or open PR is expected on the remote).
```

「Requires GitHub integration to be enabled」という文は plain archive（`--with-merge` なし）が GitHub 連携を **必須とする** と読める。しかし本機能の要件は「GitHub 無効でも plain archive が 1 回で完了する」（TC-070, TC-074, design D8）であり、`plain-archive.ts` の実装も GitHub API を一切呼ばない。この記述は機能の主旨と矛盾する。

直後の「For jobs with GitHub integration disabled: ...」段落が正しい動作を説明しているため、最初の段落は「For jobs with GitHub integration enabled, a merged or open PR is expected on the remote.」等に改める必要がある。

`TC-075` テスト（`archive-usage-text.test.ts`）は「PR merge 後に再実行」等��旧文の��在を検査するが、この誤った「Requires GitHub integration」文を検出しない。

---

### F-3: `validateJobState` が `githubIntegration` 不在の legacy state で owner/name を検証しない

**ファイル**: `src/state/schema/operations.ts` 371行目

現在の実装は以下の形になっている:

```typescript
if ("githubIntegration" in obj && obj["githubIntegration"] !== null && ...) {
  // owner/name バリデーションを実行
}
```

`githubIntegration` フィールド自体が存在しない（legacy state）場合、owner/name のバリデーションが完全にスキップされる。T-02 AC は「`enabled: true`��および契約不在）かつ `owner` が空/不在の state が validation で拒否される」と明記している。

実用上、既存 state はすべて owner/name を持つため regression は発生しないが、仕様との齟齬が存在する。TC-014 は `githubIntegration.enabled: true` の場合をカバーするが、`githubIntegration` フィールド自体が存在しないケースはカバーしていない。

---

### F-4: `composeGitHubIntegrationForJob` 内��� `resolveGitHubHost` を動的 import している

**ファイル**: `src/cli/github-composition.ts` 102行目

```typescript
const githubHost = (await import("../config/github-host.js")).resolveGitHubHost(config.github);
const githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);
```

`resolveGitHubApiBaseUrl` はファイル冒頭で `../config/github-host.js` から静的 import 済みである���もかかわらず、同一モジュールの `resolveGitHubHost` だけが動的 import されている。循環依存の回避等の技術的理由は��く、静的 import に揃えるべき。動的 import は Bun/Node のモジュールキャッシュにより動作上���問題ないが、バンドル解析や型推論の妨げになる可能性がある。

修正: ファイル冒頭の `import { resolveGitHubApiBaseUrl } from "../config/github-host.js"` に `resolveGitHubHost` を追加し、dynamic import を削除する。
