# Spec: test-cases.md の Result YAML の所有権を test-case-gen に固定し、誤読される意味の欠落を解消する

## Requirements

### Requirement: TEST_CASES_TEMPLATE の Result ブロックコメントは所有者・書込時点・enum 意味を宣言する

`TEST_CASES_TEMPLATE`（`src/templates/step-output-templates.ts`）の Result セクション要求コメントは、
以下を MUST 明記する:

- 所有者: Result YAML は **test-case-gen** によるテストケース生成の結果記録である。
- 書込時点: 生成時に **一度だけ**書かれる確定値であり、後続ステップ（test-materialize を含む）はこれを更新しない。
- `result` の値の意味:
  - `completed` = 全 TC の設計が完了し `blocked_reasons` が空
  - `partial` = 一部 TC が設計不能で `blocked_reasons` に記録あり
  - `failed` = 生成自体が成立しなかった

Result YAML のキー集合（`result` / `total` / `automated` / `manual` / `must` / `should` / `could` /
`blocked_reasons`）は変更しない（追加・削除・rename をしない）。判定基準表（`result determination:` 等の
禁止済み文字列）は導入しない。

#### Scenario: Result ブロックコメントに所有者・書込時点・enum 意味が含まれる

**Given** `TEST_CASES_TEMPLATE` の文字列
**When** テンプレート文言テストが Result ブロックのコメントを検査する
**Then** 所有者（test-case-gen）・書込時点（生成時に一度）・`completed` / `partial` / `failed` の意味が含まれ、
既存の Result YAML キー（`result:` / `total:` / `automated:` / `manual:` / `must:` / `should:` / `could:` /
`blocked_reasons:`）は保持されている

### Requirement: test-case-gen system prompt は result の enum 意味と確定規則を宣言する

`TEST_CASE_GEN_SYSTEM_PROMPT` の出力文字列は、Result YAML の `result` について以下を MUST 明記する:

- `completed` / `partial` / `failed` の意味（Requirement 1 と同一の定義）。
- 確定規則: Result YAML は生成完了時点で確定し、後続ステップは書き換えない。

この記述は既存の 5 部構成骨格（`## Question` / `## Contract` / `## Method` / `## Evidence` /
`## Completion`）と各節の順序を変えない。

#### Scenario: test-case-gen prompt に enum 意味と確定規則が含まれる

**Given** `TEST_CASE_GEN_SYSTEM_PROMPT` の出力文字列
**When** prompt contract テストが result の enum 意味と確定規則の有無を検査する
**Then** `completed` / `partial` / `failed` の意味と「生成完了時点で確定し後続ステップは書き換えない」旨が含まれ、
5 節見出しは Question → Contract → Method → Evidence → Completion の順で保持されている

### Requirement: test-materialize system prompt は Result YAML の実装完了後非更新を宣言する

`TEST_MATERIALIZE_SYSTEM_PROMPT` の出力文字列は、test-cases.md 末尾の Result YAML について、
それが生成時の記録でありテスト実装の完了状態を反映するフィールドではないこと、
テスト実装完了後も更新しないことを MUST 明記する。この記述は既存の 5 部構成骨格と各節の順序を変えず、
`## Method` 節に新規 h2 見出しを追加しない。

#### Scenario: test-materialize prompt に Result YAML 非更新の記述が含まれる

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` の出力文字列
**When** prompt contract テストが Result YAML の非更新規律の有無を検査する
**Then** 「Result YAML は生成時の記録であり、実装完了後も更新しない」旨が含まれ、
5 節見出しは Question → Contract → Method → Evidence → Completion の順で保持され、
`## Method` 節に新規 h2 見出しは存在しない

### Requirement: TEST_CASES_TEMPLATE の docstring は machine-parse の実態に整合する

`TEST_CASES_TEMPLATE` の直前 docstring（JSDoc コメント）は、Result YAML block が machine-parsed である
という記述を MUST 含まない。docstring は実態を反映する: pipeline は Result YAML を parse せず、
test-coverage 検査（`src/core/verification/test-coverage.ts`）が machine-parse するのは
TC-NNN heading と `Priority` / `Category` フィールドである。

#### Scenario: docstring に Result YAML の machine-parsed 記述が残っていない

**Given** `src/templates/step-output-templates.ts` の source テキストから抽出した
`TEST_CASES_TEMPLATE` 直前の docstring
**When** テストが machine-parse 対象の記述を検査する
**Then** 「Result YAML block (all keys)」を machine-parsed とする記述と
「Summary section (4 items)」を machine-parsed とする記述はいずれも存在せず、
TC-NNN heading と `Priority` / `Category` を machine-parse 対象とする記述が含まれている

### Requirement: 意味の確定は schema・write-scope・coverage の挙動を変えない

本変更は template / prompt の記述規律のみを追加・修正し、Result YAML の schema（キー集合）、
write-scope 検証（`src/core/step/write-scope.ts`）の挙動、test-coverage 検査の挙動を MUST 変更しない。
既存の test-cases.md 関連テスト（テンプレート形式・coverage 検査）は無改変で green のままである。

#### Scenario: 既存テストが無改変で green

**Given** `tests/templates/step-output-templates.test.ts`・`src/core/verification` の coverage 検査テスト・
`src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`
**When** 本変更を適用したうえでそれらのテストを無改変で実行する
**Then** すべて green のままである
