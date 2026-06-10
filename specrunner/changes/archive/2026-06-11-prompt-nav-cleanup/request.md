# prompt 内の古いナビゲーション文を整理する

## Meta

- **type**: chore
- **slug**: prompt-nav-cleanup
- **base-branch**: main
- **adr**: false

## 背景

PR #309 の名残のナビゲーション文「(See Pipeline Rules section below for ...)」が judge 系 prompt に残っている（#311）。severity / verdict の定義は judge-rules.ts への集約（#586）で単一情報源化されており、散文のナビ文は重複案内になっている。

## 現状コードの前提

- 該当箇所は 2 つ: `src/prompts/code-review-system.ts:27` と `src/prompts/spec-review-system.ts:25`
- 定義の実体は PIPELINE_RULES fragment と judge-rules.ts（DECISION_NEEDED_DEFINITION / VERDICT_BLOCKING_RULES）が提供している

## 要件

1. 上記 2 箇所のナビゲーション文を削除する（参照先の定義群は注入済みのため、案内文なしで成立する）
2. 削除によって prompt の文意が壊れないこと（前後の文の接続を確認して必要最小限の調整のみ可）

## スコープ外

- prompt の構成・内容の変更（ナビ文以外）
- fragment / judge-rules の変更

## 受け入れ基準

- [ ] src/prompts/ に「(See ... below)」形式のナビ文が残っていない
- [ ] 既存の prompt テストが green（文言 assert があれば追従）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

なし（散文 2 行の削除）

---
refs #311