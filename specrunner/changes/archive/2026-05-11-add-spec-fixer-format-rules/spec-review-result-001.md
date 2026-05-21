# Spec Review Result: add-spec-fixer-format-rules — Iteration 1

## Verdict

- **verdict**: approved
- **iteration**: 1
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | design.md, tasks.md | design.md は「propose-system.ts のルールテキストをそのまま複製する」と明記するが、tasks.md の挿入内容は (a) RENAMED セクションのコードブロック例（propose-system.ts L102-118 相当）と (b) rule 2 の LLM 警告文「LLM は MODIFIED を「差分の説明」と解釈してシナリオを省略しやすいが、これは validation error になるため必ず含めること」を省略している。design の「そのまま複製」と tasks の実際の挿入テキストが不整合。 | 2 択: (A) design.md の「そのまま複製する」を「Self-review checklist と RENAMED 例示を除き複製する」に修正し省略を意図的と明記する、または (B) tasks.md の挿入内容に RENAMED コードブロック例と LLM 警告文を追加して propose-system.ts と一致させる。spec-fixer も LLM であり同じ省略傾向を持つため (B) を推奨。 |
| 2 | MEDIUM | completeness | change folder (specs/ 不在) | request type が `spec-change` だが delta spec が不在。既存 `specrunner/specs/spec-fixer-session/spec.md` は system prompt の内容を Requirement で定義している（「buildSpecFixerSystemPrompt は MUST 以下のキーワードを含む」）。format rules 追加はプロンプト内容の実質的変更であり、spec 上で追跡可能にすべき。ただし既存 Requirement はキーワード列挙であり format rules 追加で violation は発生しないため、spec 更新は推奨であって阻止要因ではない。 | `specs/spec-fixer-session/spec.md` に MODIFIED Requirement として「spec-fixer の system prompt は delta spec format rules を含む MUST」旨を追加するか、または design.md に「既存 spec の Requirement はキーワード列挙のみであり format rules の有無を spec 化するほどではないため delta spec は不要」と判断根拠を明記する。 |
| 3 | LOW | consistency | tasks.md | tasks.md 挿入内容の「ファイル配置」セクションで `specs/<capability-name>/spec.md` を使用するが、propose-system.ts では `${_changesDir}/<slug>/specs/<capability-name>/spec.md` とフルパスで記載。spec-fixer は既存ファイルの修正文脈で動作するため相対パスで十分という設計判断は妥当だが、design.md にその判断根拠の記載がない。 | design.md「移植しないもの」セクションに「ファイル配置のパスプレフィックスは spec-fixer が既存ファイルの修正文脈で動作するため `specs/**/*.md` の相対記述に置き換える」を追記。 |

## Summary

小規模かつ明確なスコープの変更。propose-system.ts から spec-fixer-system.ts への format rules 移植という方針は正しく、配置位置（修正手順と修正不能 findings の間）も適切。MEDIUM 2 件は (1) design↔tasks 間の「そのまま複製」宣言と実際の省略の不整合、(2) spec-change type での delta spec 不在だが、いずれも実装を阻害するレベルではない。CRITICAL/HIGH なし、実装上の曖昧性も低いため approved。
