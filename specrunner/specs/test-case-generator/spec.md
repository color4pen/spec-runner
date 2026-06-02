## Purpose

TBD
## Requirements

### Requirement: test category は unit / integration / manual の 3 種のみ

test-case-gen step が生成する test-cases.md の Category フィールドは `unit` / `integration` / `manual` の 3 種のみを許容する。`e2e` は category として生成してはならない。

Summary セクションの Automated 集計は `unit` + `integration` の合計とし、`e2e` を含めない。

#### Scenario: test-case-gen が e2e を category として出力 → 違反

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** いずれかの test case の Category に `e2e` が指定されている
- **THEN** prompt の category 体系に違反している

#### Scenario: test-case-gen が unit / integration / manual のみを出力 → 準拠

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** 全ての test case の Category が `unit` / `integration` / `manual` のいずれかである
- **THEN** prompt の category 体系に準拠している

### Requirement: LLM 呼び出し / 実 API / 実 GitHub repo 依存の scenario は vitest test として表現しない

LLM 呼び出し、実外部 API 呼び出し、実 GitHub repository に依存する scenario は vitest test case として表現してはならない。これらの scenario は dogfood run (実 `specrunner run` 実行) で検証する。

LLM を mock して vitest 内で動かす形式は integration test と等価であり、e2e の追加価値を持たない。

#### Scenario: LLM mock を前提とする scenario を vitest test case として列挙 → 違反

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** LLM 呼び出しを mock して vitest 内で実行する scenario が Category `unit` または `integration` として列挙されている
- **AND** その scenario の本来の目的が「LLM 経路を含む end-to-end の動作確認」である
- **THEN** prompt の LLM 経路規律に違反している (= dogfood で verify すべき)

#### Scenario: LLM 非依存の unit / integration test → 準拠

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** test case が純粋なロジック・バリデーション・モジュール間結合のみを検証する
- **AND** LLM 呼び出し / 実 API / 実 GitHub repo に依存しない
- **THEN** vitest test case として表現することは準拠している

### Requirement: TC ID は downstream (implementer / verification) で grep 参照されるため一意かつ安定的に grep 可能であること

test-case-gen step が生成する TC ID は `TC-{NNN}` フラット型を正規形式とする。各 TC ID は test-cases.md 内で一意でなければならない。TC ID は implementer が test 関数名 / comment に記載し、verification step の test-coverage phase が `tests/` 配下を grep して存在を検証する。

TC ID に使用する文字列は、test code 内の他の文字列と偶然一致しにくい形式であること（3 桁以上のゼロ埋め数字を推奨）。

#### Scenario: TC ID がフラット型で一意

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** 全 TC ID が `TC-{NNN}` 形式で、かつ重複がない
- **THEN** downstream の grep 検証が正しく機能する

#### Scenario: TC ID が重複している

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** 2 つの test case に同一の TC ID が割り当てられている
- **THEN** downstream の grep 検証で誤判定が発生するため、TC ID の重複は prompt の規律に違反している

### Requirement: test-case-gen は delta spec の Scenario を acceptance test の source として test-cases.md を生成する

test-case-gen step は delta spec（`specrunner/changes/<slug>/specs/<capability>/spec.md`）の各 Requirement の Scenario を読み取り、各 Scenario に対応する 1 つ以上の test case を `test-cases.md` に生成しなければならない（MUST）。

test-cases.md の各 acceptance test case の **Source** フィールは delta spec の Scenario を指す参照でなければならない（MUST）。

#### Scenario: delta spec に 2 つの Scenario がある change で test-cases.md を生成

**Given** change folder に delta spec が存在し、2 つの Requirement に各 1 つの Scenario がある
**When** test-case-gen step が test-cases.md を生成する
**Then** test-cases.md には少なくとも 2 つの test case が含まれ、各 test case の Source が対応する Scenario を参照している

#### Scenario: delta spec が存在しない change

**Given** change folder に delta spec（`specs/` ディレクトリ）が存在しない
**When** test-case-gen step が test-cases.md を生成する
**Then** design.md / tasks.md からの test case 生成にフォールバックする（後方互換）

### Requirement: test-cases.md の Source フィールドは delta spec の Scenario を参照する形式でなければならない

test-cases.md テンプレートの **Source** フィールドは、delta spec 由来の test case では `specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>` の形式で Scenario への参照を記載しなければならない（MUST）。

#### Scenario: Source フィールドが Scenario を参照している

**Given** test-case-gen が delta spec の Scenario から test case を生成した
**When** 生成された test-cases.md を確認する
**Then** Source フィールドが `specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>` 形式で Scenario を参照している

### Requirement: system prompt は delta spec の Scenario を primary input source として指示しなければならない

test-case-gen の system prompt（`TEST_CASE_GEN_BASE`）は、testable behaviors の抽出元として delta spec の Scenario を primary に指示しなければならない（MUST）。design.md / tasks.md は supplementary context として位置づける。

#### Scenario: system prompt が delta spec Scenario を primary source として指示する

**Given** test-case-gen の system prompt を確認する
**When** Testable Behaviors Extraction セクションを読む
**Then** delta spec の Scenario が primary input source として記述されており、design.md / tasks.md は補助文脈として位置づけられている

### Requirement: initial message は delta spec の読み取り手順を含まなければならない

test-case-gen の initial user message（`buildTestCaseGenInitialMessage`）は、agent に delta spec ファイルの読み取りを指示する手順を含まなければならない（MUST）。

#### Scenario: initial message が delta spec 読み取りを指示する

**Given** test-case-gen step が起動される
**When** buildTestCaseGenInitialMessage が initial message を生成する
**Then** message に `specs/` 配下の delta spec ファイルを読み取る手順が含まれている

### Requirement: test-cases.md テンプレートの Source フィールド説明は delta spec Scenario 参照を示さなければならない

`TEST_CASES_TEMPLATE` の Source フィールド説明を、`reference to design.md or tasks.md section` から delta spec Scenario 参照に更新しなければならない（MUST）。

#### Scenario: テンプレートの Source フィールド説明が更新されている

**Given** test-cases.md テンプレート（`TEST_CASES_TEMPLATE`）を確認する
**When** Source フィールドの説明を読む
**Then** delta spec の Scenario への参照形式が記述されている

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
