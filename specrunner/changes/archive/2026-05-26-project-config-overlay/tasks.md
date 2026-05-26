## Phase 1: Schema / Type 拡張

### Task 1: StepExecutionConfig に byRequestType を追加

- [x] `src/config/schema.ts`: `StepExecutionConfig` に `byRequestType?: Record<string, StepExecutionConfig>` を追加
- [x] `StepExecutionConfig` の JSDoc に byRequestType の意味を記載（1 階層のみ、ネスト禁止）

### Task 2: AgentRunContext に requestType を追加

- [x] `src/core/port/agent-runner.ts`: `AgentRunContext` に `requestType?: string` を追加
- [x] JSDoc に用途（step config resolution の type 別切替）を記載

## Phase 2: Config Load の 2 層化

### Task 3: deep merge 関数の実装

- [x] `src/config/merge.ts` を新規作成
- [x] `deepMergeConfig(base: SpecRunnerConfig, overlay: Partial<SpecRunnerConfig>): SpecRunnerConfig` を実装
- [x] マージルール: object は再帰 merge、primitive は overlay 優先、undefined は base 維持、null は上書き
- [x] `tests/config/merge.test.ts` を新規作成: nested object merge / primitive override / null override / undefined skip / steps overlay の各ケース

**Dep**: なし

### Task 4: loadConfig の拡張 — project local overlay 対応

- [x] `src/config/store.ts`: `loadConfig(repoRoot?: string)` にシグネチャ変更
- [x] project local config パス: `${repoRoot}/.specrunner/config.json`
- [x] Load ロジック:
  - `repoRoot` 指定あり + project local 存在 + user global 存在 → 各自 migration + validate 後に deepMergeConfig
  - `repoRoot` 指定あり + project local 存在 + user global なし → project local を standalone config として validate（部分 config なら CONFIG_INVALID）
  - `repoRoot` 指定あり + project local なし → user global のみ（既存挙動）
  - `repoRoot` なし → user global のみ（既存挙動）
- [x] project local config の JSON parse error は CONFIG_INVALID（user global と同じエラー処理）
- [x] `tests/config/store.test.ts` に overlay ケースを追加: both / project-only / global-only / neither / parse error

**Dep**: Task 3

### Task 5: saveProjectConfig の追加（将来用）

- [x] `src/config/store.ts` に `saveProjectConfig(repoRoot: string, cfg: Partial<SpecRunnerConfig>): Promise<void>` を追加
- [x] atomic write + 0600 permission（saveConfig と同じパターン）
- [x] 本 request では CLI command からの呼び出しは実装しない（関数定義のみ）

**Dep**: なし

## Phase 3: Resolution Chain の拡張

### Task 6: getStepExecutionConfig を 6 レベルに拡張

- [x] `src/config/step-config.ts`: `getStepExecutionConfig()` に第 4 引数 `requestType?: string` を追加
- [x] Resolution chain:
  1. `config.steps.<step>.byRequestType.<type>.<field>`
  2. `config.steps.<step>.<field>`
  3. `config.steps.defaults.byRequestType.<type>.<field>`
  4. `config.steps.defaults.<field>`
  5. `stepDefaults.<field>`
  6. SDK fallback
- [x] `requestType` が undefined の場合、level 1 と 3 をスキップ（既存 4 レベルと同等）
- [x] `tests/config/step-config.test.ts` にテスト追加:
  - type 別 step level が最優先
  - step level が type 別 default より優先
  - type 別 default が global default より優先
  - requestType undefined で既存挙動維持
  - byRequestType 内の null が有効値として扱われる

**Dep**: Task 1

### Task 7: adapter への requestType 伝搬

- [x] `src/core/step/executor.ts`: `runAgentStep` で ctx 構築時に `requestType: deps.request.type` を追加
- [x] `src/adapter/claude-code/agent-runner.ts`: `getStepExecutionConfig()` 呼び出しに `ctx.requestType` を渡す
- [x] `src/adapter/managed-agent/agent-runner.ts`: 同様に `ctx.requestType` を渡す（managed runtime では効果なしだが resolution 自体は通す）
- [x] `src/adapter/dispatching/agent-runner.ts`: ctx をそのまま委譲しているため変更不要を確認
- [x] `src/adapter/claude-code/query-one-shot.ts`: `getStepExecutionConfig` を呼んでいる場合は requestType 対応

**Dep**: Task 2, Task 6

