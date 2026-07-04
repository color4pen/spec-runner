# Tasks: reject-duplicate-slug-run

## T-01: `DUPLICATE_LIVE_JOB` エラーコードと factory を追加

`src/errors.ts` を修正する。

- [x] `ERROR_CODES` に `DUPLICATE_LIVE_JOB: "DUPLICATE_LIVE_JOB"` を追加する
- [x] `EXIT_CODE_MAP` に `DUPLICATE_LIVE_JOB: EXIT_CODE.ARG_ERROR` を追加する
  （ユーザーが先行 job を解消してから再実行すべき前提エラー。既存 `WORKTREE_GUARD` と同じ扱い）
- [x] factory 関数 `duplicateLiveJobError(slug: string, priorJobId: string | null): SpecRunnerError` を追加する:
  - `priorJobId` が非 null のとき:
    - `hint`: `A live job (<priorJobId>) is already running for slug '<slug>'. Cancel it with 'specrunner job cancel <priorJobId>', or wait for it to finish before re-running.`
    - `message`: `Refusing to start a duplicate run: slug '<slug>' already has a live job (<priorJobId>).`
  - `priorJobId` が null のとき（sidecar に live pid はあるが jobId 欠如の縁ケース）:
    - `hint`: `A live job is already running for slug '<slug>'. Cancel it with 'specrunner job cancel <jobId>' (see 'specrunner job list'), or wait for it to finish before re-running.`
    - `message`: `Refusing to start a duplicate run: slug '<slug>' already has a live job.`

**Acceptance Criteria**:
- `duplicateLiveJobError("foo", "abcd1234")` が `code === "DUPLICATE_LIVE_JOB"`、`exitCode === 2` を返す
- 返る `hint` に `specrunner job cancel abcd1234` と待機（wait / re-running）が含まれる
- `message` に slug と先行 jobId が含まれる
- typecheck / lint / build がエラーなしで通る

---

## T-02: duplicate-slug ガードのピュア helper を新規作成

`src/core/runtime/duplicate-slug-guard.ts` を新規作成する。

- [x] 次のシグネチャの関数を実装する:
  ```
  export interface DuplicateLiveJobDeps {
    readFile?: (absPath: string) => Promise<string>;
    isAlive?: (pid: number) => boolean;
  }
  export async function checkDuplicateLiveJob(
    repoRoot: string,
    slug: string,
    deps?: DuplicateLiveJobDeps,
  ): Promise<void>
  ```
- [x] 既定 deps: `readFile` は `fs.readFile(p, "utf-8")`（`node:fs/promises`）、`isAlive` は
  `isProcessAlive`（`src/core/resume/safety.ts` から import）
- [x] sidecar パスは `path.join(repoRoot, livenessJsonPath(slug))`（`livenessJsonPath` は `src/util/paths.ts`）
- [x] 判定ロジック（D4）:
  1. `readFile` が throw（不在 / 読み取り不能） → `return`（許容）
  2. `JSON.parse` が throw（破損） → `return`（許容）
  3. `pid` が `typeof === "number"` でない → `return`（許容）
  4. `isAlive(pid)` が偽（stale） → `return`（許容）
  5. `isAlive(pid)` が真（live） → `jobId`（`typeof === "string"` なら採用、なければ null）を取り、
     `throw duplicateLiveJobError(slug, jobId)`
- [x] `src/store/local-job-index.ts` / `src/core/command/resume.ts:230` と同じ sidecar スキーマ
  （`{ pid, session, worktreePath, jobId }`）を前提に、`data` は `Record<string, unknown>` で読む
- [x] 本ファイルの import は `node:fs/promises` / `node:path` / `src/util/paths.ts` /
  `src/core/resume/safety.ts` / `src/errors.ts` に限定する（新規 pid 判定ロジックを書かない = 要件 3）

**Acceptance Criteria**:
- 新規 pid 生存判定を実装せず `isProcessAlive` を再利用している
- typecheck / lint / build がエラーなしで通る

---

## T-03: `RuntimeStrategy` port に seam を追加

`src/core/port/runtime-strategy.ts` を修正する。

- [x] `RuntimeStrategy` インターフェースに **optional** メソッドを追加する:
  ```
  /**
   * Reject a second run while a live job already holds this slug (local runtime only).
   * Called by PipelineRunCommand.prepare() immediately before bootstrapJob so a rejected
   * run creates no job state.
   * - local:   read liveness sidecar; if pid is alive → throw DUPLICATE_LIVE_JOB.
   * - managed: no-op (out of scope for this change).
   * Optional on the port so RuntimeStrategy-typed test fakes may omit it; RealRuntimeStrategy
   * requires it (mirrors canDeriveChangedFiles).
   */
  assertNoDuplicateLiveJob?(repoRoot: string, slug: string): Promise<void>;
  ```
