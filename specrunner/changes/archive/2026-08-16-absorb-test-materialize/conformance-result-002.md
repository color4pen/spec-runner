# Conformance Result — Iteration 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 前回(iter 1)からの差分

code-fixer が regression-gate findings 2 件に対して修正を実施:
- Finding 11: `specFixerNeedsFixForward` が `!isTestGenExempt(state)` guard を欠いており、chore(exempt type) が needs-fix 経路で TEST_CASE_GEN に routing されていた → `src/core/pipeline/spec-observation.ts` line 109 に guard 追加
- Finding 12: `src/core/verification/test-coverage.ts` の JSDoc が廃止済み「implementer output contract」を caller として列挙していた → コメント修正

iteration 2 は上記 2 件の修正後の状態を対象として全受け入れ基準・spec Scenario を再確認する。

---

## 検証した項目

### AC-1: 全 type で spec-review approved から implementer へ直行 (TEST_MATERIALIZE 行なし)

- `src/core/pipeline/types.ts` `STANDARD_TRANSITIONS` line 260: `{ step: SPEC_REVIEW, on: "approved", to: IMPLEMENTER }` (unconditional, 全 type) を確認
- `STANDARD_TRANSITIONS` に `step === "test-materialize"` / `to === "test-materialize"` の行が 0 件
- `FAST_TRANSITIONS` にも test-materialize への遷移なし
- テスト固定: `src/core/pipeline/__tests__/absorb-test-materialize-transitions.test.ts` TC-001, TC-002, TC-003
- **iteration 1 から変更なし**

### AC-2: implementer prompt に test-cases.md 全 TC の実体化責務が含まれること

- `src/prompts/implementer-system.ts` line 46: "test-cases.md の全 must TC をテストコードに実体化し、実装と整合させる" を確認
- `testsMaterialized` / `implement-only mode` / `test-materialize 済み` 分岐なし
- `src/core/step/implementer.ts` に `TEST_MATERIALIZE` / `testsMaterialized` 参照なし
- テスト固定: `src/core/step/__tests__/implementer-materialize.test.ts` TC-005, TC-006
- **iteration 1 から変更なし**

### AC-3: bite-evidence gate が test-materialize run なし state で EB↔candidate diff から file-set を同定し red→green に到達

- `src/core/step/bite-evidence/gate.ts`: `listChangedFilesBetweenCommits(evidenceBaseRev, headOid)` で file-set 同定
- `resolveBaseCandidateOids` import・baseOid 参照なし
- テスト固定: `src/core/step/bite-evidence/__tests__/gate-no-test-materialize.test.ts` TC-007
- **iteration 1 から変更なし**

### AC-4: archive floor が baseOid なしで判定に到達

- `src/core/archive/achieved-assurance.ts`: baseOid 早期 return なし
- file-set は `listChangedFilesBetweenCommits(evidenceBaseRev, finalHeadOid)` → `selectMaterializedTestFiles`
- テスト固定: `src/core/archive/__tests__/achieved-assurance-no-base-oid.test.ts` TC-008, TC-015, TC-015a, TC-016
- **iteration 1 から変更なし**

### AC-5: testDerivation の再定義後の挙動をテストで固定

- `achieved-assurance.ts`: testDerivation = scenario revision binding のみ (test-cases.md@testCaseGenOid content hash == test-cases.md@finalHeadOid)
- blob freeze(`diffPathsBetweenCommits`) は判定から廃止
- `STANDARD_PROFILE.assurance.testDerivation = "frozen"` は変更なし
- テスト固定: TC-015, TC-015a, TC-016
- **iteration 1 から変更なし**

### AC-6: legacy state の読み込み・resume alias が壊れないこと

- `src/core/resume/resolve-step.ts` `LEGACY_STEP_ALIASES`: `"test-materialize": STEP_NAMES.IMPLEMENTER` 追加を確認
- `--from test-materialize` および `resumePoint.step = "test-materialize"` がいずれも `implementer` に解決
- テスト固定: `src/core/resume/__tests__/resolve-step-test-materialize-alias.test.ts` TC-009, TC-010, TC-011
- **iteration 1 から変更なし**

### AC-7: exempt type の観測可能挙動が不変であること

- **iteration 2 の修正確認**: `src/core/pipeline/spec-observation.ts` `specFixerNeedsFixForward` line 109 が `&& !isTestGenExempt(state)` を含む
  - chore(exempt) が spec-review needs-fix 経路でも TEST_CASE_GEN をバイパスし、spec-fixer approved → spec-review に正しく routing される
