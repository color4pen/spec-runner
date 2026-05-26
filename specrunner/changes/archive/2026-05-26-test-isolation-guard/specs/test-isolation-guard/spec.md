# test-isolation-guard Specification (delta)

## Requirements

### Requirement: defaultStoreFactory を削除し prod path への書き込みを構造的に防止する

`tests/helpers/store-factory.ts` から `defaultStoreFactory` を SHALL 削除する。`makeStoreFactory(tempDir)` が唯一の test factory である。

`defaultStoreFactory` は `process.cwd()` を repoRoot として使用するため、test 経由で prod の `<repoRoot>/.specrunner/jobs/` に state file が書き込まれる原因となっていた。削除することで import 時点で compile error が発生し、構造的に防止される。

#### Scenario: defaultStoreFactory を import するとコンパイルエラーになる

- **WHEN** `tests/helpers/store-factory.ts` から `defaultStoreFactory` を import しようとする
- **THEN** TypeScript compile error が発生する
- **AND** `makeStoreFactory` は引き続き export される

### Requirement: 全 test file を makeStoreFactory(tempDir) に移行する

`defaultStoreFactory` を使用していた 14 test file は MUST `makeStoreFactory(tempDir)` を使うよう移行される。

各 test file は `beforeEach` で `fs.mkdtemp()` により一時ディレクトリを作成し、`afterEach` で `fs.rm()` により削除するパターンを SHALL 持つ。

#### Scenario: test 実行後に temp dir が削除される

- **GIVEN** `makeStoreFactory(tempDir)` を使う test が実行される
- **WHEN** test suite が完了する
- **THEN** `tempDir` 配下の state file は削除されている
- **AND** prod の `<repoRoot>/.specrunner/jobs/` にはファイルが増えていない

### Requirement: vitest globalSetup で prod path への書き込みを検出する

`tests/global-setup.ts` を SHALL 新規作成し、`vitest.config.ts` の `globalSetup` に MUST 登録する。

`setup()` で test suite 実行前に `.specrunner/jobs/` のファイルリストをスナップショットし、`teardown()` で実行後との差分を検出する。新規ファイルが増加していた場合は SHALL error を throw する。

#### Scenario: test が prod path に書き込んだ場合に検出される

- **GIVEN** `tests/global-setup.ts` が `vitest.config.ts` の `globalSetup` に登録されている
- **WHEN** いずれかの test が prod の `<repoRoot>/.specrunner/jobs/` に新規ファイルを作成する
- **THEN** teardown が error を throw する
- **AND** test suite が失敗として報告される

#### Scenario: test が prod path に書き込まない場合は正常終了

- **GIVEN** 全 test が `makeStoreFactory(tempDir)` を使用している
- **WHEN** test suite が完了する
- **THEN** teardown は error を throw しない

### Requirement: test 由来の fixture を prod の jobs dir から削除する

`.specrunner/jobs/` 内の非 UUID v4 形式のファイルは SHALL test 由来 fixture として削除される。

識別基準: `JobStateStore.create()` は `randomUUID()` で jobId を生成するため、prod で作成された job は MUST UUID v4 形式 (`xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx.json`) に一致する。非 UUID 形式のファイル（例: `tc-cap-001-job.json`, `test-pipeline-job.json`）は test 由来と判断する。

UUID v4 形式のファイル（本物の job）は SHALL 維持される。

#### Scenario: 非 UUID 形式の fixture が削除される

- **GIVEN** `.specrunner/jobs/` に UUID 形式 16 件 + 非 UUID 形式 46 件が存在する
- **WHEN** cleanup を実行する
- **THEN** 非 UUID 形式の 46 件が削除される
- **AND** UUID 形式の 16 件は維持される

### Requirement: typecheck と test が green であること

`bun run typecheck` は SHALL error なしで完了する。`bun run test` は MUST 全件 pass する。

#### Scenario: typecheck と test が両方 pass する

- **WHEN** `bun run typecheck && bun run test` を実行する
- **THEN** 両コマンドが exit code 0 で完了する
