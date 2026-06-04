# Spec: pipeline 構成を PipelineDescriptor + registry に集約し pipelineId で選択する

## Requirements

### Requirement: pipeline 構築は pipelineId で記述子を解決する

run / resume の pipeline 構築は、job の `pipelineId`（`getPipelineId(jobState)` で解決）を key に registry から `PipelineDescriptor` を引き、その記述子から `Pipeline` を組み立てる。構築は registry 経由でなければならない（MUST）。`pipelineId` が不在の legacy state は `getPipelineId` の fallback により `"standard"` として解決される SHALL。

#### Scenario: standard job は標準記述子で構築される

**Given** `pipelineId` が `"standard"` の job state がある
**When** run または resume が pipeline を構築する
**Then** registry から `STANDARD_DESCRIPTOR` が引かれ、その `steps` / `transitions` / `loopName` / `loopNames` / `loopFixerPairs` で `Pipeline` が構築される

#### Scenario: pipelineId 不在の legacy state は standard に解決される

**Given** `pipelineId` フィールドを持たない job state がある
**When** pipeline 構築のため `getPipelineId(jobState)` が評価される
**Then** `"standard"` が解決され、`STANDARD_DESCRIPTOR` で構築される

### Requirement: registry はちょうど 2 件の記述子を登録し未知 id を拒否する

registry は `"standard"` と `"design-only"` の 2 件の `PipelineDescriptor` を登録する SHALL。`getPipelineDescriptor(id)` は未登録の id に対して Error を投げなければならない（MUST）。

#### Scenario: 既知 id は対応する記述子を返す

**Given** registry が初期化されている
**When** `getPipelineDescriptor("standard")` および `getPipelineDescriptor("design-only")` を呼ぶ
**Then** それぞれ `STANDARD_DESCRIPTOR` / `DESIGN_ONLY_DESCRIPTOR` が返り、記述子は 2 件登録されている

#### Scenario: 未登録 id は拒否される

**Given** registry に登録されていない id `"unknown"` がある
**When** `getPipelineDescriptor("unknown")` を呼ぶ
**Then** 既知 id を示すメッセージ付きの Error が投げられる

### Requirement: design-only 記述子は "design-only" として PIPELINE_IDS に登録される

design だけの小 pipeline の記述子は id `"design-only"` を持ち、`PIPELINE_IDS`（`src/kernel/pipeline-ids.ts`）に `"design-only"` が定数として追加される SHALL。design-only pipeline は registry 経由で構築される MUST。

#### Scenario: design-only id が定数化されている

**Given** `PIPELINE_IDS` を参照する
**When** `PIPELINE_IDS.DESIGN_ONLY` を読む
**Then** 値は `"design-only"` であり、`DESIGN_ONLY_DESCRIPTOR.id` と一致する

#### Scenario: design-only pipeline が registry 経由で動作する

**Given** design-only 記述子が registry に登録されている
**When** design-only pipeline を構築して実行し、design step が success を返す
**Then** 遷移は design → end で終了し、registry から引いた記述子で構築されている

### Requirement: 標準 pipeline の挙動と画面出力は不変である

`STANDARD_*` を `STANDARD_DESCRIPTOR` に集約しても、標準 pipeline の実行・再開・画面出力は変わってはならない（MUST）。標準 pipeline の標準出力スナップショットは本変更の前後で byte 単位で同一である SHALL。

#### Scenario: 標準出力スナップショットが byte 同一

**Given** 標準 pipeline を実行する固定シナリオがある
**When** 集約後の構築経路で pipeline を実行する
**Then** 画面出力（`[iter N/M]` 行を含む）はスナップショットと byte 単位で一致する

### Requirement: resolve-step が参照する STANDARD_* は存続する

`resolve-step` が import する `STANDARD_LOOP_FIXER_PAIRS`（および既存テストが参照する `STANDARD_LOOP_NAMES` / `STANDARD_TRANSITIONS`）は、記述子へ集約した後も同一 import path・export 名・型・要素順で存続する SHALL。`resolve-step` 本体は未変更のまま typecheck が通らなければならない（MUST）。

#### Scenario: resolve-step を変更せず typecheck が通る

**Given** `resolve-step.ts` は `STANDARD_LOOP_FIXER_PAIRS` を `../pipeline/run.js` から import している
**When** `STANDARD_*` を `STANDARD_DESCRIPTOR` に集約する
**Then** `STANDARD_LOOP_FIXER_PAIRS` は `run.js` から同名・同型で re-export され、`resolve-step.ts` を変更せず `bun run typecheck` が green になる
