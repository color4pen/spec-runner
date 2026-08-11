# job cancel の process-tree kill — status gate を pid 生存 gate に置き換え、detach 子孫プロセスを回収する

## Meta

- **type**: spec-change
- **slug**: cancel-process-tree-kill
- **base-branch**: main
- **adr**: true

## 背景

detach 起動した job を `job cancel` すると、runner プロセス配下の agent subprocess（Agent SDK が spawn する claude CLI）が孤児として残る。実運用で cancel 後に孤児 2 プロセスが残り、手動 kill を要した。

原因は kill 経路の 3 つの構造的な穴が重なっていること:

1. **kill が status でゲートされる**: cancel は `state.status === "running"` のときだけ kill を試みる。resume 走行中は main checkout の state.json が awaiting-resume のまま実プロセスが走る構造（resume の running 遷移は worktree 側 store に persist される）があるため、この経路では kill 自体が警告なしでスキップされる。
2. **pid 解決に fallback がない**: cancel は `state.pid` しか見ない。`job wait` は state.pid → liveness sidecar → last-known の解決連鎖を持つのに、cancel には sidecar fallback がなく、state.pid が null だと「no PID recorded」警告を出して kill を放棄する。sidecar には pid が書かれている。
3. **単一 pid しか kill しない**: kill 対象は解決した 1 pid のみで、process group / 子孫プロセスへの伝播手段がない。runner の SIGTERM handler も awaiting-resume の persist と `process.exit(130)` を行うだけで、in-flight の agent subprocess を終了させない。SIGKILL 昇格時は handler 自体が走らないため、agent subprocess は確実に孤児化する。

detach 子は `detached: true` で spawn され自分自身が process group leader になるため、group への signal 送出で子孫を回収できる下地は既にある。

## 現状コードの前提

- cancel の kill block は `state.status === "running"` でゲートされ、`state.pid` が null なら警告のみで続行する（`src/core/cancel/runner.ts:348-361`）
- `gracefulKill` は単一 pid への SIGTERM → poll → SIGKILL 昇格のみ（`src/core/cancel/pid-kill.ts:31-94`）。process group への送出（`process.kill(-pid)`）はコードベースに存在しない
- detach 子は `detached: true` で spawn される＝POSIX では自分が process group leader（`src/util/spawn.ts:118-122`、`src/core/command/detach.ts:119-124`）
- runner の SIGINT/SIGTERM handler は interruption 記録 + awaiting-resume persist + `releasePowerAssertion()` + `process.exit(130)` のみで、子プロセスの終了処理を持たない（`src/core/runtime/local.ts:1518-1550`）
- agent subprocess の abort 手段は agent-runner 内の per-call `AbortController`（wall-clock timeout 用）として存在するが、signal handler から到達する seam はない（`src/adapter/claude-code/agent-runner.ts:515-520`）
- `job wait` の pid 解決連鎖: state.pid → liveness sidecar → last-known（`src/cli/job-wait.ts:209-218`）。cancel は state.pid のみ（`src/cli/cancel.ts:104-122` から `cancelSingleJob` へ）
- liveness sidecar `.specrunner/local/<slug>/liveness.json` には pid が書かれる（`src/core/runtime/local.ts:1432` `writeLivenessSidecar`、default `process.pid`）
- caffeinate（power assertion）は `-w <runner pid>` 付きで spawn され、runner 死亡で自動 exit する既存 backstop がある（`src/core/runtime/power-assertion.ts:64-70`）— 本 request の対象外
- resume 走行中の disk-lag（main checkout state.json が awaiting-resume のまま実プロセスが走る）は `src/cli/job-wait.ts:1-12` の docstring に明記されている既知構造

## 要件

