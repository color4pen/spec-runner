# Cross-Boundary Invariants Review — iteration 4

<!-- verdict は CLI が typed findings から導出するため、この file には verdict 行を書かない。 -->

## 検証範囲と証拠

- `git diff main...HEAD --stat` を実行し、87 files / 7,801 insertions / 702 deletions の変更範囲を確認した。
- `design.md` と `tasks.md` を通読し、readiness、duplicate guard、workspace setup、state reload、deps build、cleanup registration、teardown の順序、および resume 時の reload skip 条件を正典として照合した。
- iteration 3 以降の変更（`8f60427f`）を再読した。production lifecycle の変更はなく、step-layer test fake の narrow capability 化と ratchet の対象拡張が中心だった。
- operator 裁定対象の ports→domain 逆依存について、`command-runtime.ts` は port/state 型だけを参照し、`PipelineDepsBuilder` を含む aggregate は domain 側の `runtime-facade.ts` に置かれていることを確認した。
- `bun run typecheck` は成功した。
- lifecycle contract、ratchet、runner、resume の targeted test は 4 files / 57 tests がすべて成功した。Vitest 終了後に GitHub Actions summary の read-only path への書込み警告が出たが、test process の exit code は 0 だった。

## Cross-boundary invariant の照合

| 境界 | 新しい契約 | 未変更コード側の前提との照合 |
|---|---|---|
| provider readiness | required direct call | `prepare()` より前の位置を維持し、失敗時は job/workspace/state を作らず exit 1。Local/Managed は変更前から実装を持つ |
| duplicate live-job guard | required direct call | descriptor/reviewer validation 後、`bootstrapJob()` 前を維持。Local/Managed とも既存の `assertSlugUnoccupied` 委譲を使用 |
| workspace/state | named required capabilities | setup 後の reload 条件は `existingWorktreePath === undefined` のまま。resume の既存 worktree path は従来どおり reload を skip |
| deps/cleanup/teardown | runner-owned narrow composition | deps build → cleanup registration → pipeline → teardown の順序、pipeline throw 時の `teardown(handle, "error")` 一回、terminal path の最終 status teardown 一回を維持 |
| changed-files gate | required predicate | scope 宣言なしでは predicate を呼ばず、scope 宣言ありかつ false の場合だけ拒否。Local=true / Managed=false の既存差異を維持 |
| commit/revision capabilities | bound capability objects | 同一 runtime instance の同一メソッドを bind しており、downstream が受ける receiver と結果の意味は不変 |

## 実行列

1. 新規 Local run は readiness → duplicate guard → bootstrap → setup → reload → deps build → cleanup registration → pipeline → teardown のまま。
2. 新規 Managed run は、変更前から存在した `reloadJobState` が setup 後に throw し、`RELOAD_FAILED` を persist して停止する既存経路のまま。
3. resume は prepare で state を読み、既存 worktree を setup した後に reload を skip し、deps build 以降へ進む既存条件のまま。
4. setup failure は workspace `null` で failed state を persist し、cleanup handle を作らず停止する。
5. reload failure は workspace を渡して failed state を persist し、deps build / cleanup registration 前に停止する。
6. pipeline throw と terminal completion の双方で teardown の回数・引数・例外経路に差分はない。

未変更の store、occupancy guard、pipeline、exit guard、cleanup handler が仮定する入口条件、順序、引数を破る新経路は確認されなかった。

## 検証できなかった項目

- 実 provider、GitHub、Managed Agents API に接続する手動 CLI 実行は、外部接続を伴うため実施していない。

## Findings 詳細

None — 変更されていない隣接コードの暗黙の前提を破る、具体的かつ通常の supported execution に影響する問題は確認されなかった。
