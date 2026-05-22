# 実行中のフォアグラウンド進捗表示を改善する（step+elapsed の常時表示 + 時間throttle heartbeat）

## Meta

- **type**: new-feature
- **slug**: foreground-progress-display
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

長尺 step（実測: implementer 27分、design 数分）の実行中、`ProgressDisplay`（`src/cli/progress.ts`）は `[step] running...` を 1 行出したきり **step 完了まで無音**。step:start/complete/verdict しか描画しない。

このため:
- ユーザーが「実行中かハングか」を判別できない
- CI では **no-output idle timeout で kill される危険**

データも配線も既にある: adapter の stream（`agent-runner.ts:141-145`）は tool_use を逐次受け取るが `result` 以外を捨てている。また `executor.ts:150-153` で **adapter→EventBus を通す汎用 `ctx.emit(event, payload)` が既に存在**する。新規能力ではなく「捨てている tool 情報を emit し、cli で時間 throttle して描く」配線の問題。

SDK ストリームの tool_use 形状: `@anthropic-ai/claude-agent-sdk` の tool_use は assistant message の content block（`type: "tool_use"`, `name`, `input`）として届く。`src/adapter/claude-code/message-types.ts` には現状 `stream_event` / `text_delta` ガードのみで **tool_use ガードは未存在**のため、enrichment 実装時に該当ガードを追加する（具体型は実装時に SDK 型定義で確認）。

issue #367。durable log（#369）とは別軸（live = 揮発 / durable = 永続・opt-in）。

## 表示設計

### 常時表示の floor（runtime 非依存）
- **step + elapsed** を必ず出す。floor は EventBus の `step:start` だけに依存し、adapter の emit 有無に**完全に非依存**。CI の idle 回避 + 「どの工程か」を保証
- tool/target（`last: Edit pipeline.ts`）は adapter が emit できる時だけの enrichment

### heartbeat = 時間 throttle
- 「毎 tool」(firehose) でも「沈黙」でもなく、**毎 ~30-60s に 1 行**、現 step の経過 + 進捗要約（progress 受信カウンタ等）。1 時間 step で ~60 行

### TTY / 非TTY 分岐
- **TTY かつ非 verbose**: 最下段 1 行を `\r` 上書き（verbose 時は他 stdout が混ざり上書き行が壊れるため上書きしない）
- **非TTY (CI/pipe) / verbose**: throttle append（spinner なし）

### CI で栄える密度
- default = step 境界 + verdict + loop 周回 + timing（決定）。1 step 1 行 + 末尾 summary。tool 一個一個 / 思考テキストは出さない

## 要件

1. **step + elapsed の常時表示**を floor とする。`step:start` 起点で cli 側 timer を駆動し、elapsed は `ProgressDisplay.stepStartTimes`（既存）から計算。adapter が一度も emit しなくても出る。
2. **時間 throttle heartbeat**: 既定 ~30-60s 間隔で 1 行、現 step 経過 + 進捗要約。
3. **render 分岐**: `process.stdout.isTTY` かつ非 verbose のとき最下段上書き、それ以外は throttle append。
4. **adapter は既存 `ctx.emit` で正規化 progress を流すだけ**: port 契約（`AgentRunner.run` / `AgentRunContext` 必須形）は変えず、新規 `onProgress` callback も足さない。adapter は tool 検知時に `ctx.emit("step:progress", { step, tool, target? })` を呼ぶ。`DomainEvent` union に `"step:progress"` を正規追加し、現状 `commit:push` 等が使う `as never` 型穴を塞ぐ。throttle/サンプリング/render は cli の `ProgressDisplay` に 1 箇所集約（adapter に timer/format を持たせない）。
5. **heartbeat timer は cli（ProgressDisplay 内）に置く**: core には置かない（timer は表示の鼓動で振る舞いに非関与、D1）。`setInterval` で駆動し、最新進捗スナップショット（現 step / start 時刻 / 受信カウンタ / 直近 tool）を ProgressDisplay が保持。`step:start` で開始、`step:complete`/`step:error` で停止、さらに `pipeline:complete`/`pipeline:fail`/プロセス終了経路でも必ず `clearInterval`（timer leak で CI が hang しないこと）。timer / now は injectable にしてテスト可能にする。
6. **config**: heartbeat interval（秒）を 1 つの knob として持つ（`config → env → flag` precedence）。既定は文脈で自動（TTY=連続上書き / 非TTY≈60s）、`0`/`off` で無効。interval 以外の knob は追加しない。**配置は `SpecRunnerConfig` 内に `config.progress.heartbeatIntervalSec`** 等の新セクションを設け、既存の `config.specReview.pollIntervalMs` / `config.pipeline.maxRetries` と同じ粒度に揃える。手書きの config validator（`src/config/schema.ts` 系）にも当該フィールドの検証を追加する。
7. **振る舞い不変**: pipeline / agent の挙動・成果物・verdict・exit code は変えない。変えるのは進捗の表示のみ。

