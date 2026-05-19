## Requirements

### Requirement: verification CLI runner は build / typecheck / test / lint / security / test-coverage の 6 phase を fail-fast 順次実行する

`src/core/verification/runner.ts` の `runVerification(slug: string): Promise<VerificationResult>` は MUST 以下の 6 phase を配列順 `["build", "typecheck", "test", "lint", "security", "test-coverage"]` で順次実行する。最初の 5 phase (build / typecheck / test / lint / security) は従来通り `bun run <script>` を子プロセスとして起動する。6 番目の `test-coverage` は CLI 内部処理として実行する（package.json script を spawn しない）。

最初の non-zero exit code を返した phase で MUST break し、残り phase は SHALL `status: "skipped"` で記録される（fail-fast）。

#### Scenario: 全 6 phase passed

- **GIVEN** 5 script phase すべてが exit code 0 で終了し、test-coverage phase も passed
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** 結果の verdict は `"passed"` であり、phases 配列の length は 6

#### Scenario: test phase failed → test-coverage skipped

- **GIVEN** test phase が exit 1 で終了する
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** test-coverage phase の status は `"skipped"`

### Requirement: test-coverage phase は test-cases.md の must TC ID を tests/ 配下から grep で検証する

`src/core/verification/test-coverage.ts` の `runTestCoveragePhase(slug, cwd)` は MUST 以下の処理を行う:

1. `specrunner/changes/<slug>/test-cases.md` を読み込み、Priority: must の TC ID を抽出する
2. `tests/` 配下の `.ts` ファイルを再帰取得し、各 must TC ID が少なくとも 1 ファイルに出現するか確認する
3. TC ID の grep パターンは `TC-\d+(?:-\d+)*` 形式で、フラット型 (`TC-001`) と階層型 (`TC-10-01`) の両方を検出する
4. 未出現の must TC ID がある場合は `status: "failed"` を返し、`missingTcIds` に未実装 TC ID のリストを記録する
5. 全 must TC ID が見つかった場合は `status: "passed"` を返す
6. `stdout` に human-readable summary を生成する（例: `test-coverage: 15/18 must TCs covered\nMissing: TC-003, TC-012`）

`bun:*` / `Bun.*` の import は MUST 使用しない。`node:fs/promises` と `node:path` のみ使用する。

#### Scenario: must TC 全網羅

- **GIVEN** test-cases.md に must TC が 3 件あり、tests/ 配下に 3 件すべての TC ID が記載されている
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"passed"` であり、`missingTcIds` は空配列

#### Scenario: must TC 部分欠損

- **GIVEN** test-cases.md に must TC が 5 件あり、tests/ 配下に 2 件のみ TC ID が記載されている
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"failed"` であり、`missingTcIds` に 3 件の TC ID が含まれる

#### Scenario: must TC 0 件

- **GIVEN** test-cases.md に must TC が 0 件（should / could のみ）
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"passed"`

### Requirement: test-coverage phase は test-cases.md 不在時に skipped で記録する

`test-cases.md` が `specrunner/changes/<slug>/` に存在しない場合、test-coverage phase は SHALL `status: "skipped"` で記録される。skipped phase は verdict 判定では failed に算入されない（既存の script 不在時の skipped と同じ扱い）。

#### Scenario: test-cases.md 不在

- **GIVEN** `specrunner/changes/<slug>/test-cases.md` が存在しない
- **WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
- **THEN** `status` は `"skipped"`
