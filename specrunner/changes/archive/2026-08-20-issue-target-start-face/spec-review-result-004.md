# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周 findings の解消確認

前周（spec-review-003）で指摘した 3 件の解消状況を確認した。

| 前周 Finding | 内容 | 解消状況 |
|---|---|---|
| F-1 (medium) | tasks.md T-01 AC の期待値が `feat/` で `fix/` と矛盾 | **解消済**: tasks.md T-01 AC が `fix/my-slug-abcdef01`（`bug-fix の branchPrefix は "fix/" であり "feat/" ではない`）に更新されている |
| F-2 (medium) | spec.md Scenario "no-worktree route fires link registration" に対応 TC がない | **解消済**: test-cases.md に TC-012 が追加され、`Source: spec.md > Requirement: link registration is ordered after worktree creation and is best-effort > Scenario: no-worktree route fires link registration after branch creation` に対応している |
| F-3 (low) | tasks.md T-05 AC が test-cases.md に存在しない TC-018 を参照 | **解消済**: tasks.md T-05 AC が `tests/unit/inbox/run-inbox-inbox-origin.test.ts` のファイルパス参照になり `（TC-018）` の括弧書きが消えた |

### 読んだドキュメント

- `request.md` — 受け入れ基準・スコープ外・現状コード前提を精読
- `spec.md` — 全 Requirement × 全 Scenario（18 Scenario）を精読
- `design.md` — D1〜D8、Risks、Open Questions、spec-fixer-deferred comment を精読
- `tasks.md` — T-01〜T-07 全 Acceptance Criteria を精読（前周修正箇所に重点）
- `test-cases.md` — TC-001〜TC-021 全 21 件と Summary を精読

### 確認したソースファイル

| ファイル | 確認内容 |
|---|---|
| `src/config/type-config.ts` | `TYPE_CONFIG["bug-fix"].branchPrefix = "fix/"` を確認（line 63）。`new-feature` は `"feat/"` |
| `src/adapter/github/github-client.ts:670-682` | `getIssue()` が REST `node_id` を落として `{ number, title, body }` のみ返す現状を確認 |
| `src/kernel/github-client.ts:269` | `getIssue()` port 定義が `{ number, title, body }` のみ（`nodeId` 未追加）を確認 |
| `src/core/job/start-from-issue.ts` | 現行実装: `await import("../../cli/run.js")` を動的 import で `runRunCore` を得て呼ぶ。移設対象 |
| `src/core/command/pipeline-run.ts:174-175` | `${getBranchPrefix(type)}${slug}-${jobId.slice(0, 8)}` インライン構成の 1 箇所目を確認 |
| `src/core/port/runtime-strategy.ts:151-193` | `WorkspaceOptions` に `onFeatureBranchCreated` が存在しないことを確認（T-04 で追加予定） |
| `src/cli/command-registry.ts:623` | positional + `--issue <n>` が `runRun` を直呼びし issue-target を経由しない現状を確認 |
| `src/core/inbox/run-inbox.ts:396-398` | inbox default `startJob` が `../job/start-from-issue.js` を動的 import し `materializeDraftAndStart` を呼ぶ現状を確認 |
| `tests/unit/inbox/run-inbox-inbox-origin.test.ts` | TC-018（内部ラベル）: `vi.mock("../../../src/cli/run.js")` で配線を pin、`getIssue` mock に `nodeId` が未追加を確認 |
| `src/cli/__tests__/from-issue.test.ts:90` | `vi.mock("../../core/job/start-from-issue.js")` — 移設後に mock パスの更新が必要 |
| `src/core/job/__tests__/start-from-issue.test.ts` | `vi.mock("../../../cli/run.js")` で配線 pin。移設後は注入 primitive の assert に置換 |
| `tests/unit/architecture/module-boundary.test.ts` | 現行は `core/request/` のみ対象。T-03 で `core/issue-target/` のテストを追加予定 |
| `tests/unit/architecture/arch-allowlist.ts` | `core/issue-target/` に関するエントリが存在しないことを確認。追加不要な設計と整合 |

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
| no-worktree route fires link registration after branch creation | TC-012 ✅ |
| construction sites converge on the builder | TC-013 ✅ |
| linked branch name equals local branch name | TC-014 ✅ |
| getIssue returns nodeId | TC-015 ✅ |
| createLinkedBranch posts the GraphQL mutation | TC-016 ✅ |
| createLinkedBranch fails closed at the adapter | TC-017 ✅ |
| GraphQL endpoint is derived correctly for github.com and GHES | TC-018 ✅ |

