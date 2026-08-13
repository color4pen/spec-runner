# Spec: chore type のテスト生成免除

## Requirements

### Requirement: テスト生成要否は request type で宣言的に決まる

`TYPE_CONFIG` は各 request type がテスト生成工程（test-case-gen / test-materialize /
bite-evidence）を要するかを宣言する。参照関数 `isTestGenRequired(type)` は既知の非免除 type
（new-feature / spec-change / refactoring / bug-fix）で `true` を、chore で `false` を返さ
なければならない（MUST）。未知の type に対しては fail-closed で `true`（＝免除しない）を返さ
なければならない（MUST）。判定は走行中の agent 判断を挟まず type のみから決まる（SHALL）。

#### Scenario: chore はテスト生成免除

**Given** request type が `chore`
**When** `isTestGenRequired("chore")` を評価する
**Then** `false`（テスト生成免除）が返る

#### Scenario: 非免除 type はテスト生成必須

**Given** request type が `new-feature` / `spec-change` / `refactoring` / `bug-fix` のいずれか
**When** `isTestGenRequired(type)` を評価する
**Then** `true`（テスト生成必須）が返る

#### Scenario: 未知 type は fail-closed で免除されない

**Given** `TYPE_CONFIG` に存在しない type 文字列（例: `"docs"` や空文字列）
**When** `isTestGenRequired(type)` を評価する
**Then** `true` が返り、テスト生成は免除されない

### Requirement: 免除 type の pipeline はテスト生成工程を通らない

テスト生成免除 type の STANDARD pipeline は、spec-review 承認後に test-case-gen /
test-materialize / bite-evidence を経由せず implementer に直行し、implementer 成功後は
bite-evidence を経由せず verification に直行しなければならない（MUST）。spec-fixer が
spec-review 承認後の観測修正として forward する再入経路も、免除 type では test-case-gen では
なく implementer に向かわなければならない（MUST）。非免除 type の遷移は一切変わってはならない（SHALL）。

#### Scenario: chore は spec-review 承認から implementer へ直行

**Given** request type が `chore` の job で spec-review が `approved` を返し、routable fixable finding が無い
**When** pipeline が次ステップを解決する
**Then** 遷移先は implementer であり、test-case-gen / test-materialize / bite-evidence を通らない

#### Scenario: chore は implementer 成功から verification へ直行

**Given** request type が `chore` の job で implementer が `success` を返す
**When** pipeline が次ステップを解決する
**Then** 遷移先は verification であり、bite-evidence を通らない

#### Scenario: chore の spec-fixer 観測修正は implementer へ forward

**Given** request type が `chore` の job で、spec-review 承認後の観測修正として spec-fixer が `approved` を返す
（conformance 起点でない、`specFixerForwardsToTestGen` 条件が成立）
**When** pipeline が次ステップを解決する
**Then** 遷移先は implementer であり、test-case-gen を通らない

#### Scenario: 非免除 type は従来通りテスト生成を通る

**Given** request type が `new-feature` の job で spec-review が `approved` を返す（routable fixable 無し）
**When** pipeline が次ステップを解決する
**Then** 遷移先は test-case-gen であり、従来の SPEC_REVIEW → TEST_CASE_GEN → TEST_MATERIALIZE →
IMPLEMENTER → BITE_EVIDENCE → VERIFICATION 経路を辿る

### Requirement: 免除 type では changed-line coverage gate を明示 skip する

`verification.coverage` が設定されていても、テスト生成免除 type では changed-line coverage gate
を実行してはならない（MUST NOT）。gate を skip したことは verification 結果に status `skipped`
の phase として残り、免除が skip 理由であることを明示しなければならない（MUST）。skip は
verdict を fail に倒してはならない（SHALL）。

#### Scenario: 免除 type で coverage gate が明示 skip される

**Given** `verification.coverage` が設定された project で request type が `chore` の job を verification する
**When** verification が実行される
**Then** changed-line coverage gate は実行されず、結果に `changed-line-coverage` phase が
`skipped` として記録され、skip 理由に免除 type であることが明示される

#### Scenario: 非免除 type では coverage gate が従来通り走る

**Given** `verification.coverage` が設定された project で request type が `bug-fix` の job を verification する
**When** verification が実行される
**Then** changed-line coverage gate は従来通り評価される

### Requirement: 免除 type でも既存テスト実行は維持される

テスト生成免除 type でも、verification の build / typecheck / lint / test suite の実行は
免除されず、非免除 type と同一に走らなければならない（MUST）。免除は「テストの生成」のみに
閉じ、「既存テストの実行」には及んではならない（SHALL NOT）。

#### Scenario: chore でも verification の command 実行が走る

**Given** request type が `chore` の job を verification する
**When** verification が実行される
**Then** build / typecheck / lint / test の各 command（または対応する phase）が実行され、
その結果が verdict に反映される
