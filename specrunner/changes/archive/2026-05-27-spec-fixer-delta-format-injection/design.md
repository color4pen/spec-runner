# Design: spec-fixer-delta-format-injection

## 問題

spec-fixer が `## Removed` セクションをブロック形式で出力 → spec-merge が `- "name"` リスト形式を期待 → parse 失敗で escalation。

原因: `spec-fixer-system.ts` の `## Delta Spec Format Rules` セクションが「rules.md 参照」の一文のみで、具体的なフォーマット規約を含まない。agent が rules.md を読む保証がなく、読んでも正確に解釈する保証もない。

## 方針

spec-merge が parse 時に依存する critical なフォーマット規約を、spec-fixer と code-fixer の system prompt に **inline で直接記載** する。

- `design-system.ts` が既に Self-review checklist パターンで delta spec format rules を inline 記載している（参考パターン）
- spec-fixer / code-fixer にも同等の inline 規約を注入する
- 既存の「rules.md を読め」指示は維持する（inline は critical 項目のみ、rules.md は補足）

## 変更対象

### 1. `src/prompts/spec-fixer-system.ts`

現状の `## Delta Spec Format Rules` セクション（L36-38）を拡張し、以下の critical 規約を inline で追記する:

```
## Delta Spec Format Rules

delta spec ファイル（`specs/**/*.md`）を修正する際、以下のフォーマット規約に **必ず** 従うこと。
（詳細ルールは `specrunner/changes/<slug>/rules.md` の「delta spec 記法」セクション参照）

- `## Removed` は `- "requirement name"` のリスト形式で書くこと（ブロック形式・散文形式は禁止）
- `## Renamed` は `- "old name" → "new name"` のリスト形式で書くこと
- `### Requirement:` header は baseline と完全一致させること（MODIFIED 時）
- 各 Requirement は最低 1 つの `#### Scenario:` を含むこと
- Requirement 本文に英語の `SHALL` または `MUST` を含めること
```

### 2. `src/prompts/code-fixer-system.ts`

#### 2a. 禁止事項の明確化

現状の `- 仕様変更（spec ファイルの変更）` を以下に修正:

```
- authority spec（`specrunner/specs/` 配下）の変更
```

これにより delta spec（`specrunner/changes/<slug>/specs/`）は code-fixer の修正対象であることが明確になる。

#### 2b. Delta Spec Format Rules セクションの追加

修正手順の後（セキュリティセクションの前）に、spec-fixer と同等の inline 規約セクションを追加する:

```
## Delta Spec Format Rules

review-feedback の指摘で delta spec ファイル（`specrunner/changes/<slug>/specs/**/*.md`）を修正する場合、
以下のフォーマット規約に **必ず** 従うこと。
（詳細ルールは `specrunner/changes/<slug>/rules.md` の「delta spec 記法」セクション参照）

- `## Removed` は `- "requirement name"` のリスト形式で書くこと（ブロック形式・散文形式は禁止）
- `## Renamed` は `- "old name" → "new name"` のリスト形式で書くこと
- `### Requirement:` header は baseline と完全一致させること（MODIFIED 時）
- 各 Requirement は最低 1 つの `#### Scenario:` を含むこと
- Requirement 本文に英語の `SHALL` または `MUST` を含めること
```

## 設計判断

| 判断 | 理由 |
|------|------|
| inline は spec-merge parse 依存の 5 項目に限定 | rules.md との二重管理を最小化。design-system.ts の self-review checklist（7 項目）より絞り込み |
| rules.md 参照は残す | inline は critical 項目のみ。path 規約等の詳細は rules.md に委ねる |
| code-fixer の禁止事項を authority spec に限定 | delta spec は code-fixer の修正対象。blanket prohibition だと修正を拒否する事故が起きる |
| delta spec は不要 | 既存の spec-fixer-session spec は prompt キーワードの存在を検証するが、delta spec format rules の具体的内容は制約していない。prompt テキストの改善であり仕様変更ではない |

## テスト影響

- `tests/prompts/spec-fixer-system.test.ts` — 既存テストは「spec-fixer」「修正」「findings」「end_turn」等のキーワード存在確認のみ。内容追加で壊れない
- `tests/unit/prompts/fragment-coverage.test.ts` — fragment 構成は変更なし（COMMIT_DISCIPLINE のまま）。壊れない
- `tests/unit/step/code-fixer.test.ts` — prompt 内容のテストがあれば確認が必要
