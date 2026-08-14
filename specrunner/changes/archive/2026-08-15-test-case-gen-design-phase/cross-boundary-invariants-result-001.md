# Cross-Boundary Invariants Review: test-case-gen-design-phase

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## 検査対象の変更概要

- 遷移順序の組み替え: `design → spec-review → test-case-gen` → `design → test-case-gen → spec-review`
- `deriveSpecReviewVerdict` を dual-resolver 化（spec-fixer + test-case-gen）
- `FixTarget` union に `"test-case-gen"` を追加
- `canon-write-scope`: `writableByFixer` に `["test-case-gen", {test-cases.md}]` を追加
- `loopIntermediateSteps: new Set([TEST_CASE_GEN])` を STANDARD_DESCRIPTOR に追加
- `spec-fixer` guard: `specFixerForwardsToTestGen` → `specFixerObservationForward` 改名、`specFixerNeedsFixForward` 新規追加
- `specReviewNeedsFixIsTcOnly` 新規追加

---

## 検証した不変条件と結果

### ✅ loopIntermediateSteps — バジェットリセット阻止

`STANDARD_DESCRIPTOR.loopIntermediateSteps = new Set(["test-case-gen"])` により、`pipeline.ts:522`:
```typescript
let newEpisode = currentStep !== pairedFixerForNext && !this.loopIntermediateSteps.has(currentStep);
```
`currentStep = "test-case-gen"` の場合 `newEpisode = false`。spec-fixer → test-case-gen → spec-review パスでバジェットがリセットされない。TC-only パス（spec-review → test-case-gen → spec-review）でも同様。ループ上限が正常に機能する。✅

### ✅ 観察 pass の forward 先（specFixerObservationForward）

`specFixerObservationForward`: (1) conformance-fix context が null、(2) 最新 spec-review verdict = "approved" → test-materialize へ forward。新モデルで test-case-gen は spec-review の前に実行済みのため、観察 pass の test-materialize forward は一貫している。spec-review approved の段階では TC finding が存在しない（4b が needs-fix を返すため）。✅

### ✅ needs-fix ループ後の specFixerNeedsFixForward

conformance → spec-fixer → spec-review（verdict: needs-fix）→ spec-fixer のパス:
- `getConformanceFixContext` は spec-review が conformance より後に実行されると null を返す（recency check: `predecessor.endedAt >= conformance.endedAt` → null）
- その後 `specFixerNeedsFixForward`: conformance context = null かつ spec-review = "needs-fix" → true → test-case-gen → spec-review

conformance-triggered 経路の意味論が壊れていない。✅

### ✅ 承認後の test-cases.md 保護

`deriveConformanceVerdict`: `conformanceEffectiveFixer = (f) => f.fixTarget ?? "implementer"` を使う。test-cases.md finding (fixTarget なし) → implementer → implementer の writable set {tasks.md} に test-cases.md は含まれない → unroutable → escalation。`deriveJudgeVerdict` / `deriveRegressionGateVerdict`: `judgeEffectiveFixer = () => "code-fixer"` → code-fixer(∅) → unroutable → escalation。設計 D3-5 に示す「承認後保護は追加コード不要」が実装上も確認できた。✅

### ✅ specReviewNeedsFixIsTcOnly の条件正確性

```typescript
const nonCanon = findings.filter(
  (f) => (f.severity === "critical" || f.severity === "high") && !canonScope.canonPaths.has(f.file),
);
return specRoutable.length === 0 && nonCanon.length === 0;
```
verdict = "needs-fix" のとき decision-needed は存在せず（step 3 で escalation）、unroutable は存在せず（step 4a で escalation）。nonCanon の critical/high が存在すると step 5 が needs-fix を返し、specReviewNeedsFixIsTcOnly は false を返して spec-fixer に routing される。整合している。✅

### ✅ 免除 type (isTestGenExempt) の経路不変

`DESIGN success → SPEC_REVIEW when isTestGenExempt` が first-match-wins で `→ TEST_CASE_GEN (unconditional)` に先行している。免除 type の `spec-review approved → IMPLEMENTER when isTestGenExempt` も `→ TEST_MATERIALIZE` に先行している。免除経路は従来と等価。✅

### ✅ collectSpecReviewLedger の regression ledger 除外

`collectSpecReviewLedger` は `specReviewEffectiveFixer`（常に "spec-fixer" を返す）を使って unroutable を除外する。test-cases.md は spec-fixer の writable set に含まれないため ledger から除外される。TC finding が regression-gate の対象外になるのは設計上正しい（TC は design phase で解消済みであるべき）。✅

### ✅ spec-fixer の write-scope 保護

`writableByFixer["spec-fixer"] = {spec.md, design.md, tasks.md}`。test-cases.md は含まれない。spec-fixer が TC findings を含むメッセージを受け取っても、commit 時の write-scope ゲートが test-cases.md への書き込みを物理的にブロックする。✅

### ✅ test-case-gen の no-op 検出と test-cases.md artifact パス

`TestCaseGenStep.noOpDetect` は未設定（undefined）。`detectNoOp` は先頭ガードで `if (!step.noOpDetect) return undefined` を返す。test-cases.md が `specrunner/changes/` プレフィックスを持ちアーティファクト扱いになっても no-op 誤検知は発生しない。✅

