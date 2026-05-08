# Design: fix-create-dialog-repl-timing

## Context

PR #129（interactive-create-dialog）と PR #130（create-polish-and-resume）で確立した構造:

- `executeCreateDialog()` — 4-phase REPL
- `createPromptGenerator()` — `AsyncGenerator<SDKUserMessage>` を `queryInteractive()` に渡す
- `queryInteractive()` — `LocalRuntime` 固有の SDK 直接呼び出し。`SdkQueryFn` 型で `AsyncIterable<SDKUserMessage>` を prompt として渡す
- `QueryOptions` — `{ resume?: string, continue?: boolean, sessionId?: string }` で SDK session 制御

**問題**: SDK の `query({ prompt: AsyncIterable<SDKUserMessage> })` は generator を非同期に消費する。generator の `yield` 後に即座に次の `rl.question()` が呼ばれ、LLM が応答を生成している最中に readline がターミナルを制御する。結果として `> ` プロンプトが LLM 応答の前に表示され、入力のエコーが重複し、ストリーミングがバッチ化される。

## Goals

- LLM 応答の完了と readline 入力を直列化し、表示の競合を解消する
- generator 方式を廃止し、毎ターン独立した `query()` 呼び出しに切り替える
- `queryInteractive()` / `SdkQueryFn` 等の dead code を除去する
- session 管理を暗黙的から明示的（`session_id` 追跡）に変更する

## Non-Goals

- ストリーミング表示の改善（改行・インデント等の UX 改善）
- `Query.streamInput()` を使った単一 query 内マルチターン方式

## Decisions

### D1: generator 方式の廃止と while ループ化

**問題**: SDK は generator から次のメッセージを pre-pull する。readline の `question()` が LLM 応答完了前に呼ばれる構造的問題。

**方針**: `createPromptGenerator()` + `queryInteractive()` を廃止し、while ループで毎ターン `runtime.query()` を独立に呼ぶ:

```typescript
// 初回
let sessionId: string | undefined;
for await (const msg of runtime.query(initialText, { systemPrompt, cwd, ... })) {
  // ストリーミング表示 + FINAL_DRAFT 検出 + slug 検出
  // result メッセージから session_id を取得
  if (isResultMessage(msg)) sessionId = msg.session_id;
}

// LLM 応答完了後にユーザー入力
const input = await rl.question("> ");

// 2回目以降
for await (const msg of runtime.query(input, { resume: sessionId, cwd, ... })) {
  // ストリーミング表示
}
```

**理由**: `query()` の for-await が完了してからはじめて `rl.question()` が呼ばれるため、LLM 応答とユーザー入力が構造的に直列化される。

### D2: `resume: sessionId` による明示的 session 管理

**問題**: `continue: true` は cwd ベースの暗黙的 session resolution に依存し、並走時に session 衝突のリスクがある。

**方針**: 初回 query の result メッセージから `session_id` を取得し、2 回目以降は `resume: sessionId` で明示指定する。

```typescript
// result メッセージの構造（SDK）
// { type: "result", subtype: "success", session_id: "uuid-xxx", ... }
```

SDK の型定義で `continue` と `resume` は mutually exclusive。hot resume でも `resume: sessionId` 単体を使用する。

**理由**: session_id の明示追跡は堅牢で、テスタビリティも高い（mock で session_id を注入できる）。

### D3: systemPrompt は初回のみ

**問題**: SDK session 内で system prompt は引き継がれるため、2 回目以降に渡すと重複する可能性がある。

**方針**: `systemPrompt` は初回の `query()` にのみ渡す。2 回目以降は `resume: sessionId` のみで session を継続する。

### D4: queryInteractive / SdkQueryFn の削除

**問題**: while ループ化により `queryInteractive()` の呼び出し元がなくなる。

**方針**:
- `LocalRuntime.queryInteractive()` メソッドを削除
- `LocalRuntime` の `sdkQueryFn` フィールドを削除
- `LocalRuntimeOptions.sdkQueryFn` を削除
- `agent-runner.ts` の `SdkQueryFn` 型を削除
- `RuntimeStrategy` interface の `queryInteractive?()` を削除
- `create-dialog.ts` の `RuntimeWithQueryInteractive` interface、`hasQueryInteractive()` type guard を削除
- `SDKUserMessage` import を `create-dialog.ts` から削除

YAGNI に基づく判断。必要になった場合は `git log` から復元可能。

### D5: executeCreateDialog の構造変更

**方針**: 4-phase 構造を維持しつつ、phase 1-2 の内部実装を変更:

```
Phase 1: initSession — DynamicContext + patterns + system prompt（変更なし）
Phase 2: dialogLoop — while ループ + 毎ターン query()（generator → ループに変更）
Phase 3: detectCompletion — pure function（変更なし）
Phase 4: finalize — write request.md（変更なし）
```

dialogLoop 内の処理を関数分割して論理的な phase 境界を維持:

- `processAssistantTurn(msg, textBuffer, ...)` — ストリーミング表示 + slug/completion 検出
- `handleUserInput(rl)` — exit/quit 判定 + 入力取得
- slug collision フィードバック — 次のターンの `query()` に collision メッセージを prompt として渡す

### D6: hot resume の実装変更

**問題**: 現在の hot resume は `queryInteractive()` + generator で実現している。

**方針**: `runtime.query("(セッション再開)", { resume: sessionId, ... })` で実現する。通常のターンと同じフロー。`continue: true` は使わない。

### D7: cold start の実装変更

**問題**: 現在の cold start は `createPromptGenerator()` + `buildResumeInitialMessage()` で generator を構成。

**方針**: 初回 query に `buildResumeInitialMessage()` の内容を prompt として渡す。通常の初回 query と同じフロー。session_id は新規取得。

## Risks

### R1: session_id の取得

SDK の result メッセージに `session_id` が含まれることが前提。SDK バージョンアップで構造が変わる可能性がある。`RuntimeStrategy.query()` は `AsyncGenerator<unknown>` を返すため、result メッセージの型を適切に検出する必要がある。

### R2: `hasQueryInteractive()` 削除の影響

現在 `executeCreateDialog()` の冒頭で `hasQueryInteractive(runtime)` によるガード。削除後は `runtime.query()` が全 RuntimeStrategy に存在するため、ManagedRuntime でも呼び出し自体は可能になる。ただし ManagedRuntime の `query()` は no-op なので、別のガードが必要。既存の ManagedRuntime 非対応メッセージは維持するが、判定基準を変更する必要がある（例: `runtime instanceof LocalRuntime`、または config flag）。
