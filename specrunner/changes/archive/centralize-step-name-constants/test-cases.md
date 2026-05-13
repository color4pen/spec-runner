# Test Cases: Centralize Step Name Constants

## TC-01: step-names.ts が作成され全ステップ名を定義している

- **Category**: 定数定義ファイル
- **Priority**: must
- **Source**: request.md 要件1、tasks.md Task 1

**GIVEN** `src/core/step/step-names.ts` が実装されている  
**WHEN** ファイルを読む  
**THEN**
- `STEP_NAMES` が export されている
- `DESIGN`, `SPEC_REVIEW`, `SPEC_FIXER`, `TEST_CASE_GEN`, `IMPLEMENTER`, `VERIFICATION`, `BUILD_FIXER`, `CODE_REVIEW`, `CODE_FIXER`, `PR_CREATE` の10キーが存在する
- 各値が対応する文字列リテラル（`"design"`, `"spec-review"` 等）と完全一致する
- `as const` アサーションが付いている

---

## TC-02: StepName 型が STEP_NAMES から導出されている

- **Category**: 型システム
- **Priority**: must
- **Source**: request.md 要件2、tasks.md Task 2

**GIVEN** `src/state/schema.ts` が更新されている  
**WHEN** `StepName` 型の定義を確認する  
**THEN**
- `typeof STEP_NAMES[keyof typeof STEP_NAMES]` 形式で導出されている
- 手動 union（`"design" | "spec-review" | ...`）が残っていない
- `STEP_NAMES` の import が追加されている

---

## TC-03: AgentStepName 型が定数で VERIFICATION と PR_CREATE を除外している

- **Category**: 型システム
- **Priority**: must
- **Source**: tasks.md Task 2

**GIVEN** `src/state/schema.ts` が更新されている  
**WHEN** `AgentStepName` 型の定義を確認する  
**THEN**
- `Exclude<StepName, typeof STEP_NAMES.VERIFICATION | typeof STEP_NAMES.PR_CREATE>` の形式になっている
- `"verification" | "pr-create"` の文字列リテラルが定義行に残っていない

---

## TC-04: 各 step 定義ファイルの name プロパティが定数参照になっている

- **Category**: step 定義ファイル
- **Priority**: must
- **Source**: request.md 要件3、tasks.md Task 3

**GIVEN** 10個の step 定義ファイルが更新されている  
**WHEN** 各ファイルの `name:` プロパティを確認する  
**THEN**
- `design.ts`: `name: STEP_NAMES.DESIGN`
- `spec-review.ts`: `name: STEP_NAMES.SPEC_REVIEW`
- `spec-fixer.ts`: `name: STEP_NAMES.SPEC_FIXER`
- `test-case-gen.ts`: `name: STEP_NAMES.TEST_CASE_GEN`
- `implementer.ts`: `name: STEP_NAMES.IMPLEMENTER`
- `verification.ts`: `name: STEP_NAMES.VERIFICATION`
- `build-fixer.ts`: `name: STEP_NAMES.BUILD_FIXER`
- `code-review.ts`: `name: STEP_NAMES.CODE_REVIEW`
- `code-fixer.ts`: `name: STEP_NAMES.CODE_FIXER`
- `pr-create.ts`: `name: STEP_NAMES.PR_CREATE`
- 各ファイルに `import { STEP_NAMES } from "./step-names.js"` が追加されている

---

## TC-05: step 定義ファイルの role プロパティが定数参照になっている

- **Category**: step 定義ファイル
- **Priority**: must
- **Source**: design.md D10、tasks.md Task 3 追加スコープ

**GIVEN** step 定義ファイルが更新されている  
**WHEN** `role:` プロパティを持つファイル（8ファイル）を確認する  
**THEN**
- `role: "design"` 等の文字列リテラルが残っていない
- `role: STEP_NAMES.DESIGN` 等の定数参照に置換されている

---

## TC-06: step 定義ファイル内の step 名参照（state アクセス・エラー生成）が定数化されている

- **Category**: step 定義ファイル
- **Priority**: must
- **Source**: tasks.md Task 3 追加スコープ

**GIVEN** step 定義ファイルが更新されている  
**WHEN** ファイル内の step 名文字列リテラルを確認する  
**THEN**
- `state.steps?.["spec-review"]` 等のパターンが定数参照（`state.steps?.[STEP_NAMES.SPEC_REVIEW]`）に置換されている
- `getLatestStepResult(state, "spec-review")` 等の呼び出し引数が定数参照に置換されている
- `branchNotSetError("step-name")` の引数が定数参照に置換されている

---

## TC-07: LOOP_ERROR_CODES のキーが computed property で定数参照になっている

