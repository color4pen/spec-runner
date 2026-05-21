# Tasks: delta-spec-path-validation-hook

## T-01: step-names 定数追加

- [x] `src/core/step/step-names.ts` に `DELTA_SPEC_VALIDATION: "delta-spec-validation"` を追加
- [x] `src/core/step/step-names.ts` に `DELTA_SPEC_FIXER: "delta-spec-fixer"` を追加

**受け入れ基準**: `STEP_NAMES.DELTA_SPEC_VALIDATION` と `STEP_NAMES.DELTA_SPEC_FIXER` が型安全に参照可能

---

## T-02: validator module 新設

- [x] `src/core/spec/delta-spec-validator.ts` を新設
- [x] 型定義: `DeltaSpecViolationReason = "legacy-flat-file" | "legacy-flat-dir" | "non-canonical-path" | "missing-requirements-section" | "empty-section"`
- [x] 型定義: `DeltaSpecViolation = { path: string; reason: DeltaSpecViolationReason; suggested?: string }`
- [x] DI parameter 型: `{ readdir(path: string): Promise<string[]>; readFile(path: string): Promise<string> }`
- [x] export: `validateDeltaSpecPaths(changePath: string, deps: DeltaSpecValidatorFs): Promise<{ ok: true } | { ok: false; violations: DeltaSpecViolation[] }>`
- [x] 検出ロジック実装:
  - `<change>/delta-spec.md` → `legacy-flat-file`
  - `<change>/delta-spec/*.md` → `legacy-flat-dir`
  - `<change>/specs/*.delta.md` → `legacy-flat-file`
  - `<change>/specs/<name>.md` 直置き (subdir なし) → `non-canonical-path`
- [x] 正規 path (`<change>/specs/<cap>/spec.md`) の format check:
  - `## ADDED|MODIFIED|REMOVED Requirements` のいずれも無し → `missing-requirements-section`
  - section あるが Requirement block 0 個 → `empty-section`
- [x] `{ ok: true }` は違反 0 件の場合のみ返す

**受け入れ基準**: 4 path 違反パターン + 2 format 違反を漏れなく検出。DI で fs mock 可能。

---

## T-03: delta-spec-validation CliStep 新設

- [x] `src/core/step/delta-spec-validation.ts` を新設
- [x] `CliStep` interface を実装（`VerificationStep` を雛形）
- [x] `name`: `STEP_NAMES.DELTA_SPEC_VALIDATION`
- [x] `run()`: `validateDeltaSpecPaths()` を呼び、result file (`delta-spec-validation-result.md`) を worktree に書き出す
- [x] `resultFilePath()`: `<change>/delta-spec-validation-result.md` のパスを返す
- [x] `parseResult()`: result file から verdict を抽出
  - 違反 0 件 → `{ verdict: "approved", findingsPath: null }`
  - 違反あり → `{ verdict: "needs-fix", findingsPath: <result file path> }`
- [x] result file format: violations の一覧を markdown table で出力（path / reason / suggested fix）

**受け入れ基準**: CliStep として StepExecutor から実行可能。verdict が "approved" / "needs-fix" で正しく分岐。

---

## T-04: delta-spec-fixer AgentStep 新設

- [x] `src/core/step/delta-spec-fixer.ts` を新設
- [x] `AgentStep` interface を実装（`SpecFixerStep` を雛形）
- [x] `name`: `STEP_NAMES.DELTA_SPEC_FIXER`
- [x] `agent`: `SPEC_FIXER_SYSTEM_PROMPT` を流用した `AgentDefinition`（role: `"delta-spec-fixer"`, name: `"specrunner-delta-spec-fixer"`）
- [x] `phase`: `"spec"`
- [x] `completionVerdict`: `"approved"`
- [x] `requiresCommit`: `true`
- [x] `maxTurns`: `25`
- [x] `buildMessage()`: validation result file の違反詳細を user prompt に注入
  - 初回: change folder path + branch + validation result file path + 修正指示
  - 継続 (isFixerContinuation): 短縮 prompt
