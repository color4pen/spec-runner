# Tasks: pipeline 構成を PipelineDescriptor + registry に集約し pipelineId で選択する

## T-01: PipelineDescriptor 型と PIPELINE_IDS の拡張

- [x] `src/core/pipeline/types.ts` に `PipelineDescriptor` interface を定義・export する。フィールド: `id: string` / `steps: readonly (readonly [string, Step])[]` / `transitions: readonly Transition[]` / `loopName: string` / `loopNames: readonly string[]` / `loopFixerPairs: Readonly<Record<string, string>>` / `startStep: string` / `maxIterations?: number`
- [x] `types.ts` に `import type { Step } from "../step/types.js"` を追加する（型のみ依存。runtime step 実体は import しない）
- [x] `src/kernel/pipeline-ids.ts` の `PIPELINE_IDS` に `DESIGN_ONLY: "design-only"` を追加する。`PipelineId` union が自動拡張されることを確認する
- [x] 既存 `STANDARD_TRANSITIONS`（`types.ts`）は削除せず存続させる

**Acceptance Criteria**:
- `PipelineDescriptor` が `types.ts` から export され、`maxIterations` が optional である
- `PIPELINE_IDS.DESIGN_ONLY === "design-only"`
- `bun run typecheck` が green

## T-02: registry と記述子の導入

- [x] `src/core/pipeline/registry.ts` を新規作成する
- [x] `STANDARD_DESCRIPTOR: PipelineDescriptor` を定義する。`id = PIPELINE_IDS.STANDARD`、`steps` は現行 `createStandardPipeline` の Map entries と同一順序の `[stepName, Step]` 列、`transitions = STANDARD_TRANSITIONS`（`types.ts` を参照）、`loopName = STEP_NAMES.SPEC_REVIEW`、`loopNames = [spec-review, verification, code-review, conformance]`（現行順序）、`loopFixerPairs = { code-review→code-fixer, spec-review→spec-fixer, verification→build-fixer }`、`startStep = STEP_NAMES.DESIGN`、`maxIterations` は省略
- [x] `DESIGN_ONLY_DESCRIPTOR: PipelineDescriptor` を定義する。`id = PIPELINE_IDS.DESIGN_ONLY`、`steps = [[STEP_NAMES.DESIGN, DesignStep]]`、`transitions` は現行 `runDesignPipeline` の inline 定義（design success→end / design error→escalate）、`loopName = STEP_NAMES.DESIGN`、`loopNames = [STEP_NAMES.DESIGN]`、`loopFixerPairs = {}`、`startStep = STEP_NAMES.DESIGN`、`maxIterations = 1`
- [x] `PIPELINE_REGISTRY: Record<string, PipelineDescriptor>` を `{ [PIPELINE_IDS.STANDARD]: STANDARD_DESCRIPTOR, [PIPELINE_IDS.DESIGN_ONLY]: DESIGN_ONLY_DESCRIPTOR }` で定義する
- [x] `getPipelineDescriptor(id: string): PipelineDescriptor` を定義する。未登録 id は既知 id 一覧を含む Error を throw する
- [x] registry は `run.ts` を import しない（循環回避。依存方向は registry → step / types / kernel の一方向）

**Acceptance Criteria**:
- `PIPELINE_REGISTRY` に記述子が 2 件登録されている
- `getPipelineDescriptor("standard")` / `getPipelineDescriptor("design-only")` が対応する記述子を返す
- `getPipelineDescriptor("unknown")` が Error を throw する
- `STANDARD_DESCRIPTOR` の各フィールドが現行 `createStandardPipeline` / `STANDARD_*` と値・順序ともに一致する

## T-03: builder の集約と既存 wrapper の付け替え

- [x] `src/core/pipeline/run.ts` に `buildPipeline(descriptor, deps, events?): Pipeline` を追加する。`executor` を構築し、`steps = new Map(descriptor.steps)`、`maxIterations = descriptor.maxIterations ?? getMaxRetries(deps.config)` を解決して `new Pipeline({ steps, transitions, maxIterations, executor, events, loopName, loopNames, loopFixerPairs })` を返す
- [x] `run.ts` に `buildPipelineForJob(jobState, deps, events?): Pipeline` を追加する。`getPipelineDescriptor(getPipelineId(jobState))` で記述子を引き `buildPipeline` に委譲する
- [x] `STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS` を `STANDARD_DESCRIPTOR.loopNames` / `STANDARD_DESCRIPTOR.loopFixerPairs` の view として `run.ts` から re-export する（export 名・型・要素順を維持）
- [x] `createStandardPipeline(deps, events?)` を `buildPipeline(STANDARD_DESCRIPTOR, deps, events)` への委譲 wrapper に書き換える
- [x] `runPipeline(jobState, deps, events?)` を記述子解決経由（`getPipelineId` → `getPipelineDescriptor` → `buildPipeline(...).run(descriptor.startStep, …)`）に置き換える（standard では `startStep = design` で同値）
- [x] `runDesignPipeline(jobState, deps, events?)` を `buildPipeline(DESIGN_ONLY_DESCRIPTOR, deps, events).run(DESIGN_ONLY_DESCRIPTOR.startStep, …)` に置き換え、inline の step Map・遷移テーブル定義を削除する

