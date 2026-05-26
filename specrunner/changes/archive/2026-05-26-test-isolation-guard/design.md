# Design: test-isolation-guard

## Problem

dogfood 中に `.specrunner/jobs/` へ test 由来の fixture が 46 件混入していた。原因は `tests/helpers/store-factory.ts` の `defaultStoreFactory` が `process.cwd()` を repoRoot として使うため、test 経由で `StepExecutor` や `PipelineDeps` に渡されると、prod の `<repoRoot>/.specrunner/jobs/` に state file が書き込まれる。

14 test file が `defaultStoreFactory` を import しており、構造的な防止策がない。開発者が `makeStoreFactory(tempDir)` の代わりに `defaultStoreFactory` を使うだけで再発する。

## Decision

### D1: `defaultStoreFactory` を削除し `makeStoreFactory(tempDir)` を唯一の test factory にする

`tests/helpers/store-factory.ts` から `defaultStoreFactory` を削除する。

**Rationale**: `defaultStoreFactory` は `process.cwd()` を hardcode しており、prod path への書き込みの唯一の経路。削除すれば import 時点で compile error になり、構造的に防止される。「判断する場面を消す」原則と整合。

**却下案**: `defaultStoreFactory` 内部で `VITEST` 環境変数を検出して temp dir にリダイレクト → 暗黙的な挙動で debuggability が低下。runtime guard として `JobStateStore` constructor 内に test 検出を入れる → prod code に test 知識が侵入。

### D2: 14 test file を `makeStoreFactory(tempDir)` に移行

各 test file に `beforeEach` で `fs.mkdtemp()` + `afterEach` で `fs.rm()` のパターンを追加し、`defaultStoreFactory` → `makeStoreFactory(tempDir)` に置換する。

一部の test（`commit-and-push.test.ts`, `executor.commit.test.ts`, `review-exit-contract.test.ts` 等）は StepExecutor を直接構築し `defaultStoreFactory` を positional arg で渡している。これらも同様に `makeStoreFactory(tempDir)` に置換する。

`PipelineDeps` の `storeFactory` field に渡している箇所も同様。

### D3: test 由来 fixture の識別基準

prod の `.specrunner/jobs/` 内のファイルを以下の基準で分類する:

- **UUID v4 形式** (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json`): 本物の job → **維持**
- **非 UUID 形式**: test 由来 → **削除**

**Rationale**: `JobStateStore.create()` は `randomUUID()` で jobId を生成する（L63）。prod で作成された job は必ず UUID v4 形式。一方 test で hardcode された jobId は `tc-cap-001-job`, `err-code-test-job`, `test-pipeline-job` 等の人間可読文字列で、UUID v4 パターンに一致しない。

現在の `.specrunner/jobs/` には UUID 形式 16 件（本物）+ 非 UUID 形式 46 件（test 由来）= 計 62 件が存在。3 件は `.tmp.` を含むため `list()` でフィルタ済みだが物理ファイルとして残っている可能性あり。

### D4: vitest globalSetup で prod path への書き込みを検出する safety net

`defaultStoreFactory` 削除だけでは、開発者が `makeStoreFactory(process.cwd())` や `new JobStateStore(id, process.cwd())` を直接書く可能性が残る。

vitest の `globalSetup` で test suite 実行前後に `.specrunner/jobs/` の snapshot を取り、test 実行後に新規ファイルが増えていたら error を報告する。

```ts
// tests/global-setup.ts
export async function setup() {
  // snapshot: .specrunner/jobs/ の file list を記録
}
export async function teardown() {
  // diff: 新規ファイルが増えていたら throw
}
```

**Rationale**: compile-time guard (D1) と runtime guard (D4) の二重防御。D1 は `defaultStoreFactory` 経由のパスを塞ぐ。D4 は `defaultStoreFactory` を使わなくても prod path に書く全経路を検出する。

**却下案**: CI only の diff check → local 開発者が気づかない。lint rule → AST 解析が複雑で false positive リスク。

### D5: delta spec は不要

`job-state-store` spec の Requirement は `repoRoot` を constructor 引数で受け取ることを定義済み。`defaultStoreFactory` は spec 外の test helper であり、その削除は spec に影響しない。`globalSetup` は test infrastructure であり spec の対象外。

## Files Changed

| File | Change |
|------|--------|
| `tests/helpers/store-factory.ts` | `defaultStoreFactory` を削除。`makeStoreFactory` のみ export |
| `tests/unit/step/commit-and-push.test.ts` | `defaultStoreFactory` → `makeStoreFactory(tempDir)` に移行 |
| `tests/unit/step/executor.commit.test.ts` | 同上 |
| `tests/unit/step/review-exit-contract.test.ts` | 同上 |
| `tests/unit/adapter/agent-runner-port.test.ts` | 同上 |
| `tests/unit/remove-session-timeout.test.ts` | 同上 |
| `tests/unit/pipeline/transition-when.test.ts` | 同上 |
| `tests/unit/core/pipeline/pipeline.transitions.test.ts` | 同上 |
| `tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts` | 同上 |
| `tests/unit/core/pipeline/pipeline.cli-step-output.test.ts` | 同上 |
| `tests/core/pipeline/pipeline.test.ts` | 同上 |
| `tests/core/step/step-interface.test.ts` | 同上 |
| `tests/error-codes.test.ts` | 同上 |
| `tests/cli-stdout-snapshot.test.ts` | 同上 |
| `tests/multi-layer-defense.test.ts` | `defaultStoreFactory` import 削除（既に `makeStoreFactory` 使用） |
| `tests/global-setup.ts` | 新規: prod path 書き込み検出の globalSetup |
| `vitest.config.ts` | `globalSetup` を追加 |
| `.specrunner/jobs/` | test 由来の 46 fixture file を削除（git rm） |

## Not Changed

| File | Reason |
|------|--------|
| `src/store/job-state-store.ts` | prod code に test 知識を入れない |
| `src/util/xdg.ts` | 変更不要 |
| `specrunner/specs/job-state-store/spec.md` | spec 影響なし (D5) |
