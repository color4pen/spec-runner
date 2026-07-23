# Tasks: spec-review fixer routing

## T-01: `specReviewEffectiveFixer` と `selectRoutableCanonFindings` を canon-escalation.ts に追加する

- [x] `src/core/step/canon-escalation.ts` に `specReviewEffectiveFixer: (f: Finding) => FixTarget = () => "spec-fixer"`
      を追加する（既存 `judgeEffectiveFixer` / `conformanceEffectiveFixer` と同じ「Effective fixer resolvers」節に置く）。
- [x] 同ファイルに `selectRoutableCanonFindings(findings, scope, resolveEffectiveFixer)` を追加する。
      `selectUnroutableCanonFindings` と対称で、条件は `resolution === "fixable"` かつ
      `scope.canonPaths.has(f.file)` かつ effective fixer の書込集合が `f.file` を**含む**もの。
- [x] 既存 `selectUnroutableCanonFindings` / `judgeEffectiveFixer` / `conformanceEffectiveFixer` /
      `buildCanonEscalationReason` は変更しない。

**Acceptance Criteria**:
- `specReviewEffectiveFixer(anyFinding)` が常に `"spec-fixer"` を返す。
- `selectRoutableCanonFindings` が、canon path 上の fixable finding のうち effective fixer が
  書ける file を持つものだけを返す（`selectUnroutableCanonFindings` の補集合）。
- `typecheck` が green。

## T-02: `deriveSpecReviewVerdict` を judge-verdict.ts に追加する

- [x] `src/core/step/judge-verdict.ts` に
      `deriveSpecReviewVerdict(findings, ok, evidence?, canonScope?): "approved" | "needs-fix" | "escalation"`
      を追加する。`canon-escalation.js` から `specReviewEffectiveFixer` と `selectRoutableCanonFindings` を import する。
- [x] 判定順は次のとおり:
      1. `!ok` → `escalation`
      2. `evidence !== undefined && evidence.checked === 0` → `escalation`（vacuous check）
      3. `decision-needed` finding あり → `escalation`
      4. `canonScope` present のとき:
         - 4a. `selectUnroutableCanonFindings(findings, canonScope, specReviewEffectiveFixer).length > 0` → `escalation`
         - 4b. `selectRoutableCanonFindings(findings, canonScope, specReviewEffectiveFixer).length > 0` → `needs-fix`
      5. `critical|high` finding あり → `needs-fix`
      6. それ以外 → `approved`
- [x] 4a を 4b より前に評価する（escalation 優先）。
- [x] 既存 `deriveJudgeVerdict` / `deriveConformanceVerdict` / `deriveRegressionGateVerdict` /
      `deriveRequestReviewVerdict` は変更しない。

**Acceptance Criteria**:
- spec.md / design.md への fixable finding は severity（medium / low 含む）を問わず `needs-fix`。
- request.md / tasks.md / test-cases.md / attestation への fixable finding は `escalation`。
- 非 canon file の fixable finding（例 `src/example.ts` medium）は `approved`。
- 非 canon の critical|high は `needs-fix`、decision-needed / `ok:false` / vacuous は `escalation`。
- `deriveSpecReviewVerdict` が `AgentStep["judgeVerdictFn"]` 型に代入可能（型チェックで担保）。

## T-03: `SpecReviewStep.judgeVerdictFn = deriveSpecReviewVerdict` を配線する

- [x] `src/core/step/spec-review.ts` の `SpecReviewStep` に `judgeVerdictFn: deriveSpecReviewVerdict` を追加する
      （`regression-gate.ts:98` の配線と同型）。`deriveSpecReviewVerdict` を `judge-verdict.js` から import する。
- [x] `reportTool: JUDGE_REPORT_TOOL` は変更しない（executor の `isJudgeStep` 判定を維持し、
      `canonScope` が第 4 引数で渡る経路を使う）。

**Acceptance Criteria**:
- `SpecReviewStep.judgeVerdictFn === deriveSpecReviewVerdict`。
- executor（`step-completion.ts:194-201`）が spec-review step で `deriveSpecReviewVerdict` に
  `canonScope` を渡して dispatch する。
- `typecheck` が green。

## T-04: step-completion の escalationReason resolver を verdict 導出と同一化する

- [x] `src/core/step/step-completion.ts` の verdict 導出ブロックで、canon 判定に用いる effective fixer resolver
      を導出地点で捕捉する変数（例: `lastCanonResolver: ((f: Finding) => FixTarget) | null`）を導入する。
      - conformance branch → `conformanceEffectiveFixer` を捕捉
      - judge branch → `step.name === STEP_NAMES.SPEC_REVIEW ? specReviewEffectiveFixer : judgeEffectiveFixer` を捕捉