**Acceptance Criteria**:
- `resolve-step.ts` を変更せず `STANDARD_LOOP_FIXER_PAIRS` が `run.js` から解決できる
- `tests/unit/core/pipeline/buildMockPipeline.test.ts` が import する `STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS` が同名・同型で `run.js` から import できる
- `bun run typecheck` が green

## T-04: run / resume の配線を pipelineId 解決経由にする

- [x] `src/core/command/runner.ts` の import を `createStandardPipeline` から `buildPipelineForJob` に変更する
- [x] `runner.ts` のパイプライン構築箇所を `buildPipelineForJob(jobState, deps, this.events)` に置き換える
- [x] `pipeline.run(startStep, jobState, deps)` の `startStep` は引き続き `prepared.startStep` を渡す（resume の中途再開を不変に保つ）

**Acceptance Criteria**:
- run / resume が `getPipelineId(jobState)` 経由で記述子を引いて `Pipeline` を構築する
- `pipelineId = "standard"` の job が `STANDARD_DESCRIPTOR` で構築される
- resume の `startStep`（再開 step）が従来通り `prepared.startStep` で渡る

## T-05: pipeline module の export 整理

- [x] `src/core/pipeline/index.ts` に `PipelineDescriptor` 型 / `buildPipeline` / `buildPipelineForJob` / `getPipelineDescriptor` / `PIPELINE_REGISTRY` を export 追加する
- [x] 既存 export（`runPipeline` / `runDesignPipeline` / `createStandardPipeline` / `STANDARD_TRANSITIONS` / `Transition` / `PipelineDeps`）を維持する

**Acceptance Criteria**:
- 新規 export が `pipeline/index.js` から解決できる
- 既存 import path が壊れない
- `bun run typecheck` が green

## T-06: テストの張り替え

- [x] `tests/unit/core/pipeline/buildMockPipeline.test.ts` の `STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS` の具体値 assert を `STANDARD_DESCRIPTOR`（registry）参照に張り替える（値は同一）
- [x] `STANDARD_TRANSITIONS` を直接参照するテスト群は `types.js` import を維持し、`STANDARD_DESCRIPTOR.transitions` が同一テーブルを指すことを確認する（必要に応じて descriptor 参照の assert を追加）
- [x] `tests/unit/core/command/runner.test.ts` / `tests/unit/core/command/resume.test.ts` / `tests/unit/cli/resume.test.ts` の `vi.mock(".../pipeline/index.js")` を、`createStandardPipeline` に加えて `buildPipelineForJob` を mock export するよう張り替える（`runner.ts` が呼ぶ関数を mock 対象にする）
- [x] `runDesignPipeline` を使うテスト（`tests/pipeline.test.ts`）が registry 経由の構築でも従来の挙動（design success→end、error は err.state 経由）を満たすことを確認する
- [x] `tests/unit/core/pipeline/run.test.ts` TC-025 を `registry.ts` 参照に張り替える。`run.ts` のソース読み取り・`[STEP_NAMES.*, Step]` パターンマッチを `STANDARD_DESCRIPTOR.steps.length >= 9` のランタイムチェックに書き換える（T-03 で step エントリが `registry.ts` に移動するため、`run.ts` にはパターンが残らない）
- [x] `tests/unit/core/pipeline/pipeline.transitions.test.ts` TC-023/016 のソース読み取り部分を張り替える。`run.ts` ファイル読み取り・`STEP_NAMES.*` 存在チェック・`loopNames: [...]` パターンマッチの各 assert を削除し、`STANDARD_LOOP_NAMES` のランタイム import（`from "../../../../src/core/pipeline/run.js"`）と `expect(STANDARD_LOOP_NAMES).toContain("conformance")` / `expect(STANDARD_LOOP_NAMES).not.toContain("pr-create")` のランタイムチェックに書き換える（TC-016 の it block と統合可能）

**Acceptance Criteria**:
- `STANDARD_*` の具体値を直接 assert していたテストが記述子参照に張り替わっている
- run / resume のテスト mock が `runner.ts` の実構築関数（`buildPipelineForJob`）を握っている
- `tests/unit/core/pipeline/run.test.ts` TC-025 が `STANDARD_DESCRIPTOR` のランタイム値を参照しており、`run.ts` ソース読み取りに依存していない
- `tests/unit/core/pipeline/pipeline.transitions.test.ts` TC-023/016 が `STANDARD_LOOP_NAMES` のランタイム値を参照しており、`run.ts` ソース読み取りに依存していない
- 全テストが green

## T-07: 検証

- [x] `bun run typecheck` を実行し green を確認する
- [x] `bun run test` を実行し green を確認する
- [x] `cli-stdout-snapshot` テストで標準 pipeline の画面出力が byte 単位で同一であることを確認する

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- 画面出力スナップショットが byte 単位で変化していない
