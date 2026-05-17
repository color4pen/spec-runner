# Design: code-fixer-final-iter-reviewed

## Overview

pipeline の loop exhaustion check を改訂し、fixer の最終 iter 成果物が必ず review に渡るようにする。
「review は fixer + 1 回まで実行できる」semantic を導入し、fixer の試行回数を独立 counter で追跡する。

## Problem Analysis

現状の exhaustion check（`pipeline.ts:276-295`）:

```typescript
if (this.loopNames.includes(nextStep)) {
  const nextLoopIter = loopIters.get(nextStep) ?? 0;
  if (nextLoopIter >= this.maxIterations) {
    // escalate
  }
}
```

`loopIters` は review step の入場時にインクリメントされる。fixer は `loopNames` に含まれないため counter を持たない。

シーケンス（`maxIterations = 2`）:
1. code-review iter 1 → needs-fix → `loopIters["code-review"] = 1`
2. code-fixer → 一部修正
3. code-review iter 2 → needs-fix → `loopIters["code-review"] = 2`
4. code-fixer → 残りを修正（実態は green）
5. code-review に遷移しようとする → `2 >= 2` → **escalate**

= fixer の最終 iter の成果物は一度も review されない。

## Design Decisions

### D1: review は `maxIterations + 1` 回まで実行可（条件付き）

exhaustion check のセマンティクスを以下に変更する:

- **通常ケース**: `loopIters.get(nextStep) >= maxIterations` で halt（従来通り）
- **fixer 経由のケース**: 直前 step が対応 fixer で、かつその fixer が `maxIterations` 回目に到達している場合に限り、exhaustion check を **1 回だけ bypass** する

これにより review は最大 `maxIterations + 1` 回走る。`+1` 回目は「fixer 最終 iter の成果を判定するための review」という明確な意味を持つ。

### D2: fixer 試行回数を `fixerIters: Map` で独立追跡

fixer は `loopNames` に含めない（入れると stdout 出力や iter 表示が破綻する）。
代わりに `fixerIters: Map<string, number>` を `loopIters` と並列で Pipeline クラスに追加する。

fixer step に入るタイミングでインクリメントする。`fixerIters.get(fixerName) >= maxIterations` で fixer 自身の上限を gate する（ただし現実装では fixer への遷移は review の needs-fix verdict 経由のみで起きるため、review 側の counter と自然に同期する）。

### D3: `loopFixerPairs` で review↔fixer の対応関係を宣言

Pipeline constructor に `loopFixerPairs: Record<string, string>` を追加:

```typescript
// review step name → fixer step name
loopFixerPairs: {
  "code-review": "code-fixer",
  "spec-review": "spec-fixer",
  "verification": "build-fixer",
}
```

pair 不在の loop step は「fixer なし → 従来挙動」。将来 fixer を持たない loop step が追加されても安全。

### D4: `exhaustionPhase` を `ResumePoint` に追加

```typescript
export interface ResumePoint {
  step: StepName;
  reason: string;
  iterationsExhausted: number;
  exhaustionPhase?: "review-after-final-fix" | "review-exhausted";
}
```

- `"review-after-final-fix"`: fixer 最終 iter を経た review が approve しなかった
- `"review-exhausted"`: fixer の maxIter に達する前に review が exhaust した（= 従来挙動）
- `undefined`: 旧 state との互換（exhaust 以外の理由で awaiting-resume になった場合）

`resolve-step.ts` の既存ロジック（`iterationsExhausted > 0 && isReviewer → fixer`）は変更しない。
`exhaustionPhase` は resume のデフォルト解決には影響せず、ユーザーが状況を理解するための diagnostic 情報。

### D5: bypass は「直前 step の記録」で判定する

Pipeline の `runInternal` は transition 確定後に `prevStep` を記録している（`prevLoopStep` 変数）。
exhaustion check 時に「直前 step が `loopFixerPairs[nextStep]` と一致するか」を見て bypass を判定する。

具体的には `prevStep` 変数（= transition 前の currentStep）を利用する:

```typescript
if (this.loopNames.includes(nextStep)) {
  const nextLoopIter = loopIters.get(nextStep) ?? 0;
  if (nextLoopIter >= this.maxIterations) {
    const pairedFixer = this.loopFixerPairs[nextStep];
    const cameFromFixer = pairedFixer && currentStep === pairedFixer;
    const fixerAtMax = cameFromFixer && (fixerIters.get(pairedFixer) ?? 0) >= this.maxIterations;
    if (fixerAtMax) {
      // bypass: allow one more review iteration (final-fix review)
    } else {
      // escalate (conventional)
    }
  }
}
```

