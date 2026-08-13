# Design: agent 呼び出しの無活動タイムアウト

## Context

2026-08-12 の走行で conformance step の agent 呼び出しが step:start 直後から 1 turn も
進まないまま 9 時間停止した(プロセス生存・ほぼ無 CPU、最初の API 呼び出しが返らない型のハング)。
現行の見張りはすべて素通りする: maxTurns は turn を消費しないハングに無力、wall-clock
timeout(timeoutMs)は解決の最終 fallback が null で全 step 無制限、プロセス生存判定は
プロセスが生きているため通過する。

固定の総時間タイムアウトは過去に意図的に撤廃されている(remove-session-timeout、健全な
長走行を殺すため)。健全な走行は SDK からイベント(message / event)が流れ続けるという
性質を使い、**イベントの無活動**を見張る。

現状コードの前提(request-review により attestation 済み):

- `src/adapter/claude-code/agent-runner.ts:527-534` — `AbortController` を生成し、
  `resolvedConfig.timeoutMs` が非 null かつ >0 のときのみ全体 wall-clock タイマーを接続。
- `src/adapter/claude-code/agent-runner.ts:651 / :772 / :1008` — SDK message の
  `for await` ループ(main work / follow-up / output-repair)。
- `src/adapter/claude-code/agent-runner.ts:1099-1115` — catch 節。
  `abortController.signal.aborted && timeoutId !== undefined` のときのみ
  `completionReason: "timeout"`(code `STEP_TIMEOUT`)を返す。それ以外の throw は error。
- `src/adapter/claude-code/agent-runner.ts:726` / codex `:528` — abort 済みなら
  resume→新セッション fallback を行わず再 throw(timeout として外側 catch へ伝播)。
- `src/adapter/codex/agent-runner.ts:329-333` — 同型の AbortController + wall-clock タイマー。
- `src/adapter/codex/agent-runner.ts:375-440` — `executeTurn` 内の events `for await` ループ
  (:398)。main / follow-up / repair の全 turn がこの 1 関数を経由する。
- `src/adapter/codex/agent-runner.ts:747-764` — catch 節。同じく
  `signal.aborted && timeoutId !== undefined` で timeout 判定。
- `src/core/step/executor.ts:367` — `completionReason === "timeout"` → `makeTimeoutHalt`。
- `src/core/step/step-halt.ts:119-150` — `makeTimeoutHalt` は awaiting-resume(resume 可能)を
  生成し、halt 表示 message は `${step} timed out: ${error.message}`。`error.message` は
  adapter が catch 節で構築した文字列。

**設計上の要:** 既存 catch の timeout 判定は `timeoutId !== undefined` を条件に含む。
無活動タイマーは既定で常時 on だが timeoutMs は null(timeoutId は undefined)のままなので、
このままでは無活動 abort が timeout 経路でなく **error 経路**に落ちる。判定条件の拡張が
本 change の中核であり、これを外すと awaiting-resume でなく terminal failure になる。

## Goals / Non-Goals

**Goals**:

- claude-code / codex の各 message(event)ループに、イベント到着ごとに巻き直す無活動
  タイマーを導入する。既定 15 分の定数。query 発行〜最初のイベントの区間も見張る。
- 発火時は既存 `AbortController` を abort し、既存 timeout 経路
  (`completionReason: "timeout"` → `makeTimeoutHalt` → awaiting-resume)に合流する。
- halt 表示に「無活動タイムアウトである旨」と「最終イベントからの経過時間」を含める。
- 既存 wall-clock timeout(timeoutMs、既定 null)の意味論は不変。両方有効なら先に発火した方が勝つ。

**Non-Goals**:

- managed runtime(`src/adapter/managed-agent/`)への適用。
- provider readiness probe(`provider-readiness-probe.ts` / `query-one-shot.ts`)への適用。
- 無活動閾値の config 項目化・request type 別調整(定数、config 化しない)。
- 検知後の自動 resume(halt までが責務。再開は既存 operator 経路)。
- 新しい halt 種別 / interruption reason の新設。

## Decisions

### D1: 総時間でなく「イベント無活動」を見張る

イベント到着ごとに巻き直すタイマーで、最後のイベントから閾値ぶん無音が続いたら abort する。

- **Rationale**: 健全な長走行(implementer は 1 時間走り得る)はイベントを流し続けるため
  誤爆しない。ハング(最初の API が返らない)は無音が続くため確実に捕捉する。固定 session
  timeout を撤廃した過去判断(remove-session-timeout)と矛盾しない。
- **Alternatives considered**: 全 step への既定 timeoutMs 設定 — 健全な遅い step と hang を
  時間だけで区別できず、撤廃の経緯を巻き戻す。却下(architect 評価済み)。

### D2: 閾値 15 分は定数、config 化しない

`DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000`(900_000ms)を単一定数として持つ。

- **Rationale**: 1 turn の生成に数分かかることはあるが、15 分の完全無音は異常。較正値であり
  ユーザー調整項ではない(再較正はコード変更で行う)。config 化は非 goal。
- **Alternatives considered**: step-config resolution chain への timeoutMs とは別枠追加 —
  スコープ外の設定表面を増やす。却下。

### D3: 新 halt 種別を作らず既存 timeout 経路に合流

無活動タイマー発火は wall-clock timeout と同じく `abortController.abort()` を呼び、
`completionReason: "timeout"` / code `STEP_TIMEOUT` を返す。executor.ts:367 →
`makeTimeoutHalt` → awaiting-resume の既存配管をそのまま使う。

