# ADR-20260509: SDK query() によるプロジェクト rules 自動継承

## Status

Accepted (2026-05-09)

## Context

openspec-workflow では各ステップ（implementer, code-reviewer 等）を Claude Code の Agent ツール（subagent）経由で起動していた。しかし Agent ツールの subagent は親セッションの `.claude/rules/` を継承しない（CLAUDE.md も UI 経由では継承されない。GitHub issue #49106）。

これにより、プロジェクト固有のコーディング規約・禁止パターン・アーキテクチャ前提などを rules に蒸留しても、実際にコードを書く implementer や品質を検証する code-reviewer には適用されないという構造的欠陥があった。回避策は subagent のプロンプトに rules の内容を手動で転記するしかなく、保守性が低かった。

## Decision

spec-runner は各パイプラインステップを Claude Code SDK の `query()` で実行する。`query()` は独立したフルセッションを起動するため、`cwd` 配下の CLAUDE.md および `.claude/rules/*.md` がセッション初期化時に自動ロードされる。

この設計は「LLM session に state を持たせない」という spec-runner の設計原理（ADR-20260427-cli-first-architecture）の帰結として自然に成立したものであり、rules 継承問題を意図的に解決したわけではない。しかし結果として、openspec-workflow の構造的欠陥をアーキテクチャ上完全に回避している。

### 注入経路の整理

| 経路 | 内容 | 注入方法 | 対象 |
|------|------|----------|------|
| CLAUDE.md / `.claude/rules/` | プロジェクト固有の静的規約 | SDK `query()` のセッション初期化で自動ロード | 全ステップ |
| DynamicContext | ランタイム情報（git log, diff stat, specs一覧） | アプリ側で収集し `buildMessage()` でプロンプトに展開 | propose, implementer, code-review |
| システムプロンプト | ステップ固有の指示 | アプリ側で構築（`*-system.ts`） | 各ステップ |

rules は静的な規約層、DynamicContext はランタイム情報層であり、それぞれ独立した経路で注入される。

## Consequences

- プロジェクトの `.claude/rules/` に蒸留したパターンが、パイプラインの全ステップで自動的に適用される
- openspec-workflow のように subagent プロンプトへの手動転記が不要
- `query()` → Agent ツールへの実装変更は rules 継承を破壊するため、禁止事項として扱う
- DynamicContext にユーザー定義コンテキスト（プロジェクト前提プロンプト等）を追加する場合は、rules との責務重複に注意が必要（rules = 静的規約、DynamicContext = 動的 / リクエスト固有情報）