`fixerAtMax` 条件を入れることで「fixer が maxIter 回走った最終 iter の直後」のみ bypass する。fixer 1 回目の後の review は通常カウントで処理される。

### D6: bypass は 1 回のみ保証

bypass 後に review がさらに needs-fix を返した場合:
- fixer はもう走らない（fixer の iter は maxIterations に達しているため遷移しても gate で弾かれる）
- 次回 review 入場時に `loopIters >= maxIterations + 1`… ではなく、`loopIters >= maxIterations` がまた true になる
- ただし `currentStep` はもう fixer ではなく review 自身なので bypass 条件不成立 → escalate

つまり bypass は構造的に 1 回しか発生しない。追加の flag は不要。

ただし、needs-fix → fixer への遷移が起きた場合に fixer が gate で弾かれる必要がある。fixer の gate check は exhaustion check ブロック（review 用）と同じ位置で行う。ただし fixer は `loopNames` に入っていないため、別のチェックポイントが必要:

**fixer exhaustion gate**: transition lookup で次 step が fixer になった場合、`fixerIters.get(fixer) >= maxIterations` なら fixer をスキップして escalate する。

実装上は exhaustion check の直後に fixer 用の check を追加する:

```typescript
// Check fixer exhaustion (separate from loop step exhaustion)
const pairedFixer = Object.entries(this.loopFixerPairs).find(([_, f]) => f === nextStep)?.[1];
if (pairedFixer === nextStep) {
  // nextStep is a fixer
  if ((fixerIters.get(nextStep) ?? 0) >= this.maxIterations) {
    // fixer exhausted → escalate
  }
}
```

ただし再考: bypass が成立した review が needs-fix を返した場合、transition table は `code-review --needs-fix→ code-fixer`。code-fixer に遷移しようとするが fixer gate で弾かれる。この時点で escalation する必要がある。

### D7: spec authority — `pipeline-orchestrator` spec を MODIFIED

`pipeline-orchestrator/spec.md` の Requirement "Pipeline Enforces Loop Guard via maxIterations" を改訂する:
- 現在の scenario は「N 回連続で needs-fix → exhaust」を想定
- 新 semantic「fixer が maxIter 回走った直後の review は追加 1 回許可」を追加
- `loopFixerPairs` の宣言仕様を追加
- `fixerIters` の追跡仕様を追加
- `exhaustionPhase` の仕様を追加

## Modified Files

| File | Change |
|------|--------|
| `src/core/pipeline/pipeline.ts` | `fixerIters` counter 追加、`loopFixerPairs` constructor param 追加、exhaustion check 改訂、fixer exhaustion gate 追加、`handleExhausted` に `exhaustionPhase` 反映 |
| `src/core/pipeline/run.ts` | `loopFixerPairs` を Pipeline constructor に渡す |
| `src/core/pipeline/types.ts` | `LoopFixerPairs` type export（optional） |
| `src/state/schema.ts` | `ResumePoint.exhaustionPhase` optional field 追加 |
| `tests/pipeline-integration.test.ts` | TC-061 を新 semantic で書き換え、新 TC 追加 |
| `tests/core/pipeline/pipeline.test.ts` | unit test 追加（bypass logic、fixer gate） |

## New Files

なし（全て既存ファイルへの変更）。

## Data Flow (Amended Exhaustion Check)

```
transition lookup → nextStep 確定
  │
  ├─ nextStep is loopStep?
  │   └─ YES → loopIters[nextStep] >= maxIterations?
  │              ├─ NO → proceed (normal)
  │              └─ YES → came from paired fixer AND fixer at maxIter?
  │                        ├─ YES → BYPASS (allow +1 review)
  │                        └─ NO → handleExhausted("review-exhausted")
  │
  ├─ nextStep is fixer? (check via loopFixerPairs values)
  │   └─ YES → fixerIters[nextStep] >= maxIterations?
  │              ├─ NO → proceed (increment fixerIters)
  │              └─ YES → handleExhausted("review-after-final-fix")
  │
  └─ neither → proceed
```

## Invariants

1. review は最大 `maxIterations + 1` 回走る（+1 は fixer 最終 iter 後のみ）
2. fixer は最大 `maxIterations` 回走る（従来と同じ上限）
3. bypass は構造的に 1 回だけ発生する
4. pair 未定義の loop step は従来挙動を維持
5. `exhaustionPhase` は optional field — 旧 state file との互換を維持
