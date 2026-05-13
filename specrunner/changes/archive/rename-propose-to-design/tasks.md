# Tasks: rename-propose-to-design

## Task 1: ファイルリネーム (git mv)

**Design ref**: D1

1. [x] `git mv src/core/step/propose.ts src/core/step/design.ts`
2. [x] `git mv src/prompts/propose-system.ts src/prompts/design-system.ts`
3. [x] `git mv tests/prompts/propose-system.test.ts tests/prompts/design-system.test.ts`

## Task 2: Step 定義の更新 (`src/core/step/design.ts`)

**Design ref**: D1, D5

1. [x] `PROPOSE_AGENT_MODEL` → `DESIGN_AGENT_MODEL`
2. [x] `proposeAgentDefinition` → `designAgentDefinition`
   - `name: "specrunner-propose"` → `"specrunner-design"`
   - `role: "propose"` → `"design"`
   - `system: PROPOSE_SYSTEM_PROMPT` → `DESIGN_SYSTEM_PROMPT`
3. [x] `ProposeStep` → `DesignStep`
   - `name: "propose"` → `"design"`
4. [x] import パスを `../../prompts/design-system.js` に更新

## Task 3: Prompt 定数の更新 (`src/prompts/design-system.ts`)

**Design ref**: D1, D8

1. [x] `PROPOSE_SYSTEM_PROMPT` → `DESIGN_SYSTEM_PROMPT`
2. [x] `PROPOSE_INITIAL_MESSAGE_TEMPLATE` → `DESIGN_INITIAL_MESSAGE_TEMPLATE`
3. [x] プロンプトテキスト内の step 名参照を更新:
   - `"propose agent"` → `"design agent"`
   - `"stage 1 (propose)"` → `"stage 1 (design)"`
   - `"propose (you)"` / `"propose (あなた)"` → `"design (you)"` / `"design (あなた)"`
4. [x] `buildInitialMessage` はそのまま（汎用名）

## Task 4: StepName 型の更新 (`src/state/schema.ts`)

**Design ref**: D2, D3

1. [x] `StepName` union の `"propose"` → `"design"`
2. [x] `validateJobState()` に on-read remap を追加: `obj["step"] === "propose"` の場合 `obj["step"] = "design"` に変換（既存の `status === "success"` remap パターンに倣う）

## Task 5: 遷移テーブルの更新 (`src/core/pipeline/types.ts`)

**Design ref**: D1

1. [x] `STANDARD_TRANSITIONS` 内の `step: "propose"` → `step: "design"` (2 行)
2. [x] コメント内の `propose` → `design` への更新

## Task 6: Pipeline run の更新 (`src/core/pipeline/run.ts`)

**Design ref**: D1

1. [x] import: `ProposeStep` → `DesignStep`、パス `./propose.js` → `./design.js`
2. [x] `createStandardPipeline()` 内の Map エントリ: `["propose", ProposeStep]` → `["design", DesignStep]`
3. [x] `runPipeline()`: `pipeline.run("propose", ...)` → `pipeline.run("design", ...)`
4. [x] `runProposePipeline()`:
   - 関数名を `runDesignPipeline()` にリネーム
   - Map エントリ: `["propose", ProposeStep]` → `["design", DesignStep]`
   - 遷移テーブル: `step: "propose"` → `step: "design"`
   - `loopName: "propose"` → `"design"`
   - `pipeline.run("propose", ...)` → `pipeline.run("design", ...)`
5. [x] コメント内の `propose` → `design`
6. [x] `runProposePipeline` を呼び出している箇所の import/呼び出しも更新

## Task 7: Pipeline core の更新 (`src/core/pipeline/pipeline.ts`)

**Design ref**: D6

1. [x] L95 付近: `(finalState.step ?? "propose")` → `(finalState.step ?? "design")`
2. [x] L351 付近: `stepName === "propose"` → `stepName === "design"`
3. [x] コメント内の `propose` → `design`

## Task 8: Resume resolve-step の更新 (`src/core/resume/resolve-step.ts`)

**Design ref**: D3

1. [x] `SPEC_PHASE_STEPS`: `"propose"` → `"design"`
2. [x] `STEP_MAPPING.spec.creator`: `"propose"` → `"design"`

## Task 9: Config の更新

**Design ref**: D4

### 9a: `src/config/schema.ts`

1. [x] L276 付近: `cfg.agents?.["propose"]?.agentId` → `cfg.agents?.["design"]?.agentId`
2. [x] L95 付近のコメント: `"propose"` → `"design"`