- **Rationale**: 中断 → awaiting-resume → resume の配管と operator 案内が既存のまま機能する。
- **Alternatives considered**: 専用 interruption reason 新設 — 下流分岐が増えるだけで運用差なし。
  却下(architect 評価済み)。

### D4: catch の timeout 判定を「abort の原因」で拡張する

両 adapter の catch は現在 `signal.aborted && timeoutId !== undefined` で timeout を判定する。
無活動 abort は timeoutId が undefined のままなので、判定を
`signal.aborted && (timeoutId !== undefined || <無活動が発火した>)` に拡張する。

- **Rationale**: 無活動発火を timeout 経路へ確実に合流させる唯一の分岐点。無活動の発火有無は
  watchdog(D5)が保持する `fired` フラグで判定する。他の abort(agent-redirect による
  `abort();break`(claude-code:672)等)は fired=false かつ timeoutId=undefined のまま
  なので従来どおり timeout に**分類されない**(挙動不変)。
- **Alternatives considered**: `timeoutId` を無活動でも常に立てて既存条件を流用 — wall-clock と
  無活動が混線し、error message の出し分け(D6)とタイマー 2 本の clear 管理が不明瞭になる。却下。

### D5: 無活動タイマーは shared watchdog に単一実装し、両 adapter・全ループで再利用する

対象ループは claude-code 3 箇所(main/follow-up/repair)+ codex 1 箇所(executeTurn の
events ループ、全 turn が経由)の計 4 サイト。タイマー生成・巻き直し・発火時刻記録・
`fired`/`elapsedMs` の露出を 4 回複製せず、`src/adapter/shared/inactivity-watchdog.ts` に
1 実装を置く(両 adapter は既に `../shared/*` を共用している)。

契約(値のみ・I/O なし):

- `createInactivityWatchdog(onFire, timeoutMs?, now?)` を run() ごとに 1 個生成。
- `bump()` — 各ループの `for await` 直前(= query/turn 発行時)と、各イベント到着時に呼ぶ。
  既存タイマーを clear して再 arm し、`lastActivityAt` を更新する。発火後は no-op。
- 発火時: `fired=true`、`elapsedMs = now() - lastActivityAt` を確定し、`onFire()`(= abort)を呼ぶ。
- `fired` / `elapsedMs` — catch 節が原因判定(D4)と message 構築(D6)に読む。
- `clear()` — finally で呼ぶ。冪等。
- `now` は `Date.now` 既定(vitest fake timer は Date もモックするため advance で決定的に発火)。

- **Rationale**: reuse(4 サイト複製の回避)、単一のユニットテスト可能点、定数と message の
  single source。both adapters が `../shared/` を既に import している。
- **Alternatives considered**: 各ループにタイマーを inline — 5 行 × 4 サイト複製、巻き直し・
  発火記録のズレを生みやすい。却下。

### D6: halt message は「無活動である旨 + 最終イベントからの経過時間」を single source で構築

watchdog が `fired` のとき、catch は wall-clock とは別の message を出す。文言は watchdog module
の `formatInactivityTimeoutMessage(stepName, elapsedMs)` で single-source し、両 adapter で同一に
する。code は `STEP_TIMEOUT` のまま(下流分岐を増やさない、D3)。`makeTimeoutHalt` が
`${step} timed out: ${error.message}` として halt 表示に反映するため、旨と経過時間が表示に載る。

- **Rationale**: 経過時間は「発火時刻 − 最終 bump 時刻」を実測する(想定の閾値ではなく計測値)。
  実タイマーは境界より遅れて発火し得るため、計測のほうが真値に近い。two adapter で文言が
  ズレるとテストの pin が二重化するので single source。
- **Alternatives considered**: message に固定閾値(900000ms)を直書き — 実発火の遅延を隠す。
  計測 elapsedMs を採用。

## Risks / Trade-offs

- [Risk] 無活動 abort が timeout 経路に合流できず terminal failure(error)になる
  → **Mitigation**: D4 の判定拡張。acceptance で「abort→completionReason=timeout かつ
  awaiting-resume に合流」を fake-timer テストで固定する。
- [Risk] 常時 on の 15 分タイマーが既存テストへ影響し pin を壊す
  → **Mitigation**: 既定 900s は既存の高速テスト(wall-clock 50ms 等)より遥かに長く発火しない。
  watchdog は finally で必ず clear するためハンドルリークもない。wall-clock の message/code/経路は
  一切変更しないため、既存 timeout 系 pin(TC-032/034/035/041 等、code=STEP_TIMEOUT と
  completionReason のみを assert、message 文字列は未 assert)と衝突しない。無活動分岐は純加算。
- [Risk] 発火直後に遅延イベントが届き bump が再 arm して abort 状態と齟齬
  → **Mitigation**: `fired` 後の `bump()` は no-op(再 arm しない)を契約とする。
- [Risk] ループ間の非ループ処理(follow-up prompt 構築 / output detection)中もタイマーが走る
  → **Trade-off**: これは容認する。ローカル CPU 処理は高速で、15 分の空白自体が異常であり
  捕捉対象として妥当。各ループ入口で bump するため通常運転では問題にならない。

## Open Questions

なし(スコープ・閾値・合流先はいずれも architect 評価済みで確定)。
