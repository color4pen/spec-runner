## Requirements

### Requirement: test-cases.md の Scenario 由来 TC は GWT を再記述せず Source 参照のみとしなければならない

test-case-gen step が生成する test-cases.md において、delta spec の Scenario に由来する TC は GIVEN/WHEN/THEN を記述してはならない（MUST NOT）。各 TC は Source フィールドで対応する Scenario を参照するのみとする。behavior（GWT）の正典は delta spec の Scenario 一箇所である。

#### Scenario: Scenario 由来 TC が GWT を省略し Source 参照のみで記述される

**Given** change folder に delta spec が存在し、Scenario が定義されている
**When** test-case-gen step が test-cases.md を生成する
**Then** Scenario 由来の各 TC は Source フィールド（`specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>`）のみを持ち、GIVEN/WHEN/THEN ブロックを含まない

#### Scenario: Scenario 由来 TC に GWT が再記述されている場合は違反

**Given** change folder に delta spec が存在し、Scenario が定義されている
**When** test-case-gen step が生成した test-cases.md の Scenario 由来 TC に GIVEN/WHEN/THEN が記述されている
**Then** GWT 二重持ち禁止の規律に違反している

### Requirement: 非 Scenario 由来の補助 TC は従来通り GWT を記述しなければならない

delta spec の Scenario に対応しない補助 unit test（実装詳細テスト）は、spec に正典が存在しないため、test-cases.md に GIVEN/WHEN/THEN を記述しなければならない（MUST）。test-cases.md は Scenario 由来 TC（GWT 省略）と非 Scenario 由来 TC（GWT 保持）の混在形式となる。

#### Scenario: 非 Scenario 由来 TC が従来通り GWT を保持する

**Given** test-case-gen step が実装詳細の補助 unit test を生成する
**When** その TC に対応する delta spec の Scenario が存在しない
**Then** TC は Source に `design.md` または `tasks.md` のセクション参照を記載し、GIVEN/WHEN/THEN を記述する

### Requirement: TEST_CASES_TEMPLATE のコメントに混在形式を明記しなければならない

`TEST_CASES_TEMPLATE` の HTML コメント（FORMAT REQUIREMENTS）に、Scenario 由来 TC と非 Scenario 由来 TC の混在形式ルールを明記しなければならない（MUST）。

#### Scenario: テンプレートコメントに混在形式が記載されている

**Given** `TEST_CASES_TEMPLATE` の HTML コメントを確認する
**When** GIVEN/WHEN/THEN 構造の説明を読む
**Then** Scenario 由来 TC では GWT 省略、非 Scenario 由来 TC では GWT 必須、という混在形式のルールが明記されている

### Requirement: implementer は delta spec の Scenario から GWT を読んでテストを実装しなければならない

implementer system prompt は、Scenario 由来 TC のテスト実装時に delta spec の Scenario（test-cases.md の Source フィールドが指すパス）から GWT を読む手順を指示しなければならない（MUST）。test-cases.md に GWT が存在しなくても implementer の実装フローが破綻しないこと。

#### Scenario: implementer が Source パスから delta spec の GWT を取得してテストを書く

**Given** test-cases.md に Scenario 由来 TC が Source 参照のみで記載されている
**When** implementer がその TC を実装する
**Then** implementer は Source フィールドのパス（`specs/<capability>/spec.md`）を Read tool で開き、対応する Scenario の GWT を読んでテストコードに変換する
