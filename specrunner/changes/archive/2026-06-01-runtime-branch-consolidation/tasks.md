# Tasks: config.runtime 分岐を createRuntime / RuntimeStrategy に集約する（B-8）

## T-01: RuntimeStrategy interface に step artifact lifecycle メソッドを追加

- [x] `src/core/runtime/strategy.ts` の `RuntimeStrategy` interface に以下 3 メソッドを追加:
  - `captureHeadSha(cwd: string): Promise<string | null>` — agent 実行前の HEAD SHA 取得（local: `gitExec rev-parse HEAD`, managed: `null`）
  - `prepareStepArtifacts(cwd: string, slug: string, stepName: string, state: JobState): Promise<void>` — output テンプレート配置（local: `writeOutputTemplates()`, managed: no-op）
  - `finalizeStepArtifacts(step: AgentStep, state: JobState, deps: PipelineDeps, headBeforeStep: string | null, commitPushInfra: CommitPushInfra): Promise<void>` — テンプレート cleanup + commit & push（local: `cleanupOutputTemplates()` → `commitAndPush()`, managed: no-op）
- [x] 必要な import を追加（`JobState`, `AgentStep`, `PipelineDeps`, `CommitPushInfra`）

**Acceptance Criteria**:
- `RuntimeStrategy` interface に 3 メソッドが定義されている
- 型チェック（`bun run typecheck`）で interface 未実装エラーが出る（T-02 で実装）

## T-02: LocalRuntime / ManagedRuntime に新メソッドを実装

- [x] `src/core/runtime/local.ts` の `LocalRuntime` に 3 メソッドを実装:
  - `captureHeadSha`: `gitExec(spawnFn, cwd, ["rev-parse", "HEAD"])` を呼んで返す。spawnFn は constructor で受け取り済み（ただし現在 `SpawnFn` は `util/spawn.ts` 由来。executor が使う `SpawnFn` は `util/git-exec.ts` 由来。型互換を確認）
  - `prepareStepArtifacts`: `writeOutputTemplates(cwd, slug, stepName, state)` を呼ぶ
  - `finalizeStepArtifacts`: `cleanupOutputTemplates(cwd, slug, step.name, state)` → `commitAndPush(step, state, deps, headBeforeStep, commitPushInfra)` を呼ぶ。`commitAndPush` のエラーハンドリング（state 記録 + rethrow）は executor から移植する
- [x] `src/core/runtime/managed.ts` の `ManagedRuntime` に 3 メソッドを no-op で実装:
  - `captureHeadSha`: `return null`
  - `prepareStepArtifacts`: `return`（no-op）
  - `finalizeStepArtifacts`: `return`（no-op）
- [x] 必要な import を追加（`writeOutputTemplates`, `cleanupOutputTemplates`, `commitAndPush`, `CommitPushInfra`, `gitExec` 等）

**Acceptance Criteria**:
- `bun run typecheck` が green（interface 未実装エラー解消）
- LocalRuntime の実装が executor.ts の既存ロジックと同等である

## T-03: PipelineDeps に runtimeStrategy を追加し buildDeps で注入

- [x] `src/core/types.ts` の `PipelineDeps` に `runtimeStrategy?: RuntimeStrategy` フィールドを追加（optional にして後方互換維持）
- [x] `src/core/runtime/local.ts` の `LocalRuntime.buildDeps()` で `runtimeStrategy: this` を返す
- [x] `src/core/runtime/managed.ts` の `ManagedRuntime.buildDeps()` で `runtimeStrategy: this` を返す

**Acceptance Criteria**:
- `PipelineDeps` に `runtimeStrategy` フィールドが存在する
- `buildDeps` が `runtimeStrategy` を注入している
- `bun run typecheck` が green

## T-04: executor.ts から config.runtime 分岐を除去し strategy 委譲に置き換え

- [x] `runAgentStep` の L203–205（headBeforeStep 取得）を `deps.runtimeStrategy?.captureHeadSha(cwd) ?? null` に置き換え
- [x] `runAgentStep` の L208–210（writeOutputTemplates）を `deps.runtimeStrategy?.prepareStepArtifacts(cwd, deps.slug, step.name, state)` に置き換え（`await` 必須）
- [x] `runAgentStep` の L287–289（cleanupOutputTemplates）と L295–311（commitAndPush + エラーハンドリング）を `deps.runtimeStrategy?.finalizeStepArtifacts(step, state, deps, headBeforeStep, this.commitPushInfra)` に置き換え
- [x] executor.ts から `import { gitExec, ... }` のうち `gitExec` の import を削除（使われなくなる場合）
- [x] `deps.config.runtime` への参照が executor.ts に残っていないことを `grep` で確認

