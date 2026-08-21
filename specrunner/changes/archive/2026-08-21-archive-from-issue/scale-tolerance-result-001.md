# Scale-Tolerance Review — archive-from-issue (iteration 1)

**Reviewer**: scale-tolerance
**Purpose**: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを、merge 前に検出する。

## Scope

新規ファイル・変更ファイルのうちスケールに関係する主要パス:

| ファイル | 観点 |
|---|---|
| `src/core/issue-target/archive.ts` | comment 全走査 / closing PR ループ |
| `src/adapter/github/github-client.ts` | `listIssueClosingPullRequests` の GraphQL cap |
| `src/cli/archive-from-issue.ts` | 呼び出し構造 |
| `src/core/issue-target/resume.ts` | 対称関数との比較基準 |

## Findings

### F-1: `resolveCompletedJobId` — 全コメント走査コストが ponytail コメントで追跡されていない

**ファイル**: `src/core/issue-target/archive.ts` L53  
**重大度**: low / fixable

`resolveCompletedJobId` は `listIssueComments` を呼び出し、issue の全コメントを O(⌈C/100⌉) API リクエストで取得する（C = コメント件数、per_page=100 の pagination）。issue コメントは時間とともに単調増加するため、これはスケール感度の高い呼び出しである。

対称関数 `resolveEscalationJobId`（`src/core/issue-target/resume.ts:54-58`）には、この上限と upgrade path を明示する `// ponytail:` コメントが存在する:

```typescript
// ponytail: full pagination (O(⌈C/100⌉) calls) — the per-issue comments endpoint
// (GET /repos/{owner}/{repo}/issues/{number}/comments) ignores direction=desc; only
// the repository-level /issues/comments endpoint supports it. Early exit is therefore
// not possible. Upgrade path: switch to the repo-level endpoint with direction=desc +
// issue_number filter if escalation issues ever accumulate > 100 comments.
```

`resolveCompletedJobId` の同等呼び出しにはこのコメントがなく、デット追跡に漏れがある。コメントの内容は resume.ts のものと同一（同じエンドポイント・同じ制約）で良い。

### F-2: `listIssueClosingPullRequests` — `first: 50` 上限超過時の無声切り捨て

**ファイル**: `src/adapter/github/github-client.ts` L817  
**重大度**: low / fixable

GraphQL クエリ `closedByPullRequestsReferences(first: 50)` は 50 件でハードキャップされており、それ以上の closing PR は**無声で切り捨てられる**。

```graphql
closedByPullRequestsReferences(first: 50) {
  nodes { number headRefName }
}
```

通常の specrunner 運用では issue あたり closing PR は 1 件なので実害は生じない。しかし、長命な issue で複数回の PR 試行（open→close→open→close …）が積み重なると、50 件超で目的の PR が結果から落ち、4 点照合で confirmed 0 件となって `ARCHIVE_FROM_ISSUE_UNCONFIRMED` エラーが発生し得る（false negative）。

既存の `listIssueLinkedBranches` も `first: 50` を使用しており一貫した実装パターンだが、resume 経路は jobId を知っている時点で対象 PR は 1 件なのに対し、archive の closing PR locator はここが唯一の探索源である点で影響が大きい。

上限到達を operator に通知する仕組み（例: nodes.length === 50 で logWarn）または ponytail コメントによるデット明示が欠落している。

## 観察事項（ブロッキングなし）

### O-1: `resolveArchiveBranchFromIssue` — closing PR ごとの逐次 git fetch は既存パターンと一致

`resolveArchiveBranchFromIssue`（archive.ts L127-185）は closing PR ごとに `git fetch origin <branch>` + `rev-parse` + `readStateJsonFromRef` を逐次実行する。O(M) の git ネットワーク操作（M = closing PR 数）だが、M は `first: 50` キャップで上限がある。既存の `resolveResumeBranchFromIssue`（resume.ts L132-188）も同一パターンを採用しており、いずれも ponytail コメントなし。

本コマンドは operator が手動で 1 回実行する one-shot 操作であり、常駐バックグラウンド処理ではないため、現状の上限内では実用上の問題はない。design.md の Risk セクションには `<!-- ponytail: duplicated fetch/parse loop between resume/archive locators; unify only if a 3rd locator appears -->` が存在し、設計上の認識はある。コード上のコメントは不在だが、one-shot かつ上限付きのため escalation 対象には含めない。

### O-2: `listIssueComments` は pagination 実装済みで全件取得が保証されている

`src/adapter/github/github-client.ts:868-904` の `listIssueComments` は Link header を追いながら全ページを取得するループを実装しており、コメント件数に関わらず全件を返す。F-1 の指摘はスケール上限の文書化不足であり、実装の正確性を問うものではない。

## 総括

新規コードの scale-tolerance 上の実装不備は 2 件（いずれも low/fixable）。

- F-1: ponytail debt コメントの欠落（`resolveCompletedJobId`）
- F-2: `first: 50` 上限到達時の無声切り捨て（ponytail コメントまたは実行時 logWarn の欠落）

archive 本体（merge-then-archive / orchestrator）は変更なし。issue コメント・journal・archive の既存走査パスに新たなスケール問題は導入されていない。

## Evidence

- checked: 4（archive.ts / adapter/github-client.ts / resume.ts 対称比較 / archive-from-issue.ts 呼び出し構造）
- skipped: 0
- unverified: 0
