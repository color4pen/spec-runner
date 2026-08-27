# Scale-Tolerance Review: split-reopen-from-resume

**Reviewer**: scale-tolerance  
**Iteration**: 2  
**Date**: 2026-08-27

---

## Purpose

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを、merge 前に検出する。

---

## Iteration 2 Focus

Iteration 1 で承認済みのファイル群（`reopen.ts`, `lifecycle.ts`, `event-journal.ts`, `job-state-store.ts` 等）は code-fixer で変更されていないため再確認は省略し、**code-fixer が新たに変更した唯一のスコープ対象 `src/core/inbox/planner.ts` を重点確認する**。

前周 (iter 1) の findings はゼロ（全 approved）。今周も全量確認プロトコルに従い、iter 1 分析を維持しながら追加変更を検証する。

---

## Scope

| File | Scale-Relevant? | Examined | Note |
|------|-----------------|----------|------|
| `src/core/inbox/planner.ts` | ✅ New in iter 2 | ✅ | code-fixer 追加 |
| `src/core/inbox/__tests__/planner.test.ts` | Tests only | ✅ | No scale impact |
| `src/core/command/reopen.ts` | ✅ (iter 1 結論維持) | ✅ | 変更なし、iter 1 分析有効 |
| `src/state/lifecycle.ts` | ✅ (iter 1 結論維持) | ✅ | 変更なし、iter 1 分析有効 |
| `src/store/event-journal.ts` | ✅ (iter 1 結論維持) | ✅ | 変更なし、iter 1 分析有効 |
| `specrunner/changes/split-reopen-from-resume/events.jsonl` | No scale ops | — | state only |
| `specrunner/changes/split-reopen-from-resume/state.json` | No scale ops | — | state only |
| `specrunner/changes/split-reopen-from-resume/usage.json` | No scale ops | — | state only |

---

## New Code Added in Iteration 2: `planResumes` effectiveCutoff guard

### Change summary

`src/core/inbox/planner.ts` の `planResumes` 関数に、`job reopen` 後の stale `/resume` コメント再消費を防ぐガードが追加された（19 行の diff）。

```typescript
// Guard against re-consumption of stale /resume comments after `job reopen`.
const effectiveCutoff =
  job.updatedAt && job.updatedAt > cutoff ? job.updatedAt : cutoff;

// Find qualifying /resume comments after cutoff
for (const comment of comments) {
  // Must be after the effective cutoff
  if (comment.createdAt <= effectiveCutoff) continue;
  ...
```

### Scale-tolerance cost analysis

| Operation | Complexity | Scales with |
|---|---|---|
| `job.updatedAt && job.updatedAt > cutoff` | O(1) | — (field access + string comparison) |
| `effectiveCutoff` selection | O(1) | — |
| Replacement of `cutoff` with `effectiveCutoff` in loop guard | O(comments_per_issue) | Same as before — no change |

**Assessment**: 完全にスケール中立。以下を確認した:

1. **O(1) 追加計算**: `effectiveCutoff` は `job.updatedAt`（既にロード済みの `JobState` フィールド）と `cutoff`（既に決定済みのローカル変数）の単純な文字列比較。新たな I/O・API 呼び出し・ファイルスキャンは皆無。

2. **ループの計算量は不変**: `for (const comment of comments)` は既に O(comments_per_issue) だった。ループ内での `cutoff` → `effectiveCutoff` の置換は計算量を変えない。

3. **planner は純粋関数**: モジュール冒頭に `No I/O. All decisions are deterministic given their inputs.` とあり、追加コードもこの性質を維持している。新規 I/O なし。

4. **入力側の bounds は変更なし**: `planResumes` への入力 `awaitingJobs` は `planInbox` で `jobStates.filter(s => s.status === "awaiting-resume")` で抽出される — これは active job 数にバウンドされており、archive 増加に比例しない。

5. **`commentsByIssue` は外部渡し**: コメントのロードはこの関数の外側で行われる。`planResumes` 自体は Map lookup `commentsByIssue.get(job.issueNumber)` のみ — O(1)。

---

## Iteration 1 Findings Maintained

Iteration 1 で確認した以下の観察は、今回の code-fixer 変更でも引き続き成立することを確認した:

| 観点 | iter 1 結論 | iter 2 変化 |
|---|---|---|
| `reopen.ts` happy-path | O(active_jobs) | 変更なし |
| `reopen.ts` error-path の `list({ includeArchived: true })` | Pre-existing, error-path only | 変更なし |
| `transitionJob` | O(1) Map lookup | 変更なし |
| `appendOperatorEvent` | O(1) appendFile | 変更なし |
| GitHub API 呼び出し | 1 per invocation | 変更なし |
| Actions workflow 2-step dispatch | O(1) 追加オーバーヘッド | 変更なし |

---

## Findings

**新規スケール許容範囲外の finding なし。**

`planResumes` に追加された `effectiveCutoff` ガードは O(1) の文字列比較のみで構成されており、既存ループの計算量・I/O・API 呼び出しを変更しない。iteration 1 の全分析は変更なく有効であり、iteration 2 の追加変更もスケール問題を導入していない。

---

## Evidence Summary

- **Checked**: 8 files / code paths verified (4 new scope + 4 iter-1 scope maintained)
- **Skipped**: 0 within-scope paths
- **Unverified**: 0