- [x] `RealRuntimeStrategy` 交差型を更新し、本メソッドを **required** にする
  （既存 `canDeriveChangedFiles(): boolean` と同じ形で `& { assertNoDuplicateLiveJob(repoRoot: string, slug: string): Promise<void> }` を追加、
  または交差の右辺に列挙）

**Acceptance Criteria**:
- `RuntimeStrategy` として型付けされた既存テスト fake（本メソッド未実装）が引き続きコンパイルできる
- `RealRuntimeStrategy` を実装するクラスで本メソッドが未実装だとコンパイルエラーになる
- typecheck がエラーなしで通る

---

## T-04: `LocalRuntime` に seam を実装

`src/core/runtime/local.ts` を修正する。

- [x] `duplicate-slug-guard.ts` から `checkDuplicateLiveJob` を import する
- [x] メソッドを追加する（`canDeriveChangedFiles` 付近に配置）:
  ```
  async assertNoDuplicateLiveJob(repoRoot: string, slug: string): Promise<void> {
    await checkDuplicateLiveJob(repoRoot, slug);
  }
  ```
  （既定 deps = 実 fs + `isProcessAlive` を使う薄いラッパ）

**Acceptance Criteria**:
- `LocalRuntime` が `RealRuntimeStrategy` を満たしてコンパイルできる
- typecheck / lint / build がエラーなしで通る

---

## T-05: `ManagedRuntime` に no-op seam を実装

`src/core/runtime/managed.ts` を修正する。

- [x] メソッドを追加する（`canDeriveChangedFiles` 付近に配置）:
  ```
  /** Out of scope for the duplicate-live-job guard (managed uses marker.json). No-op. */
  async assertNoDuplicateLiveJob(_repoRoot: string, _slug: string): Promise<void> {
    // no-op
  }
  ```

**Acceptance Criteria**:
- `ManagedRuntime` が `RealRuntimeStrategy` を満たしてコンパイルできる
- managed 経路の既存挙動は不変
- typecheck / lint / build がエラーなしで通る

---

## T-06: `prepare()` の call-site にガードを差し込む

`src/core/command/pipeline-run.ts` を修正する。

- [x] `bootstrapJob`（現 122 行目の `await this.runtime.bootstrapJob(...)`）の**直前**に、
  optional-call でガードを差し込む:
  ```
  // Reject a second run while a live job already holds this slug. Placed before
  // bootstrapJob so a rejected run creates no job state. Optional on the port
  // (test fakes may omit it); real runtimes always implement it.
  await this.runtime.assertNoDuplicateLiveJob?.(cwd, slug);
  ```
  - `cwd` は既存の `const cwd = this.options.cwd ?? process.cwd();`（現 79 行目）を使う
  - `slug` は既存の `const slug = request.slug;`（現 66 行目）を使う（sidecar / workspace と同じ slug）
- [x] ガードが throw した場合、`bootstrapJob` 以降に到達しないこと（state 未生成）を担保する
  （単に `bootstrapJob` の前に置くだけで満たされる）

**Acceptance Criteria**:
- ガードが throw すると `bootstrapJob` が呼ばれない
- ガードが resolve すると従来通り `bootstrapJob` が呼ばれる
- typecheck / lint / build がエラーなしで通る

---

## T-07: helper のユニットテストを新規作成

`tests/unit/core/runtime/duplicate-slug-guard.test.ts` を新規作成する。

- [x] `checkDuplicateLiveJob` を直接 import し、`deps` に `readFile` / `isAlive` を注入して決定的にテストする
  （実 fs / 実プロセスに依存しない）

実装するテストケース:

**TC-01: live pid → 拒否**
- Given: `readFile` が `{"pid":4242,"jobId":"job-A","worktreePath":"/wt","session":null}` を返す、`isAlive: () => true`
- When: `checkDuplicateLiveJob(repoRoot, "S", deps)` を呼ぶ
- Then: `DUPLICATE_LIVE_JOB` の `SpecRunnerError` が throw される
- Then: エラーの `message` / `hint` に先行 jobId `job-A` と `specrunner job cancel job-A`（cancel）と待機の対処が含まれる

**TC-02: dead pid → 許容**
- Given: 同じ sidecar 内容、`isAlive: () => false`
- When: `checkDuplicateLiveJob` を呼ぶ
- Then: throw せず resolve する

**TC-03: sidecar 不在 → 許容**
- Given: `readFile` が ENOENT 相当で reject する
- When: `checkDuplicateLiveJob` を呼ぶ
- Then: throw せず resolve する（`isAlive` は呼ばれない）

**TC-04: JSON 破損 → 許容**
- Given: `readFile` が `"{ not json"` を返す
- Then: throw せず resolve する

**TC-05: pid 欠如 → 許容**
- Given: `readFile` が `{"jobId":"job-A"}`（pid なし）を返す、`isAlive: () => true`
- Then: throw せず resolve する（pid が number でないため live 判定に進まない）

