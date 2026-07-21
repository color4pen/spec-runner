# Spec: step prompt を 5 部構成骨格に再構成し evidence 規律と原因分類を共通化する

## Requirements

### Requirement: 全 agent step system prompt は 5 部構成の共通骨格に従う

`src/prompts/*-system.ts` が生成する全 agent 向け system prompt 出力文字列は、
`## Question` / `## Contract` / `## Method` / `## Evidence` / `## Completion` の
5 つの節見出しを、この順で MUST 含む。節見出しの表記は統一され、step ごとに揺れてはならない。

対象 prompt は次の 15 の system prompt 出力である:
request-review / design / spec-review / spec-fixer / test-case-gen / test-materialize /
implementer / build-fixer / code-review / code-fixer / conformance / regression-gate /
custom-reviewer / adr-gen / request-generate。

#### Scenario: 各 system prompt 出力が 5 節見出しを含む

**Given** 15 の system prompt 出力文字列（builder / factory 経由で組み立てた最終文字列）
**When** テストが各出力文字列を検査する
**Then** それぞれが `## Question` `## Contract` `## Method` `## Evidence` `## Completion` の 5 見出しを含む

### Requirement: pipeline stage の列挙は単一ソース PIPELINE_MAP から供給される

pipeline の step 構成・stage 一覧は単一の `PIPELINE_MAP` 定数を唯一のソースとして MUST 供給される。
どの system prompt 出力も、PIPELINE_MAP に由来しない独立した stage 表（手書きの「Pipeline Position」
節や `stage 1:` / `stage 2:` 形式の列挙）を含んではならない。stage 一覧を必要とする prompt は
PIPELINE_MAP を埋め込む。

#### Scenario: prompt 出力に独立した stage 表が存在しない

**Given** 全 system prompt 出力文字列
**When** テストが手書き stage 表マーカー（`Pipeline Position` および `stage 1:` `stage 2:` 等）の有無を検査する
**Then** いずれの出力にもそれらのマーカーが存在しない

#### Scenario: stage 一覧は PIPELINE_MAP を埋め込む

**Given** 従来 stage 表を持っていた prompt（design / implementer / test-materialize）と rules.ts の step 列挙
**When** テストが各出力に PIPELINE_MAP 定数の文字列が含まれるか検査する
**Then** stage 一覧を持つ出力は PIPELINE_MAP 定数を部分文字列として含む

### Requirement: EVIDENCE_DISCIPLINE は全 agent step の system prompt に埋め込まれる

全 agent step の system prompt 出力は、単一ソースの `EVIDENCE_DISCIPLINE` fragment を MUST 含む。
EVIDENCE_DISCIPLINE は少なくとも「unverified の主張を明示列挙する義務（無い場合は None と明記）」と
「空集合・全 skip の検査は合格ではなく判定不能として報告する」の 2 つの規律文言を含む。

#### Scenario: 全 agent prompt が EVIDENCE_DISCIPLINE を含む

**Given** 15 の system prompt 出力文字列
**When** テストが各出力に EVIDENCE_DISCIPLINE 定数が含まれるか検査する
**Then** すべての出力が EVIDENCE_DISCIPLINE 定数を部分文字列として含む

### Requirement: 失敗・escalation・decision-needed の報告に原因分類が要求される

全 agent step の system prompt 出力は、Completion 節に単一ソースの `CAUSE_CLASSIFICATION` fragment を
MUST 含む。CAUSE_CLASSIFICATION は `request-gap` / `derivation-gap` / `implementation-defect` /
`harness-defect` / `operational` の 5 分類を列挙する記述規律であり、typed schema を変更しない。

#### Scenario: 全 agent prompt が CAUSE_CLASSIFICATION を含む

**Given** 15 の system prompt 出力文字列
**When** テストが各出力に CAUSE_CLASSIFICATION 定数が含まれるか検査する
**Then** すべての出力が CAUSE_CLASSIFICATION 定数を部分文字列として含み、5 分類の識別子を列挙している

### Requirement: coverage gate 回避禁止は単一ソースから供給される

coverage gate 回避禁止の文言は単一ソースの `COVERAGE_GATE_INTEGRITY` fragment に集約され、
build-fixer と code-fixer の system prompt 出力は MUST 同一ソースを埋め込む。同一文言を複数箇所に
複製してはならない。

#### Scenario: build-fixer と code-fixer が同一ソースの coverage gate 規律を含む

**Given** BUILD_FIXER_SYSTEM_PROMPT と CODE_FIXER_SYSTEM_PROMPT の出力
**When** テストが両者に COVERAGE_GATE_INTEGRITY 定数が含まれるか検査する
**Then** 両出力が COVERAGE_GATE_INTEGRITY 定数を部分文字列として含む

