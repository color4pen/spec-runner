# Regression Gate Result

**Iteration**: 1
**Slug**: absorb-build-fixer

---

## Evidence Summary

checked: 8, skipped: 0, unverified: 0

---

## Finding Status

### [FIXED] D1 後に Approved verdict overturned ブロックが implementer を対象とするが設計文書未記載

**File**: specrunner/changes/absorb-build-fixer/design.md

design.md D1 の末尾に「副作用(no-op)」段落が追加された（lines 89–92）。`Object.values(loopFixerPairs)` に implementer が入るため `fixerNamesForReroute` も implementer を対象に含むことが明記されている。

---

### [PRESENT] T-05 legacy alias の from 経路での適用順序が tasks.md に明示されていない

**File**: specrunner/changes/absorb-build-fixer/tasks.md
**Severity**: LOW

T-05 の Task body（line 78）には `from` 経路では `allowed.has()` 検証より**前**に適用すると記載されているが、AC セクション（lines 80–83）には適用順序の明記がない。resolve-step.ts 実装は正しく（alias → mapMemberToCoordinator → allowed.has() の順）、TC-009 が返値を固定しているため機能的リスクは無い。ただし AC に順序の明記がないという点は未修正。

---

### [FIXED] TC-003/TC-004 — 失敗内容が message に含まれることが未テスト

**File**: tests/unit/absorb-build-fixer/implementer-recovery.test.ts

TC-003（line 145）と TC-004（line 225）にそれぞれ sub-test が追加され、`verificationContent` が存在するとき `## Verification Failures` セクションが message に含まれることを `expect(message).toContain("## Verification Failures")` で固定している。

---

### [FIXED] Stale JSDoc — reverificationNeeded が build-fixer を mutator として記述

**File**: src/core/pipeline/reverification.ts

`reverificationNeeded` JSDoc（lines 88–106）は「an impl-phase mutator step (implementer / code-fixer)」と記述されており、build-fixer への言及は除去済み。`IMPL_CODE_MUTATOR_STEPS`（lines 20–23）とも整合している。

---

### [FIXED] Stale file header — TC-003/TC-004 コメントが build-fixer を参照

**File**: tests/unit/core/pipeline/pipeline.reverification.test.ts

ファイルヘッダー（lines 6–7）が「TC-003: 再検証 failed は implementer へ流れる（recovery re-entry）」「TC-004: implementer 回復後に code-review 再入を経て adr-gen へ向かう（D4）」と更新されており、build-fixer への言及は除去済み。

---

### [FIXED] TC-015 の順序検証が verificationFailedLast 行を直接固定していない

**File**: tests/unit/absorb-build-fixer/transitions.test.ts

TC-015（lines 220–235）の `findIndex` が `t.when === verificationFailedLast` を条件に含めており、`verificationFailedLast` 行を直接ピンポイントで特定している。`isTestGenExempt` 行を誤ってマッチすることはない。`toBiteEvidenceIdx` より前であることも `expect(toVerificationIdx).toBeLessThan(toBiteEvidenceIdx)` で固定されている。

---

### [PRESENT] Design D3 fresh-fallback 逸脱 — fresh session でも buildImplementerRecoveryMessage を使用

**File**: src/core/step/implementer.ts:308
**Severity**: LOW

`buildMessage`（line 308–317）は `verificationFailedLast(state)` が真であれば常に `buildImplementerRecoveryMessage` を返す。前回 sessionId の有無（fresh fallback かどうか）による分岐は存在しない。design.md D3 は「fresh fallback 時は `buildImplementerInitialMessage`（branch 文脈 + tasks/spec 案内）に失敗セクションを付す」と指定しているが、その分岐は未実装。spec.md / test-cases.md にはこの差異をテストする項目がないため受け入れ基準の文面上の充足は阻害しない。設計文書と実装の乖離は残存。

---

### [PRESENT] `fixerNamesForReroute` ブロックが `spec-review approved → implementer (isTestGenExempt)` を誤 intercept する経路がある

**File**: src/core/pipeline/pipeline.ts:452
**Severity**: MEDIUM

提案された修正（`exhaustedReviewer !== currentStep` でスキップするガード）は pipeline.ts の `fixerNamesForReroute` ブロック（lines 452–497）に追加されていない。`loopFixerPairs[VERIFICATION] = IMPLEMENTER` により `fixerNamesForReroute` に implementer が含まれ、STANDARD_TRANSITIONS の `{ SPEC_REVIEW, on: approved, to: IMPLEMENTER, when: isTestGenExempt }` （types.ts line 260、実在確認済み）が発火するとき `currentStep=spec-review, nextStep=implementer` となりブロックに入る。`exhaustedReviewer = resolvePairedReviewForFixer(state, "implementer", ...) = "verification"` であり、`currentStep(spec-review) !== exhaustedReviewer(verification)` の条件でスキップするガードが無いため、budget.getFixerIter("implementer") >= effectiveMaxReroute が成立するシナリオ（finding 8 記載の極値経路）では誤って spec-review → test-materialize へ reroute される。また design.md D1 の「副作用(no-op)」段落が「全遷移表に `approved → implementer` への遷移は存在しない」と記述しているが、この記述は誤り（SPEC_REVIEW → IMPLEMENTER が存在する）。
