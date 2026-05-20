# propose agent に openspec validate ルールを注入する

## Meta

- **type**: bug-fix
- **slug**: propose-validate-rules
- **base-branch**: main

## 背景

`specrunner finish` の Phase 0 で `openspec validate --strict` が delta spec を弾くケースが複数発生している（PR #145, #147）。propose agent の system prompt に openspec validate のルールが含まれていないため、agent は delta spec の書式を知らないまま生成している。

発生パターン:
1. requirement 本文に英語の `SHALL` または `MUST` が含まれていないと validation error
2. requirement ヘッダーと `#### Scenario:` の間にコードブロックがあるとシナリオ紐付け失敗

## 要件

1. propose の system prompt に openspec validate の必須ルールを追加する
   - requirement 本文に英語の `SHALL` または `MUST` を含めること
   - requirement ヘッダーと `#### Scenario:` の間にコードブロックを挟まないこと
   - 各 requirement に最低 1 つの `#### Scenario:` ブロックが必要であること
2. 既存の prompt 構造を壊さない（追記のみ）

## スコープ外

- openspec validate 自体の修正
- spec-fixer による自動修正

## 受け入れ基準

- [ ] propose agent の system prompt に openspec validate ルールが記載されている
- [ ] 生成される delta spec が `openspec validate --strict` を通過する
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

対象は `src/prompts/propose-system.ts` のみ。prompt 末尾にルールセクションを追記する。
