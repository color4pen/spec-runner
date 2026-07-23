# Cross-Boundary Invariants Review: spec-review-fixer-routing

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## レビュー観点

変更対象: `src/core/step/canon-escalation.ts`・`src/core/step/judge-verdict.ts`・
`src/core/step/spec-review.ts`・`src/core/step/step-completion.ts` および対応するテスト。

差分が変更していないコードが暗黙的に保持している不変条件（invariant）を、
新しい挙動が黙って破っていないかを検出する。

---

## 調査した境界

### 1. 遷移テーブルの「spec-review escalation 削除」コメント

**対象ファイル（変更なし）**: `src/core/pipeline/types.ts:235`

```typescript
{ step: STEP_NAMES.SPEC_REVIEW, on: "needs-fix", to: STEP_NAMES.SPEC_FIXER },
// spec-review escalation removed (R3 cutover): judge halt via loop exhaustion only
```

**検証内容**:
- R3 cutover でこのコメントが追加され「spec-review は loop exhaustion のみで halt する」という
  invariant が文書化された。
- 本変更後、`deriveSpecReviewVerdict`（`judge-verdict.ts:95-101`）は unroutable canon finding
  （例: request.md の fixable finding）に対して "escalation" を返す。
- `pipeline.ts:366` のデフォルト `transition?.to ?? "escalate"` により、
  マッチする transition row がない「spec-review + escalation」組は escalate 終端に落ちる。
  コードの動作は正しい（CANON_FINDING_ESCALATION で awaiting-resume に落ちる）。
- しかし `types.ts:235` のコメントは「loop exhaustion のみ」という不変条件を主張したまま残っており、
  新しい直接 escalation 経路の存在を否定している。

**判定**: コードの挙動に問題はない。コメントが stale な invariant 主張となっている。fixable。

---

### 2. `resumePoint.step` の二経路乖離

**対象ファイル（変更なし）**: `pipeline.ts:770`（loop exhaustion）と `pipeline.ts:433`（直接 escalation 終端）

**検証内容**:

Loop exhaustion 経路（`handleExhausted`、変更なし）:
```typescript
// pipeline.ts:770
const resumeStep = toStepName(this.loopFixerPairs[exhaustedLoopName] ?? exhaustedLoopName);
// = "spec-fixer"
```

直接 escalation 終端（変更なし）:
```typescript
// pipeline.ts:433
step: toStepName(currentStep)
// = "spec-review"（currentStep が spec-review の場合）
```

- SPEC_REVIEW_RETRIES_EXHAUSTED 経由 halt: `resumePoint.step = "spec-fixer"` → `resume` は spec-fixer から開始
- CANON_FINDING_ESCALATION 経由 halt: `resumePoint.step = "spec-review"` → `resume` は spec-review から開始

どちらも `specrunner resume <slug>` / `resume --apply-canon` で正しく処理される（resolve-step.ts はステップ名を汎用的に解決する）。ただし「spec-review halt = resumePoint が spec-fixer」という暗黙の期待（R3 以降の運用者が持ちうる）は成立しなくなる。

`state.error.code` でどちらの halt かを区別できる（`SPEC_REVIEW_RETRIES_EXHAUSTED` vs `CANON_FINDING_ESCALATION`）。`buildEscalationComment`（`issue-notifier.ts:121`）は `resumePoint.step` と `resumePoint.reason` を汎用的に表示するため、通知内容は正しく異なる。

**判定**: コードは正しく機能する。運用者の期待と実挙動の乖離を示す変更であり、観察事項として記録する。

---

### 3. `run.ts:124` コメントの網羅性

**対象ファイル（変更なし）**: `src/core/pipeline/run.ts:124`

```typescript
// * Behavior invariants maintained:
// * - stdout `[iter N/M]` format is bit-for-bit unchanged
// * - Error codes: SESSION_TERMINATED, BRANCH_NOT_REGISTERED,
// *   SPEC_REVIEW_RETRIES_EXHAUSTED, CONFIG_INCOMPLETE
```

