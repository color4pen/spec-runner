# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周 findings の解消確認

前周（spec-review-002）で指摘した 4 件の解消状況を確認した。

| 前周 Finding | 内容 | 解消状況 |
|---|---|---|
| F-1 (medium) | TC-018 ID 重複 (GraphQL endpoint と inbox startJob が同一 ID) | **解消済**: TC-023 が GraphQL endpoint derivation に割り当てられ、test-cases.md の重複 ID が消えた |
| F-2 (medium) | `getIssue` return type 拡張で既存 mock が typecheck 違反になる (decision-needed) | **解消済**: design.md Risks section に B 案（mock リテラルへの `nodeId` フィールド追加・optional 化不採用）が明示採択された |
| F-3 (low) | spec.md に no-worktree 経路の Scenario がない | **解消済**: spec.md Requirement "link registration is ordered..." に Scenario "no-worktree route fires link registration after branch creation" が追加された |
| F-4 (low) | spec.md に GraphQL endpoint 導出の Scenario がない | **解消済**: spec.md Requirement "getIssue exposes the GraphQL node id..." に Scenario "GraphQL endpoint is derived correctly for github.com and GHES" が追加され、TC-023 が対応 |

### 読んだドキュメント

- `request.md` — 受け入れ基準・スコープ外を精読
- `design.md` — D1〜D8、Risks、Open Questions を精読（前周から変更されたセクションに注力）
- `tasks.md` — T-01〜T-07 全 Acceptance Criteria を精読
- `spec.md` — 全 Requirement × 全 Scenario（前周 F-3・F-4 修正後の 18 Scenario）を精読
- `test-cases.md` — 全 22 TC と Summary を精読

### 確認したソースファイル

| ファイル | 確認内容 |
|---|---|
| `src/config/type-config.ts` | `getBranchPrefix("bug-fix")` の実際の戻り値（`"fix/"`）を確認 |
| `src/kernel/github-client.ts:269` | `getIssue()` 現行返り値型（`{ number, title, body }`、`nodeId` 未追加を確認）|
| `src/adapter/github/github-client.ts:670-682` | `getIssue()` adapter 実装（`node_id` を落としている現状を確認）|
| `src/core/job/__tests__/start-from-issue.test.ts` | TC-001 群の assert 内容・`vi.mock("../../../cli/run.js")` の mock 対象 |
| `src/cli/__tests__/from-issue.test.ts:63-92` | `getIssue` mock（`nodeId` 未追加）・`start-from-issue.js` mock 対象 |
| `tests/unit/inbox/run-inbox-inbox-origin.test.ts` | ファイル内部ラベル TC-018・`getIssue` mock（`nodeId` 未追加）・`vi.mock("../../../src/cli/run.js")` |

### spec.md × test-cases.md 全 Scenario カバレッジ確認

spec.md の 18 Scenario すべてと対応 TC を照合した。

| Scenario | 対応 TC |
|---|---|
| no cli import exists in issue-target | TC-001 ✅ |
| start primitive is injected, not imported | TC-002 ✅ |
| writeDraft precedes start | TC-003 ✅ |
| occupancy error propagates | TC-004 ✅ |
| positional + --issue routes through issue-target | TC-005 ✅ |
| each route fires the link registration | TC-006 ✅ |
| inbox-origin start still passes inboxOrigin | TC-007 ✅ |
| base OID resolved once and shared | TC-008 ✅ |
| worktree failure skips link registration | TC-009 ✅ |
| registration failure does not stop start | TC-010 ✅ |
| registration precedes bootstrap commit | TC-011 ✅ |
| **no-worktree route fires link registration after branch creation** | **TC なし ❌** |
| construction sites converge on the builder | TC-012 ✅ |
| linked branch name equals local branch name | TC-013 ✅ |
| getIssue returns nodeId | TC-014 ✅ |
| createLinkedBranch posts the GraphQL mutation | TC-015 ✅ |
| createLinkedBranch fails closed at the adapter | TC-016 ✅ |
| GraphQL endpoint is derived correctly for github.com and GHES | TC-023 ✅ |

### tasks.md T-01 Acceptance Criteria の期待値と実コードの照合

`type-config.ts` を読んで `getBranchPrefix("bug-fix")` の実際の戻り値が `"fix/"` であることを確認した（line 63: `branchPrefix: "fix/"`）。

