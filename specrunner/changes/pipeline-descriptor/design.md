# Design: pipeline 構成を PipelineDescriptor + registry に集約し pipelineId で選択する

## Context

- pipeline 構成（工程の並び・遷移・繰り返し組）は 3 箇所に分散している。
  - `src/core/pipeline/types.ts`: `STANDARD_TRANSITIONS`（遷移テーブル）
  - `src/core/pipeline/run.ts`: `STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS`、および step Map のベタ書き（`createStandardPipeline`）
  - `src/core/pipeline/run.ts`: design だけの小 pipeline（`runDesignPipeline`）が遷移テーブル・step Map を inline 定義
- `Pipeline` クラスは `steps` / `transitions` / `loopName` / `loopNames` / `loopFixerPairs` / `maxIterations` を constructor 引数で受ける。構成を外から差し替える素地は既にある。エンジン本体（`runInternal`）は構成データを読むだけで、構成の出所には依存しない。
- 同一性フィールド `pipelineId` は既に state に記録され、`getPipelineId(state)`（`src/state/pipeline-id.ts`）で解決できる（不在時 `"standard"` fallback）。`PIPELINE_IDS`（`src/kernel/pipeline-ids.ts`）は現状 `STANDARD: "standard"` の 1 件。選択する側（registry）が未配線のため、この解決ロジックは現状まだ意味を持っていない。
- run / resume は共に `CommandRunner.execute()`（`src/core/command/runner.ts`）を通り、構築は 1 箇所（`createStandardPipeline(deps, this.events)`）に集約されている。`pipeline.run(startStep, …)` の `startStep` は run=design / resume=再開 step で、prepare() 由来。
- `src/core/resume/resolve-step.ts` は `STANDARD_LOOP_FIXER_PAIRS` を `run.js` から import し、その reverse map（`FIXER_TO_LOOP`）を組む。本変更で `resolve-step` は変更しない制約があるため、この import path と export 名・型は割れない。
- 制約: `Step.name` は agent 定義名（例: `"specrunner-design"`）であり、step Map の key（`STEP_NAMES.DESIGN === "design"`）とは一致しない。

## Goals / Non-Goals

**Goals**:

- `PipelineDescriptor` 型を定義する（`id` / `steps` / `transitions` / `loopName` / `loopNames` / `loopFixerPairs` / `startStep` / `maxIterations`）。
- registry（`id → descriptor`）を導入し、現行の `STANDARD_*` を `STANDARD_DESCRIPTOR` 1 インスタンスに集約する。
- run / resume の pipeline 構築を、`getPipelineId(jobState)` で registry から記述子を引いて組む形に置き換える。
- design だけの小 pipeline を `pipelineId = "design-only"` として registry の 2 番目の登録物にし、registry 経由で構築する。`PIPELINE_IDS` に `"design-only"` を追加する。
- 標準 pipeline の実行・再開・画面出力を変えない（byte 単位スナップショットで担保）。

**Non-Goals**:

- 工程の役割（creator / reviewer / fixer / gate）・phase を記述子に一級で持たせること。
- resume の役割導出（`resolve-step` のハードコード）の一般化。`resolve-step` は本変更で変更しない。
- `Pipeline` 本体に焼き付いた収束意味論（exhaustion 経路 / fixer bypass / まとめ表示 / 既定判定）の剥がし。エンジン本体（`runInternal`）は変更しない。
- 各工程の入出力契約の宣言。
- design-only を起動する production 経路の追加（本変更では registry 化のみ。起動は既存の wrapper 経由に留める）。

## Decisions

### D1: `PipelineDescriptor` 型を `types.ts` に定義する

`src/core/pipeline/types.ts`（既に `Transition` 型の home）に次の interface を追加・export する。

- `id: string`
- `steps: readonly (readonly [string, Step])[]` — `(stepName, Step)` の entries 列
- `transitions: readonly Transition[]`
- `loopName: string`
- `loopNames: readonly string[]`
- `loopFixerPairs: Readonly<Record<string, string>>`
- `startStep: string`
- `maxIterations?: number`

`Step` 型は `import type { Step } from "../step/types.js"` で取り込む（型のみ依存。runtime step 実体は import しない）。

