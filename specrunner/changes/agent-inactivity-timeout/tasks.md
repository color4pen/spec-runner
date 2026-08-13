# Tasks: agent 呼び出しの無活動タイムアウト

## T-01: shared inactivity watchdog を新設する

新規ファイル `src/adapter/shared/inactivity-watchdog.ts` に、イベント無活動を見張る
watchdog を実装する(design D5/D6)。

- [ ] `export const DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;`(900_000)を定義する。
- [ ] `createInactivityWatchdog(onFire: () => void, timeoutMs?: number, now?: () => number)` を実装する。
  - `timeoutMs` 既定 `DEFAULT_INACTIVITY_TIMEOUT_MS`、`now` 既定 `Date.now`。
  - `bump()`: 既存タイマーを clear し `setTimeout(timeoutMs)` で再 arm、`lastActivityAt = now()` を更新。
    既に `fired === true` の場合は no-op(再 arm しない)。
  - タイマー発火時: `fired = true`、`elapsedMs = now() - lastActivityAt` を確定し、`onFire()` を呼ぶ。
  - `clear()`: タイマーを clear(冪等、複数回呼んでも安全)。発火状態は保持する。
  - `fired`(boolean)/ `elapsedMs`(number、未発火時 0)を読み取り可能に露出する(getter でも可)。
- [ ] `export function formatInactivityTimeoutMessage(stepName: string, elapsedMs: number): string` を実装する。
  文言に「inactivity timeout」であることと `elapsedMs`(最終イベントからの経過時間)を含める。
  例: ``Step '<step>' inactivity timeout: no agent event for <elapsedMs>ms``。
- [ ] `src/adapter/shared/inactivity-watchdog.test.ts` を新設し、fake timers で下記を固定する。
  - bump しないまま `timeoutMs` 経過 → `onFire` が 1 回呼ばれ `fired === true`、`elapsedMs === timeoutMs`。
  - `timeoutMs` 未満で bump を繰り返す限り `onFire` は呼ばれない(巻き直し)。
  - 発火後の `bump()` は再 arm しない(以後 `onFire` が再度呼ばれない)。
  - `clear()` 後はタイマーが発火しない。
  - `formatInactivityTimeoutMessage` の出力が step 名と elapsedMs を含む。

**Acceptance Criteria**:
- `src/adapter/shared/inactivity-watchdog.ts` が存在し、`createInactivityWatchdog` /
  `DEFAULT_INACTIVITY_TIMEOUT_MS` / `formatInactivityTimeoutMessage` を export する。
- watchdog の unit test が fake timers で bump/fire/no-op-after-fire/clear/message を green で固定する。
- `bun run typecheck` が green。

## T-02: claude-code adapter に無活動 watchdog を配線する

`src/adapter/claude-code/agent-runner.ts` の 3 つの message ループへ watchdog を適用する
(design D3/D4/D5/D6)。既存 wall-clock timeout の意味論・message・code は変更しない。

- [ ] `../shared/inactivity-watchdog.js` から `createInactivityWatchdog` /
  `formatInactivityTimeoutMessage` を import する。
- [ ] run() スコープ(`abortController` 生成後、:527-534 付近)で watchdog を 1 個生成する。
  `onFire` は `abortController.abort()` を呼ぶ。wall-clock タイマー(timeoutId)とは独立。
- [ ] main work ループ(:651)で `for await` 直前に `watchdog.bump()` を呼び、各 message 受信時に
  `watchdog.bump()` を呼ぶ(query 発行〜最初の message の区間も見張る = 要件 2)。
- [ ] follow-up ループ(:772、`runFollowUpQueryWithRetry` の inner)でも同様に、`for await` 直前と
  各 message 受信時に `watchdog.bump()` を呼ぶ。
- [ ] output-repair ループ(:1008)でも同様に `for await` 直前と各 message 受信時に `watchdog.bump()`。
- [ ] output-repair catch(:1028)は `catch (err)` に変更し、冒頭に
  `if (abortController.signal.aborted) throw err;` を追加する。watchdog 発火による abort が
  "best-effort" 扱いで飲み込まれず outer catch へ伝播するようにする。
- [ ] catch 節(:1099)の timeout 判定を
  `abortController.signal.aborted && (timeoutId !== undefined || watchdog.fired)` に拡張する。
  - `watchdog.fired` のとき error message を
    `formatInactivityTimeoutMessage(step.name, watchdog.elapsedMs)` にし、code は `STEP_TIMEOUT` のまま。
  - `watchdog.fired` でない(= wall-clock)ときは既存 message
    ``Step '${step.name}' timed out after ${resolvedConfig.timeoutMs}ms`` を維持する。
  - `completionReason: "timeout"` / `error.code: "STEP_TIMEOUT"` は両ケースとも不変。
- [ ] finally 節(:1133-1137)で `watchdog.clear()` を呼ぶ(全 exit path で確実に停止)。

**Acceptance Criteria**:
- 3 ループすべてで message 受信ごとに watchdog が巻き直される。
- 無活動発火時に `completionReason: "timeout"` / code `STEP_TIMEOUT` を返し、message に
  無活動の旨と `elapsedMs` を含む。
- output-repair ループ中に watchdog が発火した場合、abort エラーが repair catch で飲み込まれず
  outer catch へ伝播し、`completionReason: "timeout"` として返る。
- wall-clock timeout(timeoutMs 設定時)の completionReason / code / message は従来どおり不変。
- watchdog が全 exit path(success/error/timeout/throw)で clear される。
- 既存の TC-032/033/034/035/041 等 timeout 系テストが**無変更で** green。

