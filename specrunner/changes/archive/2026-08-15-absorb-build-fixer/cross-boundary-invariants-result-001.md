# Cross-Boundary Invariants Review: absorb-build-fixer
**Reviewer**: cross-boundary-invariants
**Iteration**: 1

## Scope

「変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないか」を検出するレビュー。

diff の主変更: `loopFixerPairs[VERIFICATION] = IMPLEMENTER`（旧 `BUILD_FIXER`）、`verificationFailedLast` ガード追加、implementer の enrichContext / buildMessage 分岐、LEGACY_STEP_ALIASES の追加。

---

## 検証した不変条件

| 対象 | 内容 | 結果 |
|------|------|------|
| `loopFixerPairs` の newEpisode リセット | verification paired fixer が implementer になっても conformance reverification の fresh-budget リセットは維持されるか | ✓ 維持（conformance は loopFixerPairs の key でないため newEpisode=true が発火し続ける） |
| exhaustion ループ上限 | VERIFICATION_RETRIES_EXHAUSTED が再入方式でも機能するか | ✓ 機能する（fixer iter/loop iter の積み上がりは build-fixer 時代と等価） |
| `codeChangedSinceLastVerification` | build-fixer 除去後も reverification ガードが正しく機能するか | ✓ 機能する（recovery implementer が最新 mutator として記録される） |
| `conformanceApprovedForVerifiedRevision` | recovery 経路での commitOid 照合に影響がないか | ✓ なし（verification PASS 後 code-review → conformance の順序は不変） |
| `getConformanceFixContext` vs `verificationFailedLast` の優先順位 | conformance → implementer 経路で両フラグが同時に true になれないか | ✓ 相互排他（conformance は verification PASS を前提とするため verificationFailedLast=false） |
| LEGACY_STEP_ALIASES | `build-fixer` → `implementer` への alias が allowed 検証をバイパスしないか | ✓ 安全（alias 適用後の resolvedFrom を allowed.has() で検証） |
| `verificationFailedLast` ガードの first-match-wins 順序 | isTestGenExempt 行が verificationFailedLast 行より前に置かれているか | ✓ 正しい順序（types.ts:280/283 行） |
| `IMPL_CODE_MUTATOR_STEPS` の build-fixer 除去 | legacy state の `codeChangedSinceLastVerification` に影響するか | D4 に既知の限界として明記・operator 裁定済み ✓ |
| session 継続の fallback | resumeSessionId が null/不在のとき fresh に倒れるか | ✓ `?? undefined` で倒れる |
| **`fixerNamesForReroute` の拡大** | implementer が `Object.values(loopFixerPairs)` に入ることで、既存の "Approved verdict overturned by fixer budget" ブロックが spec-review→implementer 遷移に誤作動しないか | **⚠ 誤作動する経路が存在する（下記 Finding 1）** |

---

## Findings

### F-1: `fixerNamesForReroute` が `spec-review approved → implementer (isTestGenExempt)` を誤 intercept する経路がある

**深刻度**: medium
**解決可能性**: fixable

**所在**: `src/core/pipeline/pipeline.ts` — "T-03: Prevent approved verdict from being overturned by fixer budget" ブロック（`fixerNamesForReroute` set）

**不変条件**: 「`isTestGenExempt` 判定が true の request type は spec-review approved から直接 implementer へ遷移し、test-materialize をバイパスする」

**破れる経路**:

1. `loopFixerPairs[VERIFICATION] = IMPLEMENTER` により `Object.values(loopFixerPairs) = {code-fixer, spec-fixer, implementer}` となる
2. `fixerNamesForReroute = new Set(Object.values(this.loopFixerPairs))` に implementer が含まれる
3. STANDARD_TRANSITIONS に `{ step: SPEC_REVIEW, on: "approved", to: IMPLEMENTER, when: isTestGenExempt }` が存在する
4. この遷移が解決されると `outcome = "approved"` かつ `nextStep = "implementer"` → `fixerNamesForReroute.has("implementer") = true` → ブロック起動

**ブロックが実際に発火する条件**:

```
budget.getFixerIter("implementer") >= resolveMaxIterations("verification")
```

= implementer の fixer iter が maxIterations に達した後、verification が bypass で 1 回余分に通って PASS したケース。

具体的シーケンス:
- implementer(creator) → bite-evidence → verification: RESET(fixer iter=0) → FAIL
- implementer(recovery, fixer iter 0→1) → verification(no reset): FAIL
- …N 回継続（N = maxIterations）
- loop iter=maxIterations かつ fixer iter=maxIterations → bypass が発火 → verification が 1 回余分に実行
- verification が PASS → 継続（fixer iter = maxIterations のまま）
- → code-review → conformance → needs-fix:spec-fixer
  - "Unpaired step → fixer episode reset": `budget.resetFixerStep("spec-fixer").resetLoopStep("spec-review")` — implementer fixer iter は **リセットされない（maxIterations のまま）**
