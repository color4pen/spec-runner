## Requirements

### Requirement: test-coverage phase は test-cases.md の must TC ID を tests/ 配下から grep で検証する

`src/core/verification/test-coverage.ts` の `runTestCoveragePhase(slug, cwd)` は MUST 以下の処理を行う:

1. `specrunner/changes/<slug>/test-cases.md` を読み込み、Priority: must の TC ID を抽出する
2. `tests/` 配下の `.ts` ファイルを再帰取得し、各 must TC ID が少なくとも 1 ファイルに出現するか確認する
3. TC ID の grep パターンは `TC-\d+(?:-\d+)*` 形式で、フラット型 (`TC-001`) と階層型 (`TC-10-01`) の両方を検出する
4. 未出現の must TC ID がある場合は `status: "failed"` を返し、`missingTcIds` に未実装 TC ID のリストを記録する
5. TC ID が出現するファイルに**少なくとも 1 つの実質的な assertion**（`expect(` / `assert(` / `assert.`）が存在することを MUST 検査する。TC ID が出現する全ファイルにおいて assertion パターンが 1 つも存在しない TC ID は `assertionlessTcIds` に記録し、`status: "failed"` を返す
6. `missingTcIds` と `assertionlessTcIds` がともに空の場合のみ `status: "passed"` を返す
7. `stdout` に human-readable summary を生成する（例: `test-coverage: 15/18 must TCs covered\nMissing: TC-003\nAssertionless: TC-012`）

`TestCoverageResult` は MUST `assertionlessTcIds: string[]` フィールドを持つ。

`bun:*` / `Bun.*` の import は MUST 使用しない。`node:fs/promises` と `node:path` のみ使用する。

#### Scenario: must TC 全網羅かつ assertion あり

- **GIVEN** test-cases.md に must TC が 3 件あり、tests/ 配下に 3 件すべての TC ID が記載され、各ファイルに `expect(` を含む assertion が存在する
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"passed"` であり、`missingTcIds` は空配列、`assertionlessTcIds` は空配列

#### Scenario: must TC 部分欠損

- **GIVEN** test-cases.md に must TC が 5 件あり、tests/ 配下に 2 件のみ TC ID が記載されている
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"failed"` であり、`missingTcIds` に 3 件の TC ID が含まれる

#### Scenario: TC ID は出現するが assertion が無い（空 stub）

- **GIVEN** test-cases.md に must TC-001 があり、tests/ 配下に `it("TC-001", () => {})` のみが存在する（`expect(` / `assert(` / `assert.` が無い）
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"failed"` であり、`assertionlessTcIds` に `TC-001` が含まれる
- **AND** `missingTcIds` は空配列（TC ID 自体は found）

#### Scenario: must TC 0 件

- **GIVEN** test-cases.md に must TC が 0 件（should / could のみ）
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"passed"`

#### Scenario: missing と assertionless が混在

- **GIVEN** test-cases.md に must TC-001, TC-002, TC-003 があり、TC-001 は assertion 付き test に存在、TC-002 は assertion 無し stub に存在、TC-003 は tests/ に不在
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"failed"`
- **AND** `missingTcIds` に `TC-003` が含まれる
- **AND** `assertionlessTcIds` に `TC-002` が含まれる
- **AND** `stdout` に `Missing:` と `Assertionless:` の両方が含まれる
