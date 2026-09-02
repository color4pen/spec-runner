# Cross-Boundary Invariants Review — iteration 6

<!-- verdict は CLI が typed findings から導出するため、この file には verdict 行を書かない。 -->

## 検証範囲と証拠

- `git diff main...HEAD --stat` を実行し、103 files / 10,438 insertions / 793 deletions の変更範囲を確認した。
- reviewer 定義、`design.md`、`tasks.md` を通読し、provider readiness、duplicate guard、workspace setup、state persist/reload、deps build、cleanup registration、teardown の順序と resume 時の reload 条件を正典として照合した。
- iteration 5 後の変更を確認した。production の実行経路は変更されておらず、最新変更は `runtime-strategy-ratchet.test.ts` の test fake 再導入防止範囲の拡張である。
- operator 裁定対象を再確認した。`command-runtime.ts` は port/state 型だけを参照し、`PipelineDepsBuilder` を含む aggregate は domain 側の `runtime-facade.ts` に置かれている。Command、runtime、step、attach、pipeline および root-level test の whole-port fake 再導入を ratchet が検出する。
- `bun run typecheck` は成功した。
- lifecycle contract、ratchet、runner、resume、runtime capability gate の targeted test は 5 files / 88 tests がすべて成功した。Vitest 終了後に GitHub Actions summary の read-only path への書込み警告が出たが、test process の終了結果は成功だった。

## Cross-boundary invariant の照合

| 境界 | 現行経路 | 未変更コード側の前提との照合 |
|---|---|---|
| provider readiness → prepare | required direct call | `prepare()` より前を維持。失敗時は job state、worktree、journal、exit guard を作らず exit 1 となる |
| duplicate guard → bootstrap | required direct call | 同じ repo root / slug を用い、`bootstrapJob()` より前を維持。占有拒否時に job state を生成しない |
| setup → reload | named persistence capability | 新規 run のみ `existingWorktreePath === undefined` で reload し、resume は prepare 済み state を維持して skip する |
| reload → deps → cleanup | runner-owned narrow composition | reload 成功後に deps を構築し、その後 cleanup handle を登録する。初期化失敗時には pipeline を開始せず failed state を persist する |
| pipeline → teardown | required lifecycle capability | pipeline throw では `teardown(handle, "error")` を一回、通常完了では最終 status を渡して一回実行する |
| permission scope → changed-files gate | required predicate | scope 非宣言 profile は predicate を呼ばず、scope 宣言 profile で false の場合だけ bootstrap 前に拒否する。step 側も false を UNKNOWN として fail-closed に扱う |
| runtime → commit/revision capability | bound method object | Local / Managed とも同一 runtime instance の既存メソッドを bind し、downstream が仮定する receiver と引数を維持する |

## 実行列

1. 新規 Local run は readiness → validation/scope gate → duplicate guard → bootstrap → setup → reload → deps build → cleanup registration → pipeline → teardown の順序を維持する。
2. 新規 Managed run は setup 後に既存の `reloadJobState` fail-closed throw を捕捉し、`RELOAD_FAILED` state を persist して pipeline 開始前に停止する。
3. resume は readiness 後に既存 state/worktree を解決し、setup 後の reload を skip して deps build 以降へ進む。
4. setup failure は workspace `null` で failed state を persist し、cleanup handle を生成しない。
5. reload、deps build、cleanup registration の失敗は pipeline を開始せず、利用可能な workspace を添えて failed state を persist する。
6. scope 宣言 profile と changed-files 非対応 runtime の組合せは bootstrap 前に拒否され、scope 非宣言 profile は従来どおり進む。
7. pipeline throw と通常 terminal completion の双方で、未変更の cleanup 実装が仮定する有効な handle と一回だけの teardown 呼出しが保たれる。

未変更の store、slug occupancy guard、pipeline state machine、scope evaluator、exit guard、cleanup handler が仮定する入口条件、順序、引数を破る新経路は確認されなかった。

## 検証できなかった項目

- 実 provider、GitHub、Managed Agents API に接続する手動 CLI 実行は、外部接続を伴うため実施していない。

## Findings 詳細

None — 変更されていない隣接コードの暗黙の前提を破る、具体的かつ通常の supported execution に影響する問題は確認されなかった。
