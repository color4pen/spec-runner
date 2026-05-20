# test-case-gen の prompt を openspec-workflow 相当に強化する

## Meta

- **type**: spec-change
- **slug**: test-case-gen-prompt
- **base-branch**: main

## 背景

test-case-gen の prompt が openspec-workflow の `agents/test-case-generator.md` に比べて以下が欠けている:

1. Category（unit/integration/e2e/manual）がない
2. Source 参照がない（design.md/tasks.md のどこから導出したか）
3. Summary セクションがない（Total/Automated/Manual/Priority の内訳）
4. blocked_reasons がない（設計の曖昧さの報告）
5. must-areas の受け取りがない（重点領域の指定）
6. 戻り値の構造化がない（completed/partial/failed の判定）

現状の出力はコードの構造検証に偏り、振る舞い検証が弱い。

## 要件

1. テストケースに Category（unit/integration/e2e/manual）を付与する
2. 各テストケースの Source（導出元の設計成果物の該当箇所）を記録する
3. Summary セクション（Total/Automated/Manual/Priority 内訳）を出力する
4. blocked_reasons（設計の曖昧さで導出不能なケース）を報告する
5. must-areas による重点領域指定を受け取れるようにする
6. 戻り値を completed/partial/failed で構造化する

## スコープ外

- model の Opus 切り替え（prompt 強化で不足なら別途検討）
- implementer 側の test-cases.md 参照（#155 で対応）

## 受け入れ基準

- [ ] 出力に Category, Source, Summary が含まれている
- [ ] blocked_reasons が報告される
- [ ] 振る舞い検証のテストケースが生成される
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

対象は `src/prompts/test-case-gen-system.ts` のみ。参考元は `~/Documents/GitHub/openspec-workflow/agents/test-case-generator.md`。model は Sonnet のまま。


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/test-case-gen-prompt.md` by `merged-to-archive-consolidation`.