**Acceptance Criteria**:
- `src/core/step/executor.ts` に `config.runtime` / `cfg.runtime` の分岐が 0 件
- `bun run typecheck` が green
- `bun run test` で executor 関連テストが green

## T-05: preflight.ts の runtime 分岐を core/runtime/ に移動

- [x] `src/core/runtime/prereqs.ts` を新規作成:
  - `checkRuntimePrereqs(cfg, env)` を `src/core/preflight.ts` からそのまま移動（ロジック変更なし）
  - `resolveRuntimeCredentials(config, env)` を新設: `config.runtime === "managed"` の分岐で API key を解決し `{ specRunnerApiKey?, specRunnerApiKeySource? }` を返す。non-managed は `{}` を返す
- [x] `src/core/preflight.ts` を修正:
  - `checkRuntimePrereqs` の import 先を `../core/runtime/prereqs.js` に変更
  - L133–146 の `if (config.runtime === "managed")` ブロックを `resolveRuntimeCredentials(config, env)` 呼び出しに置き換え
- [x] `src/core/runtime/index.ts` のバレルに `prereqs.ts` のエクスポートを追加
- [x] `preflight.ts` に `config.runtime` / `cfg.runtime` の分岐が残っていないことを `grep` で確認

**Acceptance Criteria**:
- `src/core/preflight.ts` に `config.runtime` / `cfg.runtime` の分岐が 0 件
- `checkRuntimePrereqs` と API key 解決ロジックが `src/core/runtime/prereqs.ts` に存在する
- `bun run typecheck` が green
- `bun run test` で preflight 関連テストが green

## T-06: arch-allowlist.ts から B-8 エントリを全件削除

- [x] `tests/unit/architecture/arch-allowlist.ts` から `invariant: "B-8"` の 4 エントリを削除:
  - `B8-preflight-checkRuntimePrereqs`（2 件: `cfg.runtime ?? "local"`, `cfg.runtime === "managed"`）
  - `B8-preflight`（1 件: `config.runtime === "managed"`）
  - `B8-executor`（1 件: `deps.config.runtime === "local"`）
- [x] コメントブロック `// ── B-8: config.runtime branching ...` も削除
- [x] T-04 suppression-demo test に B-8 用のテストがないことを確認（request.md 要件 4 の no-op 確認）

**Acceptance Criteria**:
- `arch-allowlist.ts` に `invariant: "B-8"` のエントリが 0 件
- `bun run test -- tests/unit/architecture/core-invariants.test.ts` が green（B-8 enforcement がパス）
- T-04 の suppression-demo テストが影響を受けない（B-6 demo のみ）

## T-07: delta spec 作成（runtime-selection / step-execution-architecture）

- [x] `specrunner/changes/runtime-branch-consolidation/specs/runtime-selection/spec.md` を作成:
  - baseline の「StepExecutor が runtime 値を読まない」scenario は既存で満たされる（変更不要）
  - 新規要件: RuntimeStrategy が step artifact lifecycle メソッドを提供すること
- [x] `specrunner/changes/runtime-branch-consolidation/specs/step-execution-architecture/spec.md` を作成:
  - 既存要件「StepExecutor Manages Lifecycle and Emits Events」に対する修正: executor は `runtimeStrategy` 経由で artifact lifecycle を委譲する旨を追記

**Acceptance Criteria**:
- delta spec ファイルが規定パスに存在する
- 各 delta spec が MUST/SHALL normative keyword を含む
- 各 requirement に Scenario が 1 つ以上ある

## T-08: 全体検証

- [x] `bun run build && bun run typecheck && bun run lint && bun run test` が green
- [x] `src/core/`（`src/core/runtime/` 除外）に `config.runtime` / `cfg.runtime` の参照が 0 件であることを `grep` で確認
- [x] `arch-allowlist.ts` に B-8 エントリが 0 件であることを確認

**Acceptance Criteria**:
- プロジェクト標準 verification が全 green
- B-8 arch test が allowlist なしで green
- local / managed runtime の既存テストが全 green
