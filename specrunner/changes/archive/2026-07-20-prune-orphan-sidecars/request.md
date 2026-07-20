# job prune を orphan sidecar に拡張する — doctor の生 rm -rf hint を製品コマンド案内に置換する

## Meta

- **type**: spec-change
- **slug**: prune-orphan-sidecars
- **base-branch**: main
- **adr**: false

<!-- orphan-worktree で確立済みの「check と prune が scan 実装を共有する」対称形への追従のため、新しい設計選択は無い -->

## 背景

orphan 資源の掃除口が非対称になっている。orphan **worktree** には `job prune`（dry-run 列挙）+ `--force`（削除）があるが、orphan **sidecar**（`.specrunner/local/<slug>`、archive/cancel 済みまたは消失した job の機械状態）には対応するコマンドが無く、doctor が生の `rm -rf` コピペを案内する。

実測（74 件蓄積時の doctor 出力）:

- hint に絶対パス 74 個を quote 連結した約 8KB の `rm -rf` 1 行
- details で同じ 74 パスをもう一度全件列挙
- 合計 150 行超になり、他の check 結果が埋もれる

検出側（`orphan-sidecars` check）が read-only なのは正しい設計。問題は削除の受け皿が製品に無いこと。

## 現状コードの前提

- `src/cli/prune.ts:26-60` — `job prune` は orphan worktree 専用。`resolveRepoRootOrFail` で root 解決し、`pruneOrphanWorktrees`（`src/core/prune/runner.ts`）へ委譲。dry-run 既定 + `--force` で削除の二段
- `src/core/doctor/checks/storage/orphan-worktrees.ts:17-40` — worktree 側は scan 実装（`src/core/worktree/orphan.ts` の `scanOrphanWorktrees`）を doctor check と prune の両方が共有する形が確立済み
- `src/core/doctor/checks/storage/orphan-sidecars.ts:26-77` — sidecar の orphan 判定（`isOrphanSidecar`: state.json の status が archived/canceled、または main / worktree 双方に state 不在なら orphan。active status（running / awaiting-* / failed / terminated）は非 orphan）は check ファイル内の private 関数で、共有可能な形になっていない
- `src/core/doctor/checks/storage/orphan-sidecars.ts:131-139` — 検出時は全 path を quote 連結した `rm -rf` 一行を hint に、全 path を details に入れて返す
- `src/core/doctor/formatter.ts:60-64` — human 出力は details を全件表示する
- `src/cli/command-registry.ts:82` / `:235` — `job prune [--force]` の usage 記載は「orphan worktree を列挙（--force で削除）」

## 要件

1. **`job prune` を sidecar に拡張する**: dry-run（既定）で orphan worktree と orphan sidecar を区分して列挙し、`--force` で両方を削除する。active な job（running / awaiting-* / failed / terminated）の sidecar には dry-run でも --force でも触れない。usage 記載（`command-registry.ts:82` / `PRUNE_USAGE`）も worktree + sidecar に更新する。

2. **orphan 判定の単一実装**: sidecar の orphan 判定を check ファイルから抽出し、doctor check と prune が同一実装を共有する（worktree 側の `scanOrphanWorktrees` と同型）。判定基準は現行 `isOrphanSidecar` の意味論を変えない。

3. **doctor hint の置換**: `orphan-sidecars` check の hint から `rm -rf` 連結を廃止し、`specrunner job prune` の案内に置換する。

4. **details の丸め**: human 出力では details を先頭 N 件 + 残数（`…and K more` 相当）に丸める。`--json` では全件を保持する。

## スコープ外

- worktree 側 prune ロジックの変更
- orphan 判定基準（ACTIVE_STATUSES の集合）の変更
- doctor の他 check の出力形式

## 受け入れ基準

- [ ] **T1（dry-run 列挙）**: orphan sidecar と active sidecar が混在する fixture で、`job prune` が orphan のみを列挙し、FS を変更しないことを固定する。
- [ ] **T2（--force 削除の選別）**: `--force` で orphan sidecar が削除され、active な job の sidecar が残ることを固定する。**破壊確認**: active 判定を無効化すると本テストが落ちること。
- [ ] **T3（hint 置換)**: orphan sidecar 検出時の doctor hint が `job prune` を案内し、`rm -rf` を含まないことを固定する。
- [ ] **T4（丸め）**: N+1 件以上の orphan がある場合、human 出力の details が N 件 + 残数表示であり、`--json` の details が全件であることを固定する。
- [ ] **T5（判定の共有）**: orphan 判定が doctor check と prune で同一関数であることを、判定ロジック単体のテスト + 両呼び出し元の参照で固定する。
- [ ] **T6**: `typecheck && test` が green（既存の prune / doctor テストは無変更で green。orphan-sidecars check の hint/details 形式変更に伴う期待更新を除く）。

## architect 評価済みの設計判断

- **prune への拡張（worktree と同一コマンド）**。→ 却下: `doctor --fix`（診断コマンドに書込を持たせると read-only 保証が崩れ、他 check にも fix 期待が波及する）。→ 却下: 新規 `clean` コマンド（掃除口が 2 つになり、worktree/sidecar の非対称が別の形で残る）。
- **scan 実装の共有**。→ 却下: prune 側に判定を再実装（check と prune で orphan 集合がズレると「doctor が数えたものを prune が消さない」不整合が起きる）。
- **丸めは human のみ**。→ 却下: JSON も丸める（機械消費者が全件を必要とする。丸めは表示の都合であって data の都合ではない）。