- [x] `resultFilePath()`: `null`
- [x] `parseResult()`: `NULL_PARSE_RESULT`

**受け入れ基準**: spec-fixer と同じ agent definition / system prompt を使用。validation result 内容が user prompt に含まれる。

---

## T-05: paths.ts にヘルパー追加

- [x] `src/util/paths.ts` に `deltaSpecValidationResultPath(slug: string): string` を追加
  - 戻り値: `specrunner/changes/<slug>/delta-spec-validation-result.md`

**受け入れ基準**: T-03 / T-04 がこのヘルパーを使用。

---

## T-06: STANDARD_TRANSITIONS 更新

- [x] `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` を更新:
  - `DESIGN → SPEC_REVIEW` を `DESIGN → DELTA_SPEC_VALIDATION` に差し替え
  - `SPEC_FIXER → SPEC_REVIEW` を `SPEC_FIXER → DELTA_SPEC_VALIDATION` に差し替え
  - 追加: `DELTA_SPEC_VALIDATION → SPEC_REVIEW` (on: "approved")
  - 追加: `DELTA_SPEC_VALIDATION → DELTA_SPEC_FIXER` (on: "needs-fix")
  - 追加: `DELTA_SPEC_VALIDATION → escalate` (on: "escalation")
  - 追加: `DELTA_SPEC_FIXER → DELTA_SPEC_VALIDATION` (on: "approved")
  - 追加: `DELTA_SPEC_FIXER → escalate` (on: "error")

**受け入れ基準**: design / spec-fixer 完了後に delta-spec-validation を経由してから spec-review に進む経路が成立。

---

## T-07: LOOP_ERROR_CODES 更新

- [x] `src/core/pipeline/types.ts` の `LOOP_ERROR_CODES` に entry 追加:
  ```ts
  [STEP_NAMES.DELTA_SPEC_VALIDATION]: {
    code: "DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED",
    message: (n) => `delta-spec-validation did not pass after ${n} iterations`,
    hint: (nnn) => `Review delta-spec-validation-result.md and fix path/format violations manually.`,
  }
  ```

**受け入れ基準**: delta-spec-validation loop exhaust 時に適切な error code / message が生成される。

---

## T-08: loopNames 更新 + loopFixerPairs 追加

- [x] `src/core/pipeline/run.ts` の `loopNames` に `STEP_NAMES.DELTA_SPEC_VALIDATION` を追加（4 entry に）
- [x] Pipeline コンストラクタ / `createStandardPipeline()` で `loopFixerPairs` を確認:
  - #269 マージ済み: `loopFixerPairs` に `{ [STEP_NAMES.DELTA_SPEC_VALIDATION]: STEP_NAMES.DELTA_SPEC_FIXER }` entry を追加
  - #269 未マージ: `pipeline.ts` の `PipelineConfig` に `loopFixerPairs?: Record<string, string>` を追加し、`createStandardPipeline` で `{ [STEP_NAMES.DELTA_SPEC_VALIDATION]: STEP_NAMES.DELTA_SPEC_FIXER }` を渡す

**受け入れ基準**: delta-spec-validation loop が独立 counter で動作する。spec-review iter に影響しない。

---

## T-09: steps map 登録

- [x] `src/core/pipeline/run.ts` の steps Map に追加:
  - `[STEP_NAMES.DELTA_SPEC_VALIDATION, DeltaSpecValidationStep]`
  - `[STEP_NAMES.DELTA_SPEC_FIXER, DeltaSpecFixerStep]`
- [x] import 文を追加

**受け入れ基準**: pipeline 実行時に両 step が正しく解決される。

---

## T-10: prompt 共通定数の新設

