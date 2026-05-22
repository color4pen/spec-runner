# Test Cases: foreground-progress-display

Generated from: request.md, design.md, tasks.md

---

## Category: DomainEvent 型定義

### TC-001 step:progress が DomainEvent union に含まれる
- **Priority**: must
- **Source**: Task 1.1, 受け入れ基準「DomainEvent union に step:progress が型として追加」

**GIVEN** `src/core/event/types.ts` の `DomainEvent` union が更新されている  
**WHEN** TypeScript コンパイラが `const e: DomainEvent = "step:progress"` を型チェックする  
**THEN** コンパイルエラーが発生しない

### TC-002 EventPayloadMap に step:progress の payload 型が定義される
- **Priority**: must
- **Source**: Task 1.2, D1

**GIVEN** `EventPayloadMap["step:progress"]` が `{ step: string; tool: string; target?: string }` として定義されている  
**WHEN** `events.on("step:progress", (p) => ...)` の handler で `p.step` / `p.tool` / `p.target` を参照する  
**THEN** 型エラーなくアクセスできる（`target` は optional）

### TC-003 executor.ts の as never キャストが step:progress に対して不要になる
- **Priority**: should
- **Source**: Task 1.3, D1「`as never` 型穴の解消含む」

**GIVEN** `step:progress` が `DomainEvent` union に追加されている  
**WHEN** `ctx.emit("step:progress", payload)` を executor.ts の既存 `as never` キャスト経路で呼ぶ  
**THEN** `as never` キャストなしでコンパイルが通る（`step:progress` は union に存在するため）

### TC-004 既存の非正規 event（commit:push 等）への影響がない
- **Priority**: must
- **Source**: Task 1.3「既存の `commit:push` 等は `as never` のまま残る」

**GIVEN** `DomainEvent` union に `step:progress` が追加されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 既存の `as never` キャスト箇所でコンパイルエラーが発生しない

---

## Category: isToolUse type guard

### TC-010 tool_use content block を持つ stream message を正しく判別する
- **Priority**: must
- **Source**: Task 2, D6

**GIVEN** SDK から `{ type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", name: "Edit", input: { file_path: "foo.ts" } } } }` が届く  
**WHEN** `isToolUse(msg)` を呼ぶ  
**THEN** `true` を返す

### TC-011 tool_use 以外の content block を判別する
- **Priority**: must
- **Source**: Task 2, D6

**GIVEN** SDK から `{ type: "stream_event", event: { type: "content_block_start", content_block: { type: "text" } } }` が届く  
**WHEN** `isToolUse(msg)` を呼ぶ  
**THEN** `false` を返す

### TC-012 result メッセージを tool_use と誤判定しない
- **Priority**: must
- **Source**: Task 2

**GIVEN** `{ type: "result", ... }` 形式の message  
**WHEN** `isToolUse(msg)` を呼ぶ  
**THEN** `false` を返す

### TC-013 null / undefined 入力を安全に処理する
- **Priority**: should
- **Source**: Task 2（type guard のロバスト性）

**GIVEN** `null` または `undefined` が渡される  
**WHEN** `isToolUse(null)` / `isToolUse(undefined)` を呼ぶ  
**THEN** 例外を投げず `false` を返す

---

## Category: Adapter progress emit (claude-code)

### TC-020 main stream loop で tool_use を検出して step:progress を emit する
- **Priority**: must
- **Source**: Task 3.2, 受け入れ基準「claude-code の stream loop emit が共通ヘルパーに括られ」

**GIVEN** claude-code adapter の main stream loop（L141-144 相当）が動作している  
**AND** stream に `isToolUse` = true のメッセージが含まれる  
**WHEN** `for await` ループがそのメッセージを処理する  
**THEN** `ctx.emit("step:progress", { step: <stepName>, tool: <toolName>, target?: <target> })` が呼ばれる

### TC-021 follow-up stream loop でも同様に emit される
- **Priority**: must
- **Source**: Task 3.3, 受け入れ基準「本流と follow-up で進捗の出方が揃う」

**GIVEN** claude-code adapter の follow-up stream loop（L213-216 相当）が動作している  
**AND** stream に `isToolUse` = true のメッセージが含まれる  
**WHEN** `for await` ループがそのメッセージを処理する  
**THEN** `ctx.emit("step:progress", ...)` が呼ばれる

### TC-022 tool_use がない stream では step:progress が emit されない
- **Priority**: must
- **Source**: Task 7.5

**GIVEN** stream に `isToolUse` = true のメッセージが含まれない（result のみ）  
**WHEN** stream loop が全メッセージを処理する  
**THEN** `ctx.emit("step:progress", ...)` が一度も呼ばれない

