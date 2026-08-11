# ADR: job cancel process-tree kill — status gate 廃止・process group 回収・runner 自身の graceful abort

- **date**: 2026-08-11
- **slug**: cancel-process-tree-kill
- **status**: accepted

## Context

`job cancel` を detach 起動した job に対して実行すると、runner プロセス配下の agent subprocess（Agent SDK が spawn する `claude` CLI）が孤児として残った。実運用で cancel 後に孤児 2 プロセスが残り、手動 kill が必要になった。

原因は kill 経路の 3 つの構造的な穴が重なっていたこと:

1. **status gate** — kill block が `state.status === "running"` のときしか実行されなかった。resume 走行中は main checkout の `state.json` が `awaiting-resume` のまま実プロセスが走る既知構造（disk-lag）があり、この経路で kill がサイレントスキップされた。
2. **pid fallback 欠如** — cancel は `state.pid` しか参照しなかった。`job wait` は `state.pid → liveness sidecar → last-known` の解決連鎖を持つのに、cancel には sidecar fallback がなく、`state.pid` が null だと警告のみで kill を放棄した。
3. **単一 pid kill** — `gracefulKill` は 1 pid のみを対象とし、process group / 子孫プロセスへの伝播手段がなかった。detach 子は `detached: true` で spawn され自分が process group leader になるため、SIGKILL 昇格時に handler が走らず agent subprocess が確実に孤児化した。

detach 子は `detached: true` で spawn されるため（POSIX では pgid == pid）、group への signal 送出（`kill(-pid)`）で子孫を回収できる下地は既にあった。

## Decisions

### D1: Kill 判定を status gate から process-death gate に変更する

`state.status === "running"` によるゲートを廃止し、**解決した pid が生存しているかどうか**だけで kill を判定する。

pid が解決できれば `state.status` が何であっても `gracefulKill` を呼び出す（`awaiting-resume` でも kill する）。pid がどこからも解決できない場合は警告して続行する。`gracefulKill` は既に `ESRCH` を kill 成功として扱うため、dead pid に対する二重 kill は安全。

**採用理由**: disk status は resume 走行中に `awaiting-resume` のまま残る既知構造があり、status gate はこの経路で原理的に穴になる。生存プロセスの有無だけが kill の正しい判定材料。liveness 判定を `gracefulKill` 内に委ねることで、既存の running-path テスト（SIGTERM を必ず送るという期待）を無変更で通せる。

**代替案**:

| 案 | 理由 | 採否 |
|---|---|---|
| 明示的 `isAlive(pid)` pre-gate | SIGTERM を送らないパスが生まれ既存テストが割れる。`gracefulKill` が dead pid を自然に処理できるため冗長 | 不採用 |
| status 許可リスト拡張（running + awaiting-resume） | disk status は resume 走行中に信頼できない。request が status gate を明示的に禁じている | 不採用 |

**残存リスク**: pid reuse（dead runner の pid が無関係プロセスに再利用される）。これは変更前の running 経路と `job wait` にも存在する pre-existing リスク。(a) jobId-gated sidecar 採用、(b) terminal 遷移時に sidecar が削除される、(c) group signal は leader probe が成功した場合にのみ送出する、の 3 つが bounded する。

### D2: cancel の pid 解決を jobId-gated sidecar fallback 付き共有 resolver に統一する

`cancelSingleJob` の pid 解決を `state.pid → liveness sidecar（jobId 一致時のみ採用）` の連鎖に変更し、`job wait` の既存連鎖と同等にする。

純粋関数 `resolveJobPid({ statePid, sidecar, expectedJobId })` と async の `readLivenessSidecar(path)` を `src/core/liveness/resolve-pid.ts` に切り出す。`cancelSingleJob` はこれを消費し `expectedJobId = state.jobId` を渡す。

**jobId gate の必要性**: slug が再利用されると、sidecar が別 job のものを指す可能性がある。そのプロセスを kill することは許容されない。jobId 照合はこの境界の唯一の機械的保証。

**採用理由**: cancel と `job wait` が独立した連鎖実装を持つと実装が乖離する。純粋関数として切り出すと fs なしで全 3 ケース（state 優先・sidecar 採用・sidecar 棄却）がテスト可能。

**代替案**:

| 案 | 理由 | 採否 |
|---|---|---|
| `cancelSingleJob` 内にインライン実装 | cancel と `job wait` の連鎖が独立して乖離する | 不採用 |
| 本 change で `job wait` も共有 resolver に移行 | `job wait` の挙動変更はスコープ外。テスト影響も大きい。配置場所だけ確保し後続 change で統合できる形にする | 後回し |

