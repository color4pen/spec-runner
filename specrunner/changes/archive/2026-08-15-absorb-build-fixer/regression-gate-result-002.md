# Regression Gate Result

**Iteration**: 2
**Slug**: absorb-build-fixer

---

## Evidence Summary

checked: 11, skipped: 0, unverified: 0

---

## Finding Status

### [FIXED] D1 後に Approved verdict overturned ブロックが implementer を対象とするが設計文書未記載

**File**: specrunner/changes/absorb-build-fixer/design.md

design.md D1「副作用(guard 必須)」段落（lines 89–95）が更新され、`SPEC_REVIEW approved → IMPLEMENTER (when: isTestGenExempt)` が実在することを明記したうえで、`currentStep === exhaustedReviewer` guard の必要性を説明している。Iteration 1 で指摘された「全遷移表に approved → implementer への遷移は存在しない（no-op）」という誤記は除去済み。

---

### [FIXED] T-05 legacy alias の from 経路での適用順序が tasks.md に明示されていない

**File**: specrunner/changes/absorb-build-fixer/tasks.md

T-05 AC（line 83–84）に「`from` 経路で alias が `allowed.has()` 検証より前に適用されている（alias 後の名前が検証対象。`--from build-fixer` が「無効な step 名」で拒否されないこと）」が追加されており、適用順序が AC 内で明示されている。

---

### [FIXED] TC-003/TC-004 — 失敗内容が message に含まれることが未テスト

**File**: tests/unit/absorb-build-fixer/implementer-recovery.test.ts

TC-003（line 145–166）と TC-004（line 225–242）にそれぞれ sub-test が追加されており、`verificationContent` が存在するとき `## Verification Failures` セクションが message に含まれることを `expect(message).toContain("## Verification Failures")` で固定している。Iteration 1 で修正済み。

---

### [FIXED] Stale JSDoc — reverificationNeeded が build-fixer を mutator として記述

**File**: src/core/pipeline/reverification.ts:93

`reverificationNeeded` JSDoc（lines 88–106）は「an impl-phase mutator step (implementer / code-fixer)」と記述されており、build-fixer への言及は除去済み。`IMPL_CODE_MUTATOR_STEPS`（lines 20–23）とも整合している。Iteration 1 で修正済み。

---

### [FIXED] Stale file header — TC-003/TC-004 コメントが build-fixer を参照

**File**: tests/unit/core/pipeline/pipeline.reverification.test.ts:6

ファイルヘッダー（lines 6–7）が「TC-003: 再検証 failed は implementer へ流れる（recovery re-entry）」「TC-004: implementer 回復後に code-review 再入を経て adr-gen へ向かう（D4）」に更新されており、build-fixer への言及は除去済み。Iteration 1 で修正済み。

---

### [FIXED] TC-015 の順序検証が verificationFailedLast 行を直接固定していない

**File**: tests/unit/absorb-build-fixer/transitions.test.ts:220

TC-015（lines 220–235）の `findIndex` が `t.when === verificationFailedLast` という関数参照を条件に含めており、`verificationFailedLast` 行を直接特定している。`isTestGenExempt` 行と混同しない。`toBiteEvidenceIdx` より前であることを `expect(toVerificationIdx).toBeLessThan(toBiteEvidenceIdx)` で固定している。Iteration 1 で修正済み。

---

### [FIXED] Design D3 fresh-fallback 逸脱 — fresh session でも buildImplementerRecoveryMessage を使用

**File**: src/core/step/implementer.ts:308

`buildMessage`（lines 308–337）に前回 sessionId 有無による分岐が追加された。`getPreviousSessionId(state, STEP_NAMES.IMPLEMENTER) !== null` の場合のみ `buildImplementerRecoveryMessage` を使用し、null（fresh fallback）の場合は `buildImplementerInitialMessage`（branch 文脈 + tasks/spec 案内）に失敗セクションを付すように修正されている。design.md D3 の仕様と整合。

---

### [FIXED] Stale build-fixer references in unedited comment-only files

**Files**: src/core/verification/propagate.ts, reload-coverage-config.ts, parse-result.ts, src/core/step/staging-containment.ts, commit-push.ts, canon-write-scope.ts, src/core/port/step-types.ts

全ファイルについて `grep -n "build-fixer"` を実行したところ、いずれもマッチなし。stale コメントは除去済み。

---

### [FIXED] STANDARD_TRANSITIONS の verificationFailedLast 行コメントが不正確

**File**: src/core/pipeline/types.ts:282

当該行のコメント（line 282）が「(first-match-wins: must precede unconditional BITE_EVIDENCE row; placed after isTestGenExempt row above)」に更新されており、両条件とも正確。「must precede... isTestGenExempt row」という誤記は消えている。

---

### [FIXED] `fixerNamesForReroute` ブロックが `spec-review approved → implementer (isTestGenExempt)` を誤 intercept する経路がある

**File**: src/core/pipeline/pipeline.ts:452

pipeline.ts line 467 に `if (currentStep === exhaustedReviewer && ...)` guard が実装されている。spec-review approved → implementer (isTestGenExempt) の経路では `currentStep = "spec-review"`, `exhaustedReviewer = "verification"` となり条件が false となるため、ブロックは発火しない。Iteration 1 で指摘された guard 未実装は解消。

---

### [PRESENT] `currentStep === exhaustedReviewer` guard は実装済みだがシナリオテストなし

**File**: src/core/pipeline/pipeline.ts:467
**Severity**: MEDIUM

guard `currentStep === exhaustedReviewer`（line 467）は実装されている。しかし `spec-review approved + accumulated implementer fixer budget` の組み合わせをカバーするシナリオテストが存在しない。

確認したファイル:
- `tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts`: `loopFixerPairs: { "code-review": "code-fixer" }` のみ。spec-review + implementer の組み合わせなし
- `tests/unit/absorb-build-fixer/pipeline-exhaustion.test.ts`: `loopFixerPairs: { VERIFICATION: IMPLEMENTER }` で exhaustion は検証しているが、spec-review → implementer (isTestGenExempt) 経路への guard 発火は検証していない

guard を削除しても既存テストが全て green のままバグが潜伏する状態は未解消。`loopFixerPairs: { VERIFICATION: IMPLEMENTER }` + spec-review approved (isTestGenExempt) + implementer fixer budget >= max の組み合わせをカバーするテストが必要。