- tasks.md T-01 AC: `buildFeatureBranchName("bug-fix", "my-slug", "abcdef0123")` → `feat/my-slug-abcdef01`（**誤り**）
- TC-017: 同じ引数 → `fix/my-slug-abcdef01`（`bug-fix uses branchPrefix "fix/", not "feat/"`と明記。**正しい**）

tasks.md の `feat/` は `new-feature` の prefix（type-config.ts line 36）。`bug-fix` の prefix は `fix/`。

---

## 検証できなかった項目

- `bun run typecheck` / `bun run test` の実機実行（source 変更前のため。T-07 が担当）
- managed runtime の `onFeatureBranchCreated` 非発火動作（design Open Questions にて scope 外と明示）
- `WorktreeMaterializationPlan` 型変更の全 downstream 影響（実装後 typecheck で確認）

---

## Findings 詳細

### F-1: tasks.md T-01 AC の期待値が型定義と矛盾（medium）

**ファイル**: `specrunner/changes/issue-target-start-face/tasks.md`（T-01 Acceptance Criteria）

tasks.md T-01 AC は:

> `buildFeatureBranchName("bug-fix", "my-slug", "abcdef0123")` が `feat/my-slug-abcdef01`（bug-fix の prefix に依存）を返す最小 unit test が存在し green。

と述べるが、`src/config/type-config.ts` によると `TYPE_CONFIG["bug-fix"].branchPrefix = "fix/"` であり、正しい期待値は `fix/my-slug-abcdef01`。

TC-017（test-cases.md）は `fix/my-slug-abcdef01` と正確に記載している（`"(bug-fix uses branchPrefix \"fix/\", not \"feat/\")"` の注釈付き）。tasks.md と test-cases.md が矛盾しており、実装者が tasks.md を参照して誤った期待値でテストを書くリスクがある。

**修正**: tasks.md T-01 AC の `feat/my-slug-abcdef01` を `fix/my-slug-abcdef01` に修正する。

---

### F-2: spec.md Scenario "no-worktree route fires link registration" に対応 TC がない（medium）

**ファイル**: `specrunner/changes/issue-target-start-face/test-cases.md`

spec-fixer が spec.md に Scenario "no-worktree route fires link registration after branch creation" を追加したが（前周 F-3 の修正）、test-cases.md にはこの Scenario に対応する TC が存在しない。

tasks.md T-04 は `setupWorkspaceNoWorktree` の実装タスクを含み、tasks.md T-06 は「spec.md の各 Scenario に対応する unit test が存在することを確認・補完する」と定める。しかし no-worktree 経路は：
- `checkout -b` 成功後に `onFeatureBranchCreated` が呼ばれること
- `createLinkedBranch` 失敗時に警告を出し start が継続すること

の 2 点が spec Scenario で規定されており、どちらも現在の TC-009〜TC-011 には含まれない（これらは worktree 経路・new-run arm を対象とする）。

**修正**: test-cases.md に no-worktree 経路を対象とした TC を 1 件追加し、Scenario との 1:1 対応を確保する。Summary の total/automated/must も更新する。

---

### F-3: tasks.md T-05 AC が test-cases.md に存在しない TC-018 を参照（low）

**ファイル**: `specrunner/changes/issue-target-start-face/tasks.md`（T-05 Acceptance Criteria）

tasks.md T-05 AC:

> `tests/unit/inbox/run-inbox-inbox-origin.test.ts`（TC-018）が **挙動 assert 無改変**で green

前周 F-1（TC-018 重複）の修正で spec-fixer は TC-023 を GraphQL endpoint derivation に割り当てた結果、test-cases.md から TC-018 が削除された。一方 tasks.md の参照はそのままである。

実害は小さい。`tests/unit/inbox/run-inbox-inbox-origin.test.ts` は実際に存在し、ファイル内部でも "TC-018" とラベルされているため、実装者は当該テストを識別できる。ただし test-cases.md を参照して「TC-018 はどこか」と探す者が混乱するリスクがある。

**修正**: tasks.md T-05 AC の `（TC-018）` を削除するか `（既存テスト: tests/unit/inbox/run-inbox-inbox-origin.test.ts）` に置き換える。
