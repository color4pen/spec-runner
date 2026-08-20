# Scale-Tolerance Review: issue-target-start-face — Iteration 1

**Reviewer**: scale-tolerance  
**Purpose**: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを検出する。

---

## Evidence

### 1. 新規 API 呼び出し — `buildLinkedBranchRegistrar` (`src/core/issue-target/start.ts:62-72`)

issue-linked start の各 job で `getIssue`（REST）→ `createLinkedBranch`（GraphQL）を順に呼ぶ。

- 呼び出し回数：job start 1 回につき 1 セット（O(1)）。
- archive 件数・sidecar 件数・journal 行数には無関係。
- **スケール懸念なし**。

### 2. base OID 解決 — `local.ts` new-run arm (`src/core/runtime/local.ts`)

`git rev-parse remoteBaseRef` を fetch 後に 1 回追加。

- O(1) git コマンド、active job 数やアーカイブ数に比例しない。
- **スケール懸念なし**。

### 3. no-worktree arm base OID 解決 (`src/core/runtime/local.ts`)

`git rev-parse HEAD` を `onFeatureBranchCreated` がある場合のみ追加。

- O(1) git コマンド。
- **スケール懸念なし**。

### 4. `onFeatureBranchCreated` callback 呼び出し — materializer (`src/core/runtime/workspace-materializer.ts:195-200`)

new-run arm 内で 1 回だけ呼ぶ。callback 内で O(1) の `getIssue` + `createLinkedBranch` が走る。

- loop なし、蓄積する集合の走査なし。
- **スケール懸念なし**。

### 5. `getIssue` の重複呼び出し（低重度、スケール問題ではなく冗長呼び出し）

`--from-issue` 経路と inbox 経路では `getIssue` が **2 回** 呼ばれる:

- 1 回目: 呼び出し元が issue body を取得するために呼ぶ（`from-issue.ts:78`、inbox は `action.issue.body` から直接渡す）
- 2 回目: `buildLinkedBranchRegistrar` callback が `nodeId` 取得のために呼ぶ

これは O(1) の冗長往復であり、archive 件数・job 件数には比例しない。スケール問題ではないが、latency の冗長である。

- `from-issue.ts` では最初の `getIssue` 結果の `nodeId` を破棄し、callback 内で再取得している。
- inbox 経路では `action.issue.body` は既に持っているが、同様に `nodeId` を再取得している。
- 修正案: `nodeId` を上流から `materializeDraftAndStart` / `startWithIssueLink` の引数に追加し、callback に直接渡す。ただし best-effort 失敗は吸収されるため、実害は start 成功時の追加 RTT 1 往復に限定される。

### 6. 既存の O(n) スキャン（本変更由来でない）

inbox `startJob` の slug 占有プレチェック（`run-inbox.ts:381`）が `JobStateStore.list(repoRoot)` を呼ぶ。active job 数に比例する既存のスキャンだが、**本変更の差分には含まれない**（pre-existing）。スコープ外として記録のみ。

---

## Findings

**スケール比例成長コード（archive/sidecar/issue/PR/コメント/journal の件数増に伴いコストが増加するパターン）は検出されなかった。**

---

## Observations

- **低重度**: `buildLinkedBranchRegistrar` が `getIssue` を毎回呼ぶことで、`--from-issue` / inbox 経路では start ごとに `getIssue` が 2 往復になる。O(1) のため scale 問題ではないが、`nodeId` を上流から渡すことで 1 往復削減可能。best-effort で失敗が吸収されるため実害は限定的。対応は後続改善として扱ってよい。

---

## Evidence Summary

| 対象コード | 種別 | コスト | 判定 |
|---|---|---|---|
| `buildLinkedBranchRegistrar` callback (`getIssue` + `createLinkedBranch`) | 新規 API 呼び出し | O(1) per start | 問題なし |
| `git rev-parse remoteBaseRef` (new-run arm) | 新規 git コマンド | O(1) per start | 問題なし |
| `git rev-parse HEAD` (no-worktree arm) | 新規 git コマンド | O(1) per start | 問題なし |
| `onFeatureBranchCreated` callback 呼び出し (materializer) | 新規 effect hook | O(1) per start | 問題なし |
| `getIssue` 2 重呼び出し (`--from-issue` / inbox) | 冗長往復 (observation) | O(1) per start | スケール問題なし |
| `JobStateStore.list()` slug 占有チェック (inbox) | 既存スキャン | O(n_active) | 本変更外、pre-existing |

Checked: 6 / Skipped: 0 / Unverified: 0
