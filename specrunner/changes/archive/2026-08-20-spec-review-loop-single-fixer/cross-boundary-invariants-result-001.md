# Cross-Boundary Invariants Review — spec-review-loop-single-fixer — Iteration 1

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検証した不変条件と結果

### I-01: episode 収束予算 — spec-fixer → spec-review の same-episode 判定

**確認箇所**: `src/core/pipeline/pipeline.ts` L517

変更後の newEpisode ロジック:
```typescript
let newEpisode = currentStep !== pairedFixerForNext;
```

- spec-fixer → spec-review: `currentStep("spec-fixer") !== pairedFixerForNext("spec-fixer")` = false → newEpisode=false → 予算リセットなし ✅
- test-case-gen → spec-review（初回のみ）: `currentStep("test-case-gen") !== "spec-fixer"` = true → newEpisode=true → 予算リセット。初回は iter=0 なのでリセットによる差分なし ✅
- design → test-case-gen → spec-review（初回）に無害な budget=0 リセットが発生するが、これは old 実装（loopIntermediateSteps.has("test-case-gen")=true → newEpisode=false → リセットなし）と実質同一
- 削除した loopIntermediateSteps の唯一の使用点は「spec-fixer → test-case-gen → spec-review ループ中のリセット防止」であり、そのループ経路が消えた今、保護対象がゼロになった → パラメータ削除は安全 ✅

**判定**: 不変条件維持

---

### I-02: conformance 再検証経路 — unpaired-step からの予算リセット

**確認箇所**: `src/core/pipeline/pipeline.ts` L529-539（unpaired step → fixer episode reset ロジック）

conformance → spec-fixer:
1. `!("conformance" in loopFixerPairs)` = true → unpaired step 判定
2. `spec-fixer` is a fixer → budget.resetFixerStep("spec-fixer").resetLoopStep("spec-review") → 双方 0 リセット
3. 次: spec-fixer → spec-review: `currentStep("spec-fixer") === pairedFixerForNext("spec-fixer")` → newEpisode=false → 追加リセットなし

これは変更前と同一のパス。test-case-gen 透過化は conformance 経路に存在せず、旧コードでも specFixerNeedsFixForward=false（conformance context あり）によって spec-review への直行だった。変化なし ✅

**判定**: 不変条件維持

---

### I-03: specFixerObservationForward — observation pass / needs-fix / conformance の三路判定

**確認箇所**: `src/core/pipeline/spec-observation.ts` L61-83

| ケース | condition1（conformance context） | condition2（latest spec-review verdict） | 結果 |
|-------|----------------------------------|----------------------------------------|------|
| observation auto-fix（spec-review approved with fixables → spec-fixer → implementer） | null → pass | "approved" → TRUE | → IMPLEMENTER ✅ |
| needs-fix 経路（spec-review needs-fix → spec-fixer → spec-review） | null → pass | "needs-fix" → FALSE | → SPEC_REVIEW（unconditional）✅ |
| conformance 経由（conformance → spec-fixer → spec-review） | non-null → FALSE | — | → SPEC_REVIEW（unconditional）✅ |

旧コードでの TC 再生成行（spec-fixer → test-case-gen）削除により、3 路から 2 路に縮退したが、残存 2 路は正しく機能している ✅

**判定**: 不変条件維持

---

### I-04: STANDARD_TRANSITIONS — TEST_CASE_GEN 宛行の残存確認

**確認箇所**: `src/core/pipeline/types.ts` L236, 246-247

```
DESIGN → TEST_CASE_GEN （初回生成、残存）
TEST_CASE_GEN → SPEC_REVIEW（初回経路、残存）
TEST_CASE_GEN → escalate（error、残存）
SPEC_REVIEW → TEST_CASE_GEN（削除済み）
SPEC_FIXER → TEST_CASE_GEN（削除済み）
```

- 初回経路（design → test-case-gen → spec-review）は保持 ✅
- ループ内 TEST_CASE_GEN 経路は完全に除去 ✅
- STANDARD_TRANSITIONS.length = 45（-2 行）✅

**判定**: 不変条件維持

---

### I-05: spec-fixer scoped commit scope — test-cases.md を commit してしまう副作用

**確認箇所**: `src/core/step/write-scope.ts` forbiddenWritePaths / findScopedCommitViolations

- `SpecFixerStep.writes()` に test-cases.md 追加 → `forbiddenWritePaths("spec-fixer", slug, writes())` の forbidden set から test-cases.md が外れる → spec-fixer が test-cases.md を commit できる（意図通り）✅
- finding が test-cases.md に関係しないケース: spec-fixer が test-cases.md を変更しなければ changedPaths に含まれず、スコープ commit への影響なし ✅
- drift-guard（TC-029）: `writableByFixer["spec-fixer"]` と `SpecFixerStep.writes() ∩ protectedCanonPaths` が 4 要素で一致 ✅

**判定**: 不変条件維持

---

### I-06: deriveSpecReviewVerdict — 4b 削除後の severity 則整合

**確認箇所**: `src/core/step/judge-verdict.ts` L92-109

旧 4b（TC-routable → severity 問わず needs-fix）を削除した影響:

- medium test-cases.md fixable: `specRoutable.some(f => severity critical|high)` = false → approved（observation auto-fix fall-through）✅
- high test-cases.md fixable: `specRoutable.some(f => severity critical|high)` = true → needs-fix ✅
- request.md fixable: `fixableCanon.some(f => !specRoutableFiles.has(f.file))` = true → escalation（維持）✅

4a の判定: `!specRoutableFiles.has(f.file)` のみ（tcRoutableFiles 除去）。request.md / attestation は spec-fixer 非 writable のため引き続き unroutable → escalation ✅

