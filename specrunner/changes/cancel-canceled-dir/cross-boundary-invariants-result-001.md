# Cross-Boundary-Invariants Review — cancel-canceled-dir — iter 1

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検査対象の境界

| 境界 | 変更側 | 非変更側 |
|------|--------|----------|
| B1 | `evacuateChangeFolder` (新規) | `JobStateStore.persist()` / `changeDir` seam |
| B2 | `cancelSingleJob` 処理順変更 | `JobStateStore.list()` section 1/2/3 スキャン |
| B3 | `JobStateStore.list()` skip 条件追加 | `cancelAllTerminated` の集計ロジック |
| B4 | `resolveSourceChangeFolder` (新規) | `resolveWorktreePathForJob` / `buildWorktreePath` |
| B5 | `canceled/<slug>-<jobId8>/` 退避先パス | `liveness.json` → jobId 照合ガード |
| B6 | `--purge` 分岐 | 既存の purge / marker-unlink 処理順 |

---

## 境界別検査

### B1: `JobStateStore.persist()` の `changeDir` seam — 非 slug-mode 挙動

`new JobStateStore(state.jobId, deps.repoRoot, { changeDir: canceledDirAbs }).persist(updated)` では `isSlugMode() === false`（slug + stateRoot を渡していないため）となる。

**不変条件の確認**:

- `stateToStateJson()` が `slugMode: false` で呼ばれる → `worktreePath` / `pid` / `session` は strip されない。  
  - `worktreePath: null` はキャンセル patch で明示的にセットされているため state.json には `null` が入る。✓  
  - `pid` / `session` は元の値が残るが、`canceled/` は gitignore 済みのローカル参照専用につき許容範囲。  
- `request.slug` / `request.path` は slug モードでは strip されるが、changeDir モードでは保持される。load 時（slug inject なし）に正しく読み返せる。✓

**`_journal` カウンタ整合性**:  
`fs.cp` でコピーされた `canceledDirAbs/state.json` の `_journal.historyCount = N` が存在する状態で `persist(updated)` が呼ばれる。`updated.history.length = N+1`（キャンセル遷移 1 件追加）。persist の delta 計算:

1. 既存カウンタ読み取り: `historyCount = N`
2. fold: `events.jsonl`（コピー済み、N 件）→ `foldResult.historyCount = N`
3. `recoveredCounters.historyCount = max(N, N) = N`
4. `historyDelta = history.slice(N)` = [キャンセル遷移 1 件]
5. delta を append → events.jsonl に 1 件追記、`_journal.historyCount = N+1`

整合する。コピー元未解決の場合は fresh write 経路（ENOENT → 全件書き込み）が動作する。✓

**リスク**: 退避先 `state.json` の `request.path` は load 時の slug inject で設定されたワークツリー内パス（削除済み）を指す。gravestone から `request.md` を読もうとするコードが将来書かれた場合 ENOENT になる。現在の設計では `canceled/` は参照専用（resume なし）のため、実害なし。

### B2: `cancelSingleJob` 処理順変更 — `evacuateChangeFolder` の呼び出しタイミング

変更後の順序:  
`kill → restore-draft → evacuateChangeFolder（cleanup 前）→ cleanupJobResources → persist（退避先）→ marker unlink → purge`

**不変条件の確認**:

- `evacuateChangeFolder` 内の `resolveSourceChangeFolder` は `cleanupJobResources`（worktree 撤去）の**前**に呼ばれる。ソース（worktree slug dir）がまだ存在する状態でコピーが走る。✓
- `persist` は `cleanupJobResources` の**後**に呼ばれるが、書き込み先は `canceledDirAbs`（main checkout / worktree 非依存）であるため cleanup 後でも安全。✓
- `restoreDraftFromBranch`（opt-in）も cleanup 前に呼ばれる。worktree の `request.md` を読める。✓

### B3: `JobStateStore.list()` skip 条件追加

変更: `entry.name === "archive"` → `entry.name === "archive" || entry.name === "canceled"`

**不変条件の確認**:

- section 1（main checkout スキャン）で `canceled/` が slug dir として走査されなくなる。T-02 の設計意図と一致。✓
- section 2（worktrees スキャン）の skip 条件は `slugEntry.name === "archive"` のままで `canceled` を追加していない。`canceled/` グレーブストーンは main checkout にのみ生成され、worktree 内部に `canceled/` サブディレクトリは作られない。したがって section 2 の非追加は問題なし。✓
- `archive` の既存 skip は変更されていない。✓