## スコープ外

- **裏プロセス化 / daemon / 別 `watch` コマンド**（設計議論で不採用確定。別端末観測は tmux / systemd / `watch specrunner job ls` 等 platform に委ねる）
- **durable log**（#369 で別途）
- **managed runtime の tool enrichment**: managed は SSE が `custom_tool_use` しか tool 名を持たず built-in tool の粒度が出ない。SSE 配線変更はコスト/便益が薄いので、**managed は floor（step+elapsed）のみ**とし tool enrichment は claude-code 限定とする（idle-timeout 回避の目的は floor で達成）。
- agent の思考テキスト全文の出力

## 受け入れ基準

- [ ] 長尺 step 実行中に step + elapsed が定期出力される（無音区間が解消、floor は adapter emit 非依存）
- [ ] TTY かつ非 verbose では上書き 1 行、それ以外（非TTY / verbose）では throttle append
- [ ] adapter は `ctx.emit("step:progress", ...)` 経由で emit し、`DomainEvent` union に `step:progress` が型として追加されている（`as never` 型穴の解消含む）
- [ ] throttle/render は ProgressDisplay に集約され、adapter は timer/format を持たない
- [ ] **timer が `pipeline:complete`/`pipeline:fail`/異常終了で必ず停止する**（leak で CI が hang しない／テストで検証）
- [ ] heartbeat interval が config/env/flag で override 可能、`off` で無効化できる
- [ ] claude-code の stream loop（runResult 用 141-145 と follow-up 用 213-217）の emit が共通ヘルパーに括られ、本流と follow-up で進捗の出方が揃う
- [ ] pipeline / agent の挙動・成果物・exit code が従来どおり（regression なし）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

module-architect レビュー済み:

- **配線**: port に `onProgress` を新設しない。既存 `ctx.emit`（executor.ts:150-153 で adapter→EventBus を forward 済）を使い、`DomainEvent` に `step:progress` を追加。adapter は EventBus / ProgressDisplay 型を import せず `emit: (string, payload) => void` の構造的契約だけに依存（#372 後の構成と整合）。
- **timer 置き場所**: cli の ProgressDisplay 内（core に置かない）。EventBus は同期 emit なので heartbeat は ProgressDisplay 自前の `setInterval`。step 境界（既存 `stepStartTimes`）に乗せる。**leak 防止の clearInterval が最重要リスク**。
- **floor**: `step:start` 起点 timer で実現。adapter emit 完全非依存。draft 通り。
- **正規化 event**: `{ step, tool, target? }`。turn 数は入れず ProgressDisplay 側で受信カウンタ。
- **managed fidelity**: floor のみ、tool enrichment は claude-code 限定（scope 外明記）。
- **delta spec**: 2 本 —主 `message-streaming`（表示振る舞い: floor / heartbeat / TTY分岐 / interval knob）、補助 `agent-runner-port`（adapter の progress emit 責務）。`verbose-execution-log` には足さない（#369 寄りで capability 境界がぼやける）。delta path は `specrunner/changes/foreground-progress-display/specs/{message-streaming,agent-runner-port}/spec.md`。
- **adr: true** 維持（DomainEvent 契約拡張 + 新しい表示振る舞い）。
