# Tasks: test-cases.md GWT 二重持ち解消

## T-01: TEST_CASES_TEMPLATE を混在形式に更新

- [x] `src/templates/step-output-templates.ts` の `TEST_CASES_TEMPLATE` HTML コメントを更新
  - Scenario 由来 TC: Source 参照のみ、GWT（GIVEN/WHEN/THEN）は記述しない旨を明記
  - 非 Scenario 由来 TC: 従来通り GWT を記述する旨を明記
  - 混在形式のルールをコメント内に追加
- [x] `GIVEN/WHEN/THEN structure (required for each test case)` の記述を条件付きに変更（Scenario 由来 TC では不要、非 Scenario 由来 TC では必須）

**Acceptance Criteria**:
- TEST_CASES_TEMPLATE のコメントに混在形式（Scenario 由来=GWT 省略 / 非 Scenario 由来=GWT 保持）が明記されている
- テンプレートとして構文的に正しい（HTML コメントが閉じている等）

## T-02: test-case-gen system prompt を GWT 省略指示に更新

- [x] `src/prompts/test-case-gen-system.ts` の `TEST_CASE_GEN_BASE` を更新
  - `Test Case Format` セクション: Scenario 由来 TC では GWT を記述せず Source 参照のみとする指示を追加
  - `Test Case Format` セクション: 非 Scenario 由来 TC では従来通り GWT を記述する指示を維持
  - `Body: **GIVEN** / **WHEN** / **THEN** structure` の記述を条件付きに変更
- [x] `buildTestCaseGenInitialMessage` の手順 5 から `in GIVEN/WHEN/THEN format` を除去または条件付きに変更

**Acceptance Criteria**:
- test-case-gen agent が Scenario 由来 TC で GWT を再記述しない指示になっている
- 非 Scenario 由来 TC では従来通り GWT を記述する指示が残っている

## T-03: implementer system prompt を delta spec Scenario 参照フローに更新

- [x] `src/prompts/implementer-system.ts` の実装手順を更新
  - 手順 3 の `test-cases.md の GIVEN/WHEN/THEN をテストコードに変換する` を変更
  - Scenario 由来 TC: test-cases.md の Source パスを辿り、delta spec の Scenario から GWT を読んでテストコードに変換する
  - 非 Scenario 由来 TC: 従来通り test-cases.md の GWT をテストコードに変換する
  - test-cases.md が存在しない場合のフォールバック（tasks.md ベース TDD）は維持

**Acceptance Criteria**:
- implementer が Scenario 由来 TC の GWT を delta spec から読む手順が記載されている
- 非 Scenario 由来 TC は従来通り test-cases.md の GWT から読む手順が残っている

## T-04: delta spec 作成（test-case-generator capability）

- [x] `specrunner/changes/test-cases-reference-scenarios/specs/test-case-generator/spec.md` に delta spec を作成
  - 既存 Requirement の MODIFIED: GWT 再記述を禁止し Source 参照のみとする要件を追加
  - 混在形式の要件を追加

**Acceptance Criteria**:
- delta spec が delta spec フォーマットに準拠している
- 変更対象の Requirement が正しく記述されている

## T-05: typecheck & test green 確認

- [x] `bun run typecheck` が成功する
- [x] `bun run test` が成功する（既存テストが壊れていない）

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が exit 0
