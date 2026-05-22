# ADR: フォアグラウンド進捗表示 — heartbeat timer + DomainEvent 契約拡張

- **date**: 2026-05-23
- **slug**: foreground-progress-display
- **status**: accepted

## Context

長尺 step（implementer 最大 27 分）実行中、`ProgressDisplay` は `[step] running...` を 1 行出した後 **step 完了まで無音**だった。これにより：

- ユーザーが「実行中かハングか」を判別できない
- CI の no-output idle timeout で kill されるリスクがある

adapter の stream は tool_use を逐次受け取っていたが `result` 以外を捨てており、データも配線も既存のものを活用できる状態だった。`executor.ts` には `ctx.emit(event, payload)` による adapter→EventBus 転送が既に存在し、新規能力ではなく「捨てている情報を emit し、CLI 側で時間 throttle して描く」配線の問題として位置づけた。

issue #367。durable log（#369）とは別軸：live = 揮発 / durable = 永続・opt-in。

## Decisions

### D1: DomainEvent union に `step:progress` を正規追加

`src/core/event/types.ts` の `DomainEvent` union に `"step:progress"` を追加し、`EventPayloadMap` に payload 型 `{ step: string; tool: string; target?: string }` を定義する。

これにより `executor.ts` の `as never` キャストが `step:progress` に対しては型安全になり、EventBus の `on("step:progress", handler)` が型検査を通る。既存の `commit:push` 等の非正規 event は影響を受けない（`as never` キャスト経路がそのまま残る）。

**不採用案**: `step:progress` を `DomainEvent` 外の独立型として扱う案は、EventBus の型安全な購読を失うため不採用。

### D2: adapter は `ctx.emit("step:progress", ...)` のみ — port 契約変更なし

adapter は tool 検知時に `ctx.emit("step:progress", { step, tool, target? })` を呼ぶだけ。`AgentRunner` port の `run()` / `AgentRunContext` 必須形は変えず、新規 `onProgress` callback も追加しない。

throttle / サンプリング / render は cli の `ProgressDisplay` に 1 箇所集約し、adapter に timer / format ロジックを持たせない。

**不採用案**: port に `onProgress` callback を新設する案は、全 adapter の実装義務が増え、adapter ごとの実装差が生じやすいため不採用。`ctx.emit` の汎用パスが既に存在するため追加 callback は不要。

### D3: heartbeat timer は cli（ProgressDisplay）に置く — core に置かない

`setInterval` による heartbeat timer は `src/cli/progress.ts` の `ProgressDisplay` 内に置く。core には置かない。

**根拠**: timer は表示の鼓動であり、pipeline / agent の振る舞いに非関与。core 原則「表示ロジックを core に持ち込まない」に従う。EventBus は同期 emit のため、非同期 heartbeat は ProgressDisplay 自前の `setInterval` で駆動するのが自然。

**timer / now は injectable**: `timerFn?: typeof setInterval` / `nowFn?: () => number` を `wireProgressDisplay()` の opts で受け取り、テスト時に差し替え可能にする。

**leak 防止が最重要リスク**: `step:complete` / `step:error` / `pipeline:complete` / `pipeline:fail` の 4 経路すべてで `clearInterval` を呼ぶ。`dispose()` public method も追加し、CLI composition point がプロセス終了前に呼べるようにする。二重 clearInterval は `null` チェックでガード。

**不採用案**: core に timer を置く案は、表示ロジックが core に混入するため不採用。adapter に throttle / format を持たせる案は、保守コスト増（adapter ごとに format が分散）のため不採用。

### D4: floor は `step:start` 起点 — adapter emit 非依存

heartbeat の "floor"（最低保証の出力）は `step:start` イベント起点で cli 側 timer を駆動することで実現する。adapter が一度も `step:progress` を emit しなくても、step + elapsed が定期出力される。

tool / target は adapter が emit できたときだけの enrichment（「あれば出す」）であり、floor の実現に必須ではない。これにより CI idle timeout 回避と「どの工程か」の把握が adapter 実装状況に関係なく保証される。

### D5: TTY / 非TTY で render 分岐

| 条件 | 形式 |
|---|---|
| `process.stdout.isTTY && !verbose` | `\r` 上書き 1 行（trailing padding で前行残り消去） |
| `!process.stdout.isTTY` または `verbose` | `\n` append 1 行 |

verbose 時に上書きしない理由: verbose mode では他 stdout が混在するため、`\r` 上書き行が壊れる。throttle append に fallback することで CI / verbose 双方で読める出力を保つ。

### D6: managed runtime は floor のみ — tool enrichment は claude-code 限定

`ManagedAgentRunner` は `ctx.emit("step:progress", ...)` を呼ばない。managed の SSE は `custom_tool_use` しか tool 名を持たず、built-in tool の粒度が得られない。SSE 配線変更はコスト/便益が薄く、idle timeout 回避という主目的は floor（D4）で達成できるため、意図的な非対称設計とする。

tool enrichment（`last: Edit pipeline.ts` 等）は claude-code adapter 限定の付加価値として位置づける。

### D7: `SpecRunnerConfig` に `progress` セクション新設