### Requirement: CLI 組み込み prompt は repo 固有資源を名指ししない

`src/prompts/` が生成する system prompt 出力文字列は、`architecture/` ディレクトリへの参照を
MUST 含まない。構造定義の確認は可搬な表現（プロジェクトの構造定義＝型・状態機械・不変条件）で
指示する。

#### Scenario: prompt 出力に architecture/ 参照が存在しない

**Given** 全 system prompt 出力文字列
**When** テストが `architecture/` の部分文字列を検索する
**Then** いずれの出力にも `architecture/` が存在しない

### Requirement: rules.ts は現行 step 集合を反映し空節を持たない

`RULES_MD_CONTENT` は step 列挙を PIPELINE_MAP と同一ソース化し、本文が空の「共通禁止:」節を
MUST 含まない。責任範囲表は現行の step 集合を反映する。

#### Scenario: rules.ts に空の共通禁止節が存在しない

**Given** RULES_MD_CONTENT の文字列
**When** テストが本文の無い「共通禁止:」見出しの有無を検査する
**Then** 空本文の「共通禁止:」節が存在しない

#### Scenario: rules.ts の step 列挙が PIPELINE_MAP と一致する

**Given** RULES_MD_CONTENT の文字列と PIPELINE_MAP 定数
**When** テストが step 列挙の由来を検査する
**Then** rules.ts の step 列挙は PIPELINE_MAP 定数を埋め込みとして含む

### Requirement: producer / fixer / judge の Contract 節は write-set を宣言する

編集可能なパスを列挙した write-set の宣言が、全 producer / fixer step の Contract 節に MUST 存在する。
write-set の禁止範囲は本変更前と同一であり、禁止の意味を変えない（散文の圧縮のみ）。

#### Scenario: 全 producer / fixer prompt が write-set を宣言する

**Given** producer（design / test-case-gen / test-materialize / implementer / adr-gen）と
fixer（spec-fixer / code-fixer / build-fixer）の system prompt 出力
**When** テストが各出力の Contract 節に write-set 宣言が存在するか検査する
**Then** すべての出力が編集可能パスを列挙した write-set 宣言を含む

### Requirement: output template は出力の形式のみを所有する

`src/templates/step-output-templates.ts` の template 出力文字列は、severity / verdict / Category /
Priority の判定基準、Scores 表（Score / Weight）、および他 agent への行動指示を MUST 含まない。
template が持ってよいのはセクション構成・カラム・機械 parse される anchor などの形式要件のみである。
ただし evidence report の必須セクション（`## 検証した項目` / `## 検証できなかった項目` /
`## Findings 詳細`）と機械 parse 対象の anchor は保持する。

#### Scenario: result template に verdict 導出の判定基準が存在しない

**Given** REQUEST_REVIEW_RESULT_TEMPLATE / SPEC_REVIEW_RESULT_TEMPLATE / REVIEW_FEEDBACK_TEMPLATE /
CONFORMANCE_RESULT_TEMPLATE の各出力
**When** テストが verdict 導出の判定基準（severity → verdict の対応規則）の有無を検査する
**Then** いずれの template 出力にも verdict 導出の判定基準が存在せず、evidence report の必須セクションは保持されている

#### Scenario: TEST_CASES template に Category / Priority 判定基準表が存在しない

**Given** TEST_CASES_TEMPLATE の出力
**When** テストが Category / Priority / result の判定基準表の有無を検査する
**Then** 判定基準表は存在せず、Summary / Result の anchor と TC 見出し形式・必須カラム名は保持されている

#### Scenario: SPEC_EXEMPT_NOTE に下流 reviewer への行動指示が存在しない

**Given** SPEC_EXEMPT_NOTE の出力
**When** テストが下流 reviewer（spec-review / conformance）への行動指示文の有無を検査する
**Then** 行動指示文は存在せず、SPEC_EXEMPT_MARKER と人間向け説明のみが残る

### Requirement: 骨格再構成は routing / gate 挙動を変えない

本変更は system prompt / template の記述規律のみを再構成し、判定導出（judge-verdict）・
executor・output gate（output-contract）の挙動を MUST 変更しない。これらの既存テストは無改変で
green のままである。

#### Scenario: 判定導出・executor・output gate の既存テストが無改変で green

**Given** `src/core/step/__tests__/` の判定導出・executor・output gate 系テスト
（judge-verdict.test.ts / verdict-channel-unification.test.ts / executor-*.test.ts）
**When** 本変更を適用したうえでそれらのテストを無改変で実行する
**Then** すべて green のままである
