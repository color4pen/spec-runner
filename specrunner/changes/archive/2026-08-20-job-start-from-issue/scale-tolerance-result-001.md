# Scale-Tolerance Review: job-start-from-issue

**Reviewer**: scale-tolerance
**Iteration**: 1
**Date**: 2026-08-20

## Purpose

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、
走査・ロード・API 呼び出しのコストが比例して成長するコードを merge 前に検出する。

## Scope

対象 diff: `git diff main...HEAD`（29 ファイル、3166 行追加、8 行削除）

主要な実装ファイル:
- `src/cli/from-issue.ts` — `runFromIssue` オーケストレーション
- `src/core/job/start-from-issue.ts` — `materializeDraftAndStart` core 関数
- `src/git/branch.ts` — `getCurrentBranch` helper
- `src/core/inbox/run-inbox.ts` — inbox 委譲化（diff のみ）
- `src/cli/command-registry.ts` — `--from-issue` flag 追加・positional optional 化

## Cost Profile Analysis

### `runFromIssue` (`src/cli/from-issue.ts`)

| 操作 | コスト | 比例対象 |
|------|--------|----------|
| `loadConfigWithOverlay` | O(1) | — |
| `resolveGitHubToken` | O(1) | — |
| `getOriginInfo` | O(1) — git process 1 本 | — |
| `githubClient.getIssue(owner, repo, n)` | O(1) — 単一 issue fetch | — |
| `parseRequestMdContent(body)` | O(body size) — issue 本文のサイズ上限有り | — |
| `getCurrentBranch(cwd)` | O(1) — `git symbolic-ref` 1 本 | — |
| `materializeDraftAndStart(...)` | O(1) — ファイル 1 本書き込み + runRunCore | — |

いずれも走査数が job 件数・archive 件数・sidecar 件数・PR 件数に比例しない。

### `assertNoDuplicateLiveJob` (via `runRunCore` → `pipeline-run.ts`)

`scanSlugOccupancy(repoRoot, slug)` (`src/core/occupancy/scan.ts`) を呼ぶ。スキャン対象:

1. `specrunner/changes/<slug>/state.json` — 1 ファイル固定
2. `.git/specrunner-worktrees/*/specrunner/changes/<slug>/state.json` — worktree 件数に比例
3. `.specrunner/local/<slug>/state.json` — 1 ファイル固定

コストは O(worktree 件数)、かつ **slug を絞ってスキャン**（全 slug を列挙しない）。
本 PR 以前から存在する経路で、変更なし。

### inbox 占有事前チェック (`src/core/inbox/run-inbox.ts`)

```
const allStates = await JobStateStore.list(repoRoot);
```

これは O(active-slug 件数 + worktree 件数) のフルスキャンだが、**本 PR 導入前から存在する**コードである。
今回の diff では `writeDraft + runRunCore` の 4 行を `materializeDraftAndStart` の 1 行に置換しただけであり、
スキャン呼び出し自体は変更していない。

`--from-issue` 経路は inbox の事前スキャンを実行しない（inbox 固有責務として意図的に分離されている）。

### detach 時の二重 API 呼び出し

`--from-issue --detach` を使うと、親プロセスが `getIssue` + `getCurrentBranch` + `parseRequestMdContent` を実行し、
子プロセスが同一の処理を再実行する（`runFromIssue` への再入）。

- 1 回の invocation あたり `getIssue` が 2 回呼ばれる
- **比例対象はなく、定数倍の呼び出し**である
- 設計上の意図（親で guard を確認してから detach）が明示されており、design.md D3 / Risks に記録済み

スケール観点では問題なし（job 件数・issue 件数が増えても呼び出し回数は変わらない）。

## Findings

**なし。** 新規導入コードに、時間とともに単調増加する対象に比例してコストが成長するパターンは検出されなかった。

## Evidence

- checked: `src/cli/from-issue.ts`（全体）
- checked: `src/core/job/start-from-issue.ts`（全体）
- checked: `src/git/branch.ts`（全体）
- checked: `src/core/inbox/run-inbox.ts`（diff）
- checked: `src/cli/command-registry.ts`（diff）
- checked: `src/core/occupancy/scan.ts`（全体 — assertNoDuplicateLiveJob の内部）
- checked: `src/store/job-catalog.ts`（全体 — JobStateStore.list の内部）
- checked: `src/store/job-state-store.ts`（list メソッド経路）
- checked: detach 再入経路（`from-issue.ts:113-119`）
