# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/issue-target-start-face/request.md`
- `specrunner/changes/issue-target-start-face/design.md`
- `specrunner/changes/issue-target-start-face/spec.md`
- `specrunner/changes/issue-target-start-face/tasks.md`
- `specrunner/changes/issue-target-start-face/test-cases.md`

### 現状コードの照合

- `src/core/job/start-from-issue.ts` — `materializeDraftAndStart` の現実装・動的 import 経路を確認
- `src/cli/from-issue.ts` — `--from-issue` 経路・`materializeDraftAndStart` 呼び出しを確認
- `src/cli/__tests__/from-issue.test.ts` — mock 対象 `"../../core/job/start-from-issue.js"` と各 TC の assert を確認
- `src/core/job/__tests__/start-from-issue.test.ts` — `vi.mock("../../../cli/run.js")` の動的 import mock と assert 内容を確認
- `tests/unit/inbox/run-inbox-inbox-origin.test.ts` — TC-018（設計 D2 の齟齬原点）の mock 構成・assert を詳細照合
- `src/core/inbox/run-inbox.ts:385-398` — 既定 `startJob` effect の動的 import と呼び出し引数を確認
- `src/cli/command-registry.ts:570-624` — positional + `--issue` 経路が `runRun` を直接呼ぶ現状を確認
- `src/core/command/pipeline-run.ts:174-175` — インライン branch 名構成を確認
- `src/core/step/design.ts:149-151` — インライン branch 名構成（state.branch fallback）を確認
- `src/core/step/commit-orchestrator.ts:402-404` — インライン branch 名構成（setsBranch 経路）を確認
- `src/config/type-config.ts` — `getBranchPrefix()` の実装と各 type の `branchPrefix` 値を確認
- `src/core/runtime/local.ts:470-520` — new-run arm の remoteBaseRef 解決・fetch を確認
- `src/core/runtime/workspace-materializer.ts:150-255` — new-run arm の worktree 作成順序を確認
- `src/core/port/runtime-strategy.ts` — `WorkspaceOptions` インターフェースを確認
- `src/adapter/github/github-client.ts:670-682` — `getIssue()` の REST adapter 実装（`node_id` 廃棄を確認）
- `src/kernel/github-client.ts:269` — port の `getIssue()` 返り値型を確認
- `tests/unit/architecture/core-invariants.test.ts` — B-1〜B-18 / DSM / CWD 各 invariant test を通読
- `tests/unit/architecture/module-boundary.test.ts` — `core/request` スコープの cli 依存 grep test を確認
- `tests/unit/architecture/arch-allowlist.ts` — `RESOLVE_REPO_ROOT_ALLOWED_FILES` と allowlist 構造を確認

### 検証した観点

1. **TC-017 の期待値 vs `type-config.ts` の `getBranchPrefix("bug-fix")`**
   `type-config.ts:62` で `"bug-fix": { branchPrefix: "fix/" }` を確認。TC-017 が `"feat/my-slug-abcdef01"` を期待しているのに対し、正しい値は `"fix/my-slug-abcdef01"` となる。

2. **TC-018（既存テスト）の互換性分析**
   `run-inbox-inbox-origin.test.ts` は `vi.mock("../../../src/cli/run.js")` で module を差し替え、`runRunCore` の呼び出し引数を assert する。設計 D2 では inbox 既定 effect が動的 import を保持する形にするため、`runRunCore` の経路は変わらない。TC-018 は無改変で green になる — 設計の分析は正しい。

3. **issue-target → cli 依存の DSM 適合性**
   `core/issue-target/` は `domain` 層に分類される。注入 `startPrimitive` / `githubClient` (port) / `writeDraft` (domain-to-domain) / `parseRequestMdContent` (shared-kernel) / logger (shared-kernel) のみを使うため、DSM whitelist 違反なし。新 allowlist エントリは不要。

4. **B-10 arch test への影響（command-registry.ts 修正）**
   tasks.md T-05 が `command-registry.ts` に GitHub client 構成を追加する際、`resolveGitHubToken({ host: })` / `createGitHubClient(fetch, token, baseUrl)` の 3 引数形式が必要（B-10 scan 対象）。T-05 が「`--from-issue` / inbox と同型」と明示しており、同型の関数呼び出しは B-10 を満たす。

5. **D5 の順序契約**
   materializer の new-run arm のコードを読み、worktree 作成（`manager.create`）→ request copy / commit の順を確認した。`onFeatureBranchCreated` を manager.create 成功後・bootstrap commit 前に挿入する位置は実現可能。

6. **`getIssue()` 型拡張と既存 mock の typecheck 影響**
   `run-inbox-inbox-origin.test.ts` の `makeGitHubClient()` は `as GitHubClient` cast で、`createLinkedBranch` を持たないオブジェクトリテラルを渡す。TypeScript の `as` assertion はソース型とターゲット型が十分に overlap するなら通る（全既存メソッドが存在）。実行時も `runRunCore` が mock されるため callback 経路に到達しない。

7. **arch-allowlist.ts 無変更要件**
   issue-target 層の import 構成（port / shared-kernel / domain-to-domain）は B-1〜B-18 + DSM の既存 whitelist 内に収まる。新 allowlist エントリ追加は不要と確認。

## 検証できなかった項目

- TypeScript コンパイラが `as GitHubClient` cast で `createLinkedBranch` 欠落を typecheck エラーにするか（依存する tsconfig strict 設定や TS バージョンに依存。実際の `bun run typecheck` 実行なしには断定不能）。
- no-worktree 経路での `git rev-parse HEAD` タイミングが local HEAD を正しく固定するかの実機動作検証。

## Findings 詳細

### F-01: TC-017 の期待ブランチ名が `type-config.ts` の実装と食い違う

`test-cases.md TC-017` は `buildFeatureBranchName("bug-fix", "my-slug", "abcdef0123")` の期待値を `"feat/my-slug-abcdef01"` と記述している。しかし `src/config/type-config.ts:62` は `"bug-fix": { branchPrefix: "fix/" }` と定義しており、`getBranchPrefix("bug-fix")` は `"fix/"` を返す。正しい期待値は `"fix/my-slug-abcdef01"` である。実装がこの test case どおりに書かれると、「fix/ が返るのに feat/ を期待する」テストが実行時に必ず失敗する。T-07 gate（`bun run test` green）が受け入れ基準に含まれるため、これはブロッカーレベルの修正が必要。
