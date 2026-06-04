# ADR-20260604: PipelineDescriptor + registry を pipeline 構成の単一集約点とし pipelineId で選択する

**Date**: 2026-06-04
**Status**: accepted

## Context

pipeline 構成（工程の並び・遷移・繰り返し組）は 3 箇所に分散して定義されていた。

- `src/core/pipeline/types.ts`: `STANDARD_TRANSITIONS`（遷移テーブル）
- `src/core/pipeline/run.ts`: `STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS`、`createStandardPipeline` 内の step Map ベタ書き
- `src/core/pipeline/run.ts`: `runDesignPipeline` 内で遷移テーブル・step Map を inline 定義

`Pipeline` クラスはコンストラクタ引数で構成を受け取る設計になっており、構成を外から差し替える素地は既にあった。一方で `pipelineId` は state に記録・解決（`getPipelineId`）できる状態になっていたが、記述子を選択する側（registry）が未配線のため、この識別情報は実際に使われていなかった。

将来複数の pipeline 構成を扱う（役割・phaseMap を記述子に追加するなど）前提として、構成を 1 つのデータ型に集約し、`pipelineId` で選択できるようにする必要があった。

## Decision

### D1: `PipelineDescriptor` 型を `types.ts` に定義する

`src/core/pipeline/types.ts` に `PipelineDescriptor` interface を追加する。フィールドは `id / steps / transitions / loopName / loopNames / loopFixerPairs / startStep / maxIterations?`。

`steps` は `readonly (readonly [string, Step])[]`（entries 形式）とする。`Step.name`（例: `"specrunner-design"`）は step Map の key（`STEP_NAMES.DESIGN === "design"`）と一致しないため、`Step[]` を `step.name` で keying すると `Pipeline.steps.get(currentStep)` が全滅する。entries 形式は現行 `new Map([...])` リテラルの逐語的な fold であり、key の同一性を構造的に保証する。

### D2: `maxIterations` は optional とし未指定時は config から解決する

`buildPipeline` は `descriptor.maxIterations ?? getMaxRetries(deps.config)` を採用する。標準 pipeline の `maxIterations` は config 由来の runtime 値であり静的定数に畳めないため、optional + config fallback とする。`DESIGN_ONLY_DESCRIPTOR` は `maxIterations: 1` を静的値で持つ。

### D3: registry を新規ファイル `registry.ts` に置く

`src/core/pipeline/registry.ts` を新設し、`STANDARD_DESCRIPTOR` / `DESIGN_ONLY_DESCRIPTOR` / `PIPELINE_REGISTRY` / `getPipelineDescriptor(id)` を定義する。registry は `run.ts` を import しない一方向依存（registry → steps, types, kernel/pipeline-ids）とし、循環を回避する。`getPipelineDescriptor` は未登録 id に対して既知 id 一覧付きの Error を throw する。

### D4: `STANDARD_*` named export は descriptor の view として存続させる

`STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS` は `run.ts` から `STANDARD_DESCRIPTOR.loopNames` / `STANDARD_DESCRIPTOR.loopFixerPairs` の view として re-export する（export 名・型・要素順を維持）。`STANDARD_TRANSITIONS` は `types.ts` に存続し、`STANDARD_DESCRIPTOR.transitions` がこれを参照する。

`resolve-step.ts` が `STANDARD_LOOP_FIXER_PAIRS` を `run.js` から import しており、本変更では `resolve-step` を変更しない制約があるため、named export を削除せず descriptor を指す view として残す。

### D5: builder を 2 段に分ける

`run.ts` に次を置く。
- `buildPipeline(descriptor, deps, events?)` — 記述子から `Pipeline` を組み立てる純粋 builder
- `buildPipelineForJob(jobState, deps, events?)` — `getPipelineId(jobState)` で registry から記述子を解決し `buildPipeline` に委譲する

### D6: run / resume の構築を `buildPipelineForJob` に置き換える

`runner.ts` の `createStandardPipeline(deps, this.events)` を `buildPipelineForJob(jobState, deps, this.events)` に置き換える。`startStep` は `prepared.startStep`（resume の中途再開）を維持し、`descriptor.startStep` からは取らない。

### D7: `PIPELINE_IDS` に `"design-only"` を追加する

`src/kernel/pipeline-ids.ts` の `PIPELINE_IDS` に `DESIGN_ONLY: "design-only"` を追加する。anonymous descriptor にはせず、標準と均質な "id で引ける記述子" として扱う。