**Rationale**: `steps` を `(name, Step)` の entries にするのは、step Map の key（`STEP_NAMES.DESIGN === "design"`）と `Step.name`（`"specrunner-design"`）が不一致だから。`Step[]` を `step.name` で keying すると key が壊れ、`Pipeline.steps.get(currentStep)` が全滅する。entries 形式は現行 `new Map([...])` リテラルの逐語的な fold であり、key の同一性を構造的に保証する。

**Alternatives considered**:
- `steps: readonly Step[]` を builder 側で `step.name` keying → key 不一致で全工程解決失敗。却下。
- `steps: Map<string, Step>` を descriptor に直持ち → descriptor が可変構造体になりリテラル宣言しづらく、`readonly` 不変性も失う。entries（readonly tuple 列）の方が宣言的で凍結しやすい。却下。

### D2: `maxIterations` は optional とし、未指定時は config から解決する

`buildPipeline` は `descriptor.maxIterations ?? getMaxRetries(deps.config)` を採用する。`STANDARD_DESCRIPTOR` は `maxIterations` を持たず（config 由来）、`DESIGN_ONLY_DESCRIPTOR` は `1` を持つ。

**Rationale**: 標準 pipeline の `maxIterations` は config 由来の runtime 値（現行 `getMaxRetries(deps.config)`）で、静的定数に畳めない。optional + config fallback とすることで現行と同値を保つ。design-only は現行 `maxIterations: 1` 固定なので記述子に静的値で持たせる。

**Alternatives considered**:
- descriptor に resolver 関数 `(config) => number` を持たせる → 記述子がデータでなく振る舞いを含むことになり過剰。却下。
- `maxIterations` を必須数値にする → 標準の config 連動を壊し、回帰を生む。却下。

### D3: registry を新規ファイル `registry.ts` に置く

`src/core/pipeline/registry.ts` を新設し、次を定義する。

- `STANDARD_DESCRIPTOR: PipelineDescriptor` — `transitions` は `types.ts` の `STANDARD_TRANSITIONS` を参照。`steps` は現行 `createStandardPipeline` の Map entries と同一順序。`loopName` / `loopNames` / `loopFixerPairs` は現行値。`startStep = STEP_NAMES.DESIGN`、`maxIterations` 省略。
- `DESIGN_ONLY_DESCRIPTOR: PipelineDescriptor` — `id = PIPELINE_IDS.DESIGN_ONLY`、`steps = [[STEP_NAMES.DESIGN, DesignStep]]`、`transitions` は現行 `runDesignPipeline` の inline 定義（design success→end / error→escalate）、`loopName = loopNames = [DESIGN]`、`loopFixerPairs = {}`、`startStep = DESIGN`、`maxIterations = 1`。
- `PIPELINE_REGISTRY: Record<string, PipelineDescriptor>` — `{ [STANDARD]: STANDARD_DESCRIPTOR, [DESIGN_ONLY]: DESIGN_ONLY_DESCRIPTOR }`。
- `getPipelineDescriptor(id: string): PipelineDescriptor` — 未登録 id は既知 id 一覧を含む Error を throw する。

依存方向は registry → (steps, types, kernel/pipeline-ids) の一方向で、registry は `run.ts` を import しない（循環回避）。

**Rationale**: registry は step 実体と遷移テーブルを束ねる集約点。`run.ts` から分離することで `run.ts`（builder）が registry を import し、`resolve-step` が import する `run.ts` との循環を避けられる。

### D4: `STANDARD_*` named export は descriptor の view として存続させる

`STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS` は `run.ts` から `STANDARD_DESCRIPTOR.loopNames` / `STANDARD_DESCRIPTOR.loopFixerPairs` の view として re-export する（export 名・型・要素順を維持）。`STANDARD_TRANSITIONS` は `types.ts` に存続し、`STANDARD_DESCRIPTOR.transitions` がこれを参照する。

**Rationale**: 「畳み込み」は単一の `STANDARD_DESCRIPTOR` インスタンスへ構成を集約することであり、named const を消すことではない。`resolve-step`（`STANDARD_LOOP_FIXER_PAIRS` を `run.js` から import）と既存テスト（`STANDARD_TRANSITIONS` を `types.js` から、`STANDARD_LOOP_*` を `run.js` から import）の import path・型を割らないため、named export を descriptor を指す view として残す。これにより `resolve-step` 本体は未変更のまま typecheck が通る。

