# Tasks: test-isolation-guard

## [x] Task 1: `defaultStoreFactory` を削除

**File**: `tests/helpers/store-factory.ts`

1. `defaultStoreFactory` の定義と JSDoc コメント（L19-23）を削除
2. `makeStoreFactory` のみ export する状態にする

**Verification**: `bun run typecheck` — `defaultStoreFactory` を import している 14 test file で compile error が出る（Task 2-4 で解消）。

## [x] Task 2: unit test の `defaultStoreFactory` → `makeStoreFactory(tempDir)` 移行（StepExecutor 直接構築系）

以下の test file は `new StepExecutor(events, runner, defaultStoreFactory, ...)` のように positional arg で `defaultStoreFactory` を渡している。`tempDir` を `beforeEach` で作成し `afterEach` で削除するパターンを追加し、全箇所を `makeStoreFactory(tempDir)` に置換する。

### 2a: `tests/unit/step/commit-and-push.test.ts`

1. import を `{ makeStoreFactory }` に変更（`defaultStoreFactory` を削除）
2. `let tempDir: string;` を describe block 先頭に追加
3. `beforeEach` に `tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commit-push-test-"));` を追加
4. `afterEach` に `await fs.rm(tempDir, { recursive: true, force: true });` を追加
5. 必要な import（`fs`, `path`, `os`）を追加
6. `defaultStoreFactory` の全出現（約 12 箇所）を `makeStoreFactory(tempDir)` に置換
7. `makeDeps` ヘルパー内の `storeFactory: overrides.storeFactory ?? (defaultStoreFactory)` も同様に置換

### 2b: `tests/unit/step/executor.commit.test.ts`

1. 2a と同じパターンで移行
2. `defaultStoreFactory` の全出現（約 16 箇所）を `makeStoreFactory(tempDir)` に置換

### 2c: `tests/unit/step/review-exit-contract.test.ts`

1. 2a と同じパターンで移行
2. `defaultStoreFactory` の全出現（約 6 箇所）を `makeStoreFactory(tempDir)` に置換
3. `makeExecutor` ヘルパーと `makeDeps` ヘルパー内の使用箇所を含む

### 2d: `tests/unit/adapter/agent-runner-port.test.ts`

1. 2a と同じパターンで移行
2. `defaultStoreFactory` の全出現（約 8 箇所）を `makeStoreFactory(tempDir)` に置換
3. `makeDeps` ヘルパー内の使用箇所を含む

### 2e: `tests/unit/remove-session-timeout.test.ts`

1. 2a と同じパターンで移行
2. `defaultStoreFactory` の全出現（約 1 箇所）を `makeStoreFactory(tempDir)` に置換

**Verification**: `bun run typecheck` — 上記 5 file の compile error が解消。

## [x] Task 3: unit test の `defaultStoreFactory` → `makeStoreFactory(tempDir)` 移行（PipelineDeps 系）

以下の test file は `storeFactory: defaultStoreFactory` として `PipelineDeps` に渡している。

### 3a: `tests/unit/pipeline/transition-when.test.ts`

1. import を `{ makeStoreFactory }` に変更
2. `let tempDir: string;` + `beforeEach`/`afterEach` パターン追加
3. `storeFactory: defaultStoreFactory` → `storeFactory: makeStoreFactory(tempDir)` に置換

### 3b: `tests/unit/core/pipeline/pipeline.transitions.test.ts`

1. 3a と同じパターンで移行

### 3c: `tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts`

1. 3a と同じパターンで移行

### 3d: `tests/unit/core/pipeline/pipeline.cli-step-output.test.ts`

1. 3a と同じパターンで移行

### 3e: `tests/core/pipeline/pipeline.test.ts`

1. 3a と同じパターンで移行

### 3f: `tests/core/step/step-interface.test.ts`

1. import を `{ makeStoreFactory }` に変更
2. `tempDir` パターン追加
3. `storeFactory: defaultStoreFactory` → `storeFactory: makeStoreFactory(tempDir)` に置換
4. `new StepExecutor(events, runner, defaultStoreFactory)` の箇所（2 箇所）も `makeStoreFactory(tempDir)` に置換

### 3g: `tests/error-codes.test.ts`

1. import を `{ makeStoreFactory }` に変更
2. 既に `tempDir` があるのでそれを使用（`beforeEach` で `mkdtemp` 済み）
3. `storeFactory: defaultStoreFactory` → `storeFactory: makeStoreFactory(tempDir)` に置換

### 3h: `tests/cli-stdout-snapshot.test.ts`

1. import を `{ makeStoreFactory }` に変更
2. 既に `tempDir` があるのでそれを使用
3. `storeFactory: defaultStoreFactory` → `storeFactory: makeStoreFactory(tempDir)` に置換

### 3i: `tests/multi-layer-defense.test.ts`

1. import から `defaultStoreFactory` を削除（`makeStoreFactory` のみ残す）
2. `defaultStoreFactory` の使用箇所がないことを確認（既に `makeStoreFactory(tempDir)` を使用）

