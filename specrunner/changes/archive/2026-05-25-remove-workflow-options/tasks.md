# Tasks: remove-workflow-options

## Task 1: 型定義から `enabled` field を削除

- [x] `src/parser/rules/types.ts`: `ParsedRequestRaw` interface から `enabled: string[]` を削除
- [x] `src/core/request/types.ts`: `ParsedRequest` interface から `enabled: string[]` を削除
- [x] `src/prompts/spec-review-system.ts`: prompt input 型から `enabled` field を削除
- [x] `src/prompts/test-case-gen-system.ts`: `TestCaseGenMessageInput` (または相当する型) から `enabled` field を削除

## Task 2: parser から `extractEnabled` を削除

- [x] `src/parser/request-md.ts`: `extractEnabled()` 関数（line 178-249 周辺）を完全削除
- [x] `src/parser/request-md.ts`: `parseRequestMdRaw` 内の `extractEnabled` 呼び出し + `enabled` への代入を削除
- [x] `src/parser/request-md.ts`: `parseRequestMdContent` 内の `enabled: raw.enabled` 行を削除

## Task 3: step から `enabled` 渡しを削除

- [x] `src/core/step/spec-review.ts`: `buildMessage` 内の `enabled: deps.request.enabled` を削除
- [x] `src/core/step/test-case-gen.ts`: `buildMessage` 内の `enabled: deps.request.enabled` を削除

## Task 4: prompt テンプレートから `enabled` 関連ロジックを削除

- [x] `src/prompts/spec-review-system.ts`: `{{ENABLED}}` placeholder 行、`enabledStr` 計算ロジック、"Enabled options: ..." テンプレート行を削除
- [x] `src/prompts/test-case-gen-system.ts`: `mustAreasSection` 計算ロジック、`<must-areas>` テンプレート展開、prompt 本文の `<must-areas>` 説明行 (line 56-59 周辺) を削除

## Task 5: request テンプレートから `## Workflow Options` セクションを除去

- [x] `src/core/command/request.ts`: `buildScaffoldTemplate()` 内のテンプレート文字列から `## Workflow Options\n\n- enabled: []` を削除
- [x] `src/prompts/request-generate-system.ts`: 生成 prompt テンプレートから `## Workflow Options` セクション記述 (line 29-32 周辺) を削除

## Task 6: テスト更新

- [x] `tests/test-case-gen-step.test.ts`: TC-008 / TC-009 (must-areas 関連テスト) を削除
- [x] `tests/parser.test.ts`: `enabled` 抽出に関するテストケースを削除
- [x] `tests/parser.test.ts`: `## Workflow Options` セクションが存在する request.md を parse してもエラーにならない（silent ignore）テストを追加
- [x] 全 test file の `ParsedRequest` mock から `enabled: []` 行を削除（50+ ファイル）

## Task 7: typecheck & test green 確認

- [x] `bun run typecheck` pass
- [x] `bun run test` pass

## 実装順序の注意

- Task 1-5 は型安全性のため Task 1 → 2 → 3 → 4 → 5 の順で進める（型削除 → 参照削除 → テンプレート削除）
- Task 6 は Task 1-5 と並行可能だが、型変更が先に入ると mock の修正が必要になるため Task 5 の後が安全
- Task 7 は最後に実行
