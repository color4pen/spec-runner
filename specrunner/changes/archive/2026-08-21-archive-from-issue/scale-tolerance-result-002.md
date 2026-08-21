# Scale-Tolerance Review — archive-from-issue (iteration 2)

**Reviewer**: scale-tolerance  
**Purpose**: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを、merge 前に検出する。

## 前周 findings の解消確認

| Finding | 対象 | 解消状況 |
|---|---|---|
| F-1: `resolveCompletedJobId` ponytail コメント欠落 | `src/core/issue-target/archive.ts:53-57` | ✅ 解消 |
| F-2: `listIssueClosingPullRequests` first:50 無声切り捨て | `src/adapter/github/github-client.ts:855-867` | ✅ 解消 |

### F-1 解消内容

`resolveCompletedJobId` に、`resolveEscalationJobId` と同型の ponytail コメントが追加された:

```typescript
// ponytail: full pagination (O(⌈C/100⌉) calls) — the per-issue comments endpoint
// (GET /repos/{owner}/{repo}/issues/{number}/comments) ignores direction=desc; only
// the repository-level /issues/comments endpoint supports it. Early exit is therefore
// not possible. Upgrade path: switch to the repo-level endpoint with direction=desc +
// issue_number filter if completed issues ever accumulate > 100 comments.
```

`resume.ts` の対称関数と文言・内容が一致しており、デット追跡として十分。

### F-2 解消内容

`listIssueClosingPullRequests` に以下が追加された:

- `// ponytail: first:50 hard cap` コメント（github-client.ts:855-856）
- `result.length === 50` 時の `logWarn` による実行時警告（github-client.ts:863-867）

切り捨てが起きた場合に operator が気づける経路が確保された。

## 今周の新規 scale 観点確認

code-fixer が touch したファイル（`archive.ts` / `github-client.ts` / `checkpoint-policy.test.ts`）および前周から継続確認対象のパスを再検査した。

| パス | 観点 | 結果 |
|---|---|---|
| `resolveCompletedJobId` | O(⌈C/100⌉) 全コメント走査 | ponytail コメント追加済み ✓ |
| `listIssueClosingPullRequests` | first:50 ハードキャップ | ponytail + logWarn 追加済み ✓ |
| `resolveArchiveBranchFromIssue` | O(P) git fetch per closing PR（P ≤ 50） | 上限あり、観察事項 O-1 の範囲内 ✓ |
| `loadStateByJobId` fallback scan | O(N_active) active changes dir 走査 | 既存パターン・呼び出しは 1 回のみ ✓ |
| `listLocalSidecars` | O(N_sidecar) `.specrunner/local/` 走査 | 既存パターン・新規導入なし ✓ |
| `archive-from-issue.ts` 呼び出し構造 | new code path でのフロー | 各 API / git call が 1 回または bounded ✓ |

新規スケール問題は検出されなかった。

## 観察事項

### O-1（前周より継続）: `resolveArchiveBranchFromIssue` の逐次 git fetch

closing PR ごとの `git fetch` + `rev-parse` + `readStateJsonFromRef` は O(P) の git ネットワーク操作（P ≤ 50）。operator が手動で 1 回実行する one-shot 操作であり、実用上の問題なし。design.md Risk セクションに設計上の認識あり（`<!-- ponytail: duplicated fetch/parse loop between resume/archive locators -->` 記載）。

## 総括

iteration 1 で指摘した 2 件の low/fixable findings はいずれも解消された。code-fixer による修正で新たなスケール問題は導入されていない。残余 findings なし。

## Evidence

- checked: 6（archive.ts / github-client.ts 修正確認 / resume.ts 対称比較 / archive-from-issue.ts 呼び出し構造 / load-by-job-id.ts fallback scan / local-job-index.ts sidecar scan）
- skipped: 0
- unverified: 0