**検証内容**:
- このコメントが「維持される error code」として spec-review 由来のコードを列挙している。
- 本変更後、spec-review から `CANON_FINDING_ESCALATION` が新たに発生しうる。
- コードは正しく動作するが、コメントが不完全になる。

**判定**: fixable、low。

---

### 4. `step-completion.ts` 内の resolver 選択結合

**対象ファイル（変更あり）**: `src/core/step/step-completion.ts:199-209`

```typescript
const verdictFn =
  "judgeVerdictFn" in step && step.judgeVerdictFn
    ? step.judgeVerdictFn
    : deriveJudgeVerdict;
// ...
lastCanonResolver =
  step.name === STEP_NAMES.SPEC_REVIEW ? specReviewEffectiveFixer : judgeEffectiveFixer;
```

**検証内容**:
- `verdictFn` は `step.judgeVerdictFn` から選択され、`lastCanonResolver` は `step.name` 文字列から選択される。
- 現在の `SpecReviewStep` だけが `judgeVerdictFn = deriveSpecReviewVerdict` かつ `name = "spec-review"` を持つため、両者は一致する。
- もし将来「異なる name を持つが `deriveSpecReviewVerdict` を使う step」が追加された場合、
  `verdictFn` は `specReviewEffectiveFixer` を内部使用するが、`lastCanonResolver = judgeEffectiveFixer`
  になりドリフトする。
- 現時点ではこの条件を満たす step が存在しないため、現行の cross-boundary issue ではない。
  本変更の内部設計上の結合として記録する。

**判定**: 現行コードに問題なし。将来のドリフト経路として観察事項。

---

### 5. 変更なし境界の検証（問題なし）

以下は変更なし境界の検証で問題なしと判断したもの:

**`filterUndecidedFindings`（`decision-ledger.ts:66`）**:
`fixable` 判定の finding は `decision-needed` でないため decision 台帳にエントリされず、
`filterUndecidedFindings` により除去されない。spec.md への fixable finding は常に undecided として
`lastUndecidedFindings` に残り、verdict 導出・escalationReason 計算に使われる。問題なし。

**`FATAL_ERROR_CODES`（`pipeline.ts:19`）**:
`CANON_FINDING_ESCALATION` は FATAL_ERROR_CODES に含まれない（変更なし）。
直接 escalation 終端の `(state.status !== "failed" || !FATAL_ERROR_CODES.has(...))` 条件が満たされ、
spec-review の CANON_FINDING_ESCALATION は正しく awaiting-resume に落ちる。問題なし。

**`commit-orchestrator.ts:363`（変更なし）**:
`verdict === "escalation" && completion.escalationReason` の条件が成立するとき、
`state.error = { code: "CANON_FINDING_ESCALATION", ... }` が設定される。
直接 escalation 終端（`pipeline.ts:432`）は `state.error?.message` を `reason` に使い
`resumePoint.reason` に転写する。情報の一貫性は保たれる。問題なし。

**`apply-canon.ts`（変更なし）**:
`--apply-canon` は `protectedCanonPaths(slug)` の dirty paths を汎用的にコミットする。
`resumePoint.step = "spec-review"` でも `resumePoint.step = "spec-fixer"` でも
operator の fix した canon ファイルを commit できる。問題なし。

**`ConvergenceBudget.initial()`（`pipeline.ts:207`）**:
resume ごとに budget がリセットされる（変更なし）。CANON_FINDING_ESCALATION 後の resume でも
spec-review は maxIterations の新しい予算を得る。これは loop exhaustion 後の resume と同じ挙動であり、
既存の invariant と整合する。問題なし。

