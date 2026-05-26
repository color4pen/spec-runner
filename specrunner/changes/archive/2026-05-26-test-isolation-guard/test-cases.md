# Test Cases: test-isolation-guard

## Legend

- **Priority**: must / should / could
- **Source**: request.md (AC番号) / design.md (Dセクション) / tasks.md (Task番号)

---

## Category: Compile-time Guard (D1 / Task 1)

### TC-01 defaultStoreFactory を import しているファイルがコンパイルエラーになる
- **Priority**: must
- **Source**: request.md AC2, design.md D1, tasks.md Task 1

**GIVEN** `tests/helpers/store-factory.ts` から `defaultStoreFactory` の定義が削除されている  
**WHEN** `defaultStoreFactory` を import している 14 test file に対して `bun run typecheck` を実行する  
**THEN** 各ファイルの import 行で "Module has no exported member 'defaultStoreFactory'" 相当のコンパイルエラーが報告される

---

### TC-02 makeStoreFactory は引き続き import・使用できる
- **Priority**: must
- **Source**: design.md D1, tasks.md Task 1

**GIVEN** `tests/helpers/store-factory.ts` の `makeStoreFactory` が export されている  
**WHEN** 任意の test file が `import { makeStoreFactory } from "...store-factory"` する  
**THEN** import が成功し、`makeStoreFactory(tempDir)` 呼び出しが型エラーなく通る

---

### TC-03 store-factory.ts が makeStoreFactory のみを export している
- **Priority**: must
- **Source**: design.md D1, tasks.md Task 1

**GIVEN** `tests/helpers/store-factory.ts` を確認する  
**WHEN** ファイルの export 一覧を取得する  
**THEN** `makeStoreFactory` のみが export されており、`defaultStoreFactory` は存在しない

---

## Category: Test Migration — StepExecutor 系 (Task 2)

### TC-04 commit-and-push.test.ts が tempDir を使用している
- **Priority**: must
- **Source**: tasks.md Task 2a

**GIVEN** `tests/unit/step/commit-and-push.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`beforeEach` で `fs.mkdtemp` が呼ばれ、`afterEach` で `fs.rm(tempDir, { recursive: true, force: true })` が呼ばれ、全ての `makeStoreFactory` 呼び出しが `tempDir` を引数に取る

---

### TC-05 executor.commit.test.ts が tempDir を使用している
- **Priority**: must
- **Source**: tasks.md Task 2b

**GIVEN** `tests/unit/step/executor.commit.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`beforeEach`/`afterEach` の tempDir パターンが存在し、全 `makeStoreFactory` に `tempDir` が渡されている

---

### TC-06 review-exit-contract.test.ts が tempDir を使用している
- **Priority**: must
- **Source**: tasks.md Task 2c

**GIVEN** `tests/unit/step/review-exit-contract.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`makeExecutor` / `makeDeps` ヘルパー内を含む全箇所で `makeStoreFactory(tempDir)` が使われている

---

### TC-07 agent-runner-port.test.ts が tempDir を使用している
- **Priority**: must
- **Source**: tasks.md Task 2d

**GIVEN** `tests/unit/adapter/agent-runner-port.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`makeDeps` ヘルパー内も含めて `makeStoreFactory(tempDir)` に置換されている

---

### TC-08 remove-session-timeout.test.ts が tempDir を使用している
- **Priority**: must
- **Source**: tasks.md Task 2e

**GIVEN** `tests/unit/remove-session-timeout.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`makeStoreFactory(tempDir)` に置換されている

---

## Category: Test Migration — PipelineDeps 系 (Task 3)

### TC-09 transition-when.test.ts が tempDir を使用している
- **Priority**: must
- **Source**: tasks.md Task 3a

**GIVEN** `tests/unit/pipeline/transition-when.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`storeFactory: makeStoreFactory(tempDir)` が `PipelineDeps` に渡されている

---

### TC-10 pipeline.transitions.test.ts が tempDir を使用している
- **Priority**: must
- **Source**: tasks.md Task 3b

**GIVEN** `tests/unit/core/pipeline/pipeline.transitions.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`storeFactory: makeStoreFactory(tempDir)` が使われている

---

### TC-11 pipeline.loop-iter-stdout.test.ts が tempDir を使用している
- **Priority**: must
- **Source**: tasks.md Task 3c

**GIVEN** `tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`storeFactory: makeStoreFactory(tempDir)` が使われている

---

### TC-12 pipeline.cli-step-output.test.ts が tempDir を使用している
- **Priority**: must
- **Source**: tasks.md Task 3d

**GIVEN** `tests/unit/core/pipeline/pipeline.cli-step-output.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`storeFactory: makeStoreFactory(tempDir)` が使われている

---

### TC-13 pipeline.test.ts (core) が tempDir を使用している
- **Priority**: must
- **Source**: tasks.md Task 3e

**GIVEN** `tests/core/pipeline/pipeline.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`storeFactory: makeStoreFactory(tempDir)` が使われている

