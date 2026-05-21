# pipeline-orchestrator Delta Spec

## ADDED Requirements

### Requirement: delta-spec-validation は spec-change/new-feature type で specs/ 不在を reject する

`delta-spec-validation` step SHALL、request type が `spec-change` または `new-feature` の場合に、change folder の `specs/` 配下に `.md` ファイルが 1 件以上存在することを検証する。0 件の場合は `no-specs-for-required-type` violation を生成し verdict `needs-fix` を返す。

この check は既存 Step 1-4 (legacy path / format check) の **前** に実行し、specs/ 不在時は短絡 fail する。

request type が `bug-fix` / `refactoring` / `chore` 等の場合は本 check の対象外とし、specs/ 不在でも既存挙動 (approved) を維持する。

`DeltaSpecViolationReason` union に `"no-specs-for-required-type"` を追加する。violation の schema は既存 (`path` / `reason` / `suggested`) 準拠とする。

#### Scenario: type=spec-change で specs/ 不在 → needs-fix

- **GIVEN** request type が `spec-change`
- **AND** change folder の `specs/` 配下に `.md` ファイルが 0 件
- **WHEN** `delta-spec-validation` step が実行される
- **THEN** violation `no-specs-for-required-type` が 1 件生成される
- **AND** verdict は `needs-fix`

#### Scenario: type=new-feature で specs/ 不在 → needs-fix

- **GIVEN** request type が `new-feature`
- **AND** change folder の `specs/` 配下に `.md` ファイルが 0 件
- **WHEN** `delta-spec-validation` step が実行される
- **THEN** violation `no-specs-for-required-type` が 1 件生成される
- **AND** verdict は `needs-fix`

#### Scenario: type=bug-fix で specs/ 不在 → approved (対象外)

- **GIVEN** request type が `bug-fix`
- **AND** change folder の `specs/` 配下に `.md` ファイルが 0 件
- **WHEN** `delta-spec-validation` step が実行される
- **THEN** `no-specs-for-required-type` violation は生成されない
- **AND** 他の violation がなければ verdict は `approved`

#### Scenario: type=spec-change で specs/ に .md 1 件以上 → 後段 check 継続

- **GIVEN** request type が `spec-change`
- **AND** change folder の `specs/` 配下に `.md` ファイルが 1 件以上
- **WHEN** `delta-spec-validation` step が実行される
- **THEN** `no-specs-for-required-type` violation は生成されない
- **AND** 既存 Step 1-4 (legacy path / format check) が継続実行される
