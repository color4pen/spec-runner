# Spec:

<!-- SPEC WRITING GUIDANCE

This file is the self-contained spec for this change.
Write Layer-1 behaviors — choices the structure/types/FSM do not enforce automatically.

════════════════════════════════════════════════════════
REQUIREMENT FORMAT
════════════════════════════════════════════════════════

### Requirement: <name>

Each requirement describes a behavior this change introduces or modifies.
The body MUST contain a normative keyword: SHALL or MUST (English).

At least one Scenario per Requirement (Given/When/Then format):

#### Scenario: <name>

**Given** <preconditions>
**When** <action>
**Then** <expected result>

════════════════════════════════════════════════════════
EXAMPLE
════════════════════════════════════════════════════════

## Requirements

### Requirement: The system shall place spec.md before the design step

The system SHALL place a spec.md scaffold in the change folder before the design
agent runs, so the agent has a pre-structured output destination.

#### Scenario: spec.md exists before design agent starts

**Given** the pipeline is about to execute the design step
**When** the executor calls writeOutputTemplates for the design step
**Then** spec.md exists in the change folder at specrunner/changes/<slug>/spec.md

-->

## Requirements

### Requirement: OpenAI 系 API キーをマスクする

`maskSensitive` は `sk-proj-`・`sk-svcacct-`・汎用 `sk-`（20 文字以上）にマッチする文字列を `<prefix>...` 形式に短縮 SHALL する。prefix は最初の `_` または（`_` が無い場合）最後の `-` までとする。

#### Scenario: sk-proj- キーがマスクされる

**Given** 出力文字列に `sk-proj-abcdefghijklmnopqrstu` が含まれる  
**When** `maskSensitive` を適用する  
**Then** 該当箇所が `sk-proj-...` に置換される

#### Scenario: sk-svcacct- キーがマスクされる

**Given** 出力文字列に `sk-svcacct-abcdefghijklmnopqrstu` が含まれる  
**When** `maskSensitive` を適用する  
**Then** 該当箇所が `sk-svcacct-...` に置換される

#### Scenario: 汎用 sk- キー（20 文字以上）がマスクされる

**Given** 出力文字列に `sk-abcdefghijklmnopqrstu` が含まれる  
**When** `maskSensitive` を適用する  
**Then** 該当箇所が `sk-...` に置換される

#### Scenario: 短い sk- 文字列はマスクされない

**Given** 出力文字列に `sk-short`（合計 20 文字未満）が含まれる  
**When** `maskSensitive` を適用する  
**Then** 文字列はそのまま返る

### Requirement: 既存パターンの挙動を維持する

既存の Anthropic・GitHub パターンは変更後も同一の短縮形を返す SHALL。

#### Scenario: sk-ant- キーが既存と同じ形式でマスクされる

**Given** 出力文字列に `sk-ant-api03-abcdef` が含まれる  
**When** `maskSensitive` を適用する  
**Then** 該当箇所が `sk-ant-api03-...` に置換される

#### Scenario: gh*_ / github_pat_ キーがマスクされる

**Given** 出力文字列に `ghp_ABCDEFGHIJKLMNOPQRSTU` または `github_pat_ABCDEFGHIJKLMNOPQRSTU` が含まれる  
**When** `maskSensitive` を適用する  
**Then** 該当箇所がそれぞれ `ghp_...` / `github_...` に置換される

