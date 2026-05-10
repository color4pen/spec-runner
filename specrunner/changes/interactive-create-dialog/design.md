## Context

現在の `executeCreate()` は 1-shot パターン: DynamicContext 収集 → prompt 構築 → `runtime.query(prompt)` → `extractRequestContent()` → ファイル書き出し。ユーザーとの対話がなく、LLM の出力をそのまま受け入れるか全拒否するかの二択しかない。

`LocalRuntime` は既に `queryInteractive(prompt: AsyncIterable<SDKUserMessage>, opts?: QueryOptions): Query` を持っている。これは `RuntimeStrategy` インターフェースに含まれない LocalRuntime 固有のメソッドで、`prompt` として `AsyncIterable<SDKUserMessage>` を受け取り、SDK の `Query` オブジェクトを返す。この基盤の上に対話 REPL を構築する。

SDK の `Query` オブジェクトは `AsyncIterable<SDKMessage>` を実装しており、`for await (const msg of query)` でメッセージストリームを消費できる。`SDKPartialAssistantMessage`（`type: 'stream_event'`）を含む全メッセージ型がストリームに流れる。

## Goals / Non-Goals

**Goals:**

- ユーザーが対話しながら request.md の要件を練り上げられる REPL を実装する
- LLM がコードベースを Read / Grep / Glob で積極的に調査する
- LLM の応答をストリーミングでリアルタイム表示する
- `<!-- FINAL_DRAFT -->` マーカーで完了を検出し、ユーザー確認後にファイル書き出しする
- 中断時に draft を保存し、将来の `--resume` に備える

**Non-Goals:**

- `--resume` による中断セッション再開（R3 で実装）
- slug の対話生成（R3 で実装）
- `--run` フラグの対話版対応（finalize 後に手動で `specrunner run` を実行）
- Ctrl+C のシグナルハンドリング（readline のデフォルト挙動に任せる）
- ManagedRuntime での対話サポート（local runtime 専用）

## Decisions

### D1: 4 phase 構造（CommandRunner を継承しない）

`create-dialog.ts` は CommandRunner を継承せず、以下の 4 phase を独立関数として実装する:

```typescript
// Phase 1: セッション初期化
async function initSession(params: DialogParams): Promise<DialogSession>

// Phase 2: 対話ループ（REPL）
async function dialogLoop(session: DialogSession): Promise<DialogResult>

// Phase 3: 完了検出（dialogLoop 内で呼ばれる）
function detectCompletion(text: string): { detected: boolean; content: string }

// Phase 4: ファイル書き出し + バリデーション
async function finalize(result: DialogResult, params: DialogParams): Promise<number>
```

**理由**: CommandRunner は pipeline の deterministic フロー（prepare → setupWorkspace → buildDeps → pipeline.run → handleResult → teardown）向けに設計されている。対話の non-deterministic フロー（ユーザー入力の任意のタイミング、中断、再開）とは構造が根本的に異なる。Template Method のオーバーライドポイント（`prepare()`）では対話ループを表現できない。

### D2: SDK generator prompt で REPL を実現する

`readline/promises` から読んだユーザー入力を `SDKUserMessage` に変換し、`AsyncGenerator` 経由で `queryInteractive()` に渡す:

```typescript
async function* createPromptGenerator(
  initialMessage: string,
  rl: readline.Interface,
): AsyncGenerator<SDKUserMessage> {
  // 初回メッセージを yield
  yield { type: "user", message: { role: "user", content: initialMessage }, parent_tool_use_id: null };
  
  // 以降はユーザー入力を待って yield
  while (true) {
    const input = await rl.question("> ");
    if (input === "exit" || input === "quit") break;
    yield { type: "user", message: { role: "user", content: input }, parent_tool_use_id: null };
  }
}
```

1 つの `queryInteractive()` 呼び出し内でセッション全体が完結する。generator が終了すると SDK のセッションも終了する。

`LocalRuntime.queryInteractive()` は既に存在するため、`RuntimeStrategy` インターフェースを変更する必要はない。ただし `create-dialog.ts` は `LocalRuntime` に直接依存する（`runtime as LocalRuntime` のキャスト、または `queryInteractive` の存在チェック）。

### D3: stream_event パースによるリアルタイム表示

SDK の `Query` オブジェクトから `for await` でメッセージを受け取り、`type` で分岐:

```typescript
for await (const msg of query) {
  switch (msg.type) {
    case "stream_event":
      // content_block_delta → text_delta をリアルタイム出力
      if (msg.event.type === "content_block_delta" && msg.event.delta.type === "text_delta") {
        process.stdout.write(msg.event.delta.text);
        buffer += msg.event.delta.text;
      }
      break;
    case "tool_use_summary":
      // ツール実行の簡潔な表示
      process.stderr.write(`\n[tool] ${msg.summary}\n`);
      break;
    case "assistant":
      // ストリーミング完了後の完全なメッセージ — 完了検出に使う
      break;
    case "result":
      // セッション終了
      break;
  }
}
```

