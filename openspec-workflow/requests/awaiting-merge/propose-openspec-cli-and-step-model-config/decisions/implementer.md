# Implementer Decisions

## 2026-05-06

- `AgentStep` interface に `maxTurns?: number` を追加する :: design D3 に従い optional フィールドとして型安全に宣言。ClaudeCodeRunner が `step.maxTurns ?? 30` でフォールバック
- `ClaudeCodeRunner` の `maxTurns: 30` ハードコードを `(ctx.step as AgentStep).maxTurns ?? 30` に変更する :: `AgentStep` 型インターフェース経由で参照し、CliStep との混同を避ける
- 各 step の model 定数を tasks.md の値通りに変更する :: D2 opusplan パターン。設計/レビューは Opus、実装/修正は Sonnet
- `PROPOSE_SYSTEM_PROMPT` を openspec CLI ワークフロー版に全面書き換え :: D1。既存の path-fence / 完了条件 / セキュリティは維持しつつ、openspec new change → status → instructions のフローを追加
- 既存 propose-system.test.ts のアサーションは維持しながら openspec CLI 追加アサーションを加える :: 既存テストが path-fence / positive framing を検証しており、これらは書き換え後も保持すべき
- code-review.test.ts の model アサーションは新 TC を追加する形で更新する :: 旧テストの `claude-sonnet-4-5` assertion を `claude-opus-4-6[1m]` に変更
- agent-runner.test.ts に TC-002/TC-003（maxTurns）を追加する :: step.maxTurns が query() に渡されることを capture params で verify
- spec-review.test.ts の model assertion を更新する :: `claude-sonnet-4-5` → `claude-opus-4-6[1m]`
