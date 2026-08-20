# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだドキュメント

- `request.md` — 要求定義・前提コードの記述を通読
- `design.md` — D1〜D8 全 Decision と Risks、Open Questions を精読
- `tasks.md` — T-01〜T-07 全タスクと Acceptance Criteria を精読
- `spec.md` — 全 Requirement と Scenario を精読
- `test-cases.md` — 全 22 テストケースと Summary を確認

### 確認したソースファイル

| ファイル | 確認内容 |
|---|---|
| `src/core/job/start-from-issue.ts` | `materializeDraftAndStart` の動的 import 実装・現状の型定義 |
| `src/cli/from-issue.ts` | `runFromIssue` の実装・GitHub client セットアップ経路 |
| `src/cli/command-registry.ts:575-624` | `--from-issue` ルートと positional+`--issue` ルートの現行実装 |
| `src/core/inbox/run-inbox.ts:380-414` | 既定 `startJob` effect の動的 import 経路 |
| `src/core/command/pipeline-run.ts:165-190` | branch 名インライン構成 3 箇所のうち 1 箇所 |
| `src/core/step/design.ts:146-160` | branch 名インライン構成 2 箇所目 |
| `src/core/step/commit-orchestrator.ts:395-405` | branch 名インライン構成 3 箇所目 |
| `src/kernel/github-client.ts:260-270` | port の `getIssue()` 現行返り値型 |
| `src/adapter/github/github-client.ts:670-682` | adapter の `getIssue()` — `node_id` を落としている |
| `src/config/type-config.ts` | `getBranchPrefix` 定義・T-01 builder の置き場 |
| `src/core/runtime/workspace-materializer.ts:140-258` | new-run arm の worktree 作成→bootstrap commit 順序 |
| `src/core/runtime/local.ts:478-534` | `setupWorkspace` new-run arm / `origin/<base>` 経路 |
| `src/core/port/runtime-strategy.ts:151-193` | `WorkspaceOptions` 型 — `onFeatureBranchCreated` 未追加を確認 |
| `src/core/job/__tests__/start-from-issue.test.ts` | TC-001 群の assert 内容（呼び出し引数・順序・エラー伝播）を確認 |
| `src/cli/__tests__/from-issue.test.ts` | TC-002〜TC-012 群・mock 対象パス・assert 内容を確認 |
| `tests/unit/inbox/run-inbox-inbox-origin.test.ts` | TC-018（inbox）のファイル内ラベル・mock 構造・assert 内容 |
| `tests/unit/architecture/module-boundary.test.ts` | 現行スコープ（core/request/ のみ）を確認 |
| `tests/unit/architecture/core-invariants.test.ts` | B-1〜B-18 / DSM / CWD / RESOLVE_ONCE 各テストのスコープ |
| `tests/unit/architecture/arch-allowlist.ts` | 現行 allowlist エントリ一覧を確認 |

### 検証した Requirement × Scenario

spec.md の全 7 Requirement × 全 14 Scenario を辿り、対応する tasks.md タスクおよび test-cases.md TC と紐付けた。

1. **issue-target layer must not depend on the cli layer** — Scenario 2 件を確認。task T-03 構造検査 / TC-001 と対応。
2. **relocation preserves the issue-body start contract** — writeDraft 先行・SlugOccupiedError 伝播の各 Scenario を確認。TC-003/TC-004 と対応。
3. **all issue-linked start routes go through issue-target…** — 3 経路（--from-issue / inbox / positional+--issue）の各 Scenario を確認。TC-005/TC-006/TC-007 と対応。
4. **linked branch and local feature branch use the same immutable base OID** — base OID 1 回解決 Scenario を確認。TC-008 と対応。
5. **link registration is ordered after worktree creation and is best-effort** — worktree 失敗・登録失敗・順序の各 Scenario を確認。TC-009/TC-010/TC-011 と対応。
6. **branch name is constructed by a single shared builder** — 構成箇所収束・名称一致の各 Scenario を確認。TC-012/TC-013 と対応。
7. **getIssue exposes the GraphQL node id…** — nodeId マッピング・GraphQL mutation・fail-closed の各 Scenario を確認。TC-014/TC-015/TC-016 と対応。

### 設計整合性の検証

- D2 の「inbox 既定 effect に cli/run 動的 import を残す」方針が TC-018（inbox）の `vi.mock("../../../src/cli/run.js")` と整合することを確認
- D4 の「base OID を 1 回だけ固定」が `workspace-materializer.ts` new-run arm の `manager.create` → callback の順序設計と整合することを確認
- D7 の builder 配置（`src/config/type-config.ts`）が `getBranchPrefix` の隣として技術的に妥当であることを確認
- DSM closure scan が `src/core/issue-target/` を domain 層に分類し、`core/port/` / `parser/` / `logger/` 等への import が許容エッジ内であることを確認
- B-10 テスト（`createGitHubClient` に baseUrl 引数を要求）について、issue-target 層が client を受け取る（自前で生成しない）設計のため新違反は生じないことを確認

### セキュリティ検証（OWASP Top 10 / 入力検証）

- GraphQL mutation の variables（`issueId` / `name` / `oid`）は GitHub REST API 応答・内部 builder 出力・git rev-parse 出力であり、ユーザー入力が直接挿入される経路はない
- `createLinkedBranch` は JSON-encoded variables で送信するため GraphQL injection リスクなし
- adapter が fail-closed（throw）し、issue-target callback が best-effort（握りつぶし）するという責務分離は正しい（GraphQL エラーを caller に判断委任）
- `getIssue` で取得した `node_id` を `issueId` に使う設計はリダイレクト注入リスクなし（GitHub 内部 opaque ID）
- GHES 向け GraphQL エンドポイント導出（文字列操作）は失敗しても best-effort で吸収されるためセキュリティ上の問題はない

