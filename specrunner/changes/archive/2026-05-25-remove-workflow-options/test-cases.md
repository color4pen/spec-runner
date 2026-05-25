# Test Cases: remove-workflow-options

## Overview

`## Workflow Options` / `enabled` field の完全撤廃に対するテストシナリオ。

**Coverage areas**:
- Parser: silent ignore / backward compat
- Types: `enabled` field 削除
- Templates: `request new` / `request generate`
- Prompt: spec-review / test-case-gen から `enabled` 注入除去
- Test suite: mock 掃除 / TC-008・TC-009 削除
- Delta spec: baseline を直接編集しない

---

## Test Cases

### TC-001 — Parser: `## Workflow Options` セクションを silent ignore する

- **Category**: Parser
- **Priority**: must
- **Source**: AC-3 / Task 6

**GIVEN** `## Workflow Options\n\n- enabled: []` セクションを含む request.md  
**WHEN** `parseRequestMd()` でパースする  
**THEN** エラーが throw されない / `ParsedRequest` に `enabled` field が存在しない / 他の field (slug, type 等) は正常に返る

---

### TC-002 — Parser: `enabled` に値がある旧 archive request.md を silent ignore する

- **Category**: Parser
- **Priority**: must
- **Source**: AC-3 / 背景（過去 1 件の使用例）

**GIVEN** `- enabled: [test-case-generator]` を含む request.md（旧 archive 相当）  
**WHEN** `parseRequestMd()` でパースする  
**THEN** エラーが throw されない / `ParsedRequest` に `enabled` field が存在しない / 他の field は正常に返る

---

### TC-003 — Parser: `## Workflow Options` が存在しない request.md を正常パースする

- **Category**: Parser
- **Priority**: must
- **Source**: Task 6（regression guard）

**GIVEN** `## Workflow Options` セクションを持たない標準的な request.md  
**WHEN** `parseRequestMd()` でパースする  
**THEN** エラーが throw されない / 全 field が正常に返る

---

### TC-004 — Parser: `extractEnabled` 関数が削除されている

- **Category**: Parser / Code
- **Priority**: must
- **Source**: Task 2

**GIVEN** `src/parser/request-md.ts`  
**WHEN** ファイル内容を確認する  
**THEN** `extractEnabled` という関数・呼び出し・代入が一切存在しない

---

### TC-005 — Types: `ParsedRequestRaw` に `enabled` field が存在しない

- **Category**: Types
- **Priority**: must
- **Source**: AC-4 / Task 1

**GIVEN** `src/parser/rules/types.ts` の `ParsedRequestRaw` interface  
**WHEN** 型定義を確認する  
**THEN** `enabled` field が宣言されていない

---

### TC-006 — Types: `ParsedRequest` に `enabled` field が存在しない

- **Category**: Types
- **Priority**: must
- **Source**: AC-4 / Task 1

**GIVEN** `src/core/request/types.ts` の `ParsedRequest` interface  
**WHEN** 型定義を確認する  
**THEN** `enabled` field が宣言されていない

---

### TC-007 — Types: `SpecReviewPromptInput` に `enabled` field が存在しない

- **Category**: Types
- **Priority**: must
- **Source**: AC-4 / Task 1

**GIVEN** `src/prompts/spec-review-system.ts` の prompt input 型  
**WHEN** 型定義を確認する  
**THEN** `enabled` field が宣言されていない

---

### TC-008 — Types: `TestCaseGenPromptInput`（相当型）に `enabled` field が存在しない

- **Category**: Types
- **Priority**: must
- **Source**: AC-4 / Task 1

**GIVEN** `src/prompts/test-case-gen-system.ts` の prompt input 型  
**WHEN** 型定義を確認する  
**THEN** `enabled` field が宣言されていない

---

### TC-009 — Template: `request new <slug>` scaffold に `## Workflow Options` が含まれない

- **Category**: Template
- **Priority**: must
- **Source**: AC-1 / Task 5

**GIVEN** `src/core/command/request.ts` の `buildScaffoldTemplate()` 関数  
**WHEN** 生成される文字列を確認する  
**THEN** `## Workflow Options` が含まれない / `enabled: []` が含まれない

---

### TC-010 — Template: `request generate "<text>"` 生成 prompt に `## Workflow Options` が含まれない