---

## 発見した問題

### F-001: step-completion.ts — spec-review の escalation reason に test-cases.md が誤って含まれる

**位置**: `src/core/step/step-completion.ts:221`

```typescript
lastCanonResolver =
  step.name === STEP_NAMES.SPEC_REVIEW ? specReviewEffectiveFixer : judgeEffectiveFixer;
```

**問題の詳細**:

`deriveSpecReviewVerdict` は step 4a で dual-resolver アプローチを使う:

```typescript
// 4a: spec-fixer AND test-case-gen の両方でルーティング不可なら escalation
if (fixableCanon.some((f) => !specRoutableFiles.has(f.file) && !tcRoutableFiles.has(f.file))) {
  return "escalation";
}
```

test-cases.md は `tcRoutableFiles`（test-case-gen writable）に含まれるため、step 4a の escalation をトリガーしない。  
一方 request.md / attestation は両方の routable set に含まれないため、step 4a の escalation をトリガーする。

しかし `step-completion.ts` の escalation reason 計算では:

```typescript
const unroutable = selectUnroutableCanonFindings(
  lastUndecidedFindings, canonScope, lastCanonResolver  // = specReviewEffectiveFixer
);
```

`specReviewEffectiveFixer` は常に "spec-fixer" を返す。spec-fixer の writable set = `{spec.md, design.md, tasks.md}`。  
test-cases.md は spec-fixer の writable set に含まれないため、`selectUnroutableCanonFindings` は test-cases.md の finding を「unroutable」と判定して escalation reason に含める。

**発現条件**: spec-review が同一ラウンドで (a) request.md / attestation への fixable finding（両 fixer で unroutable → step 4a escalation）と (b) test-cases.md への fixable finding（TC-routable → step 4b が needs-fix を返す予定だったが step 4a が優先）を同時に報告した場合。

**影響**:
- routing の正確性への影響: なし（verdict は正しく "escalation"）
- 診断精度への影響: escalation reason が operator に「test-cases.md を operator が修正する必要がある」と誤って伝える。実際には request.md を修正して pipeline を再開すれば test-case-gen の再生成で TC 問題は解消される。operator が不要な手動修正を行う可能性がある。
- テストカバレッジ: TC-017 は `deriveSpecReviewVerdict` の verdict を検証するが、`step-completion.ts` の `lastCanonResolver` 選択が生成する escalation reason の正確性を検証するテストが存在しない。

**修正方法**: `step-completion.ts` において spec-review の `lastCanonResolver` を、spec-fixer のみではなく「両 fixer でいずれも routable でなければ unroutable」とする複合ロジックに置き換える。具体的には:

```typescript
// step-completion.ts:221 の修正案
lastCanonResolver = step.name === STEP_NAMES.SPEC_REVIEW
  ? (f: Finding) => {
      // test-cases.md は test-case-gen が担う — spec-fixer で unroutable でも escalation reason に含めない
      const tcWritable = canonScope.writableByFixer.get("test-case-gen" as FixTarget) ?? new Set();
      return tcWritable.has(f.file) ? "test-case-gen" : "spec-fixer";
    }
  : judgeEffectiveFixer;
```

または `selectUnroutableCanonFindings` を dual-resolver 対応にする専用 helper を用意する。

---

## 不変条件の境界マトリクス

| 検査項目 | 変更前の暗黙の前提 | 新挙動との整合 |
|---------|-----------------|-------------|
| loopIntermediateSteps によるバジェット保護 | 存在しなかった（新規追加） | 正しく実装 ✅ |
| conformance→spec-fixer→spec-review の recency guard | spec-review の後は getConformanceFixContext = null | 変更後も成立 ✅ |
| 承認後 test-cases.md は operator-only | conformance/judge は test-case-gen を routable にしない | 変更後も成立 ✅ |
| spec-fixer は test-cases.md を書けない | write-scope 保護が存在する | 変更後も成立 ✅ |
| specReviewEffectiveFixer が spec-review の全 canonical resolver | spec-review の verdict は spec-fixer のみが担う | **破れた** — verdict は dual-resolver だが diagnostic は single-resolver のまま ⚠️ |
| collectSpecReviewLedger の除外対象 | TC 以外の canon finding を除外する | test-cases.md は意図的に除外 ✅ |

---

## 未確認領域

- `spec-review` 承認後の observe-fix パスで spec-fixer が design.md を修正した後、test-cases.md が stale になるリスク（設計上「観察修正は spec の意味を変えない」という前提で意図的に許容されている）— 境界を越えた実害の有無は integration テストで確認されていないが、architect 評価済みの設計判断のため再確認は不要と判断する。
- managed runtime（Anthropic API 経由）でのバジェット追跡の挙動。ConvergenceBudget はメモリ内のみで管理されており、managed runtime での resume 時に fresh start になる既存の挙動は変更なし。

---

## 証拠

- checked: 28（主要なコードパス・guard・transition テーブル・budget ロジック・verdict 導出関数・write-scope・regression ledger）
- skipped: 0
- unverified: 1（escalation reason の実際の operator 画面への表示経路）
