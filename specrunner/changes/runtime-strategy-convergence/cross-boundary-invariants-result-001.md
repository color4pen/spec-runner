# Cross-Boundary Invariants Review — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. 差分と正典

- `git diff main...HEAD --stat` を実行し、production の中心差分が command lifecycle port、CommandRunner/subclass、runtime factory、Local/Managed runtime、runtime capability gate にあることを確認した。
- `design.md` の D1〜D7 と `tasks.md` の T-01〜T-14 を通読し、挙動不変条件（readiness → prepare、duplicate guard → bootstrap、setup → reload → deps build → cleanup registration → teardown、resume reload skip）を実装と照合した。

### 2. 新しい呼び出し経路と未変更側の前提

| 差分で強化された呼び出し | 呼び出し先・隣接機構の確認 | 結果 |
|---|---|---|
| `assertProviderReadiness()` の直接呼び出し | `LocalRuntime` は既存 probe 委譲、`ManagedRuntime` は既存 no-op。`prepare()` より前という位置と失敗時 exit 1/no job の扱いは維持 | 不変条件を維持 |
| `assertNoDuplicateLiveJob()` の直接呼び出し | Local/Managed とも既存 `assertSlugUnoccupied` 経路。descriptor/input validation 後、`bootstrapJob()` 前の順序を維持 | 不変条件を維持 |
| `reloadJobState()` の直接呼び出し | 条件 `existingWorktreePath === undefined` は変更なし。Local は setup が書いた canonical store を読む。Managed の throw も main 時点からメソッドが存在するため production 経路の意味は不変 | 不変条件を維持 |
| `canDeriveChangedFiles()` の直接呼び出し | factory が返す Local/Managed は main 時点から双方実装済み。scope 宣言なしでは呼ばず、scope 宣言ありでは false のみ拒否する既存分岐を維持 | 不変条件を維持 |
| derive shim から bound capability object への変更 | `listCommitChangedFiles` / `readRevisionContent` は同じ receiver に bind され、`PipelineDeps` の optional capability slot の形も変わらない | downstream の degrade 条件を維持 |

### 3. lifecycle の組み合わせ確認

`CommandRunner.execute()` とその未変更部分を通して以下の実行列を再構成した。

1. 新規 run: readiness → prepare 内 duplicate guard → bootstrap → setup → reload → buildDeps → registerCleanup → pipeline → teardown。
2. resume（既存 worktree）: readiness → prepare で state load → setup → reload skip → buildDeps → registerCleanup → pipeline → teardown。
3. setup failure: setup throw → failed state transition → `persistJobState(..., null, ...)` → early return。cleanup handle は未作成のままという既存前提を維持。
4. reload failure: setup 成功 → reload throw → failed state transition → workspace を渡して persist → early return。deps build/cleanup registration/pipeline は未到達。
5. readiness failure / duplicate conflict: workspace・state persistence より前に停止し、既存の副作用境界を越えない。

いずれも、未変更の store、pipeline、cleanup/teardown が仮定する入口条件を変える新経路は構成されなかった。

### 4. 型境界と composition root

- `createRuntime()` と `BootstrapResult.runtime` が同じ `RuntimeFacade` を共有し、CLI から command まで capability が欠落しないことを確認した。
- `PipelineRunCommand` が scope gate と bootstrap capability を使うため `RuntimeFacade` を保持し、基底 `CommandRunner` は bootstrap capability を露出しないことを確認した。
- production の full `RuntimeStrategy` 参照は concrete `LocalRuntime` / `ManagedRuntime` の実装保証に限定され、consumer 側へ runtime kind 分岐は追加されていない。
- `RuntimeFacade` に必要な changed-files capability が含まれるため、factory 境界を通過した後に scope gate だけが欠落する構造的不整合はない。

### 5. 回帰防止テストの確認

- `runtime-strategy-ratchet.test.ts` が whole-port intersection、`RealRuntimeStrategy`、`Pick<RuntimeStrategy` shim、double cast、changed-files optional call の再導入を検出することを確認した。
- `command-lifecycle-contract.test.ts` が Local/Managed 両 runtime の構造適合と readiness、duplicate guard、reload、changed-files predicate の差異を固定していることを確認した。
- runner / pipeline-run / resume の各テストで、新たに required となった capability fake が供給され、複合 lifecycle の順序・early return が引き続き検証されることを確認した。

## 検証できなかった項目

- 実際の provider、GitHub、Managed Agents API を使用した手動 CLI 実行。外部接続を伴うため本レビューでは実施していない。repository 内の verification report では build/typecheck/test/lint が green と記録されている。

## Findings 詳細

None — 変更されていない隣接コードの不変条件を破る具体的な実行列は確認されなかった。