**判定**: 不変条件維持

---

### I-07: step-completion.ts の単一 resolver 化 — escalation reason の正確性

**確認箇所**: `src/core/step/step-completion.ts` L208-215

旧デュアル resolver（test-cases.md → test-case-gen、他 → spec-fixer）から `specReviewEffectiveFixer`（常に "spec-fixer"）単一化。

- test-cases.md finding: 旧は test-case-gen resolver でチェック → 今は spec-fixer resolver。spec-fixer の writableByFixer に test-cases.md が含まれるので `selectUnroutableCanonFindings` = 0 件 → escalation reason に含まれない ✅
- request.md finding: spec-fixer writable に含まれない → unroutable → escalation reason に含まれる（維持）✅

旧デュアル resolver の存在理由（"test-cases.md を test-case-gen に routable と判定して escalation reason から除外"）は、今や spec-fixer の writableByFixer 拡張で自然に達成される ✅

**判定**: 不変条件維持

---

### I-08: test-case-gen.buildMessage — finding 注入除去の副作用

**確認箇所**: `src/core/step/test-case-gen.ts` L82-93

finding 注入ロジックは削除した `testCaseGenEffectiveFixer` に依存していたため compile 不能になる（削除は必須）。simplify 後の `buildTestCaseGenInitialMessage` は初回生成と同一メッセージを生成し、`specReviewFindingsBlock` optional 省略は "findings なし" = initial run と同義。プロンプト品質は変わらない ✅

**判定**: 不変条件維持

---

## Findings

### F-001 [low / fixable]: `specFixerObservationForward` にループ削除後の stale コメントが残存

**ファイル**: `src/core/pipeline/spec-observation.ts` L56

```
// Used as the `when` guard on the guarded
// `spec-fixer approved → implementer` transition row.
// (test-case-gen already ran before spec-review; observation pass goes directly to implementer)
```

末尾行 "test-case-gen already ran before spec-review" は旧設計（ループ内 test-case-gen 透過化）の説明。spec-review-loop-single-fixer で test-case-gen はループから除去されており、コメントが実態を誤表現している。機能への影響はないが、次の保守者が observation pass の設計意図を誤読するリスクがある。

**修正案**: コメントを "observation pass: spec-review was approved; spec-fixer applied low/medium fixable findings, proceed directly to implementer without re-review" 等に更新する。

---

### F-002 [low / fixable]: spec-fixer write-scope 拡張が conformance 経路の escalation 判定を暗黙に変更する

**ファイル**: `src/core/step/judge-verdict.ts` L173（`deriveConformanceVerdict` 内の `selectUnroutableCanonFindings`）

`deriveConformanceVerdict` は `conformanceEffectiveFixer`（= `f.fixTarget ?? "implementer"`）で unroutable 判定を行う。この PR 前:

- conformance finding: file=test-cases.md, fixTarget="spec-fixer"
- `writableByFixer["spec-fixer"].has(test-cases.md)` = **false** → unroutable → **escalation**

この PR 後:

- `writableByFixer["spec-fixer"].has(test-cases.md)` = **true** → routable → `deriveConformanceVerdict` は "needs-fix:spec-fixer" を返し、conformance → spec-fixer → spec-review へ進む

スコープ外（conformance routing 変更）と明示されたパスだが、request 要件4「observation auto-fix 経路の整合」では "routable の test-cases.md 拡張に伴う単純化を行う" とあり、この副作用は writableByFixer 拡張の論理的帰結。conformance が test-cases.md を fixable finding として返すシナリオは実運用では発生しない（conformance は実装と仕様の適合を検査し test-cases.md は対象外）が、挙動変化は undocumented。

**修正案**: `judge-verdict.ts` の `deriveConformanceVerdict` の doc コメントに "test-cases.md の spec-fixer fixable finding は spec-fixer に route される（旧: escalation）" を追記し、暗黙の変化を明文化する。または conformance 専用のテストを 1 件追加して新挙動を pin する。

---

## Non-Findings（確認済み・問題なし）

- **I-01** episode 予算カウント: loopIntermediateSteps 削除後も newEpisode=false（spec-fixer→spec-review）が正しく同一episode判定 ✅
- **I-02** conformance 再検証予算リセット: unpaired-step ロジックと spec-fixer→spec-review の same-episode が独立して機能 ✅
- **I-03** observation/needs-fix/conformance の三路分岐: specFixerObservationForward が 2 条件で正確に区別 ✅
- **I-04** TEST_CASE_GEN 宛 transition: DESIGN→TEST_CASE_GEN のみ残存、SPEC_REVIEW/SPEC_FIXER→TEST_CASE_GEN は除去 ✅
- **I-05** scoped commit scope: spec-fixer writes() 拡張と forbiddenWritePaths が整合 ✅
- **I-06** verdict 導出の severity 則: low/medium TC → approved、high/critical TC → needs-fix ✅
- **I-07** escalation reason 精度: 単一 resolver で test-cases.md が unroutable 判定から除外 ✅
- **I-08** test-case-gen message: initial run のみ、finding 注入なし ✅
- **削除対象 4 シンボル**: src/ に 0 件（grep 確認）✅
- **resume 経路の互換性**: 旧ループ途中の halted job が resume しても test-case-gen→spec-review transition は保持されており、新 transition table で自然に処理される ✅
- **exempt type bypass**: test-gen-exemption 経路は変更なし、DESIGN→SPEC_REVIEW bypass は独立 ✅
- **bun run typecheck / bun run test**: verification-result.md で両方 passed（11802 tests）✅