- spec-fixer → spec-review → approved (isTestGenExempt=true)
- nextStep = "implementer"、`fixerNamesForReroute.has("implementer")` = true
- `budget.getFixerIter("implementer") = maxIterations >= maxIterations` → **REROUTE 発火**
- cleanTransition = `{ spec-review, approved → test-materialize }` (unconditional, not a fixer)
- spec-review → test-materialize（本来 bypass されるべき）→ implementer

**結果**: isTestGenExempt な request type に対して test-materialize が不意に実行される。test-materialize は test-cases.md から test code を生成するため、chore/bug-fix 向けに不適切な test を生成するか、または escalation になる。ジョブは止まらないが semantic 契約（isTestGenExempt → test-materialize bypass）を黙って破る。

**設計 D1 の主張との乖離**:

design.md D1「副作用(no-op)」では「STANDARD / FAST の全遷移表に `approved → implementer` への遷移は存在しない」と述べているが、これは誤り。`{ SPEC_REVIEW, approved, IMPLEMENTER, when: isTestGenExempt }` および `{ SPEC_FIXER, approved, IMPLEMENTER, when: specFixerForwardsToImplementer }` が STANDARD_TRANSITIONS に実在する。

なお `specFixerForwardsToImplementer` 経由の経路（spec-fixer → implementer）は、"Unpaired step → fixer episode reset" ブロックが `resetFixerStep("implementer")` を先に実行するため fixer iter = 0 に戻り、reroute は発火しない（safe）。発火するのは spec-review → implementer の経路のみ。

**修正案**:

`fixerNamesForReroute` ブロックに「currentStep が nextStep の paired reviewer である場合のみ発火する」ガードを追加する。

```typescript
// 現状（pipeline.ts `:452` 付近）
const fixerNamesForReroute = new Set(Object.values(this.loopFixerPairs));
if (
  outcome === "approved" &&
  typeof nextStep === "string" &&
  fixerNamesForReroute.has(nextStep)
) {
  const budgetSkippedFixer = nextStep;
  const exhaustedReviewer = resolvePairedReviewForFixer(...);
  if (budget.getFixerIter(budgetSkippedFixer) >= effectiveMaxReroute) {
    // ...
  }
}
```

追加ガード（`exhaustedReviewer === currentStep` チェック）:

```typescript
const exhaustedReviewer = resolvePairedReviewForFixer(state, budgetSkippedFixer, this.loopFixerPairs);
// currentStep が budgetSkippedFixer の paired reviewer でない場合はスキップ
// (例: spec-review → implementer は spec-review の paired fixer が spec-fixer であるため
//  implementer を budget-skip の対象にしない)
if (exhaustedReviewer !== currentStep) { /* skip reroute */ }
```

または、より保守的に: `implementer` への "approved" 遷移を `fixerNamesForReroute` から外すため、`loopFixerPairs` 値の集合から「実際に reviewer → fixer として機能する（= currentStep が対応する reviewer の）もの」のみを含める。

---

## 観察事項（ブロッキングなし）

### O-1: `dynamic-context.ts` のコメントが陳腐化

`src/git/dynamic-context.ts:29` の `verificationContent` フィールドコメントが "Populated by BuildFixerStep.enrichContext()" のまま残っている。build-fixer は廃止済みで、現在は ImplementerStep.enrichContext() が担う。挙動への影響はなく green 維持に関係しないが、コメントとして陳腐化している。

---

## 検証した変更の安全性確認

以下は不変条件を維持していることを確認した:

- **LEGACY_STEP_ALIASES**: `"build-fixer" → STEP_NAMES.IMPLEMENTER` の alias は `--from` path と `resumePoint.step` path の両方で allowed 検証の前に適用される ✓
- **`verificationFailedLast` の false パス**: verification 未実行・passed の場合に false を返し、初回 implementer が fresh session で起動する ✓
- **conformance reverification budget リセット**: `conformance` は `loopFixerPairs` の key でないため `newEpisode=true` が発火し、`resetLoopStep("verification").resetFixerStep("implementer")` が実行される ✓
- **`getConformanceFixContext` の recency チェック**: conformance → implementer → verification の順序で predecessor（implementer）が conformance より後に実行されるため `return null` となり、recovery 経路では conformance findings が誤注入されない ✓
- **FAST pipeline**: spec-review / spec-fixer が存在しないため F-1 の経路は FAST には存在しない ✓

---

## 判定根拠の証拠

- `src/core/pipeline/pipeline.ts`:452-491 — `fixerNamesForReroute` ブロックの全体。実装変更なし（未変更ファイル）
- `src/core/pipeline/registry.ts`:63-68 — `loopFixerPairs[VERIFICATION] = STEP_NAMES.IMPLEMENTER`（本 PR で変更）
- `src/core/pipeline/types.ts`:280-284 — `IMPLEMENTER, success → VERIFICATION (isTestGenExempt)` と `IMPLEMENTER, success → VERIFICATION (verificationFailedLast)` と `IMPLEMENTER, success → BITE_EVIDENCE`（本 PR で追加）
- `src/core/pipeline/convergence-budget.ts` — budget reset 機構。resetFixerStep は spec-fixer への "Unpaired" 経路でのみ発火し、spec-review→implementer 経路では発火しないことを確認
