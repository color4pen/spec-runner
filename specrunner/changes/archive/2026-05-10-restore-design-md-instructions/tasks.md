# Tasks: restore-design-md-instructions

## T-01: design.md ガイドラインの置換

`src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` 内、`### design.md` セクション（現在 lines 60-65）を request.md 記載の新テキストに置換する。

- [x] 現在の 4 行箇条書き（lines 60-65）を以下に置換:

```
### design.md

以下のいずれかに該当する場合のみ作成:
- 複数モジュールにまたがる変更 / 新しいアーキテクチャパターン
- 新しい外部依存 / 重要なデータモデル変更
- セキュリティ・パフォーマンス・マイグレーションの複雑性
- コーディング前に技術判断を明確化する価値がある曖昧さ

セクション構成:
- **Context**: 背景、現状、制約
- **Goals / Non-Goals**: 達成すること・明示的に除外すること
- **Decisions**: 技術判断を D1, D2, ... で番号付け。各 Decision に「なぜ X であり Y でないか」と Alternatives considered を併記
- **Risks / Trade-offs**: 既知の制約、失敗シナリオ。[Risk] → Mitigation 形式
- **Migration Plan**: デプロイ手順、ロールバック戦略（該当する場合）
- **Open Questions**: 未解決の判断・不明点

実装コードは含めない。アーキテクチャとアプローチに集中する。
```

**受け入れ基準:**
- propose prompt の design.md ガイドラインに 6 セクション構成が明示されている
- 「Alternatives considered」の指示が含まれている
- 「When to include」の条件が含まれている
- `bun run typecheck && bun run test` が green