- **Category**: Template
- **Priority**: must
- **Source**: AC-2 / Task 5

**GIVEN** `src/prompts/request-generate-system.ts` の生成 prompt テンプレート  
**WHEN** テンプレート文字列を確認する  
**THEN** `## Workflow Options` セクション記述が含まれない

---

### TC-011 — Spec-Review Prompt: `{{ENABLED}}` placeholder が削除されている

- **Category**: Spec-Review Prompt
- **Priority**: must
- **Source**: AC-5 / Task 4

**GIVEN** `src/prompts/spec-review-system.ts`  
**WHEN** ファイル内容を確認する  
**THEN** `{{ENABLED}}` 文字列が存在しない / `enabledStr` 変数が存在しない / `Enabled options:` 行が存在しない

---

### TC-012 — Spec-Review Step: `enabled` を buildMessage に渡していない

- **Category**: Spec-Review Step
- **Priority**: must
- **Source**: Task 3

**GIVEN** `src/core/step/spec-review.ts` の `buildMessage` 呼び出し箇所  
**WHEN** ファイル内容を確認する  
**THEN** `enabled: deps.request.enabled` という行が存在しない

---

### TC-013 — Test-Case-Gen Prompt: `<must-areas>` セクションが削除されている

- **Category**: Test-Case-Gen Prompt
- **Priority**: must
- **Source**: AC-6 / Task 4

**GIVEN** `src/prompts/test-case-gen-system.ts`  
**WHEN** ファイル内容を確認する  
**THEN** `<must-areas>` タグが存在しない / `mustAreasSection` 変数が存在しない / must-areas の説明行（line 56-59 相当）が存在しない

---

### TC-014 — Test-Case-Gen Step: `enabled` を buildMessage に渡していない

- **Category**: Test-Case-Gen Step
- **Priority**: must
- **Source**: Task 3

**GIVEN** `src/core/step/test-case-gen.ts` の `buildMessage` 呼び出し箇所  
**WHEN** ファイル内容を確認する  
**THEN** `enabled: deps.request.enabled` という行が存在しない

---

### TC-015 — Test Suite: TC-008 / TC-009 が削除されている

- **Category**: Test Suite
- **Priority**: must
- **Source**: AC-7 / Task 6

**GIVEN** `tests/test-case-gen-step.test.ts`  
**WHEN** ファイル内容を確認する  
**THEN** `TC-008` / `TC-009` または `must-areas` に関するテストケースが存在しない

---

### TC-016 — Test Suite: parser の `enabled` 抽出テストが削除されている

- **Category**: Test Suite
- **Priority**: must
- **Source**: AC-9 / Task 6

**GIVEN** `tests/parser.test.ts`  
**WHEN** ファイル内容を確認する  
**THEN** `extractEnabled` や `enabled` 抽出を対象にしたテストケースが存在しない

---

### TC-017 — Test Suite: parser の `## Workflow Options` silent ignore テストが追加されている

- **Category**: Test Suite
- **Priority**: must
- **Source**: AC-9 / Task 6

**GIVEN** `tests/parser.test.ts`  
**WHEN** ファイル内容を確認する  
**THEN** `## Workflow Options` セクションを含む request.md を parse して error にならないことを検証するテストケースが存在する

---

### TC-018 — Test Suite: `ParsedRequest` mock に `enabled: []` が残っていない

- **Category**: Test Suite
- **Priority**: must
- **Source**: AC-10 / Task 6

**GIVEN** `tests/error-codes.test.ts` / `tests/pipeline-integration.test.ts` / `tests/cli-stdout-snapshot.test.ts` / `tests/multi-layer-defense.test.ts` 等の全 test file  
**WHEN** `ParsedRequest` mock オブジェクトを確認する  
**THEN** `enabled: []` または `enabled:` を含む行が存在しない

---

### TC-019 — Build: `bun run typecheck` が green

- **Category**: Build
- **Priority**: must
- **Source**: AC-8 / Task 7

**GIVEN** Task 1-6 が完了した状態のコードベース  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

### TC-020 — Build: `bun run test` が green

- **Category**: Build
- **Priority**: must
- **Source**: AC-8 / Task 7