- [x] escalationReason 計算（現行 `:306` の
      `lastIsConformancePath ? conformanceEffectiveFixer : judgeEffectiveFixer`）を、捕捉した
      `lastCanonResolver` を参照するよう置換する。
- [x] `canon-escalation.js` から `specReviewEffectiveFixer` を、`step-names.js` から `STEP_NAMES` を import する。
- [x] `lastCanonResolver` は `lastUndecidedFindings` と同じ typed branch でのみ設定されるため、
      escalationReason の guard（`lastUndecidedFindings !== null` かつ causal attribution 条件）成立時は
      非 null であることを不変条件として保つ（null の場合は escalationReason を計算しない）。
      参照時は non-null assertion（`!`）ではなく明示的 null ガード
      （`if (lastCanonResolver !== null)`）を用い、invariant 違反時は安全に no-op へ倒す。
- [x] escalationReason の causal attribution 条件（`lastVerdictOk` / vacuous / decision-needed の除外）は変更しない。

**Acceptance Criteria**:
- spec-review step で request.md 等 unroutable canon fixable finding → verdict `escalation` かつ
  `escalationReason` が `CANON_FINDING_ESCALATION` と当該 file path を含む。
- spec-review step で spec.md routable canon fixable finding → verdict `needs-fix` かつ `escalationReason` 未設定。
- conformance / code-review（judge）step の escalationReason resolver 選択は従来どおり
  （`conformanceEffectiveFixer` / `judgeEffectiveFixer`）で挙動不変。
- 非 canon 由来 escalation（`ok:false` / vacuous / decision-needed / finding-ref / verdictOverride）では
  `escalationReason` 未設定（既存 TC-023 系が green）。

## T-05: テストを追加し受け入れ基準を固定する

- [x] `deriveSpecReviewVerdict` の単体テスト: spec.md medium fixable → `needs-fix`、design.md low fixable →
      `needs-fix`、request.md fixable → `escalation`、非 canon medium fixable → `approved`、
      decision-needed → `escalation`、非 canon critical → `needs-fix`。
- [x] 遷移到達テスト: spec.md medium fixable の spec-review 結果で最終 verdict が `needs-fix` になり、
      標準遷移表で `spec-review` + `needs-fix` → `spec-fixer` に到達することを固定する。
- [x] escalation テスト: request.md fixable finding で `deriveStepCompletion`（spec-review step）が
      verdict `escalation` を返し、`escalationReason` が設定される（`CANON_FINDING_ESCALATION` と file path を含む）
      ことを固定する。
- [x] drift-guard テスト: spec-review step の同一 finding 入力に対し、verdict 導出（`needs-fix` vs `escalation`）と
      escalationReason 計算が同一 resolver（`specReviewEffectiveFixer`）に基づくことを固定する
      （spec.md finding → needs-fix ∧ escalationReason 未設定 / request.md finding → escalation ∧ escalationReason 設定）。
- [x] 有界性テスト: spec-review が毎 iteration で canon fixable finding により `needs-fix` を返すとき、
      `maxIterations` で `SPEC_REVIEW_RETRIES_EXHAUSTED`（status `awaiting-resume`）に有界に落ちることを固定する
      （既存 loop exhaustion テストの構成を流用する）。
- [x] 配線 identity テスト: `SpecReviewStep.judgeVerdictFn === deriveSpecReviewVerdict` の参照一致を
      専用ケースで固定する（regression-gate の先例: `judge-verdict.test.ts` の
      `createRegressionGateStep().judgeVerdictFn === deriveRegressionGateVerdict` identity check に倣う）。
- [x] judge / conformance / regression-gate / request-review の既存テストは無変更で green を維持する。
      `judge-verdict.test.ts` の TC-021（inline step + 非 canon file）の assertion は unchanged。実 `SpecReviewStep`
      の新挙動を表すケースが必要なら別ケースとして追加する（既存 assertion は書き換えない）。

**Acceptance Criteria**:
- 上記各テストが green。
- judge / conformance / regression-gate / request-review の既存テストが無変更で green。

## T-06: 検証

- [x] `typecheck && test` が green。
- [x] 変更が spec-review の verdict 導出・escalationReason resolver・関連 helper に限定されており、
      遷移表 / loopNames / loopFixerPairs / spec-fixer 書込集合 / 他 step の verdict 導出に変更がないことを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green。
- スコープ外（finding 網羅性 / stale ファイル掃除 / conformance fixTarget routing / spec-fixer 書込集合）への変更なし。
