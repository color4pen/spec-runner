# Tasks: create-polish-and-resume

## 1. `--resume` の CLI 配線

- [x] 1.1 `bin/specrunner.ts` の create case に `--resume <slug>` / `--resume=<slug>` フラグを追加する。`--resume` 指定時は description を optional にする（未指定でもエラーにしない）
- [x] 1.2 `src/cli/create.ts` の `CreateOptions` に `resume?: string` を追加する
- [x] 1.3 `runCreate()` の description 引数を `description?: string` に変更する。`--resume` 指定時は description 未指定を許容し、`loadDraft(cwd, resume)` で draft を読み込む。draft が存在しない場合は `"Error: No draft found for slug '<slug>'."` を stderr に出力して `process.exit(1)` する
- [x] 1.4 `--resume` 指定時は `executeCreateDialog()` に resume 情報（draft content + DraftState）を渡す。slug は draft の DraftState から復元する

## 2. `--resume` の復帰ロジック

- [x] 2.1 `DialogParams` に `resume?: { content: string; state: DraftState }` を追加する
- [x] 2.2 `executeCreateDialog()` に resume 分岐を追加する。resume が設定されている場合:
  - draft の request.md 内容を stderr に再表示する（「--- 前回の下書き ---」ヘッダー付き）
  - hot resume を試みる: `DraftState.sessionId` を `QueryOptions.resume` に渡して `queryInteractive()` を呼ぶ
  - hot resume の `queryInteractive()` 呼び出しを try-catch で囲む。SDK 例外時は cold start にフォールバックし、stderr に `"セッションを復旧できなかったため新規開始します"` と通知する
- [x] 2.3 cold start: `buildResumeInitialMessage(content, state)` で生成した初回メッセージで新規 session を開始する
- [x] 2.4 `src/prompts/create-dialog.ts` に `buildResumeInitialMessage(draftContent: string, state: DraftState): string` を追加する。draft content を含め「前回の途中結果がある。これを土台に対話を続けよ」という指示を組み立てる

## 3. slug の対話生成

- [x] 3.1 `DialogParams.slug` を `slug?: string` に変更する（optional 化）
- [x] 3.2 `src/core/command/create-dialog.ts` に `detectSlugProposal(text: string): string | null` を追加する。正規表現 `/<!-- SLUG_PROPOSAL:\s*(\S+)\s*-->/g` で全マッチを取得し、最後のマッチの slug を返す。マッチなしで `null`
- [x] 3.3 `src/prompts/create-dialog.ts` の `buildDialogSystemPrompt()` にパラメータ `options?: { needSlugProposal?: boolean }` を追加する。`needSlugProposal` が true の場合、system prompt に以下を追加する: 「まず description から適切な英語の slug（kebab-case、50 文字以内）を提案してください。slug は `<!-- SLUG_PROPOSAL: <slug> -->` マーカーで提示してください」
- [x] 3.4 `buildDialogInitialMessage()` の slug パラメータを `slug?: string` に変更する。未指定時は slug 行を省略し、末尾の指示文から slug 指定を除く
- [x] 3.5 `executeCreateDialog()` の dialogLoop 内で、slug 未確定（`currentSlug === undefined`）の場合、各 assistant ターン完了後に `detectSlugProposal(textBuffer)` を呼ぶ。検出した slug に対して:
  - `slugify()` でフォーマット検証（kebab-case、50 文字以内）
  - `checkSlugCollision()` で衝突チェック
  - 検証通過後、`rl.question()` で `"slug: <slug> で良いですか？ [y/N] "` と確認
  - `y` で `currentSlug` を確定し、以降の draft 永続化を有効化
  - `n` で LLM に別案を要求（通常のユーザー入力として処理される）
  - 検証失敗時は LLM に理由を伝えて再提案を求める
- [x] 3.6 slug マーカー未検出カウンタを設ける。3 assistant ターンを経過してもマーカーが検出されない場合、`slugify(description)` で自動生成し、stderr に `"slug を自動生成しました: <slug>"` と通知して続行する
- [x] 3.7 `--slug` が明示指定されている場合（`params.slug !== undefined`）は slug 提案フェーズをスキップする。`buildDialogSystemPrompt({ needSlugProposal: false })` を使用

## 4. 1-shot コードのクリーンアップ

