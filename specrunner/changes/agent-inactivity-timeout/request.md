# agent 呼び出しの無活動タイムアウト: イベントが途切れたら timeout halt に落とす

## Meta

- **type**: new-feature
- **slug**: agent-inactivity-timeout
- **base-branch**: main
- **adr**: false

## 背景

2026-08-12 の走行で、conformance step の agent 呼び出しが開始直後から 1 turn も進まないまま 9 時間停止した(log は step:start の 1 行のみ、agent プロセスは生存・ほぼ無 CPU)。最初の API 呼び出しが返らない型のハングで、現行の見張りはすべて素通りする:

- **maxTurns**: turn を消費しないハングには無力
- **wall-clock timeout(timeoutMs)**: 機構は実装済みだが、設定解決の最終 fallback が null(無制限)で、step 定義・プロジェクト設定のどこにも値が無いため全 step が無制限で走っている
- **プロセス生存判定 / job wait の死亡検知**: プロセスは生きているため通過する

固定の総時間タイムアウトは過去に意図的に撤廃されており(remove-session-timeout、健全な長走行を殺すため)、復活は筋が悪い。健全な走行は SDK からのイベント(message)が流れ続けるという性質を使い、**イベントの無活動**を見張る。

## 現状コードの前提

- `src/adapter/claude-code/agent-runner.ts:531-534` — `resolvedConfig.timeoutMs` が非 null のときのみ全体 wall-clock タイマーを `AbortController` に接続。abort 発火時は同ファイル `:1099-1111` で `completionReason: "timeout"` を返す
- `src/config/step-config.ts:10` — timeoutMs の解決順の最終 fallback は null(no timeout)。step 定義(`src/core/step/*.ts`)に timeoutMs を設定する箇所は存在しない(grep 0 件)
- `src/core/step/executor.ts:367` — `completionReason === "timeout"` は `makeTimeoutHalt` → awaiting-resume(resume 可能)の既存経路に落ちる
- `src/adapter/claude-code/agent-runner.ts:651` / `:772` / `:1008` — SDK message の for await ループ(main / follow-up / repair)
- `src/adapter/codex/agent-runner.ts:329-332` / `:398` — codex adapter も同型(AbortController + timeoutMs タイマー + events ループ)

## 要件

1. **無活動タイマーの導入(claude-code adapter)** — 各 message ループに、message 到着ごとに巻き直すタイマーを追加する。既定値は 15 分の定数とし、config 化しない。発火時は既存の `AbortController` を abort し、既存の timeout 経路(`completionReason: "timeout"` → `makeTimeoutHalt` → awaiting-resume)に合流する。halt 表示には無活動タイムアウトである旨と、最終イベントからの経過時間を含める。

2. **query 開始〜最初の message までも見張り対象** — 今回の実例はこの区間で停止した。タイマーは query 発行時に開始し、最初の message 到着で巻き直す。

3. **既存 timeoutMs との共存** — 既存の総 wall-clock timeout(timeoutMs、既定 null)の意味論は変えない。両方有効な場合は先に発火した方が勝つ。

4. **codex adapter への適用** — `src/adapter/codex/agent-runner.ts` の events ループにも同じ無活動タイマーを適用する。

## スコープ外

- managed runtime(remote 実行)への適用
- 無活動閾値の config 項目化・request type 別調整
- provider readiness probe の変更
- 検知後の自動 resume(halt までが本 request の責務。再開は既存の operator 経路)

## 受け入れ基準

- [ ] query 発行後、最初の message が閾値内に到着しない場合に timeout halt になることをテストで固定する(fake timers)
- [ ] message が閾値内で到着し続ける限り発火しないこと(タイマー巻き直し)をテストで固定する
- [ ] 発火時に `completionReason: "timeout"` を返し、awaiting-resume(resume 可能)の既存経路に合流することをテストで固定する
- [ ] halt 表示に無活動タイムアウトの旨と最終イベントからの経過時間が含まれることをテストで固定する
- [ ] 既存テストが無変更で green(無活動既定の導入が既存の timeout 関連 pin と衝突する場合は、design で対象を列挙し更新根拠を明示する。意図の書き換えは不可)
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **総時間でなく無活動を見張る** — 健全な長走行(implementer は 1 時間走り得る)はイベントを流し続けるため誤爆しない。固定 session timeout を撤廃した過去判断(remove-session-timeout)と矛盾しない。却下した代替案: 全 step への既定 timeoutMs 設定(健全な遅い step と hang を時間だけで区別できず、撤廃の経緯を巻き戻すことになる)。
- **閾値 15 分は定数、config 化しない** — 1 turn の生成に数分かかることはあるが、15 分の完全無音は異常。較正値でありユーザー調整項ではない(再較正はコード変更で行う)。
- **新しい halt 種別を作らず既存 timeout 経路に合流** — 中断 → awaiting-resume → resume の配管と operator 案内が既存のまま機能する。却下した代替案: 専用の interruption reason 新設(下流の分岐が増えるだけで運用上の差が無い)。