1. **pid 解決の統一**: cancel の kill 対象 pid 解決を `job wait` と同じ連鎖に揃える — `state.pid` → liveness sidecar（`jobId` 一致時のみ採用）。解決ロジックは cancel / wait で共有できる形に置く。
2. **kill 判定の process-death-gate 化**: kill するかどうかを `state.status` で判定しない。解決した pid が生存していれば、on-disk status が awaiting-resume 等であっても gracefulKill を実行する（disk-lag 経路の穴を塞ぐ）。pid がどこからも解決できない場合は現行どおり警告して続行する。
3. **SIGKILL 昇格時の process group 回収**: gracefulKill の SIGKILL 昇格時、対象 pid が process group leader（detach 起動）である場合に限り、group（`-pid`）へ SIGKILL を送出して子孫を回収する。**非 leader（foreground 起動の job）には group signal を送らない** — 呼び出し元 shell / 同 group プロセスの巻き添えは絶対に許容しない。leader 判定の実装手段は design で確定する。
4. **runner 自身の graceful な子回収**: runner の SIGINT/SIGTERM handler が、exit 前に in-flight の agent query を abort する（SDK subprocess へ終了が伝播する）。既存の per-call AbortController に signal handler から到達できる登録 seam を追加する。abort の完了待ちは有限（bounded）とし、awaiting-resume persist の既存動作は維持する。
5. **cancel 出力の追随**: kill をスキップした理由（pid 解決不能）と、group 回収を実施した事実が cancel の出力から判別できること。

## スコープ外

- managed runtime の cancel 経路（marker / state 整理は現状維持）
- Windows での process group 挙動の検証（既存 detach 機構と同じく POSIX を一次対象とし、制約を設計に明記する）
- 受理前 status（fake-running）の導入 — 別 request
- `job wait` / `job ls` の挙動変更
- 子 pid の state / sidecar への記録（設計判断で却下、下記）

## 受け入れ基準

- [ ] cancel: `state.pid` が null でも liveness sidecar（jobId 一致）から pid を解決して kill することをテストで固定する
- [ ] cancel: 解決 pid が生存中なら on-disk status が awaiting-resume でも kill が実行されることをテストで固定する（disk-lag 経路の歯）。破壊確認込み
- [ ] cancel: sidecar の jobId が別 job のものである場合、その pid を kill しないことをテストで固定する
- [ ] gracefulKill: SIGKILL 昇格時、leader pid に対して group（負 pid）への送出が行われることをテストで固定する（kill seam の注入で検証）。非 leader pid には group 送出しないことをテストで固定する
- [ ] runner: SIGTERM 受信で in-flight agent query の abort が発火することをテストで固定する（seam 注入）。破壊確認込み
- [ ] 統合: detach 起動した job の cancel 後に、その process group に属するプロセスが残らないことをテストで固定する（group kill を no-op 化すると fail する形）
- [ ] 既存 cancel テスト（`tests/unit/core/cancel/runner.test.ts` / `tests/unit/cli/cancel.test.ts` / `tests/unit/core/cancel/sidecar-teardown.test.ts` / `src/core/cancel/__tests__/runner-branch-delete.test.ts`）は原則無変更で green。kill 判定変更により期待の更新が必要な場合は該当 it を名指しして更新する（status ゲートを pin している it のみ許容）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: kill 判定は process-death-gate** — disk status は resume 走行中に awaiting-resume のまま残る既知構造があり、status gate はこの経路で原理的に穴になる。生存プロセスの有無だけが kill の正しい判定材料。
- **採用: group signal は leader 判定付き** — detach 子は `detached: true` により自分が group leader。foreground job は呼び出し元 shell の group 内にいるため、無条件の `-pid` 送出は巻き添え事故になる。leader のときのみ group 回収する。
- **採用: graceful 経路は runner 自身の abort** — agent subprocess の pid は cancel 側から観測できない（step ごとに生成・消滅する）。SIGTERM を受けた runner 自身が in-flight query を abort するのが、子の所在を知る唯一のプロセスに回収責任を置く構造。
- **却下: 子 pid の state / sidecar への記録** — agent subprocess は step 単位で生成・消滅し、記録は常に実態から遅れる。所有情報は process group で表現する方が leak しない。
- **却下: ps ベースの process tree walk** — 移植性が低く、走査と kill の間に race がある。group signal は kernel が原子的に配送する。