- [x] `src/prompts/delta-spec-format.ts` を新設
- [x] export する定数:
  - `CANONICAL_DELTA_SPEC_PATH_PATTERN`: `"specs/<capability-name>/spec.md"` (説明文字列)
  - `BANNED_DELTA_SPEC_PATHS`: 禁止 path 3 pattern の説明配列
  - `VALID_SECTION_HEADERS`: `["## ADDED Requirements", "## MODIFIED Requirements", "## REMOVED Requirements", "## RENAMED Requirements"]`
  - `DELTA_SPEC_FORMAT_RULES`: section / ファイル配置ルールの markdown テキストブロック（両 prompt に埋め込み用）
- [x] `design-system.ts` の「Delta Spec Format Rules」セクション + 「ファイル配置」セクションを `DELTA_SPEC_FORMAT_RULES` の import に置換
- [x] `spec-fixer-system.ts` の「Delta Spec Format Rules」セクション + 「ファイル配置」セクションを同 import に置換
- [x] 置換後の prompt 出力が変更前と同内容であることを確認

**受け入れ基準**: 両 prompt で delta spec format rules の文言が単一ソースから供給される。文言の二重管理が解消。

---

## T-11: unit test — validator

- [x] `tests/unit/core/spec/delta-spec-validator.test.ts` を新設
- [x] TC: 正規 path + 正規 section + 非空 Requirement → `{ ok: true }`
- [x] TC: `<change>/delta-spec/<capability>.md` のみ → `legacy-flat-dir` violation
- [x] TC: `<change>/delta-spec.md` のみ → `legacy-flat-file` violation
- [x] TC: `<change>/specs/<name>.delta.md` のみ → `legacy-flat-file` violation
- [x] TC: 正規 path だが section が `## ADDED` (Requirements suffix 無し) → `missing-requirements-section`
- [x] TC: 正規 path + section header あり + Requirement block 0 個 → `empty-section`
- [x] TC: 正規 path + 旧形式 path 両方存在 → 旧形式が violation 登録される
- [x] TC: 複数 capability の正規 path が全て ok → `{ ok: true }`

**受け入れ基準**: 全 TC が pass。DI mock で fs 操作をシミュレート。

---

## T-12: unit test — delta-spec-validation step

- [x] `tests/unit/step/delta-spec-validation.test.ts` を新設
- [x] TC: validator が `{ ok: true }` → step verdict が `"approved"`
- [x] TC: validator が `{ ok: false, violations }` → step verdict が `"needs-fix"` + result file に violations が書かれる
- [x] TC: result file format が delta-spec-fixer の入力として parse 可能

**受け入れ基準**: step が validator 結果を正しく verdict に変換し、result file を生成。

---

## T-13: unit test — delta-spec-fixer step

- [x] `tests/unit/step/delta-spec-fixer.test.ts` を新設
- [x] TC: validation result file path が buildMessage に含まれる
- [x] TC: agent definition の system prompt が `SPEC_FIXER_SYSTEM_PROMPT` と一致
- [x] TC: completionVerdict が `"approved"`

**受け入れ基準**: spec-fixer 流用が確認でき、validation feedback が注入される。

---

## T-14: pipeline integration test

- [x] `tests/pipeline-integration.test.ts`（既存 or 新設）に追加:
- [x] TC: design → delta-spec-validation approved → spec-review が走る
- [x] TC: design → delta-spec-validation needs-fix → delta-spec-fixer → delta-spec-validation approved → spec-review が走る
- [x] TC: spec-fixer 経由でも delta-spec-validation を通る
- [x] TC: delta-spec-validation が `maxIterations` 回 needs-fix で escalation する
- [x] TC: delta-spec-validation loop の試行が spec-review loop counter に影響しない
- [x] TC: 観測例 (`managed-reset-status-stale-guard` 相当) scenario が完走する

**受け入れ基準**: 全 TC pass。遷移 + counter 独立性 + exhaust escalation が検証される。

---

## T-15: typecheck + test green 確認

- [x] `bun run typecheck` が pass
- [x] `bun run test` が pass（既存テスト regression なし）

**受け入れ基準**: CI green 相当。
