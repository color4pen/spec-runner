# Tasks: test-cases-from-spec-scenarios

## T-01: system prompt の Testable Behaviors Extraction を Scenario 起点に書き換え

- [x] `src/prompts/test-case-gen-system.ts` の `Testable Behaviors Extraction` セクションを書き換え:
  - primary source を delta spec の Scenario（`specrunner/changes/<slug>/specs/<capability>/spec.md` の `#### Scenario:` セクション）にする
  - 各 Scenario を 1 つ以上の test case にマッピングする指示を記載する
  - design.md / tasks.md は supplementary context として位置づける（実装詳細の unit test を足す用途）
- [x] delta spec 不在時（`specs/` ディレクトリが change folder に存在しない場合）は design.md / tasks.md からの抽出にフォールバックする旨を記載する

**Acceptance Criteria**:
- prompt 内に delta spec Scenario が primary input source である旨の指示がある
- prompt 内に delta spec 不在時のフォールバック指示がある
- design.md / tasks.md が supplementary context として位置づけられている

## T-02: system prompt の Coverage Requirements を Scenario 基準に変更

- [x] `src/prompts/test-case-gen-system.ts` の `Coverage Requirements` セクションを書き換え:
  - 「Every task in tasks.md must have at least one must scenario」→「Every Scenario in delta spec must have at least one test case」に変更
  - delta spec 不在時は従来通り tasks.md ベースの coverage 基準にフォールバックする旨を記載する
- [x] Priority 判定の `must` 行の説明を更新: 「Corresponds to acceptance criteria in tasks.md」→ delta spec Scenario 由来のものは must とする

**Acceptance Criteria**:
- Coverage の基準が delta spec Scenario 単位になっている
- delta spec 不在時は tasks.md ベースにフォールバックする指示がある

## T-03: system prompt の Source フィールド説明と result 判定を更新

- [x] `src/prompts/test-case-gen-system.ts` の Test Case Format セクション内の Source フィールド説明を更新:
  - `**Source**` の説明に `specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>` 形式を記載
- [x] Result determination の `failed` 条件を更新: delta spec 不在かつ design.md / tasks.md も不在の場合に `failed` とする

**Acceptance Criteria**:
- Source フィールドの説明が delta spec Scenario 参照形式を含む
- result determination が delta spec 不在時のフォールバックを考慮している

## T-04: initial message に delta spec 読み取り手順を追加

- [x] `src/prompts/test-case-gen-system.ts` の `buildTestCaseGenInitialMessage` を更新:
  - 手順リストに「Read delta spec files under `${changeFolder}/specs/` (if present) to extract Scenarios as primary test source」を追加
  - 手順の順序: request.md → delta spec → design.md → tasks.md → generate → write

**Acceptance Criteria**:
- initial message に delta spec 読み取り手順が含まれている
- delta spec が design.md / tasks.md より先に読まれる順序になっている

## T-05: TEST_CASES_TEMPLATE の Source フィールド説明を更新

- [x] `src/templates/step-output-templates.ts` の `TEST_CASES_TEMPLATE` 内の Source フィールド説明を更新:
  - `**Source**: reference to design.md or tasks.md section` → `**Source**: reference to delta spec Scenario (specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section`

**Acceptance Criteria**:
- テンプレートの Source フィールド説明が delta spec Scenario 参照を primary として記載している

## T-06: テスト更新

- [x] `tests/prompts/test-case-gen-system.test.ts` に以下のテストを追加:
  - system prompt が delta spec Scenario を primary source として言及している
  - system prompt が `specs/` パスを含んでいる
  - system prompt にフォールバック指示がある
- [x] `buildTestCaseGenInitialMessage` のテストを追加（既存テストファイルまたは新規）:
  - 生成された message に delta spec 読み取り手順が含まれている

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- delta spec Scenario 関連の prompt 内容が regression test で保護されている
