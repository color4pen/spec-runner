# Scale-Tolerance Review — job-stats-cost-per-jobid — iter 1

- **reviewer**: scale-tolerance
- **verdict**: approved

---

## 観点

時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを検出する。

---

## 変更概要

| ファイル | 変更内容 |
|----------|----------|
| `src/store/job-state-store.ts` | `listWithSourceDirs()` を追加。`list()` は委譲に変更 |
| `src/core/command/job-stats.ts` | `list()` + per-row `resolveChangeDir()` を `listWithSourceDirs()` に一本化 |

---

## Findings

### F-01: per-row `resolveChangeDir` の除去 — 潜在 O(n²) を解消 [severity: info]

**変更前**の `runJobStats`:
```
list({ includeArchived: true })           // O(|archive|) のディレクトリ走査
for each state row:
  resolveChangeDir(slug, cwd)             // 毎行ごとに:
    → fsPromises.access(activeDir)        //   1 syscall
    → fsPromises.readdir(archiveBaseDir)  //   active に見つからなければ O(|archive|) 走査
```

slug が active に存在しない行（archived 済みの state）が多い場合、archive ディレクトリの readdir が state 件数分繰り返される。すなわち **O(|states| × |archive|)** の潜在的 n² パターン。

**変更後**: `listWithSourceDirs()` 内の単一 directory scan 中に `path.join(...)` で `sourceChangeDir` を確定し、per-row での FS アクセスを完全に除去。`runJobStats` 内の usage パス解決は O(1) 文字列結合のみ。

結果: archive が単調増加しても `job stats` の FS アクセスは O(|archive|) の固定コストにとどまる。スケール問題の解消。

---

### F-02: `list()` 委譲によるオーバーヘッド [severity: info]

`list()` の既存 caller（ps / archive / resume / exit-guard / resolveId）は、`listWithSourceDirs()` が返す `ListedJobEntry[]` を経由して `JobState[]` を取得するようになった。追加コストは O(n) の `.map(e => e.state)` 一回分と、各エントリに文字列 `sourceChangeDir` を持つ `ListedJobEntry[]` の一時アロケーション。

アクティブジョブは通常数十件以下であり、定数倍の増加にとどまる。漸近的な計算量は変化なし。

---

### F-03: ディレクトリ走査コスト — 変化なし [severity: info]

`listWithSourceDirs()` 内の各 Section の走査コストは以下のとおり、変更前 `list()` と同一:

| Section | 走査対象 | コスト |
|---------|---------|--------|
| 1 (active) | `specrunner/changes/*/state.json` | O(\|active_slugs\|) |
| 1b (archive) | `specrunner/changes/archive/*/state.json` | O(\|archive_entries\|)（`includeArchived: true` 時のみ） |
| 2 (worktree) | `.git/specrunner-worktrees/*/specrunner/changes/*/state.json` | O(\|worktrees\| × \|slugs\|) |
| 3 (sidecar) | `listLocalSidecars()` 結果 | O(\|sidecars\|) |
| 4 (managed marker) | `.specrunner/local/*/marker.json` | O(\|managed_slugs\|) |

新規に追加された走査経路はない。

---

### F-04: `entryMap` の dedup ロジック — 変化なし [severity: info]

`entryMap: Map<string, ListedJobEntry>` の dedup キーは引き続き `jobId`。`tryMerge` の `updatedAt` 比較も変更なし。同一 jobId のエントリが複数セクションで発見された場合に最新を保持する挙動は維持されている。

---

## 判定根拠

| 軸 | 評価 |
|----|------|
| archive 単調増加 | ✅ `runJobStats` の FS アクセスは O(\|archive\|) に固定。per-row 再走査なし |
| sidecar 単調増加 | ✅ Section 3 は変更なし。per-row コスト増なし |
| active jobs 増加 | ✅ 各セクションは O(n) 線形。変化なし |
| 新規 O(n²) パターン | なし |
| 改善 | per-row `resolveChangeDir` → O(1) `path.join` への置換で潜在 n² を除去 |
