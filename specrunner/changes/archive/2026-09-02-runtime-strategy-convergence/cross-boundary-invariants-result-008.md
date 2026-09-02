# Cross-Boundary Invariants Review — iteration 8

<!-- verdict は CLI が typed findings から導出するため、この file には verdict 行を書かない。 -->

## 検証範囲と証拠

- `git diff main...HEAD --stat` を実行し、129 files / 12,854 insertions / 1,359 deletions の変更範囲を確認した。
- reviewer 定義、`design.md`、`tasks.md` を読み、provider readiness、duplicate guard、workspace setup、state persist/reload、deps build、cleanup registration、teardown の順序、および resume 時の reload 条件を正典として照合した。
- iteration 7 後の変更を確認した。production の lifecycle 経路に変更はなく、追加変更は Command 系 test fake を consumer-owned contract に狭めることと、その回帰を検出する ratchet の強化だった。
- `CommandRunner.execute()` の呼出し先に加え、Local / Managed runtime、未変更の state transition、slug store、exit guard、scope gate、cleanup 実装が置く入口条件を確認した。
- `bun run typecheck` は成功した。
- lifecycle contract、ratchet、runner、resume、duplicate guard の targeted test は 5 files / 76 tests がすべて成功した。Vitest 終了後に GitHub Actions summary の read-only path への書込み警告が出たが、test process は exit code 0 だった。

## Cross-boundary invariant の照合

| 境界 | 現行経路 | 未変更コード側の前提との照合 |
|---|---|---|
| provider readiness → prepare | required direct call | `prepare()` より前を維持し、失敗時は job state、worktree、journal、exit guard を生成しない |
| scope gate / duplicate guard → bootstrap | required capability calls | scope 判定と slug 占有確認はいずれも `bootstrapJob()` より前で、拒否時に state を生成しない |
| setup → reload | required persistence capability | 新規 run のみ reload し、`existingWorktreePath !== undefined` の resume は prepare 済み state を維持して skip する |
| reload → deps → cleanup | runner-owned narrow composition | reload 成功後に deps を構築し、その後 cleanup handle を登録する。初期化失敗時は pipeline を開始しない |
| pipeline → teardown | required lifecycle capability | throw 時は `teardown(handle, "error")`、通常完了時は final status で、それぞれ一回だけ実行する |
| runtime → step capabilities | bound narrow objects | Local / Managed とも同一 runtime instance の既存メソッドを bind し、receiver、引数、戻り値契約を維持する |
| composition root → command | structural narrowing | factory/bootstrap の `RuntimeFacade` は run の scope gate に必要な changed-files capability を保持し、ResumeCommand には未使用 capability を要求しない |
| test fake → production contract | consumer-owned typed fake | test-only object から余分な lifecycle / changed-files capability を除いても production の dispatch、state、store、cleanup 経路には影響しない。ratchet は runtime 引数の unsafe cast 再導入を検出する |

## 実行列

1. 新規 Local run は readiness → validation/scope gate → duplicate guard → bootstrap → setup → reload → deps build → cleanup registration → pipeline → teardown の順序を維持する。
2. 新規 Managed run は setup 後の明示済み fail-closed reload 契約に従い、reload error を failed state として persist して pipeline 開始前に停止する。
3. resume は readiness 後に既存 state/worktree を解決し、setup 後の reload を skip して deps build 以降へ進む。
4. setup failure は workspace `null` で failed state を persist し、cleanup handle を生成しない。
5. reload、deps build、cleanup registration の失敗は pipeline を開始せず、利用可能な workspace を添えて failed state を persist する。
6. permission scope を宣言する profile と changed-files 非対応 runtime の組合せは bootstrap 前に拒否され、scope 非宣言 profile は predicate を呼ばず従来どおり進む。
7. pipeline throw と通常 terminal completion の双方で、cleanup 実装へ有効な handle と一回だけの teardown 呼出しが渡る。
8. iteration 8 の test-fake narrowing は constructor の静的入力だけを変更し、上記の production 実行列や Local / Managed の差異を増減させない。

未変更の store、slug occupancy guard、pipeline state machine、scope evaluator、exit guard、cleanup handler が仮定する入口条件、順序、引数を破る新経路は確認されなかった。

## 検証できなかった項目

- 実 provider、GitHub、Managed Agents API に接続する手動 CLI 実行は、外部接続を伴うため実施していない。

## Findings 詳細

None — 変更されていない隣接コードの暗黙の前提を破る、具体的かつ通常の supported execution に影響する問題は確認されなかった。
