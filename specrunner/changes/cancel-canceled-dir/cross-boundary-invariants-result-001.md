# Cross-Boundary Invariants Review — cancel-canceled-dir

- **verdict**: approved
- **iteration**: 1
- **reviewer**: cross-boundary-invariants

---

## Scope

```
src/core/cancel/runner.ts          +128 / -45
src/store/job-state-store.ts       +4
src/util/paths.ts                  +20
tests/unit/core/cancel/runner.test.ts  +243 / -2
src/core/cancel/__tests__/runner-branch-delete.test.ts  -8
tests/local-no-jobs-dir-writes.test.ts  +11
```

---

## 検査観点

変更していないコードが暗黙に依存している不変条件を、新しい挙動が黙って破っていないかを検出する。

---

## Findings

### F-1: `cancelAllTerminated` が新スタイル cancel 後のサイドカーを掃除できない（LOW）

**観点**: `cancelAllTerminated` は `JobStateStore.list()` で terminal 状態のジョブを探し、`.specrunner/local/<slug>/` を削除する。`list()` は `canceled/` を除外（D8）するため、`cancelSingleJob` 後に退避済みのジョブは `list()` に見えない。結果として、`cancelAllTerminated --yes` を実行しても新スタイルでキャンセルされたジョブのサイドカーは削除されない。

**影響範囲**:
- `cancelSingleJob --purge` を使えば確実にサイドカーが消える（D9、機能的には代替あり）
- サイドカーは `liveness.json` のみ（tombstone の `canceled/<slug>-<jobId8>/` には触れない）
- `cancelAllTerminated` の既存テスト `makeJob("canceled")` は旧スタイル（canonical に state.json）を使っており引き続き green ——テストが新経路をカバーしていないだけで既存テストは壊れていない

**判定**: 設計 D9 の「purge でも tombstone は残す、sidecar 削除は purge が担う」方針と整合しており、設計者が意図的に受け入れた gap。tasks.md も「cancelAllTerminated 系テストは挙動不変」と明示している。**critical な不変条件違反ではない**。

---

### F-2: `runner.ts` ヘッダコメント D1 が陳腐化（VERY LOW）

**現状**: `runner.ts` の先頭コメントに `D1: State file is preserved (audit trail) unless --purge is given` と書かれている。

**新挙動**: D9 により tombstone（`canceled/<slug>-<jobId8>/`）は `--purge` でも削除されない。`--purge` は `.specrunner/local/<slug>/` サイドカーのみ削除する。

**判定**: 動作への影響はなく、ドキュメント不整合のみ。実装の正しさには影響しない。

---

### F-3: `runner-branch-delete.test.ts` — 退避が静かに失敗し state が未書込（INFO）

**観点**: `FAKE_REPO_ROOT = "/repo"` は実在しないパス。`evacuateChangeFolder` 内の `fs.mkdir("/repo/specrunner/changes/canceled", ...)` が ENOENT で失敗 → try/catch で捕捉 → warning 追記 → `null` 返却 → `persist` が skip される。

**結果**: テストは branch 削除の振る舞いのみをアサートしており、state 書込をアサートしていないため green のまま。production コードは `evacuateChangeFolder` 全体を try/catch で包んでいるため（D9 best-effort）、branch 削除は正常に続行する。

**判定**: テスト隔離の設計上の特性。production では実パスを使うため問題なし。

---

## 重要な不変条件（問題なし）

以下は事前懸念として検査したが、いずれも正しく維持されていた：

| 不変条件 | 結果 |
|---------|------|
| `list()` が `canceled/` を active に混入させない | ✓ section 1・2 両方に `entry.name === "canceled"` skip 追加済み |
| `persist()` delta 計算 — 移動済み state.json の `_journal` カウンタと canceledState.history の整合 | ✓ 移動前カウンタが delta 起点になり、キャンセル遷移 1 件のみ追記される |
| `resolveCanonicalStateDir` が `canceled/` を canonical として解決しない | ✓ `changes/<slug>/` と `archive/*` のみ走査。変更なし |
| `loadStateByJobId` が退避済みジョブで JOB_NOT_FOUND を返す | ✓ D8 により canonical 消去後は解決不能 → 意図通り |
| `--restore-draft` と evacuate の順序 — 退避前に worktree から draft を読む | ✓ restore → evacuate → persist → cleanup の順序が維持されている |
| `evacuateChangeFolder` で fs.cp → fs.rm の後に cleanupJobResources が走る | ✓ worktree 内の slug dir は evacuate で消え、worktree 自体は cleanup で消える。二重削除なし |
| `--purge` が tombstone を消さない（D9） | ✓ purge ブロックは `.specrunner/local/<slug>/` のみ削除、`canceledDirAbs` には触れない |
| no-worktree モードで canonical `changes/<slug>/` が確実に消える | ✓ srcDir が canonical を向く場合 `fs.rm(srcDir)` により削除。テスト TC-NJW-003 でもアサート済み |
| idempotent cancel（旧スタイル canceled state が canonical に残るケース）の退避 | ✓ `makeJob("canceled")` → canonical から退避 → canonical 消去 → `loadCanceledState` で確認 |
| `JobStateStore({ changeDir })` の non-slug モードで `request.slug` が tombstone に保持される | ✓ stateToStateJson(slugMode: false) が slug をストリップしないため、tombstone state.json は slug を含む |

---

## 総評

設計（D1–D9）の意図が実装に正確に反映されている。各不変条件（scan 除外・delta 計算・順序保証・move 保証）は境界を超えても維持されており、既存の `list()` / `loadStateByJobId` / `resolveCanonicalStateDir` との相互作用に欠陥はない。

F-1 の `cancelAllTerminated` gap は設計者が意図的に受け入れた trade-off（`--purge` で代替）であり、テストも「挙動不変」と明示している。F-2・F-3 はいずれも production の正確性に影響しない。

critical な cross-boundary 違反なし。
