# spec-fixer prompt に delta spec フォーマット規約を直接注入する

## Meta

- **type**: bug-fix
- **slug**: spec-fixer-delta-format-injection
- **base-branch**: main
- **adr**: false

## 背景

`observation-auto-fix` の finish 時に spec-merge escalation が発生。spec-fixer が `## Removed` セクションをブロック形式で出力したが、spec-merge は `- "name"` のリスト形式を期待しており parse に失敗した。

現状の `src/prompts/spec-fixer-system.ts` の `## Delta Spec Format Rules` セクションは「詳細ルールは rules.md 参照」の一文のみで、具体的なフォーマット規約を含んでいない。agent が rules.md を読む保証はなく、読んでも該当セクションを正確に解釈する保証もない。

一方 `specrunner/changes/<slug>/rules.md` には正確な delta spec 記法が記載されている（`## Removed` = `- "name"` リスト形式、`## Requirements` の `### Requirement:` / `#### Scenario:` 構造等）。

## 要件

### 1. spec-fixer prompt に delta spec の critical なフォーマット規約を inline で記載する

`src/prompts/spec-fixer-system.ts` の `## Delta Spec Format Rules` セクションに、spec-merge が parse 時に依存するフォーマット規約を直接記載する:

- `## Removed` は `- "requirement name"` のリスト形式
- `## Renamed` は `- "old name" → "new name"` のリスト形式
- `### Requirement:` header は baseline と完全一致（MODIFIED 時）
- 各 Requirement は最低 1 つの `#### Scenario:` を含む
- Requirement 本文に `SHALL` または `MUST` を含む

「rules.md を読め」の指示は残す。inline 規約は spec-merge が parse 失敗する critical な項目に限定し、rules.md と二重管理にならない粒度にする。

### 2. code-fixer にも同様の delta spec format rules を注入する

`src/prompts/code-fixer-system.ts` も delta spec を修正する可能性がある（code-review findings で spec 修正を求められた場合）。spec-fixer と同じ inline 規約を注入する。

## スコープ外

- **rules.md の内容変更** — rules.md 自体は正しい、prompt 側の問題
- **spec-merge の parse を緩くする** — format は厳密であるべき、agent 側を正す
- **request constraints injection (#409) パターンの流用** — spec-fixer/code-fixer は request.md を読まない、prompt 直接記載で十分
- **共通 prompt fragment (#334) との統合** — #334 は別スコープ、本 fix は先行して入れる

## 受け入れ基準

- [ ] spec-fixer prompt に `## Removed` / `## Renamed` のフォーマット規約が inline で記載されている
- [ ] code-fixer prompt にも同様の規約が記載されている
- [ ] code-fixer の禁止事項「仕様変更（spec ファイルの変更）」が authority spec（`specrunner/specs/`）に限定される旨が明確化されている（delta spec = `specrunner/changes/<slug>/specs/` は修正対象）
- [ ] 既存の「rules.md を読め」指示が維持されている
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **prompt 直接記載**: rules.md 参照だけでは agent が読む保証がない。critical な規約は prompt に inline で書き、rules.md は補足として残す
- **spec-fixer + code-fixer の両方**: delta spec を修正しうる agent は両方。片方だけだと同じ事故が再発する