## Phase 4: Validation 拡張

### Task 8: validateConfig の byRequestType 対応

- [x] `src/config/schema.ts`: `validateConfig()` に byRequestType の validation を追加:
  - `byRequestType` が object でなければ CONFIG_INVALID
  - 各 key の validation: 空文字列 → CONFIG_INVALID
  - 既知 type 集合（`bug-fix`, `spec-change`, `new-feature`, `refactoring`, `chore`）外の key → warning ログ（reject しない）
  - 各 value を StepExecutionConfig として validate（model / maxTurns / timeoutMs の既存 validation と同じ）
  - value 内にネストした `byRequestType` があれば CONFIG_INVALID（1 階層制限）
  - model registry check（既存のモデル存在検証 + managed+openai guard）を byRequestType 内の model にも適用
- [x] error message に完全 key path を含める（例: `CONFIG_INVALID: steps.code-review.byRequestType.spec-change.model must be a non-empty string`）
- [x] `tests/config/schema.test.ts` にテスト追加:
  - byRequestType 内の valid config が通過
  - 空文字列 key で CONFIG_INVALID
  - byRequestType 内の model 空文字列で CONFIG_INVALID（path 付き error message）
  - ネストした byRequestType で CONFIG_INVALID
  - 未知 type key が warning のみで通過
  - byRequestType 内の maxTurns / timeoutMs validation

**Dep**: Task 1

### Task 9: CLI entry の config load タイミング audit

- [x] 全 CLI command の config load タイミングを確認:
  - `run.ts`: `runPreflight()` → OK（起動直後）
  - `resume.ts`: `bootstrap()` → OK（起動直後）
  - `bootstrap.ts`: `loadConfig()` → OK
  - `init.ts`: best-effort → OK（init は config 作成が目的）
  - `doctor.ts`: best-effort → OK（診断目的）
  - `login.ts`: `loadConfig()` → OK
  - `managed.ts`: `loadConfig()` → OK
  - `command-registry.ts`: `request generate` / `request review` → best-effort → OK
  - `finish.ts`: config load なし → **要確認**: finish で config 参照が必要か audit
  - `ps.ts`: config load なし → OK（job state 表示のみ）
  - `cancel.ts`: config load なし → OK
- [x] repoRoot を渡す必要がある command の呼び出しを `loadConfig(repoRoot)` に変更:
  - `runPreflight()` 内の `loadConfig()` → `loadConfig(repoRoot)` に変更（cwd から repo root を解決）
  - `bootstrap()` 内の `loadConfig()` → `loadConfig(repoRoot)` に変更
  - `src/util/repo-root.ts` の `resolveRepoRoot()` に cwd パラメータを追加
  - `src/util/spawn.ts` に error event handler を追加（ENOENT 等の spawn 失敗を graceful に処理）

**Dep**: Task 4

## Phase 5: Doc / Template 更新

### Task 10: prompts/rules.ts の更新

- [x] `src/prompts/rules.ts`: config 言及部分に project local config の存在を追記
- [x] `<repo-root>/.specrunner/config.json` で step model を repo 単位にカスタマイズ可能であることを明示

**Dep**: なし

### Task 11: project.md の更新

- [x] `specrunner/project.md`: 設定セクションに以下を追記:
  - config overlay の仕組み（user global + project local）
  - byRequestType の設定例
  - resolution chain の 6 レベル説明

**Dep**: なし

### Task 12: README の更新

- [x] `README.md`: project local config の使い方セクションを追加
  - `.specrunner/config.json` の作成方法
  - byRequestType の設定例
  - deep merge の挙動説明

**Dep**: なし

## Phase 6: Delta Spec

### Task 13: delta spec 更新の確認

- [x] `specrunner/changes/project-config-overlay/specs/cli-config-store/spec.md` が design と整合していることを確認
- [x] `specrunner/changes/project-config-overlay/specs/step-execution-architecture/spec.md` が design と整合していることを確認

**Dep**: なし

## Phase 7: 検証

### Task 14: 型チェック + テスト

- [x] `bun run typecheck` が green
- [x] `bun run test` が green
- [x] 新規テストが期待通りに pass:
  - merge.test.ts: deep merge の全ケース
  - store.test.ts: overlay load の全ケース
  - step-config.test.ts: 6 レベル resolution の全ケース
  - schema.test.ts: byRequestType validation の全ケース

**Dep**: 全 Task
