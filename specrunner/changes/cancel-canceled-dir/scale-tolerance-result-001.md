# Scale-Tolerance Review: cancel-canceled-dir

- **reviewer**: scale-tolerance
- **iteration**: 1
- **verdict**: approved

## 観点

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを、merge 前に検出する。

---

## Findings

### F-001 `canceled/` ディレクトリは `JobStateStore.list()` の走査対象から正しく除外されている

- **severity**: info
- **location**: `src/store/job-state-store.ts:226`
- **detail**: Section 1（`specrunner/changes/*/state.json` スキャン）の skip 条件が `entry.name === "archive" || entry.name === "canceled"` に更新されている（D7）。`canceled/` が `archive/` と対称的に予約サブディレクトリとして扱われ、走査対象から除外されている。キャンセル件数が増加しても `list()` のスキャンコストに影響しない。

### F-002 `evacuateChangeFolder` のコストは O(1) per cancel（件数依存なし）

- **severity**: info
- **location**: `src/core/cancel/runner.ts:266-325`
- **detail**: `fs.cp(sourceDir, destDir, { recursive: true })` による再帰コピーのコストは「1 ジョブの change-folder 内ファイル数」に依存するが、これは境界値が固定されている（request.md / design.md / spec.md / tasks.md / test-cases.md / *-result-*.md / state.json / events.jsonl / usage.json）。キャンセル累積件数とは独立。

### F-003 `canceled/` ディレクトリはディスク上に単調増加するが、既存のスキャン経路から隔離されている

- **severity**: info
- **location**: `src/core/cancel/runner.ts:408-413`, `.gitignore`
- **detail**: D5 により gitignored・untracked。D7 により `JobStateStore.list()` から除外。`cancelAllTerminated` も `list()` 経由であるため `canceled/` を走査しない。`resolveId` の `list({ includeArchived: true })` も `canceled/` をスキャンしない（Section 1b は `archive/` 配下のみ対象）。ディスク使用量は増加するが、CPU・API コストへの影響はゼロ。

### F-004 キャンセル済みジョブのライブネス sidecar が orphan 化するが、これは既存挙動

- **severity**: info
- **location**: `src/core/cancel/runner.ts:450-458`, `src/store/job-state-store.ts:302-319`
- **detail**: `cancelSingleJob` は非 `--purge` 時にライブネス sidecar（`.specrunner/local/<slug>/liveness.json`）を削除しない。`list()` Section 3 はこれらの orphan sidecar エントリを走査し、削除済み worktree からの state 読み込みを試みて ENOENT でスキップする。キャンセル件数が増えるほど Section 3 で失敗する `readFile` 呼び出しが増えるが、この挙動は本 PR 以前から存在しており、新たな退化ではない。`cancelAllTerminated` が sidecar ディレクトリごと削除することで軽減される。

### F-005 `collectChangesList`（dynamic-context.ts）が `canceled` を skip しない — 軽微な正確性の問題

- **severity**: low
- **location**: `src/git/dynamic-context.ts:79`
- **detail**: `collectChangesList` は `archive` のみを除外し、`canceled` を除外しない。`canceled/` が main checkout 下に存在すると、agent プロンプトに注入される `changesList` に `"canceled"` が偽のスラッグとして含まれる。ただし:
  1. `collectDynamicContext` は `cwd = worktreePath` で呼ばれるのが通常であり、worktree 内には `canceled/` が存在しない（`canceled/` は main checkout 下にある）。
  2. `canceled/` 直下には `state.json` が存在しないため、たとえリストアップされてもロードは行われない。
  3. コスト観点では O(1) のエントリ追加のみ（ディレクトリ配下の再帰スキャンは行われない）。

  スケール上の問題はないが、非 worktree モードで agent プロンプトに誤情報が混入する可能性がある。`archive` に倣って `canceled` を除外する 1 行修正が望ましいが、merge ブロッカーではない。

---

## 総合評価

新規コードが追加する `canceled/` ディレクトリは、`JobStateStore.list()` 走査から正しく除外されており、既存の「archive スキップ」と対称な設計になっている。`evacuateChangeFolder` のコストは 1 件あたり固定（O(1)）。累積件数に比例するスキャン・ロード・API 呼び出しの劣化経路は発見されなかった。F-005 は軽微な正確性の問題であり、スケール上の懸念ではない。

- **verdict**: approved
