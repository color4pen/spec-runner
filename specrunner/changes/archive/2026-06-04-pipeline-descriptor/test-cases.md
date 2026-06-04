# Test Cases: pipeline 構成を PipelineDescriptor + registry に集約し pipelineId で選択する

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration): 23
- **Manual**: 0
- **Priority**: must: 17, should: 6, could: 0

---

### TC-001: standard job は標準記述子で構築される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: pipeline 構築は pipelineId で記述子を解決する > Scenario: standard job は標準記述子で構築される

---

### TC-002: pipelineId 不在の legacy state は standard に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipeline 構築は pipelineId で記述子を解決する > Scenario: pipelineId 不在の legacy state は standard に解決される

---

### TC-003: 既知 id は対応する記述子を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: registry はちょうど 2 件の記述子を登録し未知 id を拒否する > Scenario: 既知 id は対応する記述子を返す

---

### TC-004: 未登録 id は拒否される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: registry はちょうど 2 件の記述子を登録し未知 id を拒否する > Scenario: 未登録 id は拒否される

---

### TC-005: design-only id が定数化されている

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: design-only 記述子は "design-only" として PIPELINE_IDS に登録される > Scenario: design-only id が定数化されている

---

### TC-006: design-only pipeline が registry 経由で動作する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: design-only 記述子は "design-only" として PIPELINE_IDS に登録される > Scenario: design-only pipeline が registry 経由で動作する

---

### TC-007: 標準出力スナップショットが byte 同一

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 標準 pipeline の挙動と画面出力は不変である > Scenario: 標準出力スナップショットが byte 同一

---

### TC-008: resolve-step を変更せず typecheck が通る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resolve-step が参照する STANDARD_* は存続する > Scenario: resolve-step を変更せず typecheck が通る

---

### TC-009: PipelineDescriptor が maxIterations を optional で持つ

**Category**: unit
**Priority**: must
**Source**: design.md D1 / tasks.md T-01

**GIVEN** `src/core/pipeline/types.ts` に `PipelineDescriptor` interface が定義されている  
**WHEN** `maxIterations` を省略した宣言と `maxIterations: 1` を持つ宣言の両方を typecheck する  
**THEN** 両パターンで typecheck が通り、`maxIterations` が optional field として扱われる

---

### TC-010: STANDARD_DESCRIPTOR の各フィールドが現行値と一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** `STANDARD_DESCRIPTOR` が `registry.ts` に定義されている  
**WHEN** `STANDARD_DESCRIPTOR` の各フィールドを参照する  
**THEN** `steps` の順序・件数が現行 `createStandardPipeline` の Map entries と同一、`transitions` が `STANDARD_TRANSITIONS` と同一オブジェクト参照、`loopName` / `loopNames` / `loopFixerPairs` / `startStep` が現行 `STANDARD_*` 定数と値・順序ともに一致する

---

### TC-011: buildPipeline が maxIterations を descriptor 優先・config fallback で解決する

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T-03

**GIVEN** `maxIterations = 3` を持つ記述子と、`maxIterations` を省略した記述子がある  
**WHEN** それぞれ `buildPipeline(descriptor, deps)` を呼ぶ  
**THEN** 前者は `3`、後者は `getMaxRetries(deps.config)` の値が `Pipeline` の `maxIterations` として渡る

---

### TC-012: registry が run.ts を import しない

**Category**: unit
**Priority**: should
**Source**: design.md D3 / tasks.md T-02

**GIVEN** `src/core/pipeline/registry.ts` が存在する  
**WHEN** registry.ts の import 宣言を検査する  
**THEN** `run.ts` / `run.js` への import が一切存在せず、依存方向が registry → (step / types / kernel) の一方向になっている

---

### TC-013: STANDARD_LOOP_NAMES / STANDARD_LOOP_FIXER_PAIRS が run.ts から re-export されている

**Category**: unit
**Priority**: must
**Source**: design.md D4 / tasks.md T-03

**GIVEN** `STANDARD_DESCRIPTOR` が `registry.ts` に定義されている  
**WHEN** `STANDARD_LOOP_NAMES` と `STANDARD_LOOP_FIXER_PAIRS` を `run.js` から import する  
**THEN** それぞれ `STANDARD_DESCRIPTOR.loopNames` / `STANDARD_DESCRIPTOR.loopFixerPairs` と同値で、型・要素順が一致する

---

### TC-014: buildPipelineForJob が getPipelineId で記述子を解決する

**Category**: unit
**Priority**: must
**Source**: design.md D5 / tasks.md T-04

