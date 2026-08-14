# Spec: conformance の正典の二層化

## Requirements

### Requirement: conformance prompt は request/spec を規範、design/tasks を計画として二層宣言する

conformance の system prompt (`CONFORMANCE_SYSTEM_PROMPT`) は、request.md / spec.md を
**規範 (normative)** — 守るべき意図・受け入れ基準・振る舞い、逸脱は finding — として、
design.md / tasks.md を **計画・根拠 (plan / rationale)** — 実装到達の文脈、実装がそれらと
異なること自体は finding にしない — として区別する宣言を含んでいなければならない (MUST)。

#### Scenario: prompt が二層宣言の anchor 文字列を含む

**Given** ビルド済みの `CONFORMANCE_SYSTEM_PROMPT` 文字列
**When** その内容を検査する
**Then** `規範（normative）` と `計画・根拠（plan / rationale）` の両 anchor を含み、かつ
request.md / spec.md / design.md / tasks.md の 4 成果物名をすべて参照している

### Requirement: design/tasks との相違はそれ自体では finding にせず、finding の根拠は request/spec を引く

conformance prompt は、design decision の不反映・tasks との相違・checkbox 未完了を検出しても
それ自体では finding にしないこと、finding は「その相違によって request/spec の意図・受け入れ
基準・振る舞いが破られる場合」に限ることを指示していなければならない (MUST)。finding の根拠は
design/tasks ではなく request.md / spec.md の該当箇所を引くこと、規範を破らない相違は
non-blocking note として evidence 報告本文に記録することも指示していなければならない (SHALL)。

#### Scenario: prompt が非 finding 化と根拠引用の指示 anchor を含む

**Given** ビルド済みの `CONFORMANCE_SYSTEM_PROMPT` 文字列
**When** その内容を検査する
**Then** `それ自体では finding にしない`、`finding の根拠には request.md / spec.md`、
`non-blocking note` の 3 anchor をすべて含む

### Requirement: 受け入れ基準と Requirement/Scenario の全件充足確認を維持する

conformance prompt は、request.md の受け入れ基準の達成を全件確認し、spec.md の全 Requirement
(SHALL/MUST) と全 Scenario の充足を全件確認する指示 (完了性 = 意図の充足の確認) を維持して
いなければならない (MUST)。緩和されるのは「計画との一致」の強制のみであり、完了性確認は緩めない。

#### Scenario: prompt が全件確認の指示を保持する

**Given** ビルド済みの `CONFORMANCE_SYSTEM_PROMPT` 文字列
**When** その内容を検査する
**Then** `全件確認` の anchor を含み、かつ `受け入れ基準` / `Requirement` / `Scenario` の各語を
参照して、request 受け入れ基準と spec Requirement/Scenario の充足確認が指示されている

### Requirement: fixTarget enum と verdict 集約の機械意味論は不変である

二層化に伴う agent 向け routing 説明の文面更新は許容されるが、`CONFORMANCE_REPORT_TOOL` の
fixTarget enum 値 (`implementer` / `code-fixer` / `spec-fixer`) と、verdict 導出・fixTarget
集約 (judge-verdict 層) の機械意味論は変更してはならない (MUST NOT)。

#### Scenario: report tool の fixTarget enum が 3 値を保持する

**Given** `CONFORMANCE_REPORT_TOOL.zodSchema` から導出した JSON schema
**When** その findings 要素の fixTarget フィールドを検査する
**Then** enum 値として `implementer` / `code-fixer` / `spec-fixer` の 3 つを含み、
description には `fixTarget` トークンが残っている

#### Scenario: verdict 導出と集約の既存挙動が保たれる

**Given** `deriveConformanceVerdict` と `aggregateFixTarget` (judge-verdict 層)
**When** 既存の判定・集約テスト (fixTarget 優先順位 spec-fixer > implementer > code-fixer、
decision-needed → escalation 等) を実行する
**Then** それらは無変更のまま green である
