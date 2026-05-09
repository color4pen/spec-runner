# Proposal: test-case-gen prompt を openspec-workflow 相当に強化する

## Background

現在の `test-case-gen-system.ts` は GIVEN/WHEN/THEN + must/should/could の基本フォーマットのみ。
openspec-workflow の `agents/test-case-generator.md` と比較して Category, Source, Summary,
blocked_reasons, must-areas, 構造化戻り値が欠けている。

出力がコード構造検証に偏り、振る舞い検証が弱い。

## Approach

`src/prompts/test-case-gen-system.ts` の system prompt と initial message builder を拡張する。
変更対象はこのファイルのみ。step 定義 (`test-case-gen.ts`) やパイプライン遷移は変更しない。

### 具体的な追加項目

1. **Category**: 各テストケースに `unit | integration | e2e | manual` を付与
2. **Source**: `design.md` / `tasks.md` のどのセクションから導出したかを記録
3. **Summary セクション**: Total / Automated / Manual / Priority 内訳を出力冒頭に配置
4. **blocked_reasons**: 設計の曖昧さでテストケース導出不能な箇所を報告
5. **must-areas**: `request.enabled` 経由で重点領域を受け取り、該当領域を must に昇格
6. **構造化戻り値**: completed / partial / failed の判定基準を prompt に記述

### 設計判断

- **must-areas の伝達経路**: `buildTestCaseGenInitialMessage` に `enabled` パラメータを追加し、
  user message 内に `<must-areas>` セクションとして埋め込む。system prompt 側で解釈ルールを記述。
  `enabled` が空配列の場合はセクション自体を省略。

- **構造化戻り値の位置**: test-cases.md 末尾に YAML front-matter 風の `## Result` セクションを配置。
  step 側の `parseResult` は現状 `NULL_PARSE_RESULT` のままとし、prompt レベルでの自己報告に留める。
  パイプライン verdict への反映は将来課題。

- **Category 判定テーブル**: openspec-workflow と同一の基準を prompt に埋め込む。

## Scope

- **IN**: `src/prompts/test-case-gen-system.ts` (system prompt + initial message builder)
- **IN**: `tests/test-case-gen-step.test.ts` (新フォーマットの検証)
- **OUT**: `src/core/step/test-case-gen.ts` (step 定義の変更なし)
- **OUT**: model の Opus 切り替え
- **OUT**: implementer 側の test-cases.md 参照 (#155)

## Risk

- **Low**: prompt-only の変更であり、パイプライン構造やランタイム挙動に影響しない
- 生成品質は Sonnet の prompt following に依存するが、スコープ外として model 変更は行わない
