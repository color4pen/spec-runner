# Tasks: TC Source Contract Drift Fix

## T-01: `src/prompts/tc-source-contract.ts` を新規作成する

- [ ] `src/prompts/tc-source-contract.ts` を新規作成する（`judge-rules.ts` と同型の leaf module）
- [ ] `TC_SOURCE_SCENARIO_FORMAT` を named export する（値: `"spec.md > Requirement: <name> > Scenario: <name>"`）
- [ ] モジュール先頭の JSDoc に「TC Source step 間契約の正準形式定数。project-internal import なし（leaf）」と明記する
- [ ] ファイルに project-internal import が存在しないことを確認する

**Acceptance Criteria**:
- `src/prompts/tc-source-contract.ts` が存在し `TC_SOURCE_SCENARIO_FORMAT` を named export している
- export された値が `"spec.md > Requirement: <name> > Scenario: <name>"` に一致する
- ファイルに `import ... from "../` または `import ... from "../../` といった project-internal import が存在しない

---

## T-02: `test-case-gen-system.ts` を更新する

- [ ] `./tc-source-contract.js` から `TC_SOURCE_SCENARIO_FORMAT` を import する
- [ ] line 55 付近の hardcoded 形式文字列（`` `spec.md > Requirement: <name> > Scenario: <name>` ``）をテンプレートリテラル `\`${TC_SOURCE_SCENARIO_FORMAT}\`` に置換する

**Acceptance Criteria**:
- `TEST_CASE_GEN_SYSTEM_PROMPT` の文字列に `TC_SOURCE_SCENARIO_FORMAT` の値（`spec.md > Requirement: <name> > Scenario: <name>`）が含まれる
- `test-case-gen-system.ts` に `TC_SOURCE_SCENARIO_FORMAT` を直書きした文字列リテラルが残っていない（定数参照に置換済み）

---

## T-03: `test-materialize-system.ts` を更新する

- [ ] `./tc-source-contract.js` から `TC_SOURCE_SCENARIO_FORMAT` を import する
- [ ] lines 84-86 の Scenario 由来 TC 判別条件を以下の通り修正する：
  - 判別条件を `Source フィールドが \`${TC_SOURCE_SCENARIO_FORMAT}\` 形式` に変更する
  - Read 対象のパスを `specs/<capability>/spec.md` から change folder の `spec.md`（`specrunner/changes/<slug>/spec.md`）に変更する

**Acceptance Criteria**:
- `TEST_MATERIALIZE_SYSTEM_PROMPT` に `TC_SOURCE_SCENARIO_FORMAT` の値が含まれる
- `TEST_MATERIALIZE_SYSTEM_PROMPT` に `specs/<capability>/spec.md` がシナリオ判別・Read 対象として存在しない（grep 0 件）

---

## T-04: `implementer-system.ts` を更新する

- [ ] `./tc-source-contract.js` から `TC_SOURCE_SCENARIO_FORMAT` を import する
- [ ] lines 48-49 の Scenario 由来 TC 判別条件を以下の通り修正する：
  - 判別条件を `Source フィールドが \`${TC_SOURCE_SCENARIO_FORMAT}\` 形式` に変更する
  - Read 対象のパスを `specs/<capability>/spec.md` から change folder の `spec.md`（`specrunner/changes/<slug>/spec.md`）に変更する

**Acceptance Criteria**:
- `IMPLEMENTER_SYSTEM_PROMPT` に `TC_SOURCE_SCENARIO_FORMAT` の値が含まれる
- `IMPLEMENTER_SYSTEM_PROMPT` に `specs/<capability>/spec.md` がシナリオ判別・Read 対象として存在しない（grep 0 件）

---

## T-05: 回帰テストを追加する

- [ ] `src/prompts/__tests__/tc-source-contract.test.ts` を新規作成する
- [ ] `TC_SOURCE_SCENARIO_FORMAT` 定数の値を検証するテストを書く：
  - 値が `spec.md >` を含む
  - 値が `specs/` を含まない（旧形式の痕跡がない）
- [ ] 3 prompt が `TC_SOURCE_SCENARIO_FORMAT` の値を含むことをアサートする：
  - `TEST_CASE_GEN_SYSTEM_PROMPT` が `TC_SOURCE_SCENARIO_FORMAT` を含む
  - `TEST_MATERIALIZE_SYSTEM_PROMPT` が `TC_SOURCE_SCENARIO_FORMAT` を含む
  - `IMPLEMENTER_SYSTEM_PROMPT` が `TC_SOURCE_SCENARIO_FORMAT` を含む
- [ ] consumer 2 prompt が旧形式を含まないことをアサートする：
  - `TEST_MATERIALIZE_SYSTEM_PROMPT` が `specs/<capability>/spec.md` を含まない
  - `IMPLEMENTER_SYSTEM_PROMPT` が `specs/<capability>/spec.md` を含まない
- [ ] `bun run typecheck && bun run test` が green になることを確認する（既存テストの無改変を含む）

**Acceptance Criteria**:
- `src/prompts/__tests__/tc-source-contract.test.ts` が存在し全アサートが green
- 既存テスト（`fragment-coverage.test.ts` 等）が無改変で green
- `bun run typecheck` がエラー 0 件