**GIVEN** Task 1-6 が完了した状態のコードベース  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、failed / skipped が 0 件

---

### TC-021 — Delta Spec: `request-md-parser` delta spec で `enabled` field が除去されている

- **Category**: Delta Spec
- **Priority**: must
- **Source**: AC-11 / 要件 4

**GIVEN** `specrunner/changes/remove-workflow-options/specs/request-md-parser/spec.md`  
**WHEN** ファイル内容を確認する  
**THEN** `ParsedRequest` shape 記述から `enabled` field の REMOVED または MODIFIED 操作が表現されている

---

### TC-022 — Delta Spec: `request-management` delta spec で `enabled` 関連 Requirement が除去されている

- **Category**: Delta Spec
- **Priority**: must
- **Source**: AC-11 / 要件 4

**GIVEN** `specrunner/changes/remove-workflow-options/specs/request-management/spec.md`  
**WHEN** ファイル内容を確認する  
**THEN** `enabled` 関連 Requirement（3 件）の REMOVED 操作が表現されている

---

### TC-023 — Delta Spec: `database` delta spec で `enabled` column 記述が除去されている

- **Category**: Delta Spec
- **Priority**: must
- **Source**: AC-11 / 要件 4

**GIVEN** `specrunner/changes/remove-workflow-options/specs/database/spec.md`  
**WHEN** ファイル内容を確認する  
**THEN** `requests` テーブルの `enabled` column 記述の MODIFIED/REMOVED 操作が表現されている

---

### TC-024 — Delta Spec: baseline spec（`specrunner/specs/`）が直接編集されていない

- **Category**: Delta Spec
- **Priority**: must
- **Source**: 要件 4 MUST NOT

**GIVEN** `specrunner/specs/request-md-parser/spec.md` / `specrunner/specs/request-management/spec.md` / `specrunner/specs/database/spec.md`  
**WHEN** git diff で変更内容を確認する  
**THEN** baseline spec ファイルへの直接編集が存在しない（delta spec path 経由のみ）

---

### TC-025 — Codebase: `enabled` の残存がない（grep チェック）

- **Category**: Code
- **Priority**: should
- **Source**: AC-11

**GIVEN** `specrunner/specs/{request-md-parser,request-management,database}/` 配下の spec ファイル  
**WHEN** `grep enabled` を実行する  
**THEN** `ParsedRequest` shape / `requests` テーブル / Scenario の `enabled` 言及が 0 件

---

### TC-026 — Parser: `## Workflow Options` が存在しても他セクションのパース結果に影響しない

- **Category**: Parser
- **Priority**: should
- **Source**: Task 6（regression guard）

**GIVEN** `## Meta` + `## Background` + `## Workflow Options\n\n- enabled: [foo]` + `## Requirements` を含む request.md  
**WHEN** `parseRequestMd()` でパースする  
**THEN** slug / type / requirements など `## Workflow Options` 以外の全 field が期待値と一致する

---

### TC-027 — Template: `request generate` 出力が `## Workflow Options` を含まない（E2E 相当）

- **Category**: Template
- **Priority**: should
- **Source**: AC-2

**GIVEN** `specrunner request generate "テスト用の変更"` を実行できる環境  
**WHEN** コマンドを実行して生成された request.md を確認する  
**THEN** `## Workflow Options` セクションが存在しない

---

### TC-028 — Spec-Review Step: `enabled` 渡し削除後も spec-review が正常に動作する

- **Category**: Spec-Review Step
- **Priority**: should
- **Source**: design.md（影響範囲）

**GIVEN** `enabled` field を持たない `ParsedRequest` / `SpecReviewPromptInput`  
**WHEN** `runSpecReview()` を呼び出す  
**THEN** エラーが発生しない / prompt が生成される

---

### TC-029 — Test-Case-Gen Step: `enabled` 渡し削除後も test-case-gen が正常に動作する

- **Category**: Test-Case-Gen Step
- **Priority**: should
- **Source**: design.md（影響範囲）

**GIVEN** `enabled` field を持たない `ParsedRequest` / `TestCaseGenPromptInput`  
**WHEN** `runTestCaseGen()` を呼び出す  
**THEN** エラーが発生しない / prompt が生成される / `<must-areas>` タグが prompt に含まれない