### TC-023 Edit ツールの file_path が target として抽出される
- **Priority**: should
- **Source**: Task 3.1「Edit/Write → file_path, Bash → command 先頭等」

**GIVEN** `{ name: "Edit", input: { file_path: "src/foo.ts" } }` の tool_use が届く  
**WHEN** `emitToolProgress` が呼ばれる  
**THEN** emit される payload に `target: "src/foo.ts"` が含まれる

### TC-024 Bash ツールのコマンド先頭が target として抽出される
- **Priority**: should
- **Source**: Task 3.1

**GIVEN** `{ name: "Bash", input: { command: "bun run test" } }` の tool_use が届く  
**WHEN** `emitToolProgress` が呼ばれる  
**THEN** emit される payload に `target` が含まれる（`bun run test` または先頭部分）

### TC-025 target が推定不能な tool では target が undefined になる
- **Priority**: should
- **Source**: Task 3.1「推定不能なら undefined を返す」

**GIVEN** `{ name: "UnknownTool", input: {} }` の tool_use が届く  
**WHEN** `emitToolProgress` が呼ばれる  
**THEN** emit される payload に `target` フィールドが含まれないか `undefined`

### TC-026 managed runtime は step:progress を emit しない
- **Priority**: must
- **Source**: D2「managed は floor のみ」、スコープ外

**GIVEN** ManagedAgentRunner が stream を処理している  
**WHEN** pipeline が実行される  
**THEN** `ctx.emit("step:progress", ...)` が一度も呼ばれない

---

## Category: Config validation

### TC-030 heartbeatIntervalSec: 30 は valid
- **Priority**: must
- **Source**: Task 4.3, 7.3

**GIVEN** config ファイルに `progress: { heartbeatIntervalSec: 30 }` が設定されている  
**WHEN** `validateConfig` を実行する  
**THEN** エラーなく通過する

### TC-031 heartbeatIntervalSec: 0 は valid（無効化）
- **Priority**: must
- **Source**: Task 4.3, 7.3

**GIVEN** config ファイルに `progress: { heartbeatIntervalSec: 0 }` が設定されている  
**WHEN** `validateConfig` を実行する  
**THEN** エラーなく通過する

### TC-032 heartbeatIntervalSec: null は valid（無効化）
- **Priority**: must
- **Source**: Task 4.3, 7.3

**GIVEN** config ファイルに `progress: { heartbeatIntervalSec: null }` が設定されている  
**WHEN** `validateConfig` を実行する  
**THEN** エラーなく通過する

### TC-033 heartbeatIntervalSec: -1 は CONFIG_INVALID
- **Priority**: must
- **Source**: Task 4.3, 7.3

**GIVEN** config ファイルに `progress: { heartbeatIntervalSec: -1 }` が設定されている  
**WHEN** `validateConfig` を実行する  
**THEN** `code: "CONFIG_INVALID"` のエラーが throw される

### TC-034 heartbeatIntervalSec: "foo" は CONFIG_INVALID
- **Priority**: must
- **Source**: Task 4.3, 7.3

**GIVEN** config ファイルに `progress: { heartbeatIntervalSec: "foo" }` が設定されている  
**WHEN** `validateConfig` を実行する  
**THEN** `code: "CONFIG_INVALID"` のエラーが throw される

### TC-035 heartbeatIntervalSec: 1.5（非整数）は CONFIG_INVALID
- **Priority**: should
- **Source**: Task 4.3「number >= 0 かつ整数 → 有効」

**GIVEN** config ファイルに `progress: { heartbeatIntervalSec: 1.5 }` が設定されている  
**WHEN** `validateConfig` を実行する  
**THEN** `code: "CONFIG_INVALID"` のエラーが throw される

### TC-036 progress セクション自体が未定義でも valid
- **Priority**: must
- **Source**: Task 4.2（`progress?: ProgressConfig` — optional）

**GIVEN** config ファイルに `progress` セクションが存在しない  
**WHEN** `validateConfig` を実行する  
**THEN** エラーなく通過する

### TC-037 progress が object 以外（例: 文字列）は CONFIG_INVALID
- **Priority**: should
- **Source**: Task 4.3「`progress` must be an object」

**GIVEN** config ファイルに `progress: "invalid"` が設定されている  
**WHEN** `validateConfig` を実行する  
**THEN** `code: "CONFIG_INVALID"` のエラーが throw される

---

## Category: ProgressDisplay heartbeat timer — ライフサイクル

### TC-040 step:start でハートビートタイマーが開始される
- **Priority**: must
- **Source**: Task 5.5, D3「step:start → startHeartbeat()」

