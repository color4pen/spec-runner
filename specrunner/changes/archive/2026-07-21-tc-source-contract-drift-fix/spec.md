# Spec: TC Source Contract Drift Fix

## Requirements

### Requirement: TC Source 正準形式定数が単一の leaf module に存在する

TC Source フィールドの正準形式文字列は `src/prompts/tc-source-contract.ts` の named export
`TC_SOURCE_SCENARIO_FORMAT` として定義される。このモジュールは project-internal import を持たない（leaf module）。
`TC_SOURCE_SCENARIO_FORMAT` の値は `"spec.md > Requirement: <name> > Scenario: <name>"` で
なければならず（MUST）、`specs/` を含んではならない（MUST NOT）。

#### Scenario: 正準形式定数が正しい形式文字列を保持する

**Given** `src/prompts/tc-source-contract.ts` が存在する
**When** `TC_SOURCE_SCENARIO_FORMAT` を参照する
**Then** 値が `"spec.md > Requirement: <name> > Scenario: <name>"` と一致し、`specs/` を含まない

---

### Requirement: 3 つの step prompt が正準形式定数を参照する

test-case-gen / test-materialize / implementer の 3 step prompt は、TC Source 形式の記述に
`TC_SOURCE_SCENARIO_FORMAT` を import して使用しなければならない（MUST）。
各 system prompt の出力文字列には正準形式が含まれなければならない（MUST）。

#### Scenario: test-case-gen の Source フィールド説明が正準形式を含む

**Given** `TEST_CASE_GEN_SYSTEM_PROMPT` が生成される
**When** prompt 文字列を検査する
**Then** `TC_SOURCE_SCENARIO_FORMAT` の値（`spec.md > Requirement: <name> > Scenario: <name>`）が含まれる

#### Scenario: test-materialize の Scenario 由来 TC 判別条件が正準形式を含む

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` が生成される
**When** prompt 文字列を検査する
**Then** `TC_SOURCE_SCENARIO_FORMAT` の値が含まれる

#### Scenario: implementer の Scenario 由来 TC 判別条件が正準形式を含む

**Given** `IMPLEMENTER_SYSTEM_PROMPT` が生成される
**When** prompt 文字列を検査する
**Then** `TC_SOURCE_SCENARIO_FORMAT` の値が含まれる

---

### Requirement: consumer prompt が旧形式 `specs/<capability>/spec.md` を参照しない

test-materialize と implementer の Scenario 由来 TC 判別条件は、旧形式
`specs/<capability>/spec.md > ...` を使用してはならない（MUST NOT）。
判別条件は `TC_SOURCE_SCENARIO_FORMAT` の現行形式のみで記述されなければならない（MUST）。

#### Scenario: test-materialize の Scenario 判別条件に旧形式が存在しない

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` が生成される
**When** prompt 文字列を検査する
**Then** `specs/<capability>/spec.md` という文字列が Scenario 由来 TC の判別条件として存在しない（grep 0 件）

#### Scenario: implementer の Scenario 判別条件に旧形式が存在しない

**Given** `IMPLEMENTER_SYSTEM_PROMPT` が生成される
**When** prompt 文字列を検査する
**Then** `specs/<capability>/spec.md` という文字列が Scenario 由来 TC の判別条件として存在しない（grep 0 件）
