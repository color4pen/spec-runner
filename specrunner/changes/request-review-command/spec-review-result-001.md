# Spec Review Result: request-review-command

- **reviewer**: spec-reviewer (Claude)
- **date**: 2026-05-14
- **verdict**: approved

## Review Summary

全体として高品質な仕様。request.md の要件は明確で、design.md・tasks.md・delta-spec が一貫して対応している。既存コードベースのパターン（command-registry の subcommand 登録、step-config resolution chain、SDK query() の呼び出しパターン）に沿った設計で、アーキテクチャとの整合性が高い。

## Findings Summary

| # | Severity | Category | Description |
|---|----------|----------|-------------|
| 1 | LOW | design-consistency | design.md の CLI Integration セクションが dynamic import (`await import(...)`) を使用しているが、tasks.md T-03 と既存 command-registry.ts は static import パターン。tasks.md 側が正しいが、design.md との不一致がある |
| 2 | LOW | request-vs-design | request.md 要件 #4 は「Agent 等」のツールも渡すと書いているが、design.md では `allowedTools: ["Read", "Grep", "Glob"]` に限定。read-only に限定する判断は正しいが、request.md の記述が誤解を招く |
| 3 | LOW | error-handling | design.md の `loadConfig().catch(() => ({} as SpecRunnerConfig))` は型安全性が低い。既存の `loadConfig()` は `SpecRunnerConfig` を返すが、空オブジェクトは `SpecRunnerConfig` の required fields を満たさない可能性がある。`getStepExecutionConfig` が空 config でも安全に動作するか、実装時に検証が必要 |
| 4 | LOW | prompt-pattern | 既存プロンプトファイルは `build{Role}SystemPrompt()` ビルダー関数パターンを使うが、design.md では定数エクスポート `REQUEST_REVIEW_SYSTEM_PROMPT` のみ。本コマンドは動的パラメータが不要なため定数で十分だが、将来 `projectContext` をシステムプロンプトに注入する場合はビルダー関数が必要になる |
| 5 | LOW | timeout-handling | design.md で `query()` に `timeoutMs` を渡す記述がないが、既存の agent-runner.ts は AbortController で wall-clock timeout を実装している。`resolvedConfig.timeoutMs` は取得するが、timeout 適用ロジックが tasks.md に明記されていない |

## Alignment Verification

### request.md ↔ design.md

- ✅ Pipeline machinery 不使用、SDK `query()` 直接呼び出し
- ✅ `RequestReviewVerdict` を pipeline `Verdict` とは独立定義
- ✅ exit code 2-way（0/1）
- ✅ JSON スキーマ `{ verdict, findings[], summary }`
- ✅ `projectMdPath()` からの project context 読み込み
- ✅ `parseRequestMdContent` インライン呼び出し（subprocess なし）
- ✅ stateless one-shot、ファイル出力なし
- ⚠️ 要件 #4 の「Agent 等」ツール → design では Read/Grep/Glob のみ（Finding #2）
- ✅ `systemPrompt` は SDK がサポートしていることを確認済み（sdk.d.ts line 1752）

### design.md ↔ tasks.md

- ✅ 型定義（`RequestReviewVerdict`, `RequestReviewFinding`, `RequestReviewResult`）が一致
- ✅ `parseReviewOutput` のフォールバック戦略が一致
- ✅ `verdictToExitCode` の mapping が一致
- ✅ `executeReview` のフローが一致（6ステップ）
- ✅ テストケースが `parseReviewOutput`, `verdictToExitCode`, `buildInitialMessage` のユニットテストをカバー
- ⚠️ import パターンの不一致（Finding #1）

### delta-spec

- ✅ baseline `specrunner/specs/cli-commands/spec.md` が存在する
- ✅ ADDED セクションが request.md の要件を正確に反映
- ✅ stateless / no-file-output / no-worktree の制約を明記

### 既存コードベースとの整合性

- ✅ `command-registry.ts` の `request.subcommands` パターンに準拠
- ✅ `getStepExecutionConfig` の resolution chain を再利用（step name: "request-review"）
- ✅ SDK `query()` の呼び出しパターンが `agent-runner.ts` / `local.ts` と一致
- ✅ `projectMdPath()` が相対パスを返す仕様を考慮（`path.join(cwd, ...)` で絶対化）
- ✅ `parseRequestMdContent` が `SpecRunnerError` を throw するパターンをハンドリング
- ✅ `QueryOptions.systemPrompt` が `strategy.ts` で定義済み、`local.ts` で SDK に渡される

## Security Considerations

- ✅ `allowedTools: ["Read", "Grep", "Glob"]` — read-only。Write/Edit/Bash を含まないため、レビューエージェントがコードベースを変更するリスクなし
- ✅ `permissionMode: "bypassPermissions"` — read-only ツールのみなので安全
- ✅ ファイル入力は `fs.readFile` + `parseRequestMdContent` でバリデーション済み
- ✅ stateless — 状態ファイルへの書き込みなし、git 操作なし
- ✅ JSON 出力は `JSON.stringify` 経由で安全にシリアライズ
- ℹ️ `filePath` はユーザー指定の positional 引数だが、`fs.readFile` が存在しないパスを拒否するため、path traversal のリスクは限定的（CLI ツールとして許容範囲）

## Verdict Rationale

HIGH severity の findings が 0 件。全 5 findings が LOW で、いずれも実装時に自然に解決可能な軽微な不一致。仕様は網羅的で、既存アーキテクチャとの整合性も高い。そのまま実装に進んで問題ない。