**GIVEN** `heartbeatIntervalSec = 30`、fake `timerFn` を注入した `ProgressDisplay`  
**WHEN** `step:start` イベントが emit される  
**THEN** fake `timerFn`（setInterval 相当）が 30000ms 間隔で呼ばれる

### TC-041 heartbeat tick が elapsed と step 名を出力する
- **Priority**: must
- **Source**: Task 5.7, D3「floor」, 受け入れ基準「step + elapsed が定期出力される」

**GIVEN** fake timer と `nowFn` を注入した `ProgressDisplay`（非TTY）  
**AND** `step:start` が emit され、60 秒後の `nowFn` を返すよう設定  
**WHEN** heartbeat tick が発火する  
**THEN** stdout に `[<step名>] 60s` を含む行が書き出される

### TC-042 step:complete でハートビートタイマーが停止する
- **Priority**: must
- **Source**: Task 5.8, 受け入れ基準「timer が pipeline:complete/fail/異常終了で必ず停止」

**GIVEN** fake timer を注入した `ProgressDisplay`  
**AND** `step:start` でタイマーが開始されている  
**WHEN** `step:complete` イベントが emit される  
**THEN** fake `clearTimerFn` が呼ばれ、`heartbeatTimer` が null になる

### TC-043 step:error でハートビートタイマーが停止する
- **Priority**: must
- **Source**: Task 5.8, 7.4

**GIVEN** fake timer を注入した `ProgressDisplay`  
**AND** `step:start` でタイマーが開始されている  
**WHEN** `step:error` イベントが emit される  
**THEN** fake `clearTimerFn` が呼ばれ、`heartbeatTimer` が null になる

### TC-044 pipeline:complete でタイマーが safety net 停止する
- **Priority**: must
- **Source**: Task 5.9, 受け入れ基準「timer が pipeline:complete で必ず停止」

**GIVEN** fake timer を注入した `ProgressDisplay`  
**AND** `step:start` でタイマーが開始されており `step:complete` が来ていない  
**WHEN** `pipeline:complete` イベントが emit される  
**THEN** fake `clearTimerFn` が呼ばれ、`heartbeatTimer` が null になる

### TC-045 pipeline:fail でタイマーが safety net 停止する
- **Priority**: must
- **Source**: Task 5.9, 受け入れ基準「timer が pipeline:fail で必ず停止」

**GIVEN** fake timer を注入した `ProgressDisplay`  
**AND** `step:start` でタイマーが開始されており `step:complete` が来ていない  
**WHEN** `pipeline:fail` イベントが emit される  
**THEN** fake `clearTimerFn` が呼ばれ、`heartbeatTimer` が null になる

### TC-046 dispose() でタイマーが停止する
- **Priority**: must
- **Source**: Task 5.10, D3「dispose()」

**GIVEN** fake timer を注入した `ProgressDisplay`  
**AND** タイマーが稼働中  
**WHEN** `dispose()` を呼ぶ  
**THEN** fake `clearTimerFn` が呼ばれる

### TC-047 heartbeatIntervalSec = 0 でタイマーが起動しない
- **Priority**: must
- **Source**: Task 5.6, 7.2「heartbeatIntervalSec = 0 → timer が起動しないこと」

**GIVEN** `heartbeatIntervalSec = 0`、fake `timerFn` を注入した `ProgressDisplay`  
**WHEN** `step:start` イベントが emit される  
**THEN** fake `timerFn` が一度も呼ばれない

### TC-048 複数 step の連続実行でタイマーが leak しない
- **Priority**: must
- **Source**: Task 7.4「複数 step が連続実行されても timer が leak しないこと」

**GIVEN** fake timer を注入した `ProgressDisplay`  
**WHEN** `step:start` → `step:complete` → `step:start` と連続して emit される  
**THEN** 2 回目の `step:start` 時に前のタイマーが確実に clearInterval されてから新タイマーが開始される（`startHeartbeat` 冒頭の `stopHeartbeat` で保証）

### TC-049 stopHeartbeat の二重呼び出しで例外が発生しない
- **Priority**: should
- **Source**: Task 5.6「二重停止は null check でガード」

**GIVEN** タイマーが停止済みの `ProgressDisplay`（`heartbeatTimer === null`）  
**WHEN** `dispose()` または `step:complete` を再度呼ぶ  
**THEN** 例外が発生しない

---

## Category: ProgressDisplay heartbeat — 進捗サマリ表示

### TC-050 step:progress 受信で progressCount が増える
- **Priority**: must
- **Source**: Task 5.4