- **Category**: pipeline/types.ts
- **Priority**: must
- **Source**: design.md D3、tasks.md Task 4

**GIVEN** `src/core/pipeline/types.ts` が更新されている  
**WHEN** `LOOP_ERROR_CODES` の定義を確認する  
**THEN**
- `[STEP_NAMES.SPEC_REVIEW]`, `[STEP_NAMES.VERIFICATION]`, `[STEP_NAMES.CODE_REVIEW]` の computed property 記法になっている
- 文字列リテラルキー（`"spec-review"` 等）が残っていない

---

## TC-08: STANDARD_TRANSITIONS が定数参照になっている

- **Category**: pipeline/types.ts
- **Priority**: must
- **Source**: request.md 要件4、tasks.md Task 4、design.md D4

**GIVEN** `src/core/pipeline/types.ts` が更新されている  
**WHEN** `STANDARD_TRANSITIONS` の定義を確認する  
**THEN**
- 全 `step` / `to` プロパティのステップ名が `STEP_NAMES.*` 定数参照になっている
- `"end"` と `"escalate"` の文字列リテラルは変更されていない（制御値のため）

---

## TC-09: pipeline/run.ts の steps Map と loopName が定数参照になっている

- **Category**: pipeline/run.ts
- **Priority**: must
- **Source**: tasks.md Task 5

**GIVEN** `src/core/pipeline/run.ts` が更新されている  
**WHEN** `createStandardPipeline` の実装を確認する  
**THEN**
- `steps` Map の10個のキーがすべて `STEP_NAMES.*` 定数参照になっている
- `loopName: STEP_NAMES.SPEC_REVIEW` に置換されている
- `loopNames: [STEP_NAMES.SPEC_REVIEW, STEP_NAMES.VERIFICATION, STEP_NAMES.CODE_REVIEW]` に置換されている
- `runDesignPipeline` / `runPipeline` 内の `"design"` リテラルが `STEP_NAMES.DESIGN` に置換されている

---

## TC-10: executor.ts の PROJECT_CONTEXT_STEPS が定数参照になっている

- **Category**: executor.ts
- **Priority**: must
- **Source**: design.md D5、tasks.md Task 6

**GIVEN** `src/core/step/executor.ts` が更新されている  
**WHEN** `PROJECT_CONTEXT_STEPS` の定義を確認する  
**THEN**
- `new Set([STEP_NAMES.DESIGN, STEP_NAMES.SPEC_REVIEW, STEP_NAMES.IMPLEMENTER, STEP_NAMES.CODE_REVIEW])` になっている
- 文字列リテラルが残っていない

---

## TC-11: resolve-step.ts の全 Set・STEP_MAPPING が定数参照になっている

- **Category**: resume/resolve-step.ts
- **Priority**: must
- **Source**: design.md D6、tasks.md Task 7

**GIVEN** `src/core/resume/resolve-step.ts` が更新されている  
**WHEN** `SPEC_PHASE_STEPS`, `CODE_PHASE_STEPS`, `REVIEWER_STEPS`, `STEP_MAPPING` の定義を確認する  
**THEN**
- `SPEC_PHASE_STEPS` の `"design"`, `"spec-review"`, `"spec-fixer"` が定数参照
- `CODE_PHASE_STEPS` の全6ステップが定数参照
- `REVIEWER_STEPS` の `"spec-review"`, `"code-review"` が定数参照
- `STEP_MAPPING` の値がすべて定数参照

---

## TC-12: doctor チェックの REQUIRED_AGENTS・AGENT_ROLES が定数参照になっている

- **Category**: doctor checks
- **Priority**: must
- **Source**: design.md D7、tasks.md Task 8・9

**GIVEN** `agents-registered.ts` と `definition-drift.ts` が更新されている  
**WHEN** 配列定義を確認する  
**THEN**
- `REQUIRED_AGENTS` の全要素が `STEP_NAMES.*` 定数参照になっている
- `AGENT_ROLES` の全要素が `STEP_NAMES.*` 定数参照になっている

---

## TC-13: config/migrate.ts の CAMEL_TO_KEBAB 値が定数参照になっている

- **Category**: config/migrate.ts
- **Priority**: must
- **Source**: design.md D8、tasks.md Task 10

**GIVEN** `src/config/migrate.ts` が更新されている  
**WHEN** `CAMEL_TO_KEBAB` の定義を確認する  
**THEN**
- 値（`STEP_NAMES.SPEC_FIXER`, `STEP_NAMES.SPEC_REVIEW`, `STEP_NAMES.DESIGN`）が定数参照になっている
- キー（`specFixer`, `specReview`, `propose`, `design`）は変更されていない
- `result["design"]` 形式のキーアクセスが `result[STEP_NAMES.DESIGN]` に置換されている
- `"propose"` の後方互換キー（変換元）は変更されていない

