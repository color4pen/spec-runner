# Design: prompt-nav-cleanup

## Context

`src/prompts/code-review-system.ts` と `src/prompts/spec-review-system.ts` の `## Pipeline Rules` セクション直下に、PR #309 由来のナビゲーション文が残っている。

```
(See Pipeline Rules section below for severity definitions, categories, findings format, scoring, and verdict definitions.)
```

severity / verdict の定義は `judge-rules.ts`（`DECISION_NEEDED_DEFINITION` / `VERDICT_BLOCKING_RULES`）と `fragments.ts`（`PIPELINE_RULES`）に集約済みで、`buildSystemPrompt` によってプロンプト末尾に結合される。散文のナビ文は重複案内になっている。

## Goals / Non-Goals

**Goals**:
- 上記 2 箇所のナビゲーション文を削除する

**Non-Goals**:
- prompt の構成・内容の変更（ナビ文以外）
- fragment / judge-rules の変更

## Decisions

**D1**: ナビ文の行のみを削除し、`## Pipeline Rules` セクション見出しは残す。

- Rationale: 見出しは agent がセクション境界を認識する手がかりとして機能する。PIPELINE_RULES 本体はプロンプト末尾に注入されるため、見出しがあっても内容なしで成立する。
- Alternatives: 見出しごと削除 → 不要な diff 拡大につながるため見送り。

**D2**: テスト修正は不要。

- Rationale: `fragment-coverage.test.ts` はナビ文の有無をアサートしていない。削除によって既存テストの期待値は変わらない。

## Risks / Trade-offs

なし（散文 2 行の削除であり、コンパイル・テストへの影響なし）

## Open Questions

なし