**Verification**: `bun run typecheck` — green。

## [x] Task 4: globalSetup で prod path 書き込み検出を追加

### 4a: `tests/global-setup.ts` を新規作成

```ts
import * as fs from "node:fs/promises";
import * as path from "node:path";

const JOBS_DIR = path.join(process.cwd(), ".specrunner", "jobs");
let snapshotBefore: Set<string>;

export async function setup() {
  try {
    const entries = await fs.readdir(JOBS_DIR);
    snapshotBefore = new Set(entries);
  } catch {
    snapshotBefore = new Set();
  }
}

export async function teardown() {
  try {
    const entries = await fs.readdir(JOBS_DIR);
    const newFiles = entries.filter((e) => !snapshotBefore.has(e));
    if (newFiles.length > 0) {
      throw new Error(
        `Test pollution detected: ${newFiles.length} new file(s) in .specrunner/jobs/:\n` +
        newFiles.map((f) => `  - ${f}`).join("\n") +
        "\n\nTests must use makeStoreFactory(tempDir), not write to the repo's .specrunner/jobs/."
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Test pollution detected")) {
      throw err;
    }
    // ENOENT is fine — jobs dir was removed or never existed
  }
}
```

### 4b: `vitest.config.ts` に globalSetup を追加

`test` object に `globalSetup: "./tests/global-setup.ts"` を追加:

```ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    pool: "forks",
    globalSetup: "./tests/global-setup.ts",
  },
});
```

**Verification**: `bun run test` — green。意図的に `makeStoreFactory(process.cwd())` を使う test を一時的に書いて globalSetup が検出することを手動確認。

## [x] Task 5: test 由来 fixture の削除

`.specrunner/jobs/` から非 UUID 形式のファイルを `git rm` で削除する。

対象ファイル一覧（46 件）:

```
.specrunner/jobs/err-code-test-job.json
.specrunner/jobs/stdout-snapshot-job.json
.specrunner/jobs/tc-auth-01-job.json
.specrunner/jobs/tc-auth-02-job.json
.specrunner/jobs/tc-auth-03-job.json
.specrunner/jobs/tc-auth-04-job.json
.specrunner/jobs/tc-auth-05-job.json
.specrunner/jobs/tc-auth-06-job.json
.specrunner/jobs/tc-cap-001-job.json
.specrunner/jobs/tc-cap-002-job.json
.specrunner/jobs/tc-cap-003-job.json
.specrunner/jobs/tc-cap-004-job.json
.specrunner/jobs/tc-cap-005-job.json
.specrunner/jobs/tc-cap-006-job.json
.specrunner/jobs/tc-cap-007-job.json
.specrunner/jobs/tc-cap-008-job.json
.specrunner/jobs/tc-cap-009-job.json
.specrunner/jobs/tc-cap-new-001-job.json
.specrunner/jobs/tc-cap-new-002-job.json
.specrunner/jobs/tc-cap-new-003-job.json
.specrunner/jobs/tc-cap-new-004-job.json
.specrunner/jobs/tc-cap-new-005-job.json
.specrunner/jobs/tc-cap-new-006-job.json
.specrunner/jobs/tc-cap-new-007-job.json
.specrunner/jobs/tc-cap-new-008-job.json
.specrunner/jobs/tc003-job.json
.specrunner/jobs/tc006-job.json
.specrunner/jobs/tc008-job.json
.specrunner/jobs/tc009-job.json
.specrunner/jobs/tc010-job.json
.specrunner/jobs/tc011-job-0.json
.specrunner/jobs/tc011-job-1.json
.specrunner/jobs/tc012-job-0.json
.specrunner/jobs/tc012-job-1.json
.specrunner/jobs/tc012-job.json
.specrunner/jobs/tc013-job.json
.specrunner/jobs/tc014-job.json
.specrunner/jobs/tcerror-job.json
.specrunner/jobs/tctimeout-job.json
.specrunner/jobs/test-cli-step-output-job.json
.specrunner/jobs/test-code-review-loop-guard.json
.specrunner/jobs/test-escalate-resume.json
.specrunner/jobs/test-exhausted-resume.json
.specrunner/jobs/test-fatal-error.json
.specrunner/jobs/test-loop-guard.json
.specrunner/jobs/test-loop-iter-stdout-job.json
.specrunner/jobs/test-pipeline-job.json
```

**識別基準**: UUID v4 パターン (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/`) に一致しないファイル = test 由来。

**Verification**: `ls .specrunner/jobs/` で UUID 形式のファイルのみ残っていることを確認。`bun run test` — green（test は tempDir に書くので prod path のファイル不在に影響されない）。

## [x] Task 6: 最終検証

1. `bun run typecheck` — green
2. `bun run test` — green
3. `grep -rn "defaultStoreFactory" tests/` — 0 matches
4. `ls .specrunner/jobs/` — UUID 形式のファイルのみ
