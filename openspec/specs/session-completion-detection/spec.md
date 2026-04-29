## Purpose

Detect session completion via SSE `end_turn` or polling `status: idle`.

## Requirements
### Requirement: 完了検知はポーリングを主、SSE を補助とする

セッション完了の判定は MUST `client.beta.sessions.retrieve()` のポーリング結果で `status === "idle"` かつ `stop_reason === "end_turn"` を観測したときに確定する。SSE の役割は SHALL Custom Tool イベント受信のみとする。

#### Scenario: ポーリングで完了確定

- **WHEN** ポーリングで `{ status: "idle", stop_reason: "end_turn" }` を受信する
- **THEN** ポーリングループを抜け、SSE ループも break し、completion を `success` として扱う

#### Scenario: SSE のみが idle を伝えた場合でも確定として扱う

- **WHEN** SSE で `session.status_idle` イベントが `stop_reason: "end_turn"` 付きで届く
- **THEN** SSE ループを break し、ポーリングを 1 回追加で発行して同じ status を確認した上で completion を確定する

### Requirement: ポーリングは指数バックオフ + ジッタで実行する

`sessions.retrieve` のポーリング間隔は MUST 初期 2000ms、最大 30000ms、係数 1.5、ジッタ ±20% で指数バックオフする。同一ジョブで SHALL 600 req/min を超える呼び出し頻度を発生させない。

#### Scenario: 初期 3 回の間隔

- **WHEN** ポーリング開始から 3 回目までの呼び出し
- **THEN** 1 回目は約 2000ms、2 回目は約 3000ms、3 回目は約 4500ms（±20%）の遅延後に発行される

#### Scenario: 上限到達

- **WHEN** バックオフ計算値が 30000ms を超える
- **THEN** 30000ms にクランプされる

### Requirement: SSE ループは idle+end_turn を観測したら必ず break する

SSE イベント処理ループは MUST `session.status_idle` かつ `stop_reason: "end_turn"` を観測したら、追加イベントを待たず即座に break する。break 後は SHALL 新規イベント送信を行わない。ポーリング側で先に idle+end_turn を確定した場合も、CLI は MUST `AbortSignal` または同等の機構で SSE 接続を中断する。

#### Scenario: end_turn 観測（SSE 側が先）

- **WHEN** SSE ループ内で idle+end_turn を観測する
- **THEN** ループから即 break し、`stream.controller.abort()` などのリソース解放を行い、追加の `events.send` を発行しない

#### Scenario: ポーリング側が先に idle+end_turn を確定した場合

- **WHEN** ポーリングで `{ status: "idle", stop_reason: "end_turn" }` を確定し、SSE ループがまだ動作中
- **THEN** CLI は MUST `AbortSignal` を SSE ストリームに渡してキャンセルし、SSE ループを即時中断する。SSE からの追加イベントは処理しない

#### Scenario: requires_action では break しない

- **WHEN** SSE ループ内で idle+`stop_reason: "requires_action"` を観測する
- **THEN** ループは継続する（Custom Tool 応答を送るため）

### Requirement: 完了タイムアウトを実装する

ポーリング開始から既定 30 分を超えても完了しない場合、CLI は MUST ジョブを `failed` としてマークし、`Session timed out after 30m. Inspect with 'specrunner ps'.` を stderr に出力する。タイムアウト値は SHALL `--timeout=Nm` または `--timeout=Ns` で上書き可能である。

#### Scenario: 既定タイムアウト

- **WHEN** ポーリングが 30 分を超えて完了しない
- **THEN** state.status を `failed` に、error.code を `SESSION_TIMEOUT` に設定し、SSE ループを abort する

#### Scenario: フラグでの上書き

- **WHEN** ユーザーが `specrunner run req.md --timeout=10m` を実行する
- **THEN** タイムアウト判定が 10 分で発動する

### Requirement: terminated ステータスは即時失敗扱いとする

ポーリングまたは SSE で `status === "terminated"` を観測したら、CLI は MUST ジョブを `failed` としてマークし、SHALL ループを即終了する。

#### Scenario: terminated 観測

- **WHEN** `sessions.retrieve()` が `{ status: "terminated" }` を返す
- **THEN** state.status を `failed`、error.code を `SESSION_TERMINATED` に設定し、ポーリングと SSE を即終了する

### Requirement: SSE 切断は再接続せずポーリング fallback で完了を待つ

SSE ストリームが想定外に切断された場合、CLI は MUST SSE 再接続を試みず、ポーリングのみで完了を待つ。`stop_reason: "requires_action"` を観測した場合は SHALL `events.list` で未処理 custom_tool_use を取得し再応答する recovery を行うことができる（実装は best-effort、Phase 1 では不要）。

#### Scenario: 通信切断

- **WHEN** SSE ストリームでネットワークエラーが発生する
- **THEN** SSE は終了し、ポーリングは継続する。stderr に `SSE disconnected; falling back to polling.` を出力する