---

## 検証できなかった項目

- `bun run typecheck` / `bun run test` の実機実行（本ステップは spec-review — ソースコード変更後の検証は T-07 が担当）
- `WorktreeMaterializationPlan` の `"new-run"` variant に `baseOid` を追加する型変更の downstream 影響の全列挙（型は実装後に typecheck で確認される）
- managed runtime における `onFeatureBranchCreated` 非発火の動作（design Open Questions に委ねられ scope 外）

---

## Findings 詳細

### F-1: TC-018 ID 重複（medium）

`test-cases.md` は "T-02: port 拡張と GraphQL adapter" セクションに **TC-018 = "GraphQL endpoint derivation covers github.com and GHES"** を定義している。一方、既存ファイル `tests/unit/inbox/run-inbox-inbox-origin.test.ts` のファイルヘッダーにも `TC-018: inbox startJob が inboxOrigin: true を runRunCore に渡す` と記載されており、`tasks.md` T-05 Acceptance Criteria も同じ test を `（TC-018）` と参照している。

同一 ID が **2 件の異なるテストケース**を指しており、実装者が「どちらの TC-018 が変更禁止の対象か」を混同するリスクがある。test-cases.md の TC-018 (GraphQL) は tasks.md T-02 Acceptance Criteria から生成されたものであり、spec.md に対応する Scenario を持たない（後述 F-3 と関連）。

**推奨修正**: test-cases.md の GraphQL endpoint derivation を別 ID（例: TC-023）に変更し、tasks.md T-02 Acceptance Criteria と揃える。

---

### F-2: `getIssue` return type 拡張が既存 mock を typecheck 違反にする可能性（medium）

design D6 は `GitHubClient.getIssue()` の返り値型に `nodeId: string`（required）を追加する。これが実装されると、以下の既存 mock が TypeScript 型エラーになる可能性がある。

**`tests/unit/inbox/run-inbox-inbox-origin.test.ts` 行 63**:
```ts
function makeGitHubClient(): GitHubClient {
  return {
    ...
    getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    ...
  } as GitHubClient;
}
```
`mockResolvedValue` の型引数は `Awaited<ReturnType<getIssue>>` = `{ number; title; body; nodeId }` となるため、`nodeId` を含まないオブジェクトリテラルは TypeScript strict mode で型不一致となる。

`from-issue.test.ts` 行 64–83 のトップレベル mock も同様。

design の mitigation 注（「`as GitHubClient` cast のリテラルは structural 代入可能なため cast は通る」）は、`as GitHubClient` キャスト付き cast 式にのみ適用される。`makeGitHubClient(): GitHubClient` の返り値型チェックと `mockResolvedValue` の型チェックには適用されない。

**影響**: `bun run typecheck` が inbox test と from-issue test で赤になり、「inbox テストが無改変で green」という受け入れ基準を型レベルで満たせない。

**推奨修正案**:
- (A) `nodeId?: string`（optional）にする — 既存 mock は型チェックをパスし、callback builder が `nodeId!` で使う（実際には常に存在するため安全）
- (B) `nodeId: string` のまま保持し、mock を `{ ..., nodeId: "MDExOklzc3VlMQ=="}` に更新（inbox test に 1 行追加）— 「無改変」の解釈を assert 内容保存のみに限定する

いずれかの方針選択を要求する。実装前に判断が必要。

---

### F-3: spec.md に no-worktree 経路の Scenario がない（low）

design D8 は `setupWorkspaceNoWorktree` 経路でも `onFeatureBranchCreated` callback を発火させると明示し、tasks.md T-04 もこの経路の実装タスクを含む。しかし spec.md の Requirement / Scenario に no-worktree 経路の記述がなく、spec.md のみを参照する実装者が当該経路を実装しない可能性がある。

**影響**: 低。tasks.md T-04 と design D8 が補完しており、spec.md との矛盾ではなく「spec.md の記述不足」。gate テスト（TC-020/TC-021/TC-022）が通れば実装の整合は検証される。

**推奨修正**: spec.md の Requirement "link registration is ordered after worktree creation and is best-effort" に Scenario を 1 件追加し、no-worktree 経路での callback 発火（best-effort）を明記する。

---

### F-4: TC-018（GraphQL）が spec.md Scenario に対応していない（low）

test-cases.md TC-018（GraphQL endpoint derivation）は tasks.md T-02 Acceptance Criteria から生成されており、spec.md の Scenario には対応していない。test-case-gen のルールでは `Source` が `spec.md > Scenario` 形式でない場合、spec Scenario に対応しないテストは "tasks.md > ... Acceptance Criteria" 由来として許容される運用になっているため、直接の規約違反ではない。ただし spec Scenario の欠如は spec.md の網羅性の観点で低リスクのギャップ。

**推奨修正**: spec.md Requirement "getIssue exposes the GraphQL node id…" に Scenario "GraphQL endpoint is correctly derived for github.com and GHES" を追加する（必須ではない）。

---

### 問題なし（記録）

- 7 つの Requirement すべてに SHALL/MUST を含む normative 文と最低 1 つの Scenario が存在
- spec.md の Scenario 文体はすべて Given/When/Then 形式
- D2 の設計判断（inbox 動的 import を issue-target の外に残す）は TC-018（inbox）の無改変 green 要件と論理的に整合
- branch 名の逆引き禁止（D7）が spec.md Scenario "builder to not be used as inverse function" でなく tasks.md T-01 doc-comment として実装指示される形式は適切（layer-0 に近い構造的制約）
- 架構テスト（B-1/DSM）は `src/core/issue-target/` を自動スキャンするため、新 allowlist エントリなしで cli 依存を検出できる
