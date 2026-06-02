## Requirements

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