## T-03: codex adapter に無活動 watchdog を配線する

`src/adapter/codex/agent-runner.ts` の events ループへ watchdog を適用する(claude-code と同型)。

- [ ] `../shared/inactivity-watchdog.js` から `createInactivityWatchdog` /
  `formatInactivityTimeoutMessage` を import する。
- [ ] run() スコープ(`abortController` 生成後、:329-333 付近)で watchdog を 1 個生成する。
  `onFire` は `abortController.abort()`。
- [ ] `executeTurn` の events ループ(:398)で `for await` 直前に `watchdog.bump()`、各 `ev` 受信時に
  `watchdog.bump()` を呼ぶ。executeTurn は main/follow-up/repair の全 turn が経由するため、
  これ 1 箇所で全ループを見張れる。
- [ ] output-repair catch(:691)は `catch (err)` に変更し、冒頭に
  `if (abortController.signal.aborted) throw err;` を追加する。watchdog 発火による abort が
  "best-effort" 扱いで飲み込まれず outer catch へ伝播するようにする。
- [ ] catch 節(:747-764)の timeout 判定を
  `abortController.signal.aborted && (timeoutId !== undefined || watchdog.fired)` に拡張する。
  - `watchdog.fired` のとき error message を `formatInactivityTimeoutMessage(step.name, watchdog.elapsedMs)`
    にし、code は `STEP_TIMEOUT` のまま。
  - それ以外は既存 message を維持する。
- [ ] finally 節(:779-781)で `watchdog.clear()` を呼ぶ。

**Acceptance Criteria**:
- events ループで event 受信ごとに watchdog が巻き直される。
- 無活動発火時に `completionReason: "timeout"` / code `STEP_TIMEOUT` を返し、message に
  無活動の旨と `elapsedMs` を含む。
- output-repair ループ中に watchdog が発火した場合、abort エラーが repair catch で飲み込まれず
  outer catch へ伝播し、`completionReason: "timeout"` として返る。
- codex の既存 wall-clock timeout 系テストが無変更で green。
- watchdog が全 exit path で clear される。

## T-04: claude-code の無活動タイムアウト挙動をテストで固定する(fake timers)

`tests/unit/adapter/claude-code/agent-runner.test.ts` に受け入れ基準を pin するテストを追加する。
既存テストは変更しない(純追加)。

- [ ] **最初の message 未到着で発火**: fake timers 下で、abort に反応するが message を一切 yield
  しない queryFn を用意し、`vi.advanceTimersByTimeAsync(DEFAULT_INACTIVITY_TIMEOUT_MS)` で
  `completionReason === "timeout"` かつ `error.code === "STEP_TIMEOUT"` になることを固定する(要件 2)。
- [ ] **巻き直しで非発火**: message を閾値未満の間隔で複数回 yield する queryFn で、間に
  `vi.advanceTimersByTimeAsync(< 閾値)` を挟んでも発火せず `completionReason === "success"` に
  なることを固定する。
- [ ] **awaiting-resume 合流**: 上記発火ケースの結果を executor 経由(または `makeTimeoutHalt` の
  既存経路)で検証し、`completionReason: "timeout"` が awaiting-resume(resume 可能)に落ちることを固定する。
  ※ agent-runner 単体では `completionReason === "timeout"` / code `STEP_TIMEOUT` を assert すれば
  合流点(executor.ts:367 の分岐)は既存テストが担保する。合流を明示する場合は executor レベルの
  既存テスト構成に倣うこと。
- [ ] **halt 表示の内容**: 発火時の `result.error.message` が無活動タイムアウトの旨(例 "inactivity")
  と経過時間(`elapsedMs`、fake timers 下では閾値と一致)を含むことを固定する。
- [ ] **output-repair 中の発火**: output-repair turn 実行中(message ループではなく repair turn 期間中)に
  watchdog が発火した場合でも `completionReason === "timeout"` / code `STEP_TIMEOUT` を返すことを固定する。
  repair catch が `if (abortController.signal.aborted) throw err;` により abort を re-throw し、
  outer catch が timeout として処理することをテストで確認する。

**Acceptance Criteria**:
- 5 つの受け入れ基準(未到着発火 / 巻き直し非発火 / timeout+awaiting-resume 合流 / halt message 内容 /
  output-repair 中の watchdog 発火)が fake timers で green に固定される。
- 追加テストは既存テストを 1 件も改変しない。

## T-05: codex の無活動タイムアウト挙動をテストで固定する(fake timers)

`tests/adapter/codex/agent-runner.test.ts`(既存の codex timeout テストが属するファイル)に、
T-04 と同型の最小テストを追加する。

- [ ] fake timers 下で、events を一切 emit しない(abort に反応する)turn で
  `completionReason === "timeout"` / code `STEP_TIMEOUT` になることを固定する。
- [ ] event を閾値未満で流し続ける限り発火しないことを固定する。
- [ ] 発火時の error message が無活動の旨と elapsedMs を含むことを固定する。

**Acceptance Criteria**:
- codex 側でも未到着発火・巻き直し非発火・halt message 内容が fake timers で green に固定される。
- 追加テストは既存 codex テストを改変しない。

## T-06: 全体検証

- [ ] `bun run typecheck` が green。
- [ ] `bun run test`(vitest 全体)が green。既存 timeout 系 pin(claude-code / codex)が無変更で通る。

**Acceptance Criteria**:
- `typecheck && test` が green。
- design の Risks で挙げた「既存 pin と衝突しない」が実測で確認される(既存テストの diff が 0)。
