# Spec: agent 呼び出しの無活動タイムアウト

## Requirements

### Requirement: 無活動タイマーが agent イベントの途絶を timeout として検知する

local runtime の agent 呼び出し(claude-code / codex adapter)は、各 message(event)ループに
無活動タイマーを持つ。タイマーは query(turn)発行時に開始し、message(event)が到着するたびに
巻き直される。既定閾値は 15 分の定数(`DEFAULT_INACTIVITY_TIMEOUT_MS = 900000`ms)であり、config
化されない。最後のイベントから閾値を超えて無音が続いた場合、システムは実行中の
`AbortController` を abort SHALL する。閾値内でイベントが到着し続ける限り、タイマーは発火して
はならない(MUST NOT fire)。

#### Scenario: query 発行後、最初の message が閾値内に到着しない

**Given** claude-code adapter が agent query を発行し、SDK が message を 1 件も yield しない
**When** 最後の活動(query 発行時刻)から無活動閾値を超える時間が経過する
**Then** 無活動タイマーが発火し `AbortController` が abort され、agent run は
`completionReason: "timeout"`(error.code `STEP_TIMEOUT`)を返す

#### Scenario: message が閾値内で到着し続ける限り発火しない

**Given** agent query が message を無活動閾値未満の間隔で継続的に yield する
**When** 各 message 到着ごとに無活動タイマーが巻き直される
**Then** 無活動タイマーは発火せず、agent run は message 由来の通常結果
(`completionReason: "success"` 等)を返す

#### Scenario: codex adapter の events ループも同じ無活動監視を持つ

**Given** codex adapter が turn を実行し、events を 1 件も emit しない
**When** 最後の活動から無活動閾値を超える時間が経過する
**Then** 無活動タイマーが発火し `AbortController` が abort され、agent run は
`completionReason: "timeout"`(error.code `STEP_TIMEOUT`)を返す

#### Scenario: output-repair ループ実行中に watchdog が発火しても timeout として返る

**Given** agent run が output-repair turn を実行中であり、output-repair catch が best-effort として
abort エラーを再 throw する(`if (abortController.signal.aborted) throw err;`)
**When** 無活動タイマーが発火し `AbortController` が abort される
**Then** abort エラーは repair catch を素通りして outer catch へ伝播し、agent run は
`completionReason: "timeout"`(error.code `STEP_TIMEOUT`)を返す(success ではない)

### Requirement: 無活動発火は既存 timeout 経路に合流し awaiting-resume になる

無活動タイマーの発火は、新しい halt 種別や interruption reason を新設せず、既存の wall-clock
timeout と同一の経路に合流 SHALL する。すなわち agent run は `completionReason: "timeout"` を返し、
executor はそれを `makeTimeoutHalt` で awaiting-resume(resume 可能)に落とす。error.code は
`STEP_TIMEOUT` を維持する。

#### Scenario: 無活動発火が awaiting-resume に落ちる

**Given** agent 呼び出しが無活動タイマー発火により abort された
**When** executor が `completionReason: "timeout"` の結果を受け取る
**Then** step は `makeTimeoutHalt` により awaiting-resume(resume 可能、interruption reason
`"timeout"`)へ遷移し、operator は既存の resume 経路で再開できる

### Requirement: halt 表示に無活動である旨と最終イベントからの経過時間を含める

無活動タイマー発火による timeout の error message は、それが無活動タイムアウトであることと、
最後のイベントからの経過時間(計測値)を含む MUST。この message は halt 表示
(`${step} timed out: ${error.message}`)に反映される。wall-clock timeout(timeoutMs 設定時)の
message・code・completionReason は変更されない SHALL NOT be changed。

#### Scenario: 無活動 timeout の message が旨と経過時間を含む

**Given** agent 呼び出しが無活動タイマー発火により timeout した
**When** agent run が error を構築する
**Then** error.message は無活動タイムアウトである旨(inactivity)と最終イベントからの経過時間
(elapsedMs)を含み、error.code は `STEP_TIMEOUT` である

#### Scenario: wall-clock timeout の表示は不変

**Given** step に timeoutMs が設定され、その wall-clock timeout で abort された
**When** agent run が error を構築する
**Then** error.message は従来どおり ``Step '<step>' timed out after <timeoutMs>ms`` であり、
completionReason `"timeout"` / code `STEP_TIMEOUT` も従来どおりである

### Requirement: 無活動タイムアウトと wall-clock timeout は共存し、先に発火した方が勝つ

既存の総 wall-clock timeout(timeoutMs、既定 null = 無制限)の意味論は変更されない SHALL NOT be
changed。無活動タイマーは既定で常時 on、wall-clock タイマーは timeoutMs が非 null のときのみ on
であり、両方有効な場合は先に発火した方が abort を確定する。無活動タイマーは agent run の
すべての終了経路(success / error / timeout / throw)で確実に停止 MUST される。

#### Scenario: timeoutMs 未設定でも無活動監視は有効

**Given** step に timeoutMs が設定されていない(解決結果 null)
**When** agent 呼び出しが無活動閾値を超えて無音になる
**Then** wall-clock タイマーは存在しないが、無活動タイマーが発火して timeout になる

#### Scenario: 正常終了時に無活動タイマーが停止する

**Given** agent 呼び出しが message を流して正常終了する
**When** agent run が結果を返す(finally 経由)
**Then** 無活動タイマーは clear され、以後の event loop を alive に保たない