**GIVEN** `pipelineId = "standard"` を持つ job state がある  
**WHEN** `buildPipelineForJob(jobState, deps)` を呼ぶ  
**THEN** 内部で `getPipelineDescriptor("standard")` が呼ばれ、`STANDARD_DESCRIPTOR` を使って構築した `Pipeline` が返る

---

### TC-015: runner.ts が buildPipelineForJob を使って Pipeline を構築する

**Category**: integration
**Priority**: must
**Source**: design.md D6 / tasks.md T-04

**GIVEN** `CommandRunner.execute()` が呼ばれる状態にある  
**WHEN** run または resume を実行する  
**THEN** `buildPipelineForJob(jobState, deps, events)` が呼ばれ、`createStandardPipeline` は呼ばれない

---

### TC-016: resume の startStep が prepared.startStep で渡る

**Category**: integration
**Priority**: must
**Source**: design.md D6 / tasks.md T-04

**GIVEN** 中途の step（例: `"code-review"`）から resume する job state がある  
**WHEN** `buildPipelineForJob` で Pipeline を構築し `pipeline.run(startStep, ...)` を呼ぶ  
**THEN** `startStep` は `STANDARD_DESCRIPTOR.startStep`（`"design"`）ではなく `prepared.startStep`（例: `"code-review"`）になる

---

### TC-017: runDesignPipeline が DESIGN_ONLY_DESCRIPTOR に委譲し inline 定義を持たない

**Category**: unit
**Priority**: should
**Source**: design.md D7 / tasks.md T-03

**GIVEN** `src/core/pipeline/run.ts` の `runDesignPipeline` が更新されている  
**WHEN** `run.ts` のソースを確認する  
**THEN** inline step Map・遷移テーブル定義が存在せず、`buildPipeline(DESIGN_ONLY_DESCRIPTOR, ...)` への委譲になっている

---

### TC-018: pipeline/index.ts が新規 export を公開している

**Category**: unit
**Priority**: should
**Source**: tasks.md T-05

**GIVEN** `src/core/pipeline/index.ts` が更新されている  
**WHEN** `PipelineDescriptor` / `buildPipeline` / `buildPipelineForJob` / `getPipelineDescriptor` / `PIPELINE_REGISTRY` を `pipeline/index.js` から import する  
**THEN** 全 export が解決でき、既存 export（`runPipeline` / `runDesignPipeline` / `createStandardPipeline` 等）も引き続き解決できる

---

### TC-019: テスト mock が buildPipelineForJob を握っている

**Category**: unit
**Priority**: must
**Source**: tasks.md T-06

**GIVEN** `runner.test.ts` / `resume.test.ts` / `cli/resume.test.ts` の `vi.mock` が更新されている  
**WHEN** 各テストファイルを実行する  
**THEN** `buildPipelineForJob` が mock され、full deps なしでテストが通る（`createStandardPipeline` の mock 呼び出しが不要になっても壊れない）

---

### TC-020: run.test.ts TC-025 が STANDARD_DESCRIPTOR のランタイム値を参照している

**Category**: unit
**Priority**: should
**Source**: tasks.md T-06

**GIVEN** `tests/unit/core/pipeline/run.test.ts` の TC-025 が更新されている  
**WHEN** テストを実行する  
**THEN** `run.ts` ソース読み取り・`[STEP_NAMES.*, Step]` パターンマッチが除去され、`STANDARD_DESCRIPTOR.steps.length >= 9` のランタイムアサーションで代替されている

---

### TC-021: pipeline.transitions.test.ts TC-023/016 がランタイム import に置き換えられている

**Category**: unit
**Priority**: should
**Source**: tasks.md T-06

**GIVEN** `tests/unit/core/pipeline/pipeline.transitions.test.ts` の TC-023/016 が更新されている  
**WHEN** テストを実行する  
**THEN** `run.ts` ソース読み取りが除去され、`STANDARD_LOOP_NAMES` のランタイム import と `toContain` / `not.toContain` チェックで代替されている

---

### TC-022: bun run typecheck && bun run test が全 green

**Category**: integration
**Priority**: must
**Source**: tasks.md T-07

**GIVEN** 全タスク（T-01〜T-06）の実装が完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** typecheck エラーなし、テスト失敗なし

---

### TC-023: DESIGN_ONLY_DESCRIPTOR の transitions が design→end / error→escalate である

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** `DESIGN_ONLY_DESCRIPTOR` が `registry.ts` に定義されている  
**WHEN** `DESIGN_ONLY_DESCRIPTOR.transitions` を参照する  
**THEN** design success→end / design error→escalate の 2 遷移が存在し、現行 `runDesignPipeline` の inline 定義と同値である

---

## Result

```yaml
result: completed
total: 23
automated: 23
manual: 0
must: 17
should: 6
could: 0
blocked_reasons: []
```