`ProgressDisplay` は pipeline の EventBus vocabulary（`step:start`, `step:complete`, `verdict:parsed`）に依存しているため、対話 REPL では流用しない。対話用の表示は `process.stdout.write()` と `process.stderr.write()` で直接行う。

### D4: `<!-- FINAL_DRAFT -->` マーカープロトコル

system prompt で LLM に以下のプロトコルを指示する:

1. request.md の全セクション（Meta / 背景 / 要件 / スコープ外 / 受け入れ基準）が十分に埋まったと判断したら、`<!-- FINAL_DRAFT -->` マーカーに続けて最終版を提示する
2. マーカーは応答テキスト中に 1 回だけ出現する

CLI 側の検出ロジック:

```typescript
function detectCompletion(text: string): { detected: boolean; content: string } {
  const marker = "<!-- FINAL_DRAFT -->";
  const idx = text.indexOf(marker);
  if (idx === -1) return { detected: false, content: "" };
  return { detected: true, content: text.slice(idx + marker.length).trim() };
}
```

検出後、CLI が「この内容で request.md を書き出しますか？ [y/N]」と確認する。`y` で finalize、`n` で対話継続（generator に次のユーザー入力を yield）。

**理由**: LLM の stop_reason やメッセージ構造に依存する完了検出は不安定。テキスト中の明示的マーカーなら検出ロジックがシンプルで testable。

### D5: draft 永続化モデル

`src/state/draft-store.ts` に JobState とは独立した軽量ストアを実装する:

```typescript
interface DraftState {
  sessionId: string;
  slug: string;
  type: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// ファイルシステムパス: specrunner/requests/draft/<slug>/
//   request.md     — 最新の draft 内容
//   draft-state.json — メタデータ
```

- `saveDraft(slug, content, state)`: draft ディレクトリに request.md と draft-state.json を書き出す
- `loadDraft(slug)`: draft を読み込む。存在しなければ null
- `deleteDraft(slug)`: draft ディレクトリを削除する

ライフサイクル:
1. LLM が `<!-- FINAL_DRAFT -->` を提示するたびに `saveDraft()` で更新
2. ユーザーが `exit` / `quit` を入力したら現在の draft を `saveDraft()` で保存して終了
3. finalize 成功時に `deleteDraft()` で削除し、`active/` に request.md を書き出す

**理由**: JobState は pipeline 実行用の重量級構造（jobId, step, history, worktreePath...）で、対話 draft の保存には過剰。slug をキーとする 2 ファイル構成で十分。

### D6: CLI ファサードのルーティング

`src/cli/create.ts` の `runCreate()` を更新:

```typescript
if (noLlm) {
  // 既存パス: scaffold テンプレート出力
  return executeCreate({ description, type, slug, cwd, noLlm: true, run: false, runtime });
} else {
  // 新規パス: 対話 REPL
  return executeCreateDialog({ description, type, slug, cwd, runtime });
}
```

`--run` フラグは対話モードでは無視する（finalize 後に手動で `specrunner run` を実行する想定）。将来的に対話内で `--run` を聞く UX を検討可能だが、本 change では対象外。

`executeCreate()` の既存ロジック（1-shot LLM パス）は `--no-llm` 時のみ使用される。1-shot LLM パスのコードは残すが呼ばれなくなる。将来の cleanup で削除可能。

### D7: queryInteractive の利用パターン

`LocalRuntime.queryInteractive()` は `RuntimeStrategy` インターフェースに含まれないため、型安全に利用するには以下のパターンを使う:

```typescript
function hasQueryInteractive(runtime: RuntimeStrategy): runtime is LocalRuntime {
  return typeof (runtime as LocalRuntime).queryInteractive === "function";
}
```

ManagedRuntime が渡された場合はエラーメッセージを表示して exit する。対話モードは local runtime 専用。

## Risks / Trade-offs

- [Risk] generator prompt のライフサイクル管理: generator が throw/return した場合に SDK セッションが正しくクリーンアップされるか → SDK の仕様を確認し、finally ブロックで rl.close() する
- [Risk] ストリーミング表示とユーザー入力の競合: LLM が応答中にユーザーがタイプすると表示が崩れる → readline のデフォルト挙動に委ねる。応答完了後にプロンプトを再表示する
- [Trade-off] `LocalRuntime` への直接依存: `create-dialog.ts` が `RuntimeStrategy` ではなく `LocalRuntime` に依存する → 対話は local 専用機能として割り切る。ManagedRuntime での対話サポートは将来検討
- [Trade-off] 1-shot パスのコード残置: `executeCreate()` 内の LLM パスは `--no-llm` 以外では使われなくなるが、コードは残す → 即時削除よりも段階的廃止が安全