**`verifyFindingRefs`（`step-completion.ts:243-254`）**:
finding-ref 検証の対象は `collectVerdictAffectingFindings`（critical|high または decision-needed）
のみ（変更なし）。spec-review が medium fixable on spec.md で "needs-fix" を返す場合、
その finding は finding-ref 検証を通過しない。spec.md は常に実在するファイルであり、
line 範囲外の hallucination があっても spec-fixer はファイル全体を読んで修正できる。
深刻な影響はないが、変更前とは異なる finding 種別が needs-fix を引き起こすようになった。問題なし（既存 judge step でも同様）。

**`deriveConformanceVerdict`（`judge-verdict.ts:148-167`）**:
`deriveJudgeVerdict` を canonScope なしで呼び、その後 `conformanceEffectiveFixer` で独自 canon check を行う。
`specReviewEffectiveFixer` とは独立しており、本変更による影響なし。問題なし。

---

## Findings 詳細

### F-001

- **severity**: low
- **resolution**: fixable
- **file**: src/core/pipeline/types.ts
- **title**: L235 コメント「judge halt via loop exhaustion only」が新しい CANON_FINDING_ESCALATION 直接 escalation 経路と矛盾する
- **rationale**: `types.ts:235` のコメント「spec-review escalation removed (R3 cutover): judge halt via loop exhaustion only」は R3 cutover 後の invariant として記述されているが、本変更で `deriveSpecReviewVerdict` が unroutable canon finding に対して "escalation" を返すようになり、spec-review は loop exhaustion 以外にも直接 "escalation" 判定で awaiting-resume に落ちる経路を持つ。コードの動作は正しい（`pipeline.ts:366` の `?? "escalate"` fallback が正しく処理する）が、コメントが stale な invariant 主張となっている。コメントを「spec-review judge halt: loop exhaustion（SPEC_REVIEW_RETRIES_EXHAUSTED）または unroutable canon finding（CANON_FINDING_ESCALATION）による awaiting-resume」等に更新することで正確になる。

### F-002

- **severity**: low
- **resolution**: fixable
- **file**: src/core/pipeline/run.ts
- **title**: L124 コメントが spec-review 由来の error code として SPEC_REVIEW_RETRIES_EXHAUSTED のみを列挙しており CANON_FINDING_ESCALATION が欠落している
- **rationale**: `run.ts:124` の「Behavior invariants maintained」コメントに「Error codes: ... SPEC_REVIEW_RETRIES_EXHAUSTED, ...」とある。本変更後は spec-review から CANON_FINDING_ESCALATION も発生しうる。コメントの意図が「変更前から存在する error code の継続」なら許容範囲だが、「spec-review 由来の可能な error code 一覧」として読むと不完全になる。

---

## 観察事項（非ブロッキング）

**`resumePoint.step` の経路差異による operator 体験の変化**

- `SPEC_REVIEW_RETRIES_EXHAUSTED` 経由: `resumePoint.step = "spec-fixer"`（operator は spec-fixer から再開）
- `CANON_FINDING_ESCALATION` 経由: `resumePoint.step = "spec-review"`（operator は spec-review から再開）

`specrunner resume` コマンドは両経路を正しく処理する。`state.error.code` が二経路を区別できる。
issue 通知（`buildEscalationComment`）も `resumePoint.reason` に CANON_FINDING_ESCALATION 詳細が含まれるため、
operator は対処が異なることを認識できる。コードの正確性に問題はないが、
R3 以降「spec-review halt → resumePoint = spec-fixer」という運用者の期待が変わることを周知する価値がある。

**`step-completion.ts` 内の resolver 選択の名前ベース結合**

`step.name === STEP_NAMES.SPEC_REVIEW` による `lastCanonResolver` 選択と
`step.judgeVerdictFn` による `verdictFn` 選択は独立しており、将来別名の step が
`deriveSpecReviewVerdict` を使った場合に resolver がドリフトしうる。
現行コードに適用事例はなく現時点では問題ではないが、D4 の drift-proof 保証の強さは
実質的に「SpecReviewStep 以外が `deriveSpecReviewVerdict` を使わない」という非型安全な前提に依存している。
