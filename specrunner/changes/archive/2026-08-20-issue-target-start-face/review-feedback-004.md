# Code Review Feedback — issue-target-start-face — iter 4

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Scope

`git diff main...HEAD --stat`: 131 ファイル変更、4701 行追加、117 行削除。  
実装コアは `src/core/issue-target/start.ts`（新設）、`src/core/runtime/workspace-materializer.ts`、`src/core/runtime/local.ts`、`src/adapter/github/github-client.ts`、`src/config/type-config.ts`、`src/cli/command-registry.ts`、`src/cli/from-issue.ts`、`src/core/inbox/run-inbox.ts`。

### 受け入れ基準検証 (11 項目)

| AC | 基準 | 結果 |
|----|------|------|
| AC-1 | inbox 既存テストが挙動 assert 無改変で green | ✅ nodeId フィールド追加のみ、挙動 assert 無改変 |
| AC-2 | from-issue.test.ts / start-from-issue.test.ts の assert 内容保存 | ✅ mock 対象 path 更新のみ |
| AC-3 | issue-target → cli/ import なし（静的・動的とも）| ✅ module-boundary.test.ts TC-001 で機械 pin |
| AC-4 | positional + --issue が issue-target 経由で route される | ✅ from-issue.test.ts TC-005 で pin |
| AC-5 | issue-linked start が Development linked branch を登録する | ⚠️ PARTIAL — "登録する" は pin 済だが "登録失敗時は警告つき" の assert が欠如 |
| AC-6 | linked branch と local feature branch が同一の immutable base OID | ✅ workspace-materializer-link.test.ts TC-008 で pin |
| AC-7 | worktree 作成失敗時に createLinkedBranch が呼ばれない | ✅ TC-009 で pin |
| AC-8 | リンク登録失敗が警告つきで start を止めない | ⚠️ PARTIAL — "stop しない" は pin 済、"警告が出力される" は未 pin |
| AC-9 | branch 名構成が単一 builder に収束、全呼び出し点が同一関数を参照 | ✅ TC-013 grep test で 3 箇所を機械 pin |
| AC-10 | tests/unit/architecture/ green、新 allowlist エントリなし | ✅ arch-allowlist.ts 変更なし確認済 |
| AC-11 | bun run typecheck / bun run test green | ✅ verification-result.md が passed を記録 |

### TC カバレッジ (21/21)

| TC | 説明 | 状態 |
|----|------|------|
| TC-001 | core/issue-target → cli/ import なし (grep) | ✅ module-boundary.test.ts |
| TC-002 | start primitive is injected, not imported | ✅ TC-001 (構造) + TC-003 (挙動) |
| TC-003 | writeDraft precedes start | ✅ start-from-issue.test.ts |
| TC-004 | occupancy error propagates | ✅ start-from-issue.test.ts |
| TC-005 | positional + --issue → startWithIssueLink に route される | ✅ from-issue.test.ts |
| TC-006 | each route fires link registration | ✅ start-from-issue.test.ts (buildLinkedBranchRegistrar) + from-issue.test.ts |
| TC-007 | inbox-origin start still passes inboxOrigin | ✅ run-inbox-inbox-origin.test.ts |
| TC-008 | base OID resolved once and shared | ✅ workspace-materializer-link.test.ts (3 assertions) |
| TC-009 | worktree failure skips link registration | ✅ workspace-materializer-link.test.ts |
| TC-010 | registration failure does not stop start | △ "stop しない" は pin 済、"警告" 未 pin (F-001) |
| TC-011 | registration precedes bootstrap commit | ✅ workspace-materializer-link.test.ts |
| TC-012 | no-worktree route fires link registration after branch creation | △ callback 発火と rev-parse 失敗ケースは pin 済、rejection 警告は未 pin (F-001) |
| TC-013 | construction sites converge on builder | ✅ workspace-materializer-link.test.ts (grep + import) |
| TC-014 | linked branch name equals local branch name | ✅ workspace-materializer-link.test.ts |
| TC-015 | getIssue returns nodeId | ✅ github-client-get-issue.test.ts |
| TC-016 | createLinkedBranch posts GraphQL mutation | ✅ github-client-graphql.test.ts |
| TC-017 | createLinkedBranch fails closed | ✅ github-client-graphql.test.ts |
| TC-018 | GraphQL endpoint derived correctly for github.com and GHES | ✅ github-client-graphql.test.ts |
| TC-019 | buildFeatureBranchName returns correct prefix per type | ✅ workspace-materializer-link.test.ts |
| TC-020 | inbox existing tests green with nodeId mock addition only | ✅ run-inbox-inbox-origin.test.ts |
| TC-021 | architecture tests green, no new allowlist entries | ✅ arch-allowlist.ts 変更なし |

