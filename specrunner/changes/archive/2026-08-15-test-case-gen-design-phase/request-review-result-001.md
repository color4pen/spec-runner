# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証 (Step 2: Code Assertion Fact-Check)

#### `src/core/pipeline/types.ts` — 遷移表

- **L232**: `{ step: STEP_NAMES.DESIGN, on: "success", to: STEP_NAMES.SPEC_REVIEW }` ✅ (request `:232`)
- **L236**: `{ step: STEP_NAMES.SPEC_REVIEW, on: "approved", to: STEP_NAMES.SPEC_FIXER, when: specReviewHasRoutableFixables }` ✅ (request `:236`)
- **L238**: `{ step: STEP_NAMES.SPEC_REVIEW, on: "approved", to: STEP_NAMES.IMPLEMENTER, when: isTestGenExempt }` ✅ (request `:238`)
- **L239**: `{ step: STEP_NAMES.SPEC_REVIEW, on: "approved", to: STEP_NAMES.TEST_CASE_GEN }` (無条件行) ✅ (request `:239`)
- **L242**: `{ step: STEP_NAMES.TEST_CASE_GEN, on: "success", to: STEP_NAMES.TEST_MATERIALIZE }` ✅ (request `:242`)
- **L247**: `{ step: STEP_NAMES.SPEC_FIXER, on: "approved", to: STEP_NAMES.IMPLEMENTER, when: specFixerForwardsToImplementer }` ✅ (request `:247`)
- **L249**: `{ step: STEP_NAMES.SPEC_FIXER, on: "approved", to: STEP_NAMES.TEST_CASE_GEN, when: specFixerForwardsToTestGen }` ✅ (request `:249`)
- **L251**: `{ step: STEP_NAMES.SPEC_FIXER, on: "approved", to: STEP_NAMES.SPEC_REVIEW }` ✅ (request `:251`)

#### `src/core/step/spec-review.ts` — reads() 宣言

- reads() は `requestMdPath(slug)` / `spec.md` / `design.md` / `tasks.md` を返す。test-cases.md は含まない ✅ (request `:81-83`)
- 注: request は「入力は spec.md / design.md / tasks.md」と記述しているが、実装では request.md も含む (L79-84)。test-cases.md が含まれないという主張は正確。

#### `src/core/step/test-case-gen.ts` — reads() / writes() 宣言

- reads(): design.md / tasks.md のみ ✅ (request `:69-76`)
- writes(): test-cases.md のみ ✅ (request 「tasks.md への書き込みは無い」)
- tasks.md への書き込みは無い ✅

#### `src/prompts/test-case-gen-system.ts` — 抽象度の指示

- GIVEN/WHEN/THEN の記述要求あり (`TC format` セクション)
- 実装構造への踏み込みを禁止する指示は存在しない ✅ (request 「抽象度(実装構造へ踏み込まない)の指示は無い」)

#### `src/prompts/spec-review-system.ts` — 照合観点

- `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` に test-cases.md のレビュー指示なし ✅
- `SPEC_REVIEW_BASE` の Contract 入力に test-cases.md なし ✅

#### 既存 pin テスト確認

- `tests/unit/core/pipeline/pipeline.transitions.test.ts:273` — `expect(STANDARD_TRANSITIONS.length).toBe(49)` (現行 49 行)
- `tests/unit/pipeline/transition-when.test.ts:200` — `expect(STANDARD_TRANSITIONS.length).toBe(49)` (同値)
- `tests/test-case-gen-step.test.ts:166` — `spec-review --approved→ test-case-gen` が存在することを pin
- `tests/test-case-gen-step.test.ts:185` — `test-case-gen --success→ test-materialize` が存在することを pin

### 設計判断の整合性

- `specFixerForwardsToTestGen` 述語の現行意味論を確認: 観察 pass の spec-fixer が test-case-gen に forward する
- `specReviewHasRoutableFixables`: `selectRoutableCanonFindings` + `specReviewEffectiveFixer` (→ spec-fixer) を使用。test-cases.md は `protectedCanonPaths` に含まれるが spec-fixer の `writableByFixer` に含まれないため「unroutable」→現行は escalation
- `protectedCanonPaths()` (write-scope.ts:64-74): test-cases.md が無条件で保護パスに含まれていることを確認

## 検証できなかった項目

- 要件 5 の具体的 routing 機構（FixTarget 追加等）: design に委任されており、現時点でコードは存在しない。設計の妥当性は architect 評価済みの判断に依拠
- conformance → spec-fixer 経路で test-case-gen を挟む際の phase-aware 判定の具体形: design で確定予定

## Findings 詳細

### F-001 (low / fixable): `test-case-gen.ts` の reads() に spec.md が含まれない

spec-review の新位置では test-case-gen が spec-review の前に実行される。`test-case-gen-system.ts` の prompt は spec.md を primary source として参照しているが、`reads()` 宣言（L66-68）は design.md / tasks.md のみ。spec.md の形式的宣言が欠落している。  
実害: エージェントは message 指示で spec.md を読むため機能上は問題なし。ただし `reads()` が writes-gate やデバッグログの依拠対象になっている場合、宣言漏れとして表面化する可能性がある。  
対処: 実装 PR で `reads()` に spec.md を追加する。

### F-002 (low / fixable): `TestCaseGenStep` のコメント (L39) が旧 pipeline 位置を示す

L39 「Position in pipeline: spec-review:approved → test-case-gen → implementer」は旧順序。新順序では design → test-case-gen → spec-review となる。実装 PR で更新が必要。

### 非ブロッキング観察

**O-1**: 要件 5 の TC-only fixable findings 経路は新しい routing 機構を必要とし設計作業が多い。具体的には:
- `specReviewHasRoutableFixables` は現在 spec-fixer を唯一の routing 先とする
- test-cases.md fixable findings を test-case-gen へ routing するには、新 FixTarget 追加または phase-aware な canon 保護変更が必要
- request は「routing の具体形(FixTarget の追加等)は design で確定する」と明示しており、適切に defer されている

**O-2**: TC 遷移 pin テスト (49 行) は本 change で大幅に変更される。受け入れ基準に「列挙外の既存テストは無変更で green」と明記されており、設計で全列挙することが要求されている。

**O-3**: `specFixerForwardsToTestGen` は変更後の新意味論（観察 pass → test-materialize）と関数名が乖離する。rename が推奨されるが設計判断。