**Alternatives considered**:
- named const を削除し全 consumer を descriptor 参照へ書き換える → `resolve-step` を変更することになり、本 request の Non-Goal（resolve-step 未変更制約）に抵触。却下。

### D5: builder を 2 段に分ける

`run.ts` に次を置く。

- `buildPipeline(descriptor, deps, events?): Pipeline` — `executor` を構築し、`steps = new Map(descriptor.steps)`、`maxIterations = descriptor.maxIterations ?? getMaxRetries(deps.config)` を解決して `new Pipeline({ steps, transitions, maxIterations, executor, events, loopName, loopNames, loopFixerPairs })` を返す汎用 builder。
- `buildPipelineForJob(jobState, deps, events?): Pipeline` — `getPipelineDescriptor(getPipelineId(jobState))` で記述子を引き `buildPipeline` に委譲する registry 解決 builder。

**Rationale**: 「記述子から Pipeline を組む」純粋関数（`buildPipeline`）と「job から記述子を選ぶ」解決関数（`buildPipelineForJob`）を分離することで、選択ロジックを 1 箇所に閉じ込め、テストでも記述子直指定と job 経由の両方を扱える。

### D6: run / resume の構築を `buildPipelineForJob` に置き換える

`runner.ts` の `createStandardPipeline(deps, this.events)` を `buildPipelineForJob(jobState, deps, this.events)` に置き換える。`pipeline.run(startStep, jobState, deps)` の `startStep` は従来通り `prepared.startStep` を渡す（resume の中途再開を維持）。

**Rationale**: run / resume は共に `CommandRunner.execute()` を通るため、構築点 1 箇所の置換で両系統が registry 経由になる。`startStep` を descriptor から取らないのは、resume が中途 step から再開するため。descriptor.startStep は run-from-start の wrapper（`runPipeline` / `runDesignPipeline`）でのみ使う。

### D7: 既存 wrapper は registry 経由に付け替える

- `createStandardPipeline(deps, events?)` は `buildPipeline(STANDARD_DESCRIPTOR, deps, events)` への委譲 wrapper として存続（後方互換）。
- `runPipeline(jobState, deps, events?)` は記述子を `getPipelineId` で解決し `buildPipeline(...).run(descriptor.startStep, …)` に置き換える（standard では `startStep = design` で同値）。
- `runDesignPipeline(jobState, deps, events?)` は `buildPipeline(DESIGN_ONLY_DESCRIPTOR, deps, events).run(DESIGN_ONLY_DESCRIPTOR.startStep, …)` に置き換え、inline 定義を削除する。

### D8: `PIPELINE_IDS` に `"design-only"` を追加する

`src/kernel/pipeline-ids.ts` の `PIPELINE_IDS` に `DESIGN_ONLY: "design-only"` を追加する。`PipelineId` union は自動拡張される。anonymous descriptor にはしない。

**Rationale**: design-only も標準と同じく「id で引ける記述子」とすることで、registry の登録物が均質になり、id が `PIPELINE_IDS` の single source of truth に乗る。

## Risks / Trade-offs

- [画面出力の差分] design-only 記述子が `loopName = "design"` / `loopNames = ["design"]` を保持しないと、design step が loop 扱いされず `[iter N/M]` 出力が変わる → 記述子で現行値を逐語保持し、`cli-stdout-snapshot` の byte 同一比較で検出する。
- [test mock の取りこぼし] `runner.test.ts` / `resume.test.ts` / `cli/resume.test.ts` は `createStandardPipeline` を `vi.mock` している。`runner.ts` が `buildPipelineForJob` に切り替わると、mock 対象が呼ばれず実 builder が走り full deps 不足で test が崩れる → mock 対象を `buildPipelineForJob` に張り替える（tasks T-06 で明示）。
- [循環 import] `registry` ↔ `run` の循環懸念 → registry は `run.ts` を import しない一方向依存で回避する。
- [maxIterations の解決漏れ] `descriptor.maxIterations ?? getMaxRetries(deps.config)` の `??` が `0` を有効値として通す点に注意 → 現行も `getMaxRetries` は正の値前提で、design-only は `1`、standard は config 由来のため実害なし。

## Open Questions

なし。