### 9b: `src/config/migrate.ts`

1. [x] `CAMEL_TO_KEBAB`:
   - `propose: "propose"` を `propose: "design"` に変更（後方互換エイリアス）
   - `design: "design"` を追加（正規キー）
2. [x] legacy migration: `result["propose"]` → `result["design"]`
3. [x] コメント内の `agents.propose` → `agents.design`

## Task 10: Executor の更新 (`src/core/step/executor.ts`)

**Design ref**: D7

1. [x] `PROJECT_CONTEXT_STEPS` Set 内の `"propose"` → `"design"`

## Task 11: Step index の更新 (`src/core/step/index.ts`)

**Design ref**: D1

1. [x] `export { ProposeStep } from "./propose.js"` → `export { DesignStep } from "./design.js"`

## Task 12: Adapter の更新

### 12a: `src/adapter/managed-agent/agent-runner.ts`

1. [x] `step.agent.role === "propose"` → `step.agent.role === "design"`
2. [x] `runProposeStyle` → `runDesignStyle`（メソッド名とコメント）

### 12b: `src/adapter/managed-agent/sse-stream.ts`

1. [x] import パス: `propose-system.js` → `design-system.js`
2. [x] import 名: `PROPOSE_SYSTEM_PROMPT` → `DESIGN_SYSTEM_PROMPT`（使用されている場合）
3. [x] コメント内の `propose` → `design`

## Task 13: Doctor チェックの更新

### 13a: `src/core/doctor/checks/agents/definition-drift.ts`

1. [x] import: `ProposeStep` → `DesignStep`、パス `propose.js` → `design.js`
2. [x] `AGENT_ROLES` 配列: `"propose"` → `"design"`

### 13b: `src/core/doctor/checks/agents/agents-registered.ts`

1. [x] `"propose"` の参照があれば `"design"` に更新

## Task 14: CLI の更新

### 14a: `src/cli/init.ts`

1. [x] import: `ProposeStep` → `DesignStep`、パス更新

### 14b: `src/cli/command-registry.ts`

1. [x] ヘルプテキスト内の `"propose pipeline"` → `"design pipeline"`

## Task 15: エラーメッセージの更新

### 15a: `src/errors.ts`

1. [x] `"propose output"` → `"design output"`
2. [x] `"propose ran successfully"` → `"design ran successfully"`

### 15b: `src/core/finish/preflight.ts`

1. [x] `"propose pipeline"` → `"design pipeline"`

### 15c: `src/core/command/pipeline-run.ts`

1. [x] L46: `logInfo("Starting propose pipeline for: ...")` → `"Starting design pipeline for: ..."`
2. [x] L74: `startStep: "propose"` → `startStep: "design"`

## Task 16: テストの更新

### 16a: `tests/prompts/design-system.test.ts`（リネーム済み）

1. [x] import パス: `design-system.js` に更新
2. [x] 定数名: `PROPOSE_SYSTEM_PROMPT` → `DESIGN_SYSTEM_PROMPT`、`PROPOSE_INITIAL_MESSAGE_TEMPLATE` → `DESIGN_INITIAL_MESSAGE_TEMPLATE`
3. [x] テスト内の describe / it 文言で step 名参照を更新

### 16b: `tests/unit/core/pipeline/pipeline.transitions.test.ts`

1. [x] step 名 `"propose"` → `"design"`

### 16c: `tests/grep-no-step-name-hardcode.test.ts`

1. [x] 正規表現パターン内の `"propose"` → `"design"`

### 16d: その他テストファイル

1. [x] `grep -r "propose" tests/ --include="*.ts"` で残存する step 名参照を `"design"` に更新
2. [x] `ProposeStep` import を `DesignStep` に更新

## Task 17: `runProposePipeline` の呼び出し元更新

**Design ref**: Task 6 の関数リネームに伴う依存更新

1. [x] `grep -r "runProposePipeline" src/ tests/` で全呼び出し元を特定
2. [x] `runDesignPipeline` に更新

## Task 18: 検証

1. [x] `bun run typecheck` — 型エラーなし
2. [x] `bun run test` — 全テスト pass (145 files, 1715 tests)
3. [x] `grep -r '"propose"' src/ --include="*.ts"` で step 名としての残存がないこと（一般的な英単語用法は除く）
4. [x] `ls src/core/step/propose.ts` が存在しないこと
5. [x] `ls src/prompts/propose-system.ts` が存在しないこと