### D3: SIGKILL 昇格時に leader 判定付きで process group を回収する

`gracefulKill` に `isGroupLeader(pid) → boolean` の注入を追加する。
対象 pid の死が観測されたすべてのパス（SIGTERM poll 中の `isAlive` false / ESRCH、SIGKILL 昇格）において、`isGroupLeader(pid)` が true の場合に SIGKILL を group（`-pid`）に送出する。`KillResult` に `groupKilled: boolean` を追加。

**重要**: SIGTERM で leader が死んでも子孫が group を生かし続ける場合があるため、poll-death パスでも group 回収が必要。これが孤児問題の核心。

**leader 判定（production 実装）**: `kill(-pid, 0)` を probe として使用する。成功 ⟺ process group `pid` が存在 ⟺ （live pid に対して）pid が group leader（pgid == pid）。detach 子は leader → 成功。foreground job は shell の group member → group `pid` は存在しない → ESRCH → 非 leader。いかなる例外も非 leader として扱う（保守的方向への誤り）。

**安全性の非対称性**: 誤って leader と判定した場合は呼び出し元 shell の group を kill する（壊滅的）。誤って非 leader と判定した場合は孤児が残る（劣化、安全）。したがって probe が clean positive を返した場合のみ group signal を送る。

`CancelDeps` に optional `isGroupLeader?: (pid) => boolean` を追加し、未配線のテストが group signal を送らないようにするため `deps.isGroupLeader ?? (() => false)` を `gracefulKill` に渡す。CLI (`src/cli/cancel.ts`) に production probe を供給する。

**採用理由**: kernel が group membership の唯一の信頼できる情報源。`kill(-pid, 0)` は同じ `process.kill` プリミティブを liveness probe と共用しており新たな依存がない。ps ベースのツリー走査に比べ、group signal は kernel が原子的に配送する。

**代替案**:

| 案 | 理由 | 採否 |
|---|---|---|
| state / sidecar に `detached` フラグを記録 | 古くなる可能性があり、kernel probe が常に正確。request が sidecar への子 pid 記録を明示的に却下している理由と同型 | 不採用 |
| ps ベースの process tree walk + 各 pid kill | 移植性が低い。走査と kill の間に race がある。kernel の group signal は原子的 | 不採用 |
| SIGKILL 昇格時のみ group kill（poll-death 除外） | SIGTERM で leader が死亡し子孫が group を維持するケースをカバーできない。孤児問題の核心を塞げない | 不採用 |
| group signal を EPERM/ESRCH で fail させる | group signal は best-effort（race や権限の差異がある）。pid kill の成否を汚染してはならない | 不採用 |

**POSIX 制約**: Windows では `kill(-pid, …)` の semantics が異なる。leader probe が throw すると非 leader として扱うため、Windows では group signal がスキップされ現行の single-pid kill に劣化する。

### D4: runner 自身の signal handler に QueryAbortHub 経由で in-flight query を abort させる

agent subprocess の pid は cancel 側から観測できない（step ごとに生成・消滅する）。子の所在を知る唯一のプロセスである runner 自身に graceful teardown の責任を持たせる。

**構成要素**:

- `src/core/port/query-abort.ts` — `interface QueryAbortRegistration { register(controller: AbortController): () => void }` （adapter → core/port のみという既存 layer 境界を尊重）
- `src/core/lifecycle/query-abort-hub.ts` — `QueryAbortHub` が `register`（deregister fn を返す）・`abortActive()`・`drain(timeoutMs, sleep)` を実装。pure、I/O なし、unit testable
- `ClaudeCodeRunner` — `ClaudeCodeRunnerDeps` に optional `queryAbortHub?: QueryAbortRegistration` を追加。`run()` で per-call `AbortController` 生成直後に register し、全 exit path の `finally` で deregister
- `LocalRuntime` — hub を構築し `createAgentRunner()` に渡す。`signalCleanup` では `markSignalHandlerFired()`（同期）の直後に `hub.abortActive()` → `await hub.drain(bound, sleep)` を実行し、その後に既存の `awaiting-resume` persist → `releasePowerAssertion()` → `process.exit(130)` を行う

**ordering 保証**: `markSignalHandlerFired()` が最初の await より前に同期実行される既存の exit-guard ordering contract が保たれる。`awaiting-resume` persist が signal path の最終状態書き込みであることが保たれる。

