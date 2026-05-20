# create の対話セッション再開と slug 生成の対話化

## Meta

- **type**: spec-change
- **slug**: create-polish-and-resume

## 背景

R1（interactive-query-foundation）で query() の対話基盤を整備し、R2（interactive-create-dialog）で対話 REPL の本体を実装した前提で、残りの仕上げを行う。

- `--resume` による中断セッションの再開（hot resume + cold start の 2 層）
- slug 生成の対話化（LLM が英語 slug を提案 → ユーザー承認）
- 既存の 1-shot create コードのクリーンアップ

## 要件

### 1. `--resume` による対話セッション再開

1. `specrunner create --resume <slug>` で中断した対話セッションを再開する

2. hot resume: draft-state.json に `sessionId` が記録されている場合、SDK の `resume: sessionId` オプションで session を復帰を試みる。draft の request.md 内容を再表示してからユーザー入力を待つ

3. hot resume は try-catch で実行する。SDK の `resume` オプションが無効な sessionId に対して投げる例外（セッションファイル不在等）を catch し、cold start にフォールバックする。フォールバック時はユーザーに「セッションを復旧できなかったため新規開始します」と stderr に通知する

4. cold start: sessionId が無効、または draft-state.json に sessionId がない場合、新しい session を開始する。draft の request.md 内容を初回 prompt に含めて「前回の途中結果がある。これを土台に対話を続けよ」という system prompt で再開する

5. `--resume` 対象の draft が存在しない場合はエラー終了

### 2. slug の対話生成

5. `--slug` が指定されていない場合、初回の system prompt に「まず description から適切な英語の slug を提案し、ユーザーに確認を求めよ」と指示する

7. LLM が `<!-- SLUG_PROPOSAL: <slug> -->` マーカーで slug を提案する。CLI がマーカーを正規表現 `/<!-- SLUG_PROPOSAL:\s*(\S+)\s*-->/` で検出し、「slug: <slug> で良いですか？ [y/N]」と確認する。同一応答に複数マーカーがある場合は最後のものを採用する

8. `y` で確定、`n` で LLM に別案を求める。確定した slug で draft ディレクトリを作成し、以降の対話で使用する

9. LLM が 3 ターン以内にマーカーを出力しない場合、`slugify(description)` で自動生成して続行する。ユーザーに「slug を自動生成しました: <slug>」と通知する

10. slug 未確定の間は draft を永続化しない（slug 確定前の Ctrl+C では draft ロスを許容する。known limitation）

11. `--slug` が明示指定されている場合は slug 提案フェーズをスキップする

12. `slugify()` はバリデーション用途に残す（LLM が提案した slug のフォーマットチェック: kebab-case、50 文字以内、既存 slug との衝突チェック）

### 3. 既存 1-shot コードのクリーンアップ

13. `src/core/command/create.ts` の `extractRequestContent()` 本体を削除する。R1 で `isResultMessage()` は `src/adapter/claude-code/message-types.ts` に移動済みのため、そちらには触れない

14. `buildCreateSystemPrompt()` と `buildCreateUserMessage()`（`src/prompts/create-system.ts`）を削除する。R2 の `src/prompts/create-dialog.ts` が同等の機能を持つため移植は不要。`--no-llm` の `buildScaffoldTemplate()` は `create.ts` に残す

15. `executeCreate()` に `--no-llm` 分岐を残し、対話パスは `create-dialog.ts` に委譲する。`executeCreate()` がファサードとして残る構成にする

### 4. Ctrl+C のハンドリング

16. SIGINT（Ctrl+C）を `process.on('SIGINT', ...)` で捕捉し、現在の draft を保存してから終了する。readline の `close` イベントも併用する（readline が active でない瞬間の SIGINT に対応）。R2 で known limitation だった Ctrl+C 時の draft ロスを解消する

### 5. `--run` の対話版対応

17. finalize 後に「`specrunner run` を実行しますか？ [y/N]」と確認する。`--run` フラグが付いている場合は確認なしで実行する

### 6. テスト

18. `--resume` の hot resume テスト（sessionId あり → SDK resume オプションが渡されること）
19. `--resume` の cold start テスト（SDK 例外 → 新規 session + draft 内容が prompt に含まれること + stderr 通知）
20. slug 提案マーカー `/<!-- SLUG_PROPOSAL:\s*(\S+)\s*-->/` の検出テスト（複数マーカー時は最後を採用）
21. slug マーカー 3 ターン未検出時の slugify フォールバックテスト
22. `slugify()` による LLM 提案 slug のバリデーションテスト
23. Ctrl+C（SIGINT）時の draft 保存テスト
24. `extractRequestContent()` / `buildCreateSystemPrompt()` 削除後も `--no-llm` が動作するテスト

## スコープ外

- ManagedRuntime での対話サポート
- 対話履歴の永続的なログ保存
- 複数の draft の管理 UI（`specrunner create --list` 等）

## 受け入れ基準

- [ ] `specrunner create --resume <slug>` で中断した対話を再開できる
- [ ] session が有効な場合は hot resume、無効な場合は cold start で再開する
- [ ] `--slug` 未指定時に LLM が slug を提案し、ユーザーが承認/拒否できる
- [ ] LLM 提案の slug が slugify のバリデーション（kebab-case、50 文字、衝突チェック）を通る
- [ ] `extractRequestContent()` と `buildCreateSystemPrompt()` が削除されている
- [ ] `--no-llm` が引き続き動作する
- [ ] Ctrl+C で draft が保存される
- [ ] `--run` で finalize 後に pipeline が起動する
- [ ] `bun run typecheck && bun run test` が green
