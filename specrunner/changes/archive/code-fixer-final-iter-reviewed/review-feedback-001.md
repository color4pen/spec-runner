# Code Review Feedback — code-fixer-final-iter-reviewed — iter 1

## Summary

- **verdict**: approved
- **date**: 2026-05-17
- **reviewer**: code-reviewer

---

## Scope

| File | Change |
|------|--------|
| `src/core/pipeline/pipeline.ts` | `fixerIters` counter、`loopFixerPairs` param、exhaustion check 改訂、fixer gate、`handleExhausted` 拡張 |
| `src/core/pipeline/run.ts` | `loopFixerPairs` 3 pairs を Pipeline に渡す |
| `src/state/schema.ts` | `ResumePoint.exhaustionPhase` optional field 追加 |
| `tests/pipeline-integration.test.ts` | TC-012・TC-061 更新、TC-062〜TC-064 新規追加 |
| `tests/core/pipeline/pipeline.test.ts` | TC-069 新規追加 |
| `specrunner/changes/.../delta-spec/pipeline-orchestrator.md` | delta spec 作成 |

---

## Findings

| # | Severity | Category | File | Line | Description | Recommendation |
|---|----------|----------|------|------|-------------|----------------|
| F-01 | LOW | cosmetic | `pipeline.ts` | 43–44 | `loopName` フィールドの JSDoc コメントが 2 行連続で重複している | 上段 1 行を削除する |
| F-02 | LOW | performance | `pipeline.ts` | 316–317 | `const fixerNames = new Set(Object.values(this.loopFixerPairs))` が while ループ内で毎回再生成されている。`loopFixerPairs` は immutable なので Set はコンストラクタで 1 回だけ生成すればよい | `private readonly fixerNames: Set<string>` をコンストラクタで初期化する |
| F-03 | INFO | test-coverage | `tests/` | — | TC-N10（must）が明示的テストとして存在しない。TC-N10 は「pair 定義あり・fixerIters < maxIterations で conventional exhaustion → "review-exhausted"」を想定するが、標準遷移テーブルでは数学的に到達不能なシナリオ（review N 回到達時に fixer は必ず N−1 回走っており、そのまま maxIter と比較すると常に bypass 条件が成立する）。TC-N06/TC-069 が同じコードパス(`!fixerAtMax → handleExhausted("review-exhausted")`)を pair 未定義で正しく検証している | TC-N10 を priority `could` に降格するか、「到達不能」として spec 修正する。実装上の問題はない |

---

## Must Scenario Coverage

| TC-ID | Priority | Description | Covered by |
|-------|----------|-------------|------------|
| TC-N01 | must | code-review pair: fixer final iter → +1 approved → awaiting-merge | TC-062 ✅ |
| TC-N02 | must | code-review pair: fixer final iter → +1 needs-fix → review-after-final-fix | TC-061 (updated) ✅ |
| TC-N03 | must | TC-061 new semantic: 3 review runs + exhaustionPhase | TC-061 ✅ |
| TC-N04 | must | spec-review/spec-fixer pair: same bypass | TC-063 ✅ |
| TC-N05 | must | verification/build-fixer pair: same bypass | TC-064 ✅ |
| TC-N06 | must | fixer-absent loop step: maxIterations で即 escalate | TC-069 ✅ |
| TC-N07 | must | TC-060 regression: code-review 1 needs-fix → fixer → approved | TC-060 ✅ |
| TC-N08 | must | fixerIters counter が step 実行前にインクリメント | TC-062〜064 の bypass 成立で間接検証 ✅ |
| TC-N09 | must | bypass は構造的に 1 回のみ（二重 bypass 不可） | TC-061 (fixer gate 発動 + exhaustionPhase 検証) ✅ |
| TC-N10 | must | pair 定義あり・fixer < maxIter → "review-exhausted" | 標準フローでは到達不能シナリオ。TC-069 が同一コードパスを検証 ⚠️ (F-03 参照) |

---

## Implementation Correctness

### Core logic

- **bypass 条件** (`cameFromFixer && fixerAtMax`): 直前 step が paired fixer かつ fixerIters >= maxIterations のときのみ bypass — 設計 D5/D6 通り ✅
- **bypass の 1 回保証**: bypass 後に review が needs-fix → fixer gate で fixerIters >= maxIterations → fixer 入場を阻止して escalate。追加フラグなしに構造で保証 ✅
- **fixer gate の exhaustionPhase**: fixer gate は必ず bypass 直後に発動するため `"review-after-final-fix"` が意味的に正しい ✅
- **conventional exhaustion の exhaustionPhase**: `"review-exhausted"` を渡す。pair 不在 (`pairedFixer === undefined`) でも pair ありで `fixerAtMax = false` でも同一コードパスを通過 ✅
- **`handleExhausted` backward compat**: `exhaustionPhase` は optional spread (`...(exhaustionPhase && { exhaustionPhase })`) で付与。既存 state ファイルへの影響なし ✅
- **`loopFixerPairs` のデフォルト `{}`**: constructor param 省略時は `{}` → 全ての loop step が従来挙動を維持 ✅

### run.ts

`createStandardPipeline` で `STEP_NAMES.*` 定数を使って 3 pairs を設定。リテラル文字列なし ✅

### state/schema.ts

`ResumePoint.exhaustionPhase` が optional field として追加。既存フィールドへの変更なし ✅

### delta-spec

pipeline-orchestrator の "Pipeline Enforces Loop Guard via maxIterations" を MODIFIED で更新。`loopFixerPairs`・`fixerIters`・`exhaustionPhase` の仕様と 4 シナリオ（GIVEN/WHEN/THEN 形式）を明記 ✅

### Verification

`bun run typecheck && bun run test`: 全 1937 tests passed, 型エラー 0 ✅

---

## Verdict

- **verdict**: approved

F-01・F-02 はいずれも機能に影響しないコスメティック/パフォーマンスの指摘。F-03 は spec 側の問題で実装バグではない。コア修正（exhaustion check 改訂・fixer gate・fixerIters counter）は設計通りに正確に実装されており、全 must 受け入れ基準を満たす。
