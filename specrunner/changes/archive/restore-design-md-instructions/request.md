# propose prompt の design.md 生成指示を復元する

## Meta

- **type**: bug-fix
- **slug**: restore-design-md-instructions
- **base-branch**: main

## 背景

PR #190（remove-openspec-cli-dependency）で propose prompt から openspec CLI ワークフローを除去した際、openspec の `instructions design` が返していた design.md の構造指示が 4 行の箇条書きに圧縮されてしまった。

openspec CLI が提供していた design.md の instructions:
- 6 セクション構成（Context / Goals・Non-Goals / Decisions / Risks・Trade-offs / Migration Plan / Open Questions）
- 各セクションの記述ガイドライン（「Include alternatives considered for each decision」等）
- 「When to include design.md」の条件（cross-cutting change, new dependency 等）
- markdown テンプレート骨格

現在の propose prompt の design.md ガイドライン:
```
### design.md

- 技術設計の核心（なぜこのアプローチか）を明記する
- 実装判断（Design D1, D2, ...）を番号付きで記録する
- 外部依存・制約・リスクを明示する
- 実装コードを含めない（設計のみ）
```

architect 評価で HIGH findings 2 件:
1. 6 セクション構成の指示消失 — design.md の構造が不安定になり spec-review の入力品質が劣化する
2. 「Alternatives considered」の指示消失 — spec-review が Decisions の代替案を検証していた実績があり、入力が保証されなくなる

## 要件

`src/prompts/propose-system.ts` の design.md ガイドラインセクションを以下に置き換える:

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

## スコープ外

- design.md 以外の artifact ガイドライン変更
- テンプレート骨格の別ファイル分離（現時点では不要）

## 受け入れ基準

- [ ] propose prompt の design.md ガイドラインに 6 セクション構成が明示されている
- [ ] 「Alternatives considered」の指示が含まれている
- [ ] 「When to include」の条件が含まれている
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
