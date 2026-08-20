# Code Review Feedback — issue-target-start-face — iter 3

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Scope

`git diff main...HEAD --stat`: 21 ファイル変更、573 行追加、177 行削除。

### 受け入れ基準検証 (11/11)

| AC | 基準 | 結果 |
|----|------|------|
| AC-1 | `core/issue-target/` が `cli/` を静的・動的 import しない | ✅ TC-001 grep テストで確認 |
| AC-2 | `materializeDraftAndStart` が `core/issue-target/start.ts` に存在 | ✅ |
| AC-3 | `startWithIssueLink` が `core/issue-target/start.ts` に存在 | ✅ |
| AC-4 | `materializeDraftAndStart` が `inboxOrigin: true` + `issue` を startPrimitive に渡す | ✅ TC-003 |
| AC-5 | `startWithIssueLink` が `inboxOrigin` を渡さない | ✅ TC-005-unit |
| AC-6 | 両関数が `onFeatureBranchCreated` を startPrimitive に渡す | ✅ TC-003, TC-005-unit |
| AC-7 | `buildLinkedBranchRegistrar` が getIssue→createLinkedBranch を呼ぶ | ✅ TC-006 |
| AC-8 | createLinkedBranch 失敗は best-effort（再スローしない） | ✅ TC-006 |
| AC-9 | inbox 経路のデフォルト startJob が inboxOrigin: true + onFeatureBranchCreated を渡す | ✅ TC-018 |
| AC-10 | no-worktree path が callback を発火する | ✅ TC-012 |
| AC-11 | arch-allowlist に新規エントリ追加なし | ✅ diff 確認 |

### TC カバレッジ (21/21)

| TC | 説明 | 状態 |
|----|------|------|
| TC-001 | core/issue-target → cli/ import なし (grep) | ✅ |
| TC-002 | buildFeatureBranchName フォーマット検証 | ✅ |
| TC-003 (x5) | writeDraft → startPrimitive 順序 + inboxOrigin/issue | ✅ |
| TC-004 | SlugOccupiedError 伝播 | ✅ |
| TC-005-unit (x2) | startWithIssueLink: onFeatureBranchCreated あり / inboxOrigin なし | ✅ |
| TC-006 (x2) | buildLinkedBranchRegistrar — getIssue→createLinkedBranch / best-effort | ✅ |
| TC-007 | buildFeatureBranchName が WorkspaceMaterializerOptions を通じて渡される | ✅ |
| TC-008 | manager.create が baseOid を受け取る / callback が同 baseOid を受け取る | ✅ |
| TC-009 | manager.create 失敗時は callback 未呼び出し | ✅ |
| TC-010 | callback 失敗は best-effort（materialize が resolve） | ✅ |
| TC-011 | callback が git-add/commit より前に発火 | ✅ |
| TC-012 (x2) | no-worktree: callback 発火 / 失敗は best-effort | ✅ |
| TC-013 | buildFeatureBranchName が import 可能かつ正しいフォーマット | △ (F-001 参照) |
| TC-014 | callback が manager.create と同一 branchName を受け取る | ✅ |
| TC-015 | getIssue が nodeId を返す | ✅ |
| TC-016 | createLinkedBranch が GraphQL mutation を送る | ✅ |
| TC-017 | graphqlEndpoint() GHES パス変換 | ✅ |
| TC-018 | inbox startJob が inboxOrigin: true + onFeatureBranchCreated を渡す | ✅ |
| TC-019 | bug-fix 型が "fix/" prefix を生成する | ✅ |
| TC-020 | createLinkedBranch が errors フィールドで githubApiError を throw | ✅ |

### 読んだファイル

- `src/core/issue-target/start.ts` — 全体
- `src/core/job/start-from-issue.ts` — 削除確認
- `src/core/runtime/workspace-materializer.ts` — callback 注入箇所
- `src/core/runtime/local.ts` — baseOid 解決 + no-worktree callback
- `src/kernel/github-client.ts` — port 拡張
- `src/adapter/github/github-client.ts` — createLinkedBranch 実装 + graphqlEndpoint
- `src/config/type-config.ts` — buildFeatureBranchName
- `src/cli/from-issue.ts`, `src/cli/command-registry.ts` — 呼び出し切り替え
- `src/core/inbox/run-inbox.ts` — デフォルト startJob
- `tests/unit/architecture/module-boundary.test.ts` — TC-001
- `tests/unit/core/runtime/workspace-materializer-link.test.ts` — TC-008〜TC-014, TC-019
- `tests/unit/no-worktree-mode.test.ts` — TC-012
- `tests/unit/inbox/run-inbox-inbox-origin.test.ts` — TC-018
- `src/core/job/__tests__/start-from-issue.test.ts` — TC-003, TC-004, TC-005-unit, TC-006
- `tests/unit/architecture/arch-allowlist.ts` — 新規エントリなし確認
- spec.md, tasks.md, test-cases.md

## 検証できなかった項目

None

## Findings 詳細

### F-001 (low): TC-013 — buildFeatureBranchName の3呼び出し箇所が grep-pin されていない

TC-013 はフォーマット検証のみ。`workspace-materializer.ts`・`local.ts`・`command-registry.ts` の3箇所で実際に `buildFeatureBranchName` が使われることを機械的に固定するテストが存在しない。コードは正しく使用しているが、いずれかの箇所で手書き文字列に戻っても現行テストでは検出できない。merge をブロックしない。

### F-002 (low): no-worktree path で `git rev-parse HEAD` 失敗時の callback スキップが無警告

`local.ts` の `setupWorkspaceNoWorktree` 内で `git rev-parse HEAD` が exitCode != 0 の場合、`headOidForCallback` は undefined のまま callback が呼ばれない。この分岐で `stderrWrite` が出力されないため、ネットワーク分離環境や特殊な git 状態でリンク登録がサイレントにスキップされる。merge をブロックしない。
