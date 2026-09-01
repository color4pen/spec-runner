# Cross-Boundary Invariants Review — iteration 3

<!-- verdict は CLI が typed findings から導出するため、この file には verdict 行を書かない。 -->

## 検証した項目

### 差分と正典

- `git diff main...HEAD --stat` を実行し、command lifecycle contract、CommandRunner と subclass、composition root、Local/Managed runtime、changed-files capability 周辺を主対象として確認した。
- `design.md` と `tasks.md` を通読し、readiness、duplicate guard、workspace setup、state reload、deps build、cleanup registration、teardown の順序および resume の reload skip 条件を正典として照合した。
- operator 裁定済みの ports→domain 逆依存と Command 系 test fake の収束について、現在の `command-runtime.ts`、`runtime-facade.ts`、ratchet test も確認した。

### required 化された呼び出しと未変更側の前提

| 境界 | main からの意味変化 | 未変更側の前提との照合 |
|---|---|---|
| provider readiness | 存在確認を除き直接呼び出しへ変更 | factory が生成する Local/Managed は main 時点から実装済み。呼び出し位置は `prepare()` 前のままで、失敗時は job/state/workspace を作らず exit 1 のまま |
| duplicate live-job guard | optional call を直接呼び出しへ変更 | Local/Managed は main 時点から `assertSlugUnoccupied` へ委譲。reviewer/descriptor validation 後かつ `bootstrapJob()` 前という副作用境界を維持 |
| job-state reload | メソッド存在確認のみ除去 | production の Local/Managed は main 時点からメソッドを保有していたため呼び出し集合は不変。`existingWorktreePath === undefined` の条件も不変 |
| changed-files derivability | optional call を required call へ変更 | factory の両 runtime は main 時点から predicate を実装。scope 非宣言時は gate が predicate を呼ばず、宣言時は false のみ拒否する分岐を維持 |
| commit/revision capability | derive shim を bound object に置換 | 同じ runtime instance の同じメソッドを bind しており、downstream の receiver、戻り値、optional capability slot の意味は不変 |

### lifecycle 実行列

1. 新規 Local run: readiness → prepare 内 duplicate guard → bootstrap → setup → canonical store reload → deps build → cleanup registration → pipeline → teardown。
2. 新規 Managed run: readiness no-op → duplicate guard → bootstrap → setup → required reload が既存実装どおり throw → `RELOAD_FAILED` persist → early return。main でもメソッドが存在したため同じ経路である。
3. resume（既存 worktree）: readiness → prepare で state load → setup → `existingWorktreePath !== undefined` により reload skip → deps build → cleanup registration → pipeline → teardown。
4. setup failure: failed transition → `persistJobState(..., null, ...)` → early return。cleanup handle は作成されず、teardown も呼ばれない既存の扱いを維持。
5. reload failure: workspace を伴う failed state persist 後、deps build と cleanup registration より前に停止。未変更 store が期待する workspace 引数を維持。
6. pipeline throw: cleanup handle 作成後に `teardown(handle, "error")` を一度呼び early return。正常/terminal path は最終 status で一度 teardown する既存分岐を維持。

上記の各列で、未変更の store、occupancy guard、pipeline、cleanup/teardown が仮定する入口条件・順序・引数を破る新経路は確認されなかった。

### 境界の構成

- `createRuntime()` と `BootstrapResult.runtime` は同じ `RuntimeFacade` を共有し、CLI から `PipelineRunCommand` まで scope gate、bootstrap、runner lifecycle に必要な capability が欠落しない。
- 基底 `CommandRunner` は readiness/workspace/state/deps の narrow intersection のみを参照し、bootstrap や runtime kind 分岐を未変更の pipeline/store 側へ漏らしていない。
- `RuntimeStrategy` の production consumer は concrete runtime の実装保証に限定され、pipeline/step の leaf consumer は従来どおり named capability 経由で動作する。

## 検証できなかった項目

- 実 provider、GitHub、Managed Agents API に接続した手動 CLI 実行。外部接続を伴うため本レビューでは実施していない。repository 内の verification report と contract/ratchet tests を補助証拠として確認した。

## Findings 詳細

None — 変更されていない隣接コードの不変条件を破る具体的な実行列は確認されなかった。