---

### TC-14 step-interface.test.ts が tempDir を使用している
- **Priority**: must
- **Source**: tasks.md Task 3f

**GIVEN** `tests/core/step/step-interface.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`storeFactory:` / `new StepExecutor(...)` の両方で `makeStoreFactory(tempDir)` が使われている

---

### TC-15 error-codes.test.ts が既存の tempDir を再利用している
- **Priority**: must
- **Source**: tasks.md Task 3g

**GIVEN** `tests/error-codes.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、`beforeEach` で既に確保されている `tempDir` を用いて `makeStoreFactory(tempDir)` が呼ばれている

---

### TC-16 cli-stdout-snapshot.test.ts が既存の tempDir を再利用している
- **Priority**: must
- **Source**: tasks.md Task 3h

**GIVEN** `tests/cli-stdout-snapshot.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の出現が 0 件であり、既存の `tempDir` で `makeStoreFactory(tempDir)` が呼ばれている

---

### TC-17 multi-layer-defense.test.ts から defaultStoreFactory の import が除去されている
- **Priority**: must
- **Source**: tasks.md Task 3i

**GIVEN** `tests/multi-layer-defense.test.ts` が移行済みである  
**WHEN** ファイルを静的に確認する  
**THEN** `defaultStoreFactory` の import が存在せず、`makeStoreFactory` の使用が維持されている

---

### TC-18 全 test ファイルで defaultStoreFactory の出現がゼロである
- **Priority**: must
- **Source**: request.md AC2, tasks.md Task 6

**GIVEN** Task 2 / Task 3 の移行が完了している  
**WHEN** `grep -rn "defaultStoreFactory" tests/` を実行する  
**THEN** 出力が 0 件である

---

## Category: Runtime Guard — globalSetup (Task 4 / D4)

### TC-19 globalSetup が vitest.config.ts に登録されている
- **Priority**: must
- **Source**: design.md D4, tasks.md Task 4b

**GIVEN** `vitest.config.ts` が変更されている  
**WHEN** `test.globalSetup` フィールドを確認する  
**THEN** `"./tests/global-setup.ts"` が設定されている

---

### TC-20 globalSetup の setup() が .specrunner/jobs/ のスナップショットを取得する
- **Priority**: must
- **Source**: design.md D4, tasks.md Task 4a

**GIVEN** `tests/global-setup.ts` が新規作成されている  
**WHEN** `setup()` 関数の実装を確認する  
**THEN** `.specrunner/jobs/` の `readdir` 結果を `snapshotBefore` として保持し、ENOENT は無視する実装になっている

---

### TC-21 teardown() がテスト後に新規ファイルを検出してエラーを投げる
- **Priority**: must
- **Source**: design.md D4, tasks.md Task 4a, request.md AC1・AC2

**GIVEN** `tests/global-setup.ts` の `teardown()` が実装されている  
**AND** test 実行前後で `.specrunner/jobs/` に新規ファイルが追加されている  
**WHEN** `teardown()` が実行される  
**THEN** `"Test pollution detected: N new file(s) in .specrunner/jobs/:"` を含む Error が throw される

---

### TC-22 teardown() が新規ファイルなしの場合は正常終了する
- **Priority**: must
- **Source**: design.md D4, tasks.md Task 4a

**GIVEN** `tests/global-setup.ts` の `teardown()` が実装されている  
**AND** test 実行前後で `.specrunner/jobs/` のファイル一覧が変化していない  
**WHEN** `teardown()` が実行される  
**THEN** エラーが throw されず正常終了する

---

### TC-23 teardown() が .specrunner/jobs/ 不在の場合は正常終了する
- **Priority**: should
- **Source**: design.md D4, tasks.md Task 4a

**GIVEN** `.specrunner/jobs/` ディレクトリが存在しない  
**WHEN** `teardown()` が実行される  
**THEN** ENOENT を無視して正常終了する（エラーを throw しない）

---

### TC-24 makeStoreFactory(process.cwd()) を使う test が globalSetup で検出される
- **Priority**: must
- **Source**: design.md D4, tasks.md Task 4 Verification, request.md AC2

**GIVEN** globalSetup が有効な状態で  
**AND** ある test が `makeStoreFactory(process.cwd())` を使って prod path に state file を書く  
**WHEN** `bun run test` を実行する  
**THEN** `teardown()` が Test pollution detected エラーを報告し、test suite が失敗する

---

### TC-25 prod code (src/) に test 検出ロジックが混入していない
- **Priority**: must
- **Source**: design.md D1・D4 (却下案の理由), request.md AC2

**GIVEN** `src/store/job-state-store.ts` および `src/util/xdg.ts` の実装を確認する  
**WHEN** `VITEST` / `NODE_ENV` / `process.env` の test 検出コードを grep する  
**THEN** prod code に test 知識が侵入していない（0 件）

---

## Category: Fixture Cleanup (Task 5 / D3)

### TC-26 非 UUID 形式の test 由来 fixture が全件削除されている
- **Priority**: must
- **Source**: request.md AC4, design.md D3, tasks.md Task 5

**GIVEN** Task 5 の `git rm` が実行されている  
**WHEN** `.specrunner/jobs/` のファイル一覧を確認する  
**THEN** UUID v4 パターン（`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/`）に一致しないファイルが 0 件である

---

### TC-27 UUID 形式の本物の job ファイルが削除されていない
- **Priority**: must
- **Source**: request.md AC5, design.md D3

**GIVEN** Task 5 の `git rm` が実行されている  
**WHEN** `.specrunner/jobs/` のファイル一覧を確認する  
**THEN** UUID v4 パターンに一致するファイルが 1 件以上存在し、削除されていない

---

### TC-28 削除対象 46 件の各ファイルが非 UUID 形式である
- **Priority**: should
- **Source**: design.md D3, tasks.md Task 5

**GIVEN** tasks.md に列挙された 46 件のファイル名（`tc-cap-001-job.json` 等）  
**WHEN** UUID v4 正規表現でマッチングする  
**THEN** 全件がパターンに一致しない（= test 由来の識別基準を満たす）

---

### TC-29 .tmp. を含む残留ファイルが存在しない
- **Priority**: should
- **Source**: design.md D3（「3 件は `.tmp.` を含む」言及）

**GIVEN** Task 5 の削除が完了している  
**WHEN** `.specrunner/jobs/` で `.tmp.` を含むファイルを確認する  
**THEN** 該当ファイルが 0 件である（物理的に存在しない）

---

## Category: Integration / Final Verification (Task 6)

### TC-30 bun run typecheck が green になる
- **Priority**: must
- **Source**: request.md AC6, tasks.md Task 6

**GIVEN** Task 1〜5 の全変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code 0 でエラーが報告されない

---

### TC-31 bun run test が green になる
- **Priority**: must
- **Source**: request.md AC6, tasks.md Task 6

**GIVEN** Task 1〜5 の全変更が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** exit code 0 で全テストがパスする

---

### TC-32 test 実行後に .specrunner/jobs/ に新規ファイルが増えない
- **Priority**: must
- **Source**: request.md AC1, design.md D4

**GIVEN** `bun run test` を実行する前の `.specrunner/jobs/` のファイル数を記録する  
**WHEN** `bun run test` を実行する  
**THEN** 実行後のファイル数が実行前と同一である（globalSetup の teardown が silent に通過する）

---

### TC-33 移行後も各 test ファイルの test ロジックが壊れていない
- **Priority**: must
- **Source**: request.md AC6

**GIVEN** Task 2 / Task 3 の移行が完了している  
**WHEN** 移行された各 test ファイル単体を `bun run test <file>` で実行する  
**THEN** 各ファイルの全テストが green になる

---

### TC-34 beforeEach で作成した tempDir が afterEach で削除されている（リソースリーク防止）
- **Priority**: should
- **Source**: design.md D2, tasks.md Task 2a〜Task 3f

**GIVEN** 移行済みの test file が `beforeEach`/`afterEach` パターンを持つ  
**WHEN** test 実行後に tempDir のパスを確認する  
**THEN** `afterEach` で `fs.rm(tempDir, { recursive: true, force: true })` が呼ばれておりディレクトリが存在しない

---

### TC-35 spec (job-state-store/spec.md) に変更が加えられていない
- **Priority**: should
- **Source**: design.md D5

**GIVEN** `specrunner/specs/job-state-store/spec.md` を確認する  
**WHEN** git diff で変更を確認する  
**THEN** 本 change による変更が 0 件である

---

### TC-36 src/store/job-state-store.ts に変更が加えられていない
- **Priority**: must
- **Source**: design.md Not Changed セクション

**GIVEN** `src/store/job-state-store.ts` を確認する  
**WHEN** git diff で変更を確認する  
**THEN** 本 change による変更が 0 件である

---

## Category: Regression Guard

### TC-37 job ls コマンドが UUID 形式の job のみを表示する
- **Priority**: should
- **Source**: request.md 背景（`job ls` での fixture 混入が発端）

**GIVEN** `.specrunner/jobs/` に UUID 形式のファイルのみが残っている  
**WHEN** `specrunner job ls` を実行する  
**THEN** 表示される job 一覧に `tc-cap-*`, `tc-auth-*`, `test-*` 等の test 由来 jobId が含まれない

---

### TC-38 将来の開発者が defaultStoreFactory を再追加しようとしても compile error になる
- **Priority**: could
- **Source**: request.md AC2（「構造的防止」）, design.md D1 Rationale

**GIVEN** `tests/helpers/store-factory.ts` から `defaultStoreFactory` が削除されている  
**WHEN** 新しい test file が `import { defaultStoreFactory } from "...store-factory"` を書く  
**THEN** `bun run typecheck` が compile error を報告し、PR/CI でブロックされる