**`cancelAllTerminated` との相互作用**:

`cancelAllTerminated` は `JobStateStore.list()` で terminal job 一覧を取得し、sidecar を削除する。cancel 後（non-purge）の worktree-only ジョブは:

- worktree 削除済み → section 2 で検出不可
- sidecar 残存 → section 3 が worktree 走査 → ENOENT → skip

よって `cancelAllTerminated` は cancel 済み job の sidecar を回収できない（non-purge 時）。これは**変更前からの挙動**であり、本 change の新規導入ではない（変更前も worktree-only の記録は喪失していたため sidecar が唯一の痕跡だったが、cancel 後は `list()` から外れていた）。退避により gravestone が残るようになったことで記録性は向上しており、後退はない。✓

### B4: `resolveSourceChangeFolder` 内部 — `getJobSlug` 二重呼び出し

`evacuateChangeFolder` が `getJobSlug(state)` でガードした後、`resolveSourceChangeFolder` が同じ `getJobSlug(state)` を独立に呼ぶ。`state` は変更されておらず結果は同じ。空文字列 `""` は `evacuateChangeFolder` の `!slug` ガードで弾かれる（`!""` === `true`）ため、`changeFolderPath("")` や `canceledDirName("", ...)` が呼ばれることはない。✓

### B5: liveness sidecar の `jobId` 型ガード — `resolveWorktreePathForJob` との交差

```typescript
if (typeof sidecar["worktreePath"] === "string" &&
    typeof sidecar["jobId"] === "string" &&
    sidecar["jobId"] === state.jobId) {
  return sidecar["worktreePath"];
}
```

同一 slug で複数 job を cancel する場合（TC-004）、liveness sidecar は後の job で上書きされる。前の job を cancel する際、sidecar の `jobId` は前の job のものなので一致し、worktree パスを正しく解決できる。後の job の sidecar に上書きされた後は、前の job の `resolveWorktreePathForJob` は `jobId` 不一致でスキップし、convention パス（`buildWorktreePath`）へ fallback する。退避先ディレクトリ名は `<slug>-<jobId8>` で衝突しない。✓

### B6: `--purge` と `status === "canceled"` の条件分岐

```typescript
let canceledDirAbs: string | null = null;
if (state.status !== "canceled" && !purge) {
  canceledDirAbs = await evacuateChangeFolder(state, deps, warnings);
}
// ...
if (state.status !== "canceled" && !purge) {
  // persist
  if (canceledDirAbs) {
    await new JobStateStore(...).persist(updated);
  }
}
```

- `--purge` 時: 退避も persist も skip。marker unlink は実行。purge（sidecar rm -rf）は最後に実行。✓  
- `status === "canceled"` 時: 退避も persist も skip。cleanup と marker unlink のみ実行（既存挙動踏襲）。✓  
- `canceledDirAbs === null`（evacuate が親ディレクトリ作成失敗で null を返した場合）: persist もスキップ。warning が積まれる。ベストエフォートの設計どおり。✓

---

## まとめ

| 不変条件 | 状態 |
|----------|------|
| `JobStateStore.persist()` / `_journal` delta 整合性 | ✓ 維持 |
| `JobStateStore.list()` — `archive` skip 回帰なし | ✓ 維持 |
| `JobStateStore.list()` — worktrees scan で `canceled/` を走査しない | ✓ 問題なし（main checkout のみに生成） |
| `cancelAllTerminated` の集計対象不変 | ✓ 維持（sidecar 残存は既存挙動） |
| `evacuateChangeFolder` が cleanup 前に実行される | ✓ 維持 |
| `--purge` の留跡なし保証 | ✓ 維持 |
| `status === "canceled"` 再 cancel の冪等性 | ✓ 維持 |
| `resolveWorktreePathForJob` の jobId 照合ガード | ✓ 維持 |

**観察事項（非ブロッキング）**:

1. 退避先 `state.json` の `request.path` フィールドが削除済みワークツリー内パスを指す（stale）。`canceled/` は参照専用であり resume なし設計のため現実害なし。将来 canceled/ を起点に resume 機能を実装する場合は要対処。
2. キャンセル後に liveness sidecar が残る（non-purge 時）。これは変更前からの挙動で、本 change の新規問題ではない。
3. changeDir モード（非 slug モード）では `pid` / `session` フィールドが state.json に残る。gitignore 済みのローカル参照専用につき許容範囲。

---

## Findings

- **verdict**: approved