## Alternatives Considered

### Alternative 1: `steps` を `Step[]` にして `step.name` で keying する

- **Pros**: 宣言が簡潔。Step オブジェクトだけで完結する
- **Cons**: `Step.name`（例: `"specrunner-design"`）と step Map key（`"design"`）が不一致のため、`Pipeline.steps.get(currentStep)` が全工程で解決失敗する
- **Why not**: entries 形式が現行 `new Map([...])` リテラルの逐語的な fold であり、key 同一性を構造的に保証する唯一の形式

### Alternative 2: `steps` を `Map<string, Step>` として descriptor に直持ちする

- **Pros**: 使用側で `new Map()` 変換が不要
- **Cons**: descriptor が可変構造体になりリテラル宣言しづらく、`readonly` 不変性も失う
- **Why not**: entries（readonly tuple 列）の方が宣言的で凍結しやすく、descriptor をデータとして扱う一貫性を保てる

### Alternative 3: `maxIterations` を必須数値にする

- **Pros**: 型が単純で `undefined` チェック不要、記述子が自己完結する
- **Cons**: 標準 pipeline の `maxIterations` は config 由来の runtime 値であり、静的定数に畳めない。現行挙動を壊す
- **Why not**: optional + builder 側 `?? getMaxRetries(deps.config)` fallback で現行と同値を保てる

### Alternative 4: descriptor に `maxIterations` resolver 関数 `(config) => number` を持たせる

- **Pros**: 全記述子が `maxIterations` を自己解決できる。builder 側に fallback ロジックが不要になる
- **Cons**: 記述子がデータでなく振る舞いを含む構造になる
- **Why not**: 過剰。optional 数値 + builder 側 fallback で十分であり、記述子をピュアデータとして保つ原則に反する

### Alternative 5: `STANDARD_*` named export を削除し全 consumer を descriptor 参照へ書き換える

- **Pros**: コードがクリーンになり、named const の二重管理がなくなる
- **Cons**: `resolve-step.ts` が `STANDARD_LOOP_FIXER_PAIRS` を `run.js` から import しており、変更が必要になる。本変更の Non-Goal（resolve-step 未変更制約）に抵触する
- **Why not**: named export を descriptor の view として re-export することで `resolve-step.ts` を未変更のまま typecheck が通る

### Alternative 6: registry を `run.ts` 内に置く（ファイル分割しない）

- **Pros**: ファイルが増えない。pipeline 構成の定義が 1 ファイルに集まる
- **Cons**: registry が step 実体（`DesignStep` 等）を import し、`run.ts` が registry を import すると、`resolve-step.ts` → `run.ts` → registry → steps の循環が生じる
- **Why not**: `registry.ts` を別ファイルに分離することで registry → (steps, types, kernel/pipeline-ids) の一方向依存を保証できる

## Consequences

### Positive

- pipeline 構成の分散が解消され、`PipelineDescriptor` が単一の集約点になる
- `pipelineId` による registry 選択が初めて実際に機能し、複数 pipeline 構成への拡張基盤ができる
- `buildPipeline` が純粋関数になり、テストで記述子直指定と job 経由の両方を独立して検証できる
- 標準 pipeline の挙動は byte 単位スナップショットで保証される

### Negative

- `createStandardPipeline` を mock していたテストは `buildPipelineForJob` に mock 対象を張り替える必要があった

### Known Debt / Deferred

- 工程の役割（creator / reviewer / fixer / gate）と phaseMap を記述子に一級で追加することは本変更のスコープ外。将来の request で実施する
- `resolve-step` が `STANDARD_LOOP_FIXER_PAIRS` を `run.js` から import するハードコードは、役割フィールドを記述子に追加する変更と一体で一般化する
- `Pipeline` 本体に焼き付いた収束意味論（exhaustion 経路 / fixer bypass）の剥がしは別 request で扱う

## References

- Request: `specrunner/changes/pipeline-descriptor/request.md`
- Design: `specrunner/changes/pipeline-descriptor/design.md`
- Spec: `specrunner/changes/pipeline-descriptor/spec.md`
- Related: `specrunner/adr/2026-04-27-cli-core-pipeline.md`（Pipeline クラス設計）
- Related: `specrunner/adr/2026-05-22-job-state-store-di.md`（DI パターンの確立）
