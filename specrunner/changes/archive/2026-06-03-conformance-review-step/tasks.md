# Tasks: conformance-review-step

## T-01: STEP_NAMES に conformance を追加

- [x] `src/kernel/step-names.ts` の `AGENT_STEP_NAMES` 配列に `"conformance"` を追加
- [x] `STEP_NAMES` オブジェクトに `CONFORMANCE: "conformance"` を追加

**Acceptance Criteria**:
- `StepName` 型に `"conformance"` が含まれる（型チェック通過）
- `AGENT_STEP_NAMES` に `"conformance"` が含まれる

## T-02: conformance result path ユーティリティを追加

- [x] `src/util/paths.ts` に `conformanceResultPath(slug: string, iteration: number): string` を追加
- [x] 返り値: `specrunner/changes/${slug}/conformance-result-${nnn}.md`（nnn = zero-padded 3 digits）

**Acceptance Criteria**:
- `conformanceResultPath("foo", 1)` → `"specrunner/changes/foo/conformance-result-001.md"`

## T-03: conformance system prompt を作成

- [x] `src/prompts/conformance-system.ts` を新規作成
- [x] identity priming + rules.md Read 指示（既存 step と同パターン）
- [x] 4 判断項目（tasks.md 全完了 / design.md 通り / spec.md 満足 / request.md 達成）を明記
- [x] verdict 定義: approved / needs-fix / escalation
- [x] 結果ファイルのフォーマット指示（findings 付き）
- [x] `buildSystemPrompt` + `PIPELINE_RULES` fragment を使用
- [x] `report_result` tool 呼び出し指示
- [x] read-only 制約（ソースコード変更不可）

**Acceptance Criteria**:
- export `CONFORMANCE_SYSTEM_PROMPT` が存在し string 型
- 4 判断項目が prompt 内に記述されている

## T-04: ConformanceStep を実装

- [x] `src/core/step/conformance.ts` を新規作成
- [x] `AgentStep` インターフェース準拠（kind: "agent"）
- [x] `JUDGE_REPORT_TOOL` を reportTool に設定
- [x] `needsProjectContext: true`
- [x] `buildMessage`: slug, iteration, findingsPath, requestContent を組み込む初期メッセージ構築
- [x] `resultFilePath`: conformanceResultPath を使用（iteration ベース）
- [x] `parseResult`: verdict: null を返す（R4 contract: executor が typed toolResult を使用）
- [x] `maxTurns`: 15（spec-review と同等 — read + judgment）
- [x] AgentDefinition: name `"specrunner-conformance"`, role `"conformance"`, model opus, gitWrite: true

**Acceptance Criteria**:
- `ConformanceStep` が `AgentStep` 型として export される
- `ConformanceStep.name` が `"conformance"`

## T-05: 遷移テーブルを変更

- [x] `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` を変更:
  - `code-review approved → adr-gen` の行を `code-review approved → conformance` に変更（when なし）
  - `code-fixer approved → adr-gen`（when: lastReview.verdict === "approved"）の行を `code-fixer approved → conformance` に変更
  - 新規: `{ step: STEP_NAMES.CONFORMANCE, on: "approved", to: STEP_NAMES.ADR_GEN }`
  - 新規: `{ step: STEP_NAMES.CONFORMANCE, on: "needs-fix", to: STEP_NAMES.IMPLEMENTER }`
- [x] `LOOP_ERROR_CODES` に conformance エントリを追加:
  - key: `STEP_NAMES.CONFORMANCE`
  - code: `"CONFORMANCE_RETRIES_EXHAUSTED"`
  - message: `(n) => \`conformance did not approve after ${n} iterations\``
  - hint: `(nnn) => \`Review conformance-result-${nnn}.md and fix the implementation manually.\``

**Acceptance Criteria**:
- adr-gen へ入る transition は `conformance approved` のみ
- code-review / code-fixer から adr-gen への直行辺が存在しない
- conformance needs-fix → implementer の transition が存在する

## T-06: pipeline run.ts に conformance を登録

- [x] `src/core/pipeline/run.ts`:
  - `import { ConformanceStep }` を追加
  - `steps` Map に `[STEP_NAMES.CONFORMANCE, ConformanceStep]` を追加
  - `STANDARD_LOOP_NAMES` に `STEP_NAMES.CONFORMANCE` を追加

**Acceptance Criteria**:
- `createStandardPipeline` が返す Pipeline の steps に conformance が含まれる
- conformance が loopNames に含まれる

## T-07: code-review-system.ts の spec 参照を修正

- [x] `src/prompts/code-review-system.ts` L32: `(design.md, tasks.md, specs/)` → `(design.md, tasks.md, spec.md)`

**Acceptance Criteria**:
- code-review system prompt に `specs/` が含まれない
- `spec.md` が含まれる

## T-08: テストを追加・修正

- [x] `tests/unit/core/pipeline/pipeline.transitions.test.ts` に conformance 関連の遷移テストを追加:
  - code-review approved (no fixable) → conformance
  - code-fixer approved (observation-fix) → conformance
  - conformance approved → adr-gen
  - conformance needs-fix → implementer
  - adr-gen への直行辺が存在しないことを assert
- [x] `LOOP_ERROR_CODES` に conformance エントリが存在することをテスト
- [x] 既存テストで adr-gen 直行を前提としたものがあれば修正

**Acceptance Criteria**:
- `bun run typecheck` が green
- `bun run test` が green
- 新規テストが conformance の遷移を検証している