全 18 Scenario に 1:1 対応する TC が存在する。

### test-cases.md Summary 整合確認

- Total: 21 = TC-001〜TC-021 の実数と一致 ✅
- Automated: 21（全件 unit）✅
- Manual: 0 ✅
- Priority: must: 20、should: 1（TC-018 のみ should）✅

### request.md 受け入れ基準 × spec/tasks カバレッジ

| 受け入れ基準 | カバー箇所 |
|---|---|
| inbox 既存テストが挙動 assert 無改変で green | TC-020 + T-05 AC |
| from-issue/start-from-issue テスト変更は mock/path のみ | T-05 AC（tasks.md） |
| issue-target → cli/ import が存在しない | TC-001（grep pin） |
| positional + `--issue` が issue-target 経由 | TC-005 |
| Development linked branch 登録 | TC-006、TC-016 |
| 同一 immutable base OID | TC-008 |
| worktree 失敗時 createLinkedBranch 非呼び出し | TC-009 |
| 登録失敗は警告のみ・start を止めない | TC-010 |
| branch 名 builder 単一定義化 | TC-013 |
| architecture tests green・allowlist 無変更 | TC-021（gate） |
| typecheck / test green | TC-021（gate） |

全受け入れ基準が spec または tasks の AC にトレースされている。

### セキュリティ確認

- `createLinkedBranch` の引数（issueId / oid / name）は GitHub REST API レスポンス・git rev-parse・deterministic builder からのみ生成され、ユーザー入力が直接フローしない。
- 新規認証メカニズムなし。既存 GitHub token を使用。
- adapter が fail-closed（非 2xx / GraphQL errors は throw）、caller が best-effort（catch して警告）という責務分離は適切。
- OWASP Top 10 該当なし。

---

## 検証できなかった項目

- `bun run typecheck` / `bun run test` の実機実行（実装前のため。T-07 gate が担当）
- `WorktreeMaterializationPlan` 型拡張の全 downstream 影響（実装後 typecheck で検出）
- managed runtime での `onFeatureBranchCreated` 非発火（design Open Questions にて scope 外と明示）

---

## Findings 詳細

### F-1: design.md の "TC-018" 参照が test-cases.md の TC-018 と名前衝突（low）

**ファイル**: `specrunner/changes/issue-target-start-face/design.md`（D2 セクション、line 19 / line 63）

design.md D2 は `tests/unit/inbox/run-inbox-inbox-origin.test.ts` の内部ラベル "TC-018" を 2 箇所で参照している（「TC-018（Context の齟齬）」「TC-018 の `vi.mock("cli/run")` が経路から外れて赤化」）。

前周の修正（test-case-gen による TC 追加）で test-cases.md の TC-018 が "GraphQL endpoint is derived correctly for github.com and GHES" に割り当てられた結果、design.md の "TC-018" 参照が同一 ID で異なるテストを指すようになった。

実害は限定的：design.md の各 "TC-018" 参照には常にファイルパス（`tests/unit/inbox/run-inbox-inbox-origin.test.ts`）が併記されており、文脈から inbox テストを指すことは判別可能。ただし実装者が test-cases.md で TC-018 を検索すると GraphQL endpoint テストがヒットし、一瞬混乱が生じる。

**修正**: design.md の "TC-018" を「`run-inbox-inbox-origin.test.ts` 内ラベル TC-018」または単に「`run-inbox-inbox-origin.test.ts`」に置き換え、test-cases.md ID と区別を明確にする。

---

### 観察事項（Findings 閾値未満）

**design.md の spec-fixer-deferred コメントが陳腐化**（line 130-131）

```html
<!-- spec-fixer-deferred: no-worktree Scenario に対応する TC を test-cases.md に追加できなかった...implementer が TC を追加するか、次回 test-case-gen で補完すること。 -->
```

test-case-gen が TC-012 を追加した現在、このコメントは既に解消されている。HTML コメントであり実装への誤誘導なし。削除推奨だが blockerではない。