- `isTestGenExempt` の `STANDARD_TRANSITIONS` における guard 使用は 2 箇所のみ:
  - `DESIGN success → SPEC_REVIEW when isTestGenExempt` (TEST_CASE_GEN バイパス)
  - `IMPLEMENTER success → VERIFICATION when isTestGenExempt` (BITE_EVIDENCE バイパス)
- `specFixerNeedsFixForward` 内での `!isTestGenExempt(state)` は transition guard ではなく predicate の内部論理。要件6「isTestGenExempt の制御対象は 2 箇所に縮退」の「2 箇所」は STANDARD_TRANSITIONS の when-guard 行を指す。この解釈は design.md D1 の「`isTestGenExempt` の使用は 2 箇所(...に縮退)」記述とも一致する
- `specFixerForwardsToImplementer` 述語は production から削除済み
- テスト固定: `test-gen-exemption.test.ts` TC-004/TC-005(無改変 green)、`absorb-test-materialize-transitions.test.ts` TC-012

### AC-8: 遷移表・test-materialize 関連の既存テストの更新対象を design で全列挙し根拠を明示

- `design.md`「テスト更新対象の全列挙」セクション(line 139–172) に全カテゴリと根拠を列挙
- **iteration 1 から変更なし**

### AC-9: `typecheck && test` が green

- `verification-result.md`: build / typecheck / test / lint すべて passed (iteration 1 verification)
- iteration 2 の code-fixer 修正(Finding 11 / 12)後、post-fixer reverification chokepoint により conformance approved → verification 再実行が設計上保証される

---

### Spec Scenarios — 全確認

**Requirement: spec-phase 承認は全 type で implementer へ収束する**

- Scenario: 非免除 type は spec-review 承認から implementer へ直行する → ✅ (TC-001)
- Scenario: 免除 type も spec-review 承認から implementer へ直行する → ✅ (TC-002)
- Scenario: 遷移表に test-materialize 行が存在しない → ✅ (TC-003)
- Scenario: spec-fixer の観測 auto-fix は implementer へ forward する → ✅ (TC-004)

**Requirement: implementer は test-cases.md を正典としてテストと実装を一体で行う**

- Scenario: implementer prompt が全 must TC の実体化責務を明示する → ✅ (TC-005)
- Scenario: implementer message は test-materialize 実行歴に依存しない → ✅ (TC-006)

**Requirement: materialized test file の同定は Evidence Base 参照と candidate の diff で行う**

- Scenario: gate は test-materialize run 無しで red→green 判定に到達する → ✅ (TC-007)
- Scenario: archive floor は baseOid 無しで判定に到達する → ✅ (TC-008)

**Requirement: testDerivation は scenario 凍結として判定される**

- Scenario: scenario 凍結が intact なら testDerivation は frozen → ✅ (TC-015)
- Scenario: materializedTestFiles が空でも testDerivation は frozen（D4 独立性）→ ✅ (TC-015a)
- Scenario: scenario がすり替えられたら testDerivation は absent → ✅ (TC-016)

**Requirement: test-materialize の resume 互換は legacy alias で担保される**

- Scenario: --from test-materialize は implementer に解決される → ✅ (TC-009)
- Scenario: resumePoint.step が test-materialize でも implementer に解決される → ✅ (TC-010)
- Scenario: test-materialize 実行歴を含む legacy state が読み込み・fold で壊れない → ✅ (TC-011)

**Requirement: test-gen 免除の制御対象は 2 箇所に縮退する**

- Scenario: 免除 type は test-case-gen と bite-evidence を通らない → ✅ (TC-012)

---

### 削除完全性(iteration 2 再確認)

- `src/core/step/test-materialize.ts` — 削除済み
- `src/prompts/test-materialize-system.ts` — 削除済み
- `AGENT_STEP_NAMES` / `AgentStepName` union から `"test-materialize"` — 削除済み
- `STEP_NAMES.TEST_MATERIALIZE` 定数 — 削除済み
- `resolveBaseCandidateOids` (production) — 削除済み
- `diffPathsBetweenCommits` (production caller) — 削除済み
- `specFixerForwardsToImplementer` 述語 — 削除済み
- `testsMaterialized` 分岐 — 削除済み
- registry / write-scope / staging-containment / pipeline-map / rules / tc-source-contract の test-materialize エントリ — 削除済み
- `specFixerNeedsFixForward` に `!isTestGenExempt(state)` guard 追加済み(Finding 11 修正)
- `test-coverage.ts` JSDoc 修正済み(Finding 12 修正)

## 検証できなかった項目

- iteration 2 の code-fixer 修正後の `bun run test` green を直接確認できていない(verification result は iteration 1 時点)。post-fixer reverification chokepoint の設計上、conformance approved → verification が再実行される前提。

## Findings 詳細

None。