---

## TC-14: agent-runner.ts の比較式が定数参照になっている

- **Category**: adapter/managed-agent
- **Priority**: must
- **Source**: design.md D10、tasks.md Task 11

**GIVEN** `src/adapter/managed-agent/agent-runner.ts` が更新されている  
**WHEN** ステップ名を使った比較式を確認する  
**THEN**
- `step.name === "code-review"` 等の比較が `step.name === STEP_NAMES.CODE_REVIEW` に置換されている
- `step.agent.role === "design"` 等の role 比較が定数参照に置換されている

---

## TC-15: その他対象ファイルの文字列リテラルが定数参照になっている

- **Category**: その他ファイル
- **Priority**: must
- **Source**: tasks.md Task 11

**GIVEN** 以下のファイルが更新されている:
- `src/core/command/runner.ts`
- `src/config/schema.ts`
- `src/config/step-config.ts`
- `src/core/pipeline/pipeline.ts`
- `src/core/command/pipeline-run.ts`
- `src/core/pr-create/body-template.ts`  
**WHEN** 各ファイルのステップ名参照を確認する  
**THEN**
- すべてのステップ名文字列リテラルが `STEP_NAMES.*` 定数参照に置換されている
- `pipeline-run.ts` の `startStep: "design"` が `startStep: STEP_NAMES.DESIGN` になっている

---

## TC-16: grep 検証コマンドがゼロヒットを返す

- **Category**: リテラル排除検証
- **Priority**: must
- **Source**: request.md 要件6・受け入れ基準、tasks.md Task 12

**GIVEN** 全ファイルの置換が完了している  
**WHEN** 以下のコマンドを実行する:
```bash
grep -rn '"design"\|"spec-review"\|"spec-fixer"\|"test-case-gen"\|"implementer"\|"verification"\|"build-fixer"\|"code-review"\|"code-fixer"\|"pr-create"' src/ --include='*.ts' \
  | grep -v 'step-names.ts' \
  | grep -v '\.test\.ts'
```
**THEN**
- 出力がゼロ行（ヒットなし）である

---

## TC-17: validateJobState の後方互換リマップが変更されていない

- **Category**: 後方互換
- **Priority**: must
- **Source**: request.md 補足、tasks.md Task 2 注意

**GIVEN** `src/state/schema.ts` が更新されている  
**WHEN** `validateJobState` 内の旧ステップ名リマップを確認する  
**THEN**
- `"propose"` → `"design"` のリマップ文字列が変更されていない（歴史的な値のため定数化不適）

---

## TC-18: bun run typecheck が全 pass する

- **Category**: ビルド
- **Priority**: must
- **Source**: request.md 受け入れ基準、tasks.md Task 12

**GIVEN** 全変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN**
- 型エラーがゼロで終了する

---

## TC-19: bun run test が全 pass する

- **Category**: ビルド
- **Priority**: must
- **Source**: request.md 受け入れ基準、tasks.md Task 12

**GIVEN** 全変更が適用されている  
**WHEN** `bun run test` を実行する  
**THEN**
- 全テストケースが pass する
- 失敗・スキップしたテストが増えていない（振る舞いが変わっていない）

---

## TC-20: step-names.ts から schema.ts への逆方向 import が発生していない

- **Category**: 循環依存
- **Priority**: should
- **Source**: design.md D1

**GIVEN** `src/core/step/step-names.ts` が作成されている  
**WHEN** ファイルの import 文を確認する  
**THEN**
- `schema.ts` または `state/` 配下のファイルを import していない
- 依存方向が `step-names.ts` → (なし)、`schema.ts` → `step-names.ts` の一方向になっている

---

## TC-21: テストファイル内の文字列リテラルはスコープ外である

- **Category**: スコープ外確認
- **Priority**: should
- **Source**: request.md 補足

**GIVEN** `*.test.ts` ファイルが存在する  
**WHEN** テストファイル内のステップ名リテラルを確認する  
**THEN**
- テストファイル内の文字列リテラルが残っていても問題ない（スコープ外）
- テストが定数を import して参照していても問題ない

---

## TC-22: STEP_NAMES に新ステップを追加すると StepName 型に自動反映される

- **Category**: 型システム（将来の保守性）
- **Priority**: could
- **Source**: request.md 目的

**GIVEN** `STEP_NAMES` が `as const` で定義されている  
**WHEN** `STEP_NAMES` に新しいキー・値を追加する  
**THEN**
- `StepName` 型が自動的に新しい値を含む union 型に拡張される
- 既存コードを個別に修正しなくても型チェックが機能する