heartbeat interval を 1 つの knob として `config.progress.heartbeatIntervalSec` に配置する。既存の `config.specReview.pollIntervalMs` / `config.pipeline.maxRetries` と同じ粒度に揃える。

解決優先度: config file → `SPECRUNNER_HEARTBEAT_INTERVAL` env var → default（TTY=30s / 非TTY=60s）。`0` または `null` で heartbeat 無効。interval 以外の knob は追加しない。

## Alternatives Considered

### Alternative 1: 裏プロセス化 / daemon / 別 `watch` コマンドで観測する

- **Pros**: フォアグラウンドの stdout を汚さない。別端末から好きなタイミングで確認できる
- **Cons**: デーモン管理の複雑さ（PID ファイル・socket・クリーンアップ）が増す。ユーザーが別端末を用意しなければ現状と変わらない。CI では別端末自体が使えない
- **Why not**: 設計議論で不採用確定。別端末観測は tmux / systemd / `watch specrunner job ls` 等 platform に委ねる方針。CI の idle timeout 回避という主目的が達成できない

### Alternative 2: port に `onProgress` callback を追加する

- **Pros**: 型安全に progress を受け取れる。EventBus を介さず直結でコールバックが呼ばれる
- **Cons**: `AgentRunner` port の必須形が変わり、全 adapter（claude-code / managed / Codex）に実装義務が生じる。managed は tool 粒度が出ないため callback 実装が空になる（Liskov 違反気味）。port 変更は contract を広げるため将来の adapter 追加コストも増える
- **Why not**: `ctx.emit` の汎用パスが既に存在しており、EventBus 経由で同じ目的を達成できる。port 契約は最小に保つ原則に反する

### Alternative 3: heartbeat timer を core に置く

- **Pros**: EventBus と同一層で動き、adapter の emit と timer が同じ実行コンテキストに収まる
- **Cons**: timer は表示の鼓動であり pipeline / agent の振る舞いに非関与。core に UI タイミング制御を持ち込むと「core は表示を知らない」原則が崩れる。core のテストに time injection が必要になり test complexity が増す
- **Why not**: D1 原則「timer は表示ロジック、core に属さない」。cli 層の `ProgressDisplay` が `setInterval` を所有するのが自然な配置

### Alternative 4: adapter に throttle / format ロジックを持たせる

- **Pros**: adapter が自身の出力形式を完全に制御できる
- **Cons**: claude-code と managed でそれぞれ throttle / format を実装することになり、TTY 判定・interval knob・render 分岐が複数箇所に分散する。将来 3 つ目の adapter が増えたとき同じロジックを再実装することになる
- **Why not**: throttle / render は純粋に表示レイヤーの責務。`ProgressDisplay` への集約により変更が 1 箇所に収まる

### Alternative 5: managed runtime にも tool enrichment（SSE 配線変更）

- **Pros**: runtime 間の表示フィデリティが揃う
- **Cons**: managed の SSE は `custom_tool_use` イベントしか tool 名を持たず、built-in tool（Edit / Bash 等）の粒度が得られない。SSE 配線を変更して built-in tool を取得するコストが高く、得られる情報の粒度も低い
- **Why not**: idle timeout 回避という主目的は floor（step + elapsed の定期出力）で達成できる。enrichment は「あれば出す」付加価値であり、managed に無理に合わせるコスト/便益が薄い。明示的に scope 外として確定

## Consequences

### Positive

- 長尺 step 実行中の無音区間が解消され、ユーザーが「実行中かハングか」を判別できる
- floor は adapter emit 非依存のため、managed / claude-code の両 runtime で CI idle timeout kill リスクが解消される
- `DomainEvent` union への `step:progress` 正規追加により、EventBus 上のイベント型安全性が向上（`as never` 型穴の部分的解消）
- throttle / render が `ProgressDisplay` 1 箇所に集約され、adapter には emit 責務のみが残る
- timer / now が injectable になり、heartbeat 振る舞いが単体テストで検証可能

### Negative / 既知の負債

- `resolveHeartbeatInterval` が `src/cli/run.ts` と `src/cli/resume.ts` で重複実装（review F-01）。将来 `src/cli/progress-config.ts` 等への抽出が必要
- `as never` 型穴は `commit:push` 等の非正規 event に残存。完全解消は別 change
- pipeline の停止経路で `stopHeartbeat()` が 2 度呼ばれる経路あり（`pipeline:complete` handler + `finally` の `dispose()`）。`null` チェックで安全だが意図をコメントで明記すべき（review F-03）

## 関連 ADR

- [2026-05-05-agent-runner-port-and-local-runtime](./2026-05-05-agent-runner-port-and-local-runtime.md) — `AgentRunContext` / `ctx.emit` の初期定義。本 ADR で `DomainEvent` に `step:progress` を追加
- [2026-05-19-verbose-execution-log](./2026-05-19-verbose-execution-log.md) — verbose 出力の位置づけ。本 ADR の TTY/verbose 分岐設計の前提
- [2026-05-22-intra-step-follow-up-prompt](./2026-05-22-intra-step-follow-up-prompt.md) — `AgentRunContext` への field 追加パターン（本 ADR の D2 と対比）