**GIVEN** `ProgressDisplay` が `step:start` で初期化されている（`progressCount = 0`）  
**WHEN** `step:progress` イベントが 3 回 emit される  
**THEN** 次の heartbeat tick の出力に `3 actions` が含まれる

### TC-051 lastTool が最新ツール名で更新される
- **Priority**: must
- **Source**: Task 5.4

**GIVEN** `step:progress` イベントが `{ step, tool: "Edit", target: "src/foo.ts" }` で emit される  
**WHEN** 次の heartbeat tick が発火する  
**THEN** 出力に `last: Edit src/foo.ts` が含まれる

### TC-052 progressCount = 0 のとき enrichment なしの floor 出力になる
- **Priority**: must
- **Source**: D4「enrichment なし（floor）: `[implementer] 120s`」

**GIVEN** `step:progress` が一度も emit されていない  
**WHEN** heartbeat tick が発火する  
**THEN** 出力は `[<step>] <elapsed>s` のみ（`| N actions` が含まれない）

### TC-053 step:start で progressCount と lastTool がリセットされる
- **Priority**: must
- **Source**: Task 5.5「`progressCount = 0`、`lastTool = null`」

**GIVEN** 前 step で `progressCount = 5`、`lastTool = "Edit"` だった  
**WHEN** 新しい `step:start` イベントが emit される  
**THEN** `progressCount` が 0、`lastTool` が null にリセットされる

---

## Category: Render 分岐（TTY / 非TTY）

### TC-060 TTY かつ非 verbose では \r 上書き形式で出力される
- **Priority**: must
- **Source**: Task 5.7, D4, 受け入れ基準「TTY かつ非 verbose では上書き 1 行」

**GIVEN** `isTTY = true`、`verbose = false`、fake timer を注入した `ProgressDisplay`  
**WHEN** heartbeat tick が発火する  
**THEN** stdout に `\r` で始まる文字列が書き出される（`\n` は含まれない）

### TC-061 TTY かつ非 verbose では端末幅にパディングされる
- **Priority**: should
- **Source**: Task 5.7「padding で前行残りを消去」

**GIVEN** `isTTY = true`、`verbose = false`、`process.stdout.columns = 80`  
**WHEN** heartbeat tick が発火する  
**THEN** `\r` の後ろの文字列長が 80 文字（`padEnd(80)`）

### TC-062 非 TTY では \n append 形式で出力される
- **Priority**: must
- **Source**: Task 5.7, D4, 受け入れ基準「非TTY では throttle append」

**GIVEN** `isTTY = false`、fake timer を注入した `ProgressDisplay`  
**WHEN** heartbeat tick が発火する  
**THEN** stdout に `\n` で終わる文字列が書き出される

### TC-063 TTY かつ verbose では \n append 形式で出力される
- **Priority**: must
- **Source**: D4「verbose 時は他 stdout が混ざり上書き行が壊れるため上書きしない」

**GIVEN** `isTTY = true`、`verbose = true`、fake timer を注入した `ProgressDisplay`  
**WHEN** heartbeat tick が発火する  
**THEN** stdout に `\n` で終わる文字列が書き出される（`\r` 形式は使わない）

### TC-064 step:complete 時に TTY では上書き行がクリアされる
- **Priority**: should
- **Source**: Task 5.8「`\r\x1b[K` で上書き行をクリア」

**GIVEN** `isTTY = true`、`verbose = false`、タイマーが稼働中  
**WHEN** `step:complete` イベントが emit される  
**THEN** stdout に `\r\x1b[K` が書き出された後、完了行（`[step] ✓ (Xs)`）が出力される

---

## Category: Config/Env による interval 解決

### TC-070 config ファイルの値が最優先で使われる
- **Priority**: must
- **Source**: Task 6.1「1. config」、D5「解決優先度」

**GIVEN** config に `progress.heartbeatIntervalSec: 45` が設定されている  
**AND** `SPECRUNNER_HEARTBEAT_INTERVAL=30` 環境変数も設定されている  
**WHEN** `resolveHeartbeatInterval(config)` を呼ぶ  
**THEN** `45` が返される

### TC-071 config が未設定のとき env 変数が使われる
- **Priority**: must
- **Source**: Task 6.1「2. env」

**GIVEN** config に `progress.heartbeatIntervalSec` が未設定  
**AND** `SPECRUNNER_HEARTBEAT_INTERVAL=120` 環境変数が設定されている  
**WHEN** `resolveHeartbeatInterval(config)` を呼ぶ  
**THEN** `120` が返される

### TC-072 env="off" のとき 0（無効）が返される
- **Priority**: must
- **Source**: Task 6.1「`off` で無効化」、受け入れ基準「off で無効化できる」