### 前回レビュー指摘 (review-003 F-001, F-002) の対応確認

- **F-001 (TC-013 grep pin 欠如)** → FIXED ✅  
  `workspace-materializer-link.test.ts` に `pipeline-run.ts` / `design.ts` / `commit-orchestrator.ts` の 3 箇所 grep assertion を追加。
- **F-002 (rev-parse HEAD 失敗時の無警告スキップ)** → FIXED ✅  
  `local.ts` にて `stderrWrite("Warning: could not resolve HEAD OID ...")` を追加。  
  `no-worktree-mode.test.ts` TC-012 "rev-parse HEAD failure" ケースで `stderr.write` が警告を含むことを assert。

### 読んだファイル

- `src/core/issue-target/start.ts`
- `src/core/runtime/workspace-materializer.ts`
- `src/core/runtime/local.ts`（setupWorkspaceNoWorktree + new-run arm）
- `src/adapter/github/github-client.ts`（createLinkedBranch, graphqlEndpoint, getIssue）
- `src/kernel/github-client.ts`（port: nodeId, createLinkedBranch）
- `src/config/type-config.ts`（buildFeatureBranchName）
- `src/cli/command-registry.ts`（--issue routing）
- `src/cli/from-issue.ts`
- `src/core/inbox/run-inbox.ts`
- `tests/unit/architecture/module-boundary.test.ts`
- `tests/unit/architecture/arch-allowlist.ts`
- `tests/unit/core/runtime/workspace-materializer-link.test.ts`
- `tests/unit/no-worktree-mode.test.ts`（TC-012 全体）
- `tests/unit/inbox/run-inbox-inbox-origin.test.ts`
- `src/core/job/__tests__/start-from-issue.test.ts`
- `src/cli/__tests__/from-issue.test.ts`
- `tests/unit/adapter/github/github-client-get-issue.test.ts`
- `tests/unit/adapter/github/github-client-graphql.test.ts`
- spec.md, test-cases.md, conformance-result-001.md

## 検証できなかった項目

None

## Findings 詳細

### F-001 (medium): リンク登録失敗時の警告 assertion が未 pin — TC-010 / TC-012 / TC-006

**対象受け入れ基準**: "リンク登録失敗が警告つきで start を止めないことがテストで pin される"

**対象 Scenario**: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: "registration failure does not stop start" / "no-worktree route fires link registration after branch creation"

**実装は正しい**: 3 箇所すべてで `stderrWrite(...)` を呼んでいる。
1. `start.ts:66-70` — `buildLinkedBranchRegistrar` の catch で "Warning: linked branch registration failed for issue #..."
2. `workspace-materializer.ts:197-199` — materializer の defensive catch で "Warning: linked branch registration failed: ..."
3. `local.ts:383-387` — no-worktree の catch で "Warning: linked branch registration failed (no-worktree): ..."

**不足**: テストが "stop しない" のみを検証し、"警告が出力される" を assert していない。

- `start-from-issue.test.ts` TC-006 "createLinkedBranch throw is swallowed":  
  `vi.mock("../../logger/stdout.js")` でモック済だが `expect(vi.mocked(stderrWrite)).toHaveBeenCalledWith(...)` がない。
- `workspace-materializer-link.test.ts` TC-010:  
  `stderrWrite` のモックが存在しないため構造的に assert 不可能（callback が resolve するため materializer の defensive catch は実際には発火しない設計。TC-006 側の assert で代替可能）。
- `no-worktree-mode.test.ts` TC-012 "onFeatureBranchCreated rejection is warning-only":  
  `vi.spyOn(process.stderr, "write")` は `beforeEach` で設定されているが、spy 呼び出し assert がない。

**修正案**:
- TC-006 (`start-from-issue.test.ts`): `expect(vi.mocked(stderrWrite)).toHaveBeenCalledWith(expect.stringContaining("Warning"))` を追加する。
- TC-012 no-worktree rejection (`no-worktree-mode.test.ts`): `process.stderr.write` spy の呼び出しが "Warning" を含む文字列を受け取ることを assert する。
- TC-010 は callback が always-resolve 設計のため materializer catch は発火しない。TC-006 の callback レベル assert で受け入れ基準を充足すると判断してよい。

**ブロック判定**: 受け入れ基準の文言「警告つきで start を止めないことがテストで pin される」は "警告" assertion を明示要求している。オーナーの承認が必要。

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

（何をどう確認したか。読んだファイル・辿った diff・確認したコード等を記載する）

## 検証できなかった項目

（確認できなかった項目と理由。無ければ None と明記する）

## Findings 詳細

（typed findings の補足説明。指摘がない場合は None と明記する）
