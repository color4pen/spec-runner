## 1. 対話用 system prompt

- [x] 1.1 `src/prompts/create-dialog.ts` を新設し、`buildDialogSystemPrompt()` を実装する。既存の `buildCreateSystemPrompt()` から request.md 構造ルールを流用しつつ、対話モード固有の指示（コードベース調査の積極化、`<!-- FINAL_DRAFT -->` マーカープロトコル）を追加
- [x] 1.2 `buildDialogInitialMessage()` を実装する。description / type / slug / DynamicContext / request パターンを含む初回 user message を構築。`buildCreateUserMessage()` と同じ情報を含むが、対話を開始する文脈で記述

## 2. stream_event パース + type guard

- [x] 2.1 `src/adapter/claude-code/message-types.ts` に `isStreamEvent()` type guard を追加。`type === "stream_event"` かつ `event` プロパティの存在を検証
- [x] 2.2 `isTextDelta()` ヘルパを追加。`event.type === "content_block_delta"` かつ `event.delta.type === "text_delta"` を検証し、`event.delta.text` を安全に取得
- [x] 2.3 `isToolUseSummary()` type guard を追加。`type === "tool_use_summary"` かつ `summary` プロパティの存在を検証

## 3. 対話エンジン本体

- [x] 3.1 `src/core/command/create-dialog.ts` を新設。`DialogParams` 型を定義（description, type, slug, cwd, runtime）
- [x] 3.2 `createPromptGenerator()` を実装。`readline/promises` の Interface を受け取り、`AsyncGenerator<SDKUserMessage>` を yield する generator。初回は initialMessage を yield し、以降はユーザー入力を待って yield。`exit` / `quit` 入力で generator を終了
- [x] 3.3 `initSession()` を実装。DynamicContext 収集 + request パターン収集 + system prompt 組み立て + `queryInteractive()` 呼び出し。`hasQueryInteractive()` による runtime チェックを含む
- [x] 3.4 `dialogLoop()` を実装。`for await (const msg of query)` で SDK メッセージストリームを消費し、`stream_event` → text_delta をリアルタイム表示、`tool_use_summary` を stderr 表示。LLM 応答完了後にプロンプトを再表示
- [x] 3.5 `detectCompletion()` を実装。テキストバッファから `<!-- FINAL_DRAFT -->` マーカーを検索し、検出結果と content を返す純粋関数
- [x] 3.6 完了検出後の確認フローを実装。`readline.question("この内容で request.md を書き出しますか？ [y/N] ")` で確認。`y` / `Y` で finalize パスへ、それ以外で対話継続
- [x] 3.7 `finalize()` を実装。request.md の書き出し（`specrunner/requests/active/<slug>/request.md`） + `parseRequestMdContent()` によるバリデーション + type/slug の一致検証 + パス出力 + draft 削除
- [x] 3.8 `executeCreateDialog()` を実装。上記 phase を組み合わせたエントリポイント。成功時 0、エラー時 1 を返す

## 4. draft ストア

- [x] 4.1 `src/state/draft-store.ts` を新設。`DraftState` インターフェースと `saveDraft()` / `loadDraft()` / `deleteDraft()` を実装
- [x] 4.2 保存先: `specrunner/requests/draft/<slug>/request.md` と `draft-state.json` の 2 ファイル
- [x] 4.3 `<!-- FINAL_DRAFT -->` 検出時に `saveDraft()` を呼ぶ統合を 3.6 に追加
- [x] 4.4 `exit` / `quit` 入力時に現在の draft バッファを `saveDraft()` で保存する統合を 3.2 に追加

## 5. CLI ファサード更新

- [x] 5.1 `src/cli/create.ts` の `runCreate()` を更新。`noLlm` が false の場合に `executeCreateDialog()` を呼び出すルーティングを追加
- [x] 5.2 `--run` フラグは対話モードでは無視する（将来の TODO コメントを残す）

## 6. テスト

- [x] 6.1 `detectCompletion()` のユニットテスト: マーカーあり / マーカーなし / マーカー後にコンテンツあり / 空文字列
- [x] 6.2 `isStreamEvent()` / `isTextDelta()` / `isToolUseSummary()` の type guard テスト
- [x] 6.3 `draft-store` のテスト: `saveDraft` → `loadDraft` のラウンドトリップ、`deleteDraft` 後の `loadDraft` が null、存在しない slug の `loadDraft` が null
- [x] 6.4 `buildDialogSystemPrompt()` のテスト: `<!-- FINAL_DRAFT -->` マーカー指示を含むことの検証
- [x] 6.5 `buildDialogInitialMessage()` のテスト: description / type / slug / DynamicContext / patterns が含まれることの検証
- [x] 6.6 `createPromptGenerator()` のテスト: mock readline で初回メッセージ + ユーザー入力 + exit の流れを検証
- [x] 6.7 `--no-llm` が引き続き scaffold テンプレートを出力することの回帰テスト
- [x] 6.8 ストリーミング表示のテスト: mock メッセージストリームから text_delta を抽出し stdout に書き出す処理の検証

## 7. Delta Spec

- [x] 7.1 `cli-commands` delta spec: `specrunner create` サブコマンドの対話モード振る舞いを追加
- [x] 7.2 `request-management` delta spec: draft ライフサイクル（`specrunner/requests/draft/<slug>/`）を追加

## 8. 検証

- [x] 8.1 `bun run typecheck` が green
- [x] 8.2 `bun run test` が green
