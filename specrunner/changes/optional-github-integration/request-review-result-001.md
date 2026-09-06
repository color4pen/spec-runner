# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合（調査基準: main `6c37dc52027be8ff6f6a699a73e5a959b9ea7cfa`）

以下のファイルを直接 Read して request.md の「再調査で確認した現状」セクションのアサーションを確認した。

1. **`src/core/preflight.ts`**
   - `resolveGitHubToken` が line 56 で無条件呼び出し（try-catch で失敗時に throw）。✓
   - `getOriginInfo(cwd, githubHost)` が line 88 で呼ばれ、GitHub形式のoriginを要求。✓

2. **`src/cli/bootstrap.ts`**
   - `resolveGitHubToken` が line 43 で無条件呼び出し。✓
   - `createGitHubClient` が line 44 で常に構築。✓
   - `createRuntime` に `githubClient` と `githubToken` を渡す（line 51）。✓

3. **`src/core/runtime/factory.ts`**
   - `createRuntime` のシグネチャが `githubClient: GitHubClient` と `githubToken: string` を必須パラメータとして持つ。✓
   - local/managed 両方のランタイムに githubClient/githubToken が渡される。✓

4. **`src/git/remote.ts`**
   - `getOriginInfo` が `parseRemoteUrl` を呼び、URLのhostnameが設定済みhostに一致しない場合 `remoteNotGitHubError()` を throw。✓
   - Git remote確認（`git remote get-url origin`）とGitHub owner/name抽出が同一関数で混在。✓

5. **`src/git/transport-auth.ts`**
   - `buildTransportAuthArgs` が token が absent/empty の場合 `[]` を返す（pass-through）。✓
   - SSH形式（`git@`）および非HTTPS URL にも注入しない（pass-through）。✓
   - 「tokenなしなら通常のGit transportへ通過できる」アサーションが成立。✓

6. **`src/core/pipeline/registry.ts`**
   - `STANDARD_DESCRIPTOR`: 最終ステップが `PrCreateStep`（line 50）。✓
   - `FAST_DESCRIPTOR`: 最終ステップが `PrCreateStep`（line 135）。✓
   - `DESIGN_ONLY_DESCRIPTOR`: 終端は `"end"`（GitHub API 終端ではない）。✓

7. **`src/core/step/pr-create.ts`**
   - `runPrCreate` 呼び出し（line 48）で GitHub REST API を使用。✓
   - attestation comment の投稿処理が含まれる。✓

8. **`src/core/attach/orchestrator.ts`**
   - `runAttachVerification` は `git fetch origin <branch>`、`git rev-parse`、`readCheckpointFromRef`、`verifyCheckpoint` のみ。✓
   - GitHub API クライアントへの依存なし。✓

9. **`src/core/command/reopen.ts`**
   - line 134: `state.pullRequest?.number` 未設定 → エラー終了。✓
   - line 140: `githubClient` が null → fail-closed（エラー終了）。✓
   - line 150–178: PR状態を GitHub API で取得し、MERGED/CLOSED は拒否（OPEN のみ許可）。✓
   - 「recorded PR必須かつOPEN確認必須」アサーションが成立。✓

10. **`src/core/archive/plain-archive.ts`**
    - ファイル先頭コメントに "Does NOT query GitHub PR state. No GitHub API client used." と明示（line 17）。✓
    - `githubToken` は git push の認証のみに使用（GitHub API 呼び出しなし）。✓

11. **`src/state/schema/types.ts`**
    - `RepositoryInfo` が `owner: string; name: string;` の両必須フィールドを持つ（lines 99–101）。✓
    - 「repository identityがowner/name必須」アサーションが成立。✓

### 設計要求の整合性確認

- **`github.enabled` フィールドの現状**: `src/config/` 配下を Grep した結果、`github.enabled` や `githubEnabled` の実装は存在しない。request.md が「新設する」として設計要求に含めていることと一致。✓
- **Non-goals との整合**: #1122 の artifact-output コードに関して、既存コードに該当する復活実装は見当たらない。✓
- **stop-on-push-failure 要求**: `plain-archive.ts` の設計コメントに「Push is skipped only when the remote feature branch no longer exists … Any push failure while the remote branch exists … → escalation (exit 1), no transition, no cleanup」と明記されており、ユーザーストーリー4「push失敗時はarchive完了にせず、未送信の成果物・記録をcleanupで失わない」の前提と整合する。✓

## 検証できなかった項目

- **`src/core/runtime/managed.ts`**: request.md に「GitHub経由のファイル取得やsessionへのrepository/token渡しがある」とアサーションがあるが、managed runtime の初期範囲外（Non-goal）のため詳細検証は省略した。design 判断として request.md が正確に把握していれば問題ない。
- **`src/config/schema.ts`** の全体構造（`github` 設定の現行スキーマ形状）: grep で `github.enabled` が存在しないことは確認済みだが、既存の `github` キーの構造（`host` フィールド等）は詳細読み込みを省略した。設計要求上の影響は低い。

## Findings 詳細

指摘事項なし。

全コードアサーションが一致し、設計要求・Non-goals・Acceptance Criteria・Stop Conditions に内部矛盾は検出されなかった。`RepositoryInfo` のスキーマ変更（owner/name 必須 → GitHub無効時の generic identity）は複雑だが、request.md が「GitHubなしで架空のowner/nameを埋めて済ませてはならない」と明示的に制約しており、設計判断として適切に記述されている。

