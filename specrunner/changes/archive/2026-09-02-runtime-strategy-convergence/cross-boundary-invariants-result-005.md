# Cross-Boundary Invariants Review — iteration 5

<!-- verdict は CLI が typed findings から導出するため、この file には verdict 行を書かない。 -->

## 検証範囲と証拠

- `git diff main...HEAD --stat` を実行し、92 files / 8,691 insertions / 783 deletions の変更範囲を確認した。
- `design.md` と `tasks.md` を通読し、readiness、duplicate guard、workspace setup、state reload、deps build、cleanup registration、teardown の順序、および resume 時の reload skip 条件を正典として照合した。
- iteration 4 以降の production 差分を再読した。`src/core/command/runner.ts` の lifecycle コメント補完以外に production の実行経路変更はなく、残りは test fake の narrow capability 化と ratchet 対象拡張だった。
- operator 裁定対象を再確認した。`command-runtime.ts` は port/state 型だけを参照し、`PipelineDepsBuilder` を含む aggregate は domain 側の `runtime-facade.ts` に置かれている。また Command/step/attach 系 test fake の whole-port 再導入を ratchet が検出する。
- `bun run typecheck` は成功した。
- lifecycle contract、ratchet、runner、resume、runtime capability gate の targeted test は 5 files / 85 tests がすべて成功した。Vitest 終了後に GitHub Actions summary の read-only path への書込み警告が出たが、test process の exit code は 0 だった。

## Cross-boundary invariant の照合

| 境界 | 新しい契約 | 未変更コード側の前提との照合 |
|---|---|---|
| provider readiness | required direct call | `prepare()` より前の位置を維持し、失敗時は job/workspace/state/exit guard を作らず exit 1。Local は既存 probe、Managed は既存 no-op を使う |
| duplicate live-job guard | required direct call | descriptor/reviewer/scope validation 後、`bootstrapJob()` 前を維持。占有 guard が仮定する repo root と slug は従来と同じ値 |
| workspace/state | named required capabilities | setup 後の reload 条件は `existingWorktreePath === undefined` のまま。resume の既存 worktree path は従来どおり reload を skipし、新規 Local run だけ store から setup 結果を再取得する |
| deps/cleanup/teardown | runner-owned narrow composition | deps build → dynamic context/push capability → cleanup registration → gate/pipeline → teardown の順序を維持。初期化失敗では handle を使わず、pipeline throw と terminal completion では各一回だけ teardown する |
| changed-files gate | required predicate | permission scope がない descriptor では predicate を呼ばない。scope ありかつ false の場合だけ bootstrap 前に拒否し、step 側も false/unavailable を UNKNOWN として fail-closed に扱う |
| commit/revision capability | bound capability object | Local/Managed とも同じ runtime instance の既存メソッドを bind しており、downstream の receiver、引数、DU の意味を変えていない |

## 実行列

1. 新規 Local run は readiness → validations → duplicate guard → bootstrap → setup → reload → deps build → cleanup registration → pipeline → teardown のまま。
2. 新規 Managed run は、変更前から実装済みだった `reloadJobState` の throw を setup 後に捕捉し、`RELOAD_FAILED` を persist して停止する既存 fail-closed 経路のまま。
3. resume は readiness の後に state と既存 worktree を解決し、setup 後の reload を skip して deps build 以降へ進む。
4. setup failure は workspace `null` で failed state を persist し、cleanup handle を作らず停止する。
5. reload/buildDeps/registerCleanup failure は pipeline を開始せず、利用可能な workspace を添えて failed state を persist する。
6. scope-declaring pipeline と changed-files 非対応 runtime の組合せは bootstrap 前に拒否され、scope を宣言しない pipeline と Local runtime の経路は従来どおり進む。
7. pipeline throw は `teardown(handle, "error")` を一回、terminal completion は最終 status を渡す teardown を一回実行する。

未変更の store、occupancy guard、pipeline、scope evaluator、exit guard、cleanup handler が仮定する入口条件、順序、引数を破る新経路は確認されなかった。

## 検証できなかった項目

- 実 provider、GitHub、Managed Agents API に接続する手動 CLI 実行は、外部接続を伴うため実施していない。

## Findings 詳細

None — 変更されていない隣接コードの暗黙の前提を破る、具体的かつ通常の supported execution に影響する問題は確認されなかった。
