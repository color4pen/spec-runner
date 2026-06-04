# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | 全チェックボックス [x] 済み（T-01〜T-07）|
| design.md | ✅ | D1〜D8 すべて実装で充足 |
| spec.md | ✅ | R1〜R5 すべて充足 |
| request.md | ✅ | 受け入れ基準 8 項目すべて充足 |

## Detail

### tasks.md

全チェックボックスが `[x]` 済み。T-01 の `PipelineDescriptor` 型定義、T-02 の `registry.ts` 新設、T-03 の `buildPipeline` / `buildPipelineForJob` / re-export、T-04 の `runner.ts` 付け替え、T-05 の `index.ts` export 整理、T-06 のテスト張り替え、T-07 の verification がすべて実装済みであることをコード差分で確認した。

### design.md

| 決定 | 確認 |
|------|------|
| D1: `PipelineDescriptor` を `types.ts` に定義 | `src/core/pipeline/types.ts` に interface 追加・export ✅ |
| D2: `maxIterations` optional、未指定時は config 解決 | `buildPipeline` で `descriptor.maxIterations ?? getMaxRetries(deps.config)` ✅ |
| D3: `registry.ts` を新設 | `src/core/pipeline/registry.ts` 新規作成 ✅ |
| D4: `STANDARD_*` named export を view として存続 | `STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS` を `run.ts` から re-export ✅ |
| D5: builder を 2 段に分ける | `buildPipeline` + `buildPipelineForJob` を `run.ts` に実装 ✅ |
| D6: `runner.ts` を `buildPipelineForJob` に切り替え | `createStandardPipeline` → `buildPipelineForJob(jobState, deps, this.events)` ✅ |
| D7: 既存 wrapper を registry 経由に付け替え | `createStandardPipeline` / `runPipeline` / `runDesignPipeline` すべて更新 ✅ |
| D8: `PIPELINE_IDS.DESIGN_ONLY = "design-only"` | `kernel/pipeline-ids.ts` に追加 ✅ |

### spec.md

**R1: pipeline 構築は pipelineId で記述子を解決する**
`buildPipelineForJob` が `getPipelineId(jobState)` → `getPipelineDescriptor` → `buildPipeline` の順に解決。`resolve-step.ts` が未変更であることを `git diff` で確認。pipelineId 不在の legacy state は `getPipelineId` 内 fallback `"standard"` で解決される。

**R2: registry はちょうど 2 件の記述子を登録し未知 id を拒否する**
`PIPELINE_REGISTRY` に `STANDARD_DESCRIPTOR` と `DESIGN_ONLY_DESCRIPTOR` の 2 件。`getPipelineDescriptor` は未登録 id で `Error("Unknown pipeline id: ..." + 既知 id 一覧)` を throw。

**R3: design-only 記述子は "design-only" として PIPELINE_IDS に登録される**
`PIPELINE_IDS.DESIGN_ONLY === "design-only"` かつ `DESIGN_ONLY_DESCRIPTOR.id = PIPELINE_IDS.DESIGN_ONLY`。`runDesignPipeline` が `buildPipeline(DESIGN_ONLY_DESCRIPTOR, ...)` 経由。

**R4: 標準 pipeline の挙動と画面出力は不変である**
`DESIGN_ONLY_DESCRIPTOR` の `loopNames = [STEP_NAMES.DESIGN]` / `loopFixerPairs = {}` は旧 `Pipeline` constructor のデフォルト値（`loopNames ?? [this.loopName]` / `loopFixerPairs ?? {}`）と同値。`STANDARD_DESCRIPTOR` の steps / loopNames / loopFixerPairs が旧 `STANDARD_*` 定数と逐語一致。`cli-stdout-snapshot.test.ts` を含む 266 test files / 3059 tests all passed。

**R5: resolve-step が参照する STANDARD_* は存続する**
`git diff main...HEAD -- src/core/resume/resolve-step.ts` が空（変更なし）。`STANDARD_LOOP_FIXER_PAIRS` は `run.ts` から同名・同型で re-export。`bun run typecheck` green。

### request.md

受け入れ基準 8 項目すべて充足。スコープ外事項（役割フィールド・resolve-step 一般化・収束意味論・入出力契約）への変更なし。
