# Scale-Tolerance Review: remote-branch-job-attach

- **reviewer**: scale-tolerance
- **iteration**: 1
- **verdict**: approved

## 観点

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを検出する。

## 走査コスト分析

### 新規コードパスの対象と複雑度

| 操作 | ファイル | コスト | 成長要因 |
|------|----------|--------|---------|
| `git fetch origin <branch>` | orchestrator.ts | O(1) | 単一 branch 明示指定 |
| `resolveCheckpointSlug` — `git ls-tree` | checkpoint-ref.ts:65 | O(N) git subproc | N = remote branch の changes/ 直下エントリ数 |
| `resolveCheckpointSlug` — `git cat-file -e` loop | checkpoint-ref.ts:89-95 | O(N) git subproc | 同上 |
| `git show <ref>:state.json` | checkpoint-ref.ts:152 | O(1) | — |
| `git show <ref>:events.jsonl` | checkpoint-ref.ts:165 | O(1) | — |
| `git ls-tree -r <ref> -- changes/<slug>/` | checkpoint-ref.ts:174 | O(M) | M = change folder 内ファイル数 |
| `treeFiles.includes(requiredPath)` | verify-checkpoint.ts:120 | O(M) | 同上 |
| `fold(eventsJsonl)` | job-state-projection.ts:76 | O(E) | E = job の event 数 |
| `writeLivenessSidecar` | local.ts:929 | O(1) | — |

### N（remote branch の changes/ エントリ数）の評価

`resolveCheckpointSlug` は remote branch の `specrunner/changes/` 直下を列挙し、`archive` / `canceled` を除く各候補に `git cat-file -e` を 1 回ずつ発行する（O(N) sequential subproc）。

- **N の実態**: feature branch は慣習上 active change folder を 1 つ持つ。複数あれば `CHECKPOINT_NOT_FOUND`（ambiguous）で即拒否し、誤 attach を防ぐ設計になっている。N は設計上 1 に収束する。
- **`git cat-file -e` のコスト**: fetch 済み remote-tracking ref の local object store 参照のみ。ネットワーク I/O は発生しない。サブプロセス起動コストはあるが、N=1 ならほぼゼロ。
- **モノトニック成長の有無**: `specrunner/changes/` の active エントリは feature branch の使い方に依存し、時間とともに単調増加しない（archive に移動 or canceled で除外される）。

**判定**: 問題なし。N=1 の実態と安価なオブジェクト参照の組み合わせで、コストは実質 O(1)。

### E（events.jsonl のイベント数）の評価

`fold(eventsJsonl)` は events.jsonl の全行を走査する（O(E)）。E は job が進むほど単調増加する。

- **既存コードとの比較**: `composeSplitLayout` → `fold` は resume・cancel・finish でも同様に呼ばれる。attach が新たにスケール問題を追加するわけではなく、既存コストパターンに乗っている。
- **呼び出し頻度**: attach は CLI の one-shot コマンド（パイプライン実行ではない）。E の増加速度 × 呼び出し頻度は resume と同等以下。
- **単調増加との関係**: E は1つの job の中で増加するが、attach はその job に 1 回しか呼ばれない。O(E) の走査が繰り返されるホットパスではない。

**判定**: 問題なし。既存コストパターンと同等、かつ one-shot 呼び出し。

### 明示的に「スキャンしない」設計の確認

以下の走査は attach コードに存在しないことを確認した:

- `origin/*` の暗黙走査 — なし（branch 明示指定のみ）
- `JobStateStore.list()` / `JobCatalog.listWithSourceDirs()` — なし（archive 走査を呼ばない）
- `listLocalSidecars()` — なし（sidecar index を走査しない）
- GitHub API issue/PR/comment 一覧 — なし
- `.git/specrunner-worktrees/*` の glob scan — なし

これら全て、attach の成功・失敗経路のどちらでも呼ばれない。

## 所見

### F-001（INFO）`resolveCheckpointSlug` の O(N) git subproc ループ

- **場所**: `src/git/checkpoint-ref.ts:89-95`
- **内容**: active change folder 候補ごとに `git cat-file -e` を 1 subproc 発行。
- **スケール影響**: N は feature branch の active change folder 数。慣習上 1。複数は ambiguous で拒否。安価なローカルオブジェクト参照。成長要因なし。
- **要対応**: なし（INFO のみ）

### F-002（INFO）`fold(eventsJsonl)` は O(E) スキャン

- **場所**: `src/store/job-state-projection.ts:76`（`composeSplitLayoutFromContent` 経由）
- **内容**: events.jsonl の全行を fold する。E = job のイベント総数で単調増加する。
- **スケール影響**: resume 等の既存コードと同じパターン。attach は one-shot なので呼び出し頻度はループではない。ホットパス問題なし。
- **要対応**: なし（INFO のみ）

## まとめ

- `origin/*` 走査・archive スキャン・sidecar 総当たり・issue/PR 一覧取得のいずれも導入していない。
- 全ての操作コストは単一の明示指定 branch に閉じており、repo 内の job 総数・archive 件数・コメント数などに比例しない。
- 唯一の O(N) ループ（`git cat-file -e` for each change folder）は N=1 に収束し、コストは安価なローカルオブジェクト参照。
- O(E) の events fold は既存コストパターンと同等で、one-shot 呼び出しのためホットパスではない。

**スケール許容上の新規問題なし。merge を妨げる知見なし。**