- [x] 4.1 `src/core/command/create.ts` から `extractRequestContent()` の関数本体と export を削除する。`export { isResultMessage }` の re-export は残す（他ファイルが依存している場合）。依存がなければ re-export も削除する
- [x] 4.2 `src/prompts/create-system.ts` を削除する（`buildCreateSystemPrompt()` と `buildCreateUserMessage()` の全廃）
- [x] 4.3 `src/core/command/create.ts` の `executeCreate()` を修正する:
  - 1-shot LLM パス（step c-g: context 収集 → prompt 生成 → LLM query → extract）を削除
  - `noLlm` 分岐を残す（scaffold template → write → validate → output path → optional run）
  - else ブランチは `executeCreateDialog()` に委譲する
  - `CreateParams` に `resume?: { content: string; state: DraftState }` を追加（ファサードとして resume を下流に渡す）
- [x] 4.4 `src/cli/create.ts` の `runCreate()` を整理する:
  - `noLlm` / interactive の分岐を削除し、常に `executeCreate()` を呼ぶ
  - `executeCreate()` が内部でルーティングする（ファサードパターン）
  - TODO コメント（`--run` flag ignored）を削除
- [x] 4.5 `isResultMessage` の re-export 先を確認する。`create.ts` から re-export されていたものが他ファイルで import されている場合、import パスを `message-types.ts` に変更する

## 5. Ctrl+C ハンドリング

- [x] 5.1 `executeCreateDialog()` の開始時に `process.on('SIGINT', sigintHandler)` を登録する。handler は:
  - slug 確定済み（`currentSlug !== undefined`）かつ draft content がある場合: `saveDraft()` → stderr に通知 → `process.exit(130)`
  - slug 未確定の場合: そのまま `process.exit(130)`
- [x] 5.2 readline の `close` イベントでも同様のロジックを実行する（readline が active でない瞬間の SIGINT に対応）
- [x] 5.3 finalize 完了後に `process.removeListener('SIGINT', sigintHandler)` で handler を解除する

## 6. `--run` の対話版対応

- [x] 6.1 `DialogParams` に `run?: boolean` を追加する
- [x] 6.2 `finalize()` の呼び出し元（`executeCreateDialog` 内）で、finalize 成功（return 0）後に:
  - `params.run === true` の場合: 確認なしで `runRunCore(requestMdPath)` を実行
  - `params.run` が未設定の場合: `rl.question("specrunner run を実行しますか？ [y/N] ")` で確認。`y` なら実行
  - `finalize()` から requestMdPath を返す必要がある。戻り値を `{ exitCode: number; requestMdPath?: string }` に変更するか、finalize 内で run 処理まで行う
- [x] 6.3 `runRunCore` を `create-dialog.ts` に import する（`src/cli/run.ts` から）

## 7. テスト

- [x] 7.1 `detectSlugProposal()` のユニットテスト:
  - マーカーあり → slug が返る
  - マーカーなし → null
  - 複数マーカー → 最後の slug が返る
  - 不正な形式（空白含み等）→ null
- [x] 7.2 `--resume` hot resume テスト: `DraftState.sessionId` あり → `queryInteractive()` に `{ resume: sessionId }` が渡されることを検証
- [x] 7.3 `--resume` cold start テスト: SDK 例外 → 新規 session + draft 内容が初回 prompt に含まれること + stderr に復旧失敗メッセージ
- [x] 7.4 `--resume` 対象の draft が存在しない場合 → エラー終了
- [x] 7.5 slug マーカー 3 ターン未検出 → `slugify(description)` フォールバック + stderr 通知
- [x] 7.6 `slugify()` による LLM 提案 slug のバリデーション（既存テストに追加）: 50 文字超過、非 kebab-case、衝突ありの各ケース
- [x] 7.7 Ctrl+C（SIGINT）時の draft 保存テスト: slug 確定済み → `saveDraft()` が呼ばれる。slug 未確定 → `saveDraft()` が呼ばれない
- [x] 7.8 `extractRequestContent()` / `buildCreateSystemPrompt()` 削除後も `--no-llm` が動作するテスト: `buildScaffoldTemplate()` による request.md 生成 → write → validate が通ること
- [x] 7.9 `buildResumeInitialMessage()` のテスト: draft content と state が prompt に含まれること
- [x] 7.10 `buildDialogSystemPrompt({ needSlugProposal: true })` のテスト: SLUG_PROPOSAL マーカーの指示が含まれること

## 8. 検証

- [x] 8.1 `bun run typecheck` が green
- [x] 8.2 `bun run test` が green