**採用理由**: 既存の per-call `AbortController` をそのまま流用する。registry が唯一の新状態で bounded かつ observable。abort が先に始まることで SDK が subprocess teardown を開始しながら persist I/O が走る。bounded drain が hang を防ぎ、group SIGKILL（D3）が SDK が時間内に回収できなかった場合の backstop になる。

**代替案**:

| 案 | 理由 | 採否 |
|---|---|---|
| adapter から concrete hub を直接 import | `adapter → core/port` のみという既存 layer 境界を破る | 不採用 |
| signal handler から `run()` promise 全体を await | pipeline 内部への結合が深く、registration set の drain で十分かつ bounded | 不採用 |
| 子 pid を state / sidecar に記録して cancel 側から kill | agent subprocess は step 単位で生成・消滅し記録は常に実態から遅れる。ownership は process group で表現する方が leak しない（D3 の group kill が backstop として機能）。request でも明示的に却下 | 不採用 |

## Consequences

### Positive

- resume 走行中（disk-lag 経路）で `job cancel` を実行しても kill がスキップされなくなる
- detach 起動した job の cancel 後に process group に属するプロセスが残らない（agent subprocess の孤児問題が解消）
- cancel の出力がスキップ理由（pid 解決不能）と group 回収の事実を区別できる
- runner が SIGTERM を受けた際に in-flight agent query が abort され SDK subprocess が graceful に tear down される
- `resolveJobPid` が純粋関数として切り出されており、将来 `job wait` が統合する際に共通基盤になる

### Negative / 既知の負債

- **[group signal + pid reuse]** SIGKILL 昇格は pid が SIGTERM poll window を通じて生存し続けた後にのみ発生するため、single `gracefulKill` 呼び出しの範囲内で pid が reuse される機会はない。leader detection は昇格時に新規 kernel probe を発行する。
- **[SDK が AbortController を honor しない]** これは group SIGKILL（D3）が存在する理由そのもの。graceful abort は best-effort、group reap が保証になる。
- **[`awaiting-resume` の concurrent persist との競合]** signal path は drain 後に `awaiting-resume` を persist する（signal path での最終書き込み）。`markSignalHandlerFired()` が mid-run persist を既に抑制している。競合が統合テストで顕在化した場合の最小対応は pipeline の mid-run persist を `isSignalHandlerFired()` でゲートすること（今回は pre-emptive に実装しない）。
- **[Windows での劣化]** D3 の POSIX 制約参照。Windows では group signal がスキップされ現行の single-pid kill に劣化する（既存 detach 機構も同じく POSIX 一次対象）。
- **[`job wait` の pid 解決連鎖が未統合]** `job wait` は `resolveJobPid` を使わず既存のインライン連鎖（`last-known` tail 付き）を維持する。挙動変更なしでの統合は後続 change に委ねる。

### 将来の開発者への注意

- **signal handler に新しい await 境界を追加する場合**: `markSignalHandlerFired()` の呼び出しを最初の await より前に同期実行される状態で維持すること。exit-guard ordering contract の前提になっている
- **group signal を追加する場合**: `kill(-pid, 0)` probe が clean positive を返した場合にのみ group signal を送るという asymmetric safety bias を維持すること。foreground job への巻き添えは絶対に許容されない
- **`job wait` を共有 resolver に移行する場合**: `readSidecarPid` injection seam と wait-only `last-known` tail の挙動を保持しつつ移行する。挙動変更なしが前提

## References

- Request: `specrunner/changes/cancel-process-tree-kill/request.md`
- Design: `specrunner/changes/cancel-process-tree-kill/design.md`
- Spec: `specrunner/changes/cancel-process-tree-kill/spec.md`
- 関連 ADR: [2026-05-26-process-lifecycle-keepalive](./2026-05-26-process-lifecycle-keepalive.md) — runner の KeepAlive と signal handler の既存設計（本 change は signal handler に abort hub を追加する）
- 関連 ADR: [2026-05-05-agent-runner-port-and-local-runtime](./2026-05-05-agent-runner-port-and-local-runtime.md) — `AgentRunner` port 契約と `LocalRuntime` の adapter → core/port layer 境界（本 change の D4 がこの境界を踏襲する根拠）
- 関連 ADR: [2026-05-21-job-cancel-audit-trail-over-delete](./2026-05-21-job-cancel-audit-trail-over-delete.md) — cancel の基本設計（marker / state teardown の現状維持はこの ADR の判断を引き継ぐ）