**TC-06: live pid だが jobId 欠如 → 拒否（jobId は null 経路）**
- Given: `readFile` が `{"pid":4242}` を返す、`isAlive: () => true`
- Then: `DUPLICATE_LIVE_JOB` が throw され、`hint` に `specrunner job list` の案内が含まれる

**Acceptance Criteria**:
- 全 6 ケースが vitest で green
- `isAlive` 注入により pid 生存の live/dead を実プロセスなしで決定的に検証している
- typecheck / lint / build がエラーなしで通る

---

## T-08: call-site 結合テストを新規作成

`tests/unit/core/command/pipeline-run-duplicate-guard.test.ts` を新規作成する
（既存 `pipeline-run-gate.test.ts` の fake runtime / `TestablePipelineRunCommand` パターンを踏襲）。

- [x] `loadReviewerDefinitions` を `vi.mock` で `[]` に固定する（gate test と同じ）
- [x] fake runtime に `assertNoDuplicateLiveJob` を含め、テストごとに throw / resolve を切り替える
- [x] `bootstrapJob` を spy にして呼び出し有無を検証する

実装するテストケース:

**TC-GUARD-01: ガードが throw → prepare() が reject、bootstrapJob 未呼び出し**
- Given: fake runtime の `assertNoDuplicateLiveJob` が `duplicateLiveJobError("test-slug", "job-A")` を throw する
- When: `command.testPrepare()` を呼ぶ
- Then: `DUPLICATE_LIVE_JOB` エラーで reject する
- Then: `runtime.bootstrapJob` が呼ばれていない（job state 未生成）

**TC-GUARD-02: ガードが resolve → prepare() 成功、bootstrapJob 呼び出し**
- Given: fake runtime の `assertNoDuplicateLiveJob` が resolve する
- When: `command.testPrepare()` を呼ぶ
- Then: prepare() が成功し `runtime.bootstrapJob` が 1 回呼ばれる

**TC-GUARD-03: エラーメッセージ内容の固定**
- Given: `assertNoDuplicateLiveJob` が `duplicateLiveJobError("test-slug", "job-A")` を throw する
- When: `command.testPrepare()` の reject を捕捉する
- Then: `SpecRunnerError` で `code === "DUPLICATE_LIVE_JOB"`
- Then: `hint` に先行 jobId `job-A` と `specrunner job cancel job-A`、待機の対処が含まれる

**Acceptance Criteria**:
- 全 3 ケースが vitest で green
- 既存 `pipeline-run-gate.test.ts`（`assertNoDuplicateLiveJob` を持たない fake runtime）が無変更で green のまま
  （optional-on-port + `?.` 呼び出しにより発火しないこと）
- typecheck / lint / build がエラーなしで通る

---

## T-09: `LocalRuntime` 経路の結合テストを新規作成

`tests/unit/core/runtime/local-duplicate-guard.test.ts` を新規作成する（実 fs 経由の配線確認）。

- [x] temp dir を `repoRoot` として使い、`.specrunner/local/<slug>/liveness.json` を実ファイルで用意する
- [x] `LocalRuntime.assertNoDuplicateLiveJob(repoRoot, slug)` を直接呼ぶ

実装するテストケース:

**TC-LR-01: live pid（`process.pid`）→ 拒否**
- Given: liveness.json に `{"pid": <process.pid>, "jobId":"job-A", ...}` を書く（`process.pid` は必ず生存）
- When: `assertNoDuplicateLiveJob(repoRoot, slug)` を呼ぶ
- Then: `DUPLICATE_LIVE_JOB` が throw され、`job-A` が含まれる

**TC-LR-02: sidecar 不在 → 許容**
- Given: `.specrunner/local/<slug>/liveness.json` が存在しない
- When: `assertNoDuplicateLiveJob(repoRoot, slug)` を呼ぶ
- Then: throw せず resolve する

（pid が present で dead の分岐は T-07 の `isAlive` 注入テストで決定的に固定済みのため、
実プロセス依存の flaky を避けて本結合テストでは配線確認に留める）

**Acceptance Criteria**:
- 全 2 ケースが vitest で green
- typecheck / lint / build がエラーなしで通る

---

## T-10: 回帰確認（既存挙動の不変）

- [x] `RealRuntimeStrategy` の実 implementer が `LocalRuntime` / `ManagedRuntime` の 2 つのみであることを
  確認し（`grep -rn "implements RealRuntimeStrategy" src/`）、両方に seam が実装されていることを担保する
- [x] 既存の cancel / resume / inbox 関連テストが無変更で green であることを確認する
- [x] `bun run typecheck && bun run test` が green であることを確認する

**Acceptance Criteria**:
- 既存 cancel / resume / inbox の挙動が不変（該当既存テストが無変更で green）
- `typecheck && test` が green