**GIVEN** config に `progress.heartbeatIntervalSec` が未設定  
**AND** `SPECRUNNER_HEARTBEAT_INTERVAL=off` 環境変数が設定されている  
**WHEN** `resolveHeartbeatInterval(config)` を呼ぶ  
**THEN** `0` が返される

### TC-073 env="0" のとき 0（無効）が返される
- **Priority**: must
- **Source**: Task 6.1

**GIVEN** config に `progress.heartbeatIntervalSec` が未設定  
**AND** `SPECRUNNER_HEARTBEAT_INTERVAL=0` 環境変数が設定されている  
**WHEN** `resolveHeartbeatInterval(config)` を呼ぶ  
**THEN** `0` が返される

### TC-074 config も env も未設定で TTY のとき default = 30s
- **Priority**: must
- **Source**: Task 6.1「3. default: TTY = 30」、D5

**GIVEN** config に `progress.heartbeatIntervalSec` が未設定  
**AND** `SPECRUNNER_HEARTBEAT_INTERVAL` 環境変数が未設定  
**AND** `process.stdout.isTTY = true`  
**WHEN** `resolveHeartbeatInterval(config)` を呼ぶ  
**THEN** `30` が返される

### TC-075 config も env も未設定で非 TTY のとき default = 60s
- **Priority**: must
- **Source**: Task 6.1「3. default: 非TTY = 60」、D5

**GIVEN** config に `progress.heartbeatIntervalSec` が未設定  
**AND** `SPECRUNNER_HEARTBEAT_INTERVAL` 環境変数が未設定  
**AND** `process.stdout.isTTY = false`  
**WHEN** `resolveHeartbeatInterval(config)` を呼ぶ  
**THEN** `60` が返される

### TC-076 config: null のとき 0（無効）が返される
- **Priority**: must
- **Source**: D5「`0` または `null` で heartbeat 無効」

**GIVEN** config に `progress.heartbeatIntervalSec: null` が設定されている  
**WHEN** `resolveHeartbeatInterval(config)` を呼ぶ  
**THEN** `0` が返される

---

## Category: Timer Leak 防止（CI safety）

### TC-080 step:start → step:error でタイマーが確実にクリアされる
- **Priority**: must
- **Source**: Task 7.4, 受け入れ基準「leak で CI が hang しない／テストで検証」

**GIVEN** fake timer を注入した `ProgressDisplay`  
**AND** `step:start` でタイマーが開始されている  
**WHEN** `step:error` イベントが emit される  
**THEN** fake `clearTimerFn` が呼ばれ、追加の tick が発火しない

### TC-081 pipeline run 全体を通じて最終的にタイマーが leak しない
- **Priority**: must
- **Source**: 受け入れ基準「timer が pipeline:complete/pipeline:fail/異常終了で必ず停止する」

**GIVEN** fake timer を注入した `ProgressDisplay`  
**AND** step:start → step:complete（正常終了） の flow が実行された  
**WHEN** pipeline:complete イベントが emit される  
**THEN** fake `clearTimerFn` の呼び出し回数 ≥ 1 で、最終的に `heartbeatTimer === null`

---

## Category: Regression（振る舞い不変）

### TC-090 pipeline の verdict / exit code が変わらない
- **Priority**: must
- **Source**: 要件 7, 受け入れ基準「pipeline / agent の挙動・成果物・exit code が従来どおり」

**GIVEN** heartbeat 機能を有効にした状態で pipeline を実行する  
**WHEN** pipeline が完了する  
**THEN** verdict 出力と exit code が heartbeat 無効時と同一

### TC-091 bun run typecheck が green
- **Priority**: must
- **Source**: 受け入れ基準「`bun run typecheck && bun run test` が green」

**GIVEN** 全変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラー 0 件

### TC-092 bun run test が green
- **Priority**: must
- **Source**: 受け入れ基準「`bun run typecheck && bun run test` が green」

**GIVEN** 全変更が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass

### TC-093 adapter の既存 result 処理が変わらない
- **Priority**: must
- **Source**: 要件 7「振る舞い不変」

**GIVEN** claude-code adapter に `emitToolProgress` ヘルパーが追加されている  
**WHEN** stream から `type === "result"` のメッセージが届く  
**THEN** `lastResult` の処理は従来と同一（`emitToolProgress` は result を無視して return）

### TC-094 managed runtime の既存動作が変わらない
- **Priority**: must
- **Source**: スコープ外「managed は floor のみ」

**GIVEN** ManagedAgentRunner が使われている  
**WHEN** pipeline が実行される  
**THEN** step:progress emit の追加がなく、managed の挙動に影響しない
