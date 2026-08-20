# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証

| アサーション | 結果 |
|---|---|
| `materializeDraftAndStart` が `src/core/job/start-from-issue.ts` に存在 | ✅ 確認 |
| 同関数が `await import("../../cli/run.js")` を動的 import（line 31） | ✅ 確認 |
| inbox の `startJob` も `materializeDraftAndStart` を動的 import で呼ぶ（`run-inbox.ts:396`） | ✅ 確認 |
| `body-template.ts:75` に `Fixes #${jobState.issueNumber}` が存在 | ✅ 確認（line 75） |
| `pipeline-run.ts:174-175` にインライン branch 名 template が存在 | ✅ 確認 |
| `src/core/runtime/local.ts:478-479` に `baseBranch` / `remoteBaseRef` の定義 | ✅ 確認 |
| `adapter/github/github-client.ts` が REST のみで GraphQL 未実装 | ✅ 確認 |
| `getBranchPrefix` 共有 builder が存在しない（インライン 3 箇所） | ✅ 確認。ただし request は pipeline-run.ts 1 箇所のみ例示しているが、実際は `design.ts:151` と `commit-orchestrator.ts:403-404` にも同一パターンが存在する（3 箇所） |
| `getIssue()` の返り値に `node_id` が含まれる | ❌ 不正確。`kernel/github-client.ts` の `GitHubClient` インターフェースおよびアダプタ実装は `{ number, title, body }` のみを返す。REST レスポンスの `node_id` フィールドは型定義に含まれず、型キャストもされていない |
| 既存アーキテクチャテストが `src/core/job/` → `cli/` 依存を禁止している | ❌ 検出されず。`module-boundary.test.ts` は `src/core/request/` のみが対象。`core-invariants.test.ts` の B-1 は adapter/ への import のみ検査。現行の動的 import（`start-from-issue.ts:31`）は既存テストに引っかかっていない |

### 既存テストとの整合性

- `src/core/job/__tests__/start-from-issue.test.ts`（TC-001）: `vi.mock("../../../cli/run.js", ...)` を使い、`runRunCore` が呼ばれることを assert している
- `src/cli/__tests__/from-issue.test.ts`（TC-011）: `vi.mock("../../core/job/start-from-issue.js", ...)` を使い、`materializeDraftAndStart` の呼び出し経路を pin している

### `--issue <n>` 経路の現状

`job start <positional> --issue <n>` は現在 `runRun()` に直接渡り、`issue-target` 層は存在しない。issue-target 経由にするためのルーティング変更は新規であり、既存テストには対応するものがない。

## 検証できなかった項目

- GitHub GraphQL `createLinkedBranch` mutation の実際の挙動（API 制約は request.md に記載済みとして信頼）

## Findings 詳細

### Finding 1: 受け入れ基準の内部矛盾（critical / decision-needed）

「既存テストが無改変で green（移設が挙動保存であることの証拠）」と「core→cli 依存の解消」が同時に成立しない。

`src/core/job/__tests__/start-from-issue.test.ts` TC-001 は：
```ts
vi.mock("../../../cli/run.js", ...)  // cli/run.js を mock
expect(vi.mocked(runRunCore)).toHaveBeenCalledWith(..., { inboxOrigin: true, issue: ... })
```
と明示的に `runRunCore`（cli 層）の呼び出しを assert している。core→cli 依存を解消すれば、この assert は必ず壊れる。「無改変」と「依存解消」は両立しない。

`src/cli/__tests__/from-issue.test.ts` TC-011 も `vi.mock("../../core/job/start-from-issue.js", ...)` で import path を pin しているため、関数が `issue-target` に移設されると mock パスが変わり、テストは壊れる（re-export stub を残せば回避可能だが、それは依存解消を骨抜きにする）。

**設計判断が必要**:

A. 「既存テストが無改変」= test の assertions（`expect(...)` の内容）が変わらない、という弱い解釈を採用する。  
   結果: `start-from-issue.test.ts` は移設に伴い mock 対象が変わるが、動作保証としての新テスト群が代替する。from-issue.test.ts は mock パスを `issue-target` に更新する。

B. 「既存テストが無改変」= test ファイルそのものが一行も変わらない、という強い解釈を採用する。  
   結果: `src/core/job/start-from-issue.ts` に re-export stub を残し続ける。ただし core→cli 依存は `issue-target` ではなく stub ファイルに残り続け、依存解消は完全には達成されない。受け入れ基準 2 つ目（`cli/ への import が存在しない`）と矛盾する。

**推奨**: A を採用し、「既存テストが無改変」の意味を request.md で明示化する（test assertions の内容を保存する、という意味に限定する）。

---

### Finding 2: `node_id` が port インターフェースに存在しない（high / fixable）

request.md 「現状コードの前提」は「issueId（GraphQL node ID）は REST の issue 取得結果（`node_id`）から得られる」と述べる。

しかし `kernel/github-client.ts` の `GitHubClient` インターフェースおよびアダプタ実装の `getIssue()` は `{ number, title, body }` のみを返す（REST レスポンスの `node_id` フィールドは型マッピングで落とされている）。

`createLinkedBranch` mutation に渡す `issueId`（GraphQL node ID）を取得するためには：
1. `getIssue()` の返り値型を `{ number, title, body, nodeId: string }` に拡張する（port + adapter + 全 mock の更新が必要）
2. または、GraphQL クエリで issue nodeId を別途取得するメソッドを port に追加する

このギャップを request.md が認識していないと、設計ステップが port 拡張なしに実装を試みて後退する可能性がある。

**修正方法**: 「現状コードの前提」に「`getIssue()` は現在 `node_id` を返さない。設計では port 拡張（`nodeId` フィールド追加または新メソッド）を含める必要がある」を明記する。

---

### Finding 3: branch 名構成が 3 箇所（medium / fixable）

request.md は「`pipeline-run.ts:174-175`」を例示するが、同一インラインパターンはさらに：
- `src/core/step/design.ts:151`
- `src/core/step/commit-orchestrator.ts:403-404`

にも存在する。要求 4「作る側の全呼び出し点が同一関数を参照する」は 3 箇所すべてを対象とする必要があり、設計ステップはこれを知っておく必要がある。request.md に 3 箇所列挙すれば design が漏れなく対応できる。
