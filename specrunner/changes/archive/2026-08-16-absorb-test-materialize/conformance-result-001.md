# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 受け入れ基準 (request.md)

**AC-1: 全 type で spec-review approved から implementer へ直行 (TEST_MATERIALIZE 行なし)**

- `src/core/pipeline/types.ts` `STANDARD_TRANSITIONS`: `{ step: SPEC_REVIEW, on: "approved", to: IMPLEMENTER }` (unconditional) を確認
- `STANDARD_TRANSITIONS` / `FAST_TRANSITIONS` に `step === "test-materialize"` / `to === "test-materialize"` の行が 0 件
- テスト固定: `src/core/pipeline/__tests__/absorb-test-materialize-transitions.test.ts` TC-001, TC-002, TC-003

**AC-2: implementer prompt に test-cases.md 全 TC の実体化責務が含まれることをテストで固定**

- `src/prompts/implementer-system.ts` line 46: "test-cases.md の全 must TC をテストコードに実体化し、実装と整合させる"
- `testsMaterialized` / `implement-only mode` / `test-materialize 済み` 分岐なし
- `src/core/step/implementer.ts` `buildMessage()` に `TEST_MATERIALIZE` / `testsMaterialized` 参照なし
- テスト固定: `src/core/step/__tests__/implementer-materialize.test.ts` TC-005, TC-006

**AC-3: bite-evidence gate が test-materialize run なし state で EB↔candidate diff から file-set を同定し red→green に到達**

- `src/core/step/bite-evidence/gate.ts`: `listChangedFilesBetweenCommits(evidenceBaseRev, headOid)` で file-set 同定
- `resolveBaseCandidateOids` の import・baseOid 参照なし
- テスト固定: `src/core/step/bite-evidence/__tests__/gate-no-test-materialize.test.ts` TC-007

**AC-4: archive floor が baseOid なしで判定に到達**

- `src/core/archive/achieved-assurance.ts`: `baseOid` 早期 return なし
- file-set は `listChangedFilesBetweenCommits(evidenceBaseRev, finalHeadOid)` → `selectMaterializedTestFiles`
- テスト固定: `src/core/archive/__tests__/achieved-assurance-no-base-oid.test.ts` TC-008

**AC-5: testDerivation の再定義後の挙動をテストで固定**

- `achieved-assurance.ts`: testDerivation = scenario revision binding のみ (test-cases.md hash 比較)
- blob freeze (`diffPathsBetweenCommits`) は判定から廃止
- materializedTestFiles が空でも scenario binding intact なら `testDerivation = "frozen"` (D4 独立性)
- `STANDARD_PROFILE.assurance.testDerivation = "frozen"` は変更なし (state/profile.ts)
- テスト固定: TC-015, TC-015a, TC-016 (`achieved-assurance-no-base-oid.test.ts`)

**AC-6: legacy state の読み込み・resume alias が壊れないことをテストで固定**

- `src/core/resume/resolve-step.ts` `LEGACY_STEP_ALIASES`: `"test-materialize": STEP_NAMES.IMPLEMENTER` 追加
- `--from test-materialize` および `resumePoint.step = "test-materialize"` がいずれも `implementer` に解決
- `state.step` hard-crash fallback (priority 4) は alias 非適用のまま (build-fixer と同一の既存挙動)
- テスト固定: `src/core/resume/__tests__/resolve-step-test-materialize-alias.test.ts` TC-009, TC-010, TC-011

**AC-7: exempt type の観測可能挙動が不変であることを既存テストの green で確認**

- `isTestGenExempt` は production で 2 箇所のみ: `DESIGN success → SPEC_REVIEW` / `IMPLEMENTER success → VERIFICATION`
- `specFixerForwardsToImplementer` 述語は production から削除済み
- 既存 `test-gen-exemption.test.ts` TC-004/TC-005 は無改変 green
- `absorb-test-materialize-transitions.test.ts` TC-012 で追加 pin

**AC-8: 遷移表・test-materialize 関連の既存テストの更新対象を design で全列挙し根拠を明示**

- `design.md` 「テスト更新対象の全列挙」セクション (line 139–172) に全カテゴリと根拠を列挙
- `bun run test`: 774 テストファイル, 11383 テスト通過, 1 skipped, 2 todo

**AC-9: `typecheck && test` が green**

- `bun run typecheck` (tsc --noEmit): エラー 0
- `bun run test`: 774 passed, 11383 tests

### Spec Requirements & Scenarios

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

### 削除完全性

- `src/core/step/test-materialize.ts` — 削除済み
- `src/prompts/test-materialize-system.ts` — 削除済み
- `AGENT_STEP_NAMES` / `AgentStepName` union から `"test-materialize"` — 削除済み
- `STEP_NAMES.TEST_MATERIALIZE` 定数 — 削除済み
- `resolveBaseCandidateOids` (production) — 削除済み
- `diffPathsBetweenCommits` (production) — 削除済み (`listChangedFilesBetweenCommits` に置換)
- `specFixerForwardsToImplementer` 述語 — 削除済み
- `testsMaterialized` 分岐 — 削除済み
- registry / write-scope / staging-containment / pipeline-map / rules の test-materialize エントリ — 削除済み

## 検証できなかった項目

None。全受け入れ基準・全 spec Scenario を実装コードおよびテストコードで確認した。

## Findings 詳細

None。
