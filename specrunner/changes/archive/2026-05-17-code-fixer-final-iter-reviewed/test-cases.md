# Test Cases: code-fixer-final-iter-reviewed

## Overview

pipeline の loop exhaustion check 改訂に対するテストシナリオ。
「fixer 最終 iter の成果物を必ず review に渡す」semantic の正確性と、既存挙動の regression なしを検証する。

---

## TC-N01 — code-review pair: fixer 最終 iter 後に review +1 が approved で完走

- **Category**: Happy Path
- **Priority**: must
- **Source**: T-08, 要件 §6

**GIVEN** `maxIterations = 2`、`loopFixerPairs` に `code-review → code-fixer` が定義されている  
**AND** code-review iter 1 が `needs-fix` を返す  
**AND** code-fixer iter 1 が完了する  
**AND** code-review iter 2 が `needs-fix` を返す  
**AND** code-fixer iter 2 が完了する（fixer 最終 iter）  
**WHEN** pipeline が code-review へ遷移しようとする（`loopIters["code-review"] = 2 >= 2`）  
**THEN** bypass 条件が成立し、code-review iter 3（+1）が実行される  
**AND** code-review iter 3 が `approved` を返す  
**AND** pipeline は pr-create へ進み `status === "awaiting-merge"` で完了する  
**AND** `codeReviewArr.length === 3`、`codeFixerArr.length === 2`

---

## TC-N02 — code-review pair: fixer 最終 iter 後の review +1 が needs-fix → exhaustionPhase=review-after-final-fix

- **Category**: Escalation
- **Priority**: must
- **Source**: T-07 (TC-061 新 semantic), 要件 §6, 設計 D4

**GIVEN** `maxIterations = 2`、`loopFixerPairs` に `code-review → code-fixer` が定義されている  
**AND** code-review が 3 回とも `needs-fix` を返す設定  
**AND** code-fixer が 2 回走った後、bypass により code-review iter 3 が実行される  
**WHEN** code-review iter 3 が `needs-fix` を返し、code-fixer へ遷移しようとする  
**AND** `fixerIters["code-fixer"] = 2 >= 2` で fixer gate が発動する  
**THEN** pipeline は escalate する  
**AND** `result.status === "awaiting-resume"`  
**AND** `result.resumePoint.exhaustionPhase === "review-after-final-fix"`  
**AND** `result.error.code === "CODE_REVIEW_RETRIES_EXHAUSTED"`  
**AND** `codeReviewArr.length === 3`

---

## TC-N03 — TC-061 新 semantic: maxRetries=2 で全 review が needs-fix → review-after-final-fix で escalate

- **Category**: Escalation
- **Priority**: must
- **Source**: T-07, 受け入れ基準

**GIVEN** `maxRetries = 2`  
**AND** `codeReviewVerdicts = ["needs-fix", "needs-fix", "needs-fix"]`（3 回全て needs-fix）  
**WHEN** pipeline を実行する  
**THEN** code-review が 3 回実行される（iter 1, 2, bypass iter 3）  
**AND** code-fixer が 2 回実行される  
**AND** `codeReviewArr.length === 3`（旧 TC-061 の `length === 2` から更新）  
**AND** `result.resumePoint.exhaustionPhase === "review-after-final-fix"`  
**AND** `result.status === "awaiting-resume"`

---

## TC-N04 — spec-review / spec-fixer pair: 同一 bypass 挙動が成立

- **Category**: Happy Path (per-pair)
- **Priority**: must
- **Source**: T-09, 要件 §6

**GIVEN** `maxRetries = 2`、`loopFixerPairs` に `spec-review → spec-fixer` が定義されている  
**AND** `specReviewVerdicts = ["needs-fix", "needs-fix", "approved"]`  
**WHEN** pipeline を実行する  
**THEN** spec-fixer が 2 回実行される  
**AND** spec-review iter 3（bypass）が実行され `approved` で完走する  
**AND** `specReviewArr.length === 3`  
**AND** `specFixerArr.length === 2`

---

## TC-N05 — verification / build-fixer pair: 同一 bypass 挙動が成立

- **Category**: Happy Path (per-pair)
- **Priority**: must
- **Source**: T-10, 要件 §6

**GIVEN** `maxRetries = 2`、`loopFixerPairs` に `verification → build-fixer` が定義されている  
**AND** verification が 2 回 `failed` を返し、build-fixer が 2 回走った後  
**AND** verification iter 3（bypass）が `passed` を返す設定  
**WHEN** pipeline を実行する  
**THEN** verification が 3 entries 存在する  
**AND** build-fixer が 2 entries 存在する  
**AND** pipeline は次ステップへ進む（escalate しない）

---

## TC-N06 — fixer 不在の loop step は maxIterations で即 escalate（bypass なし）

- **Category**: Conventional Exhaustion
- **Priority**: must
- **Source**: T-11, 設計 D3, 受け入れ基準

**GIVEN** `loopFixerPairs = {}`（pair 定義なし）  
**AND** loop step が `maxIterations` 回実行される  
**WHEN** loop step が `maxIterations + 1` 回目に遷移しようとする  
**THEN** bypass は発生しない（`pairedFixer` が undefined）  
**AND** pipeline は即座に escalate する  
**AND** `resumePoint.exhaustionPhase === "review-exhausted"`

---

## TC-N07 — TC-060 regression: code-review needs-fix → code-fixer → approved（fixer 1 回で完走）

- **Category**: Regression
- **Priority**: must
- **Source**: T-12, 受け入れ基準

**GIVEN** `maxRetries = 2`  
**AND** code-review iter 1 が `needs-fix` を返す  
**AND** code-fixer iter 1 が完了する  
**AND** code-review iter 2 が `approved` を返す  
**WHEN** pipeline を実行する  
**THEN** `result.status === "awaiting-merge"`  
**AND** `codeReviewArr.length === 2`  
**AND** `codeFixerArr.length === 1`  
**AND** bypass は発生しない（fixer が maxIterations に達していない）

---

## TC-N08 — fixerIters counter が正確にインクリメントされる

- **Category**: Unit / Counter Tracking
- **Priority**: must
- **Source**: T-03, 設計 D2

**GIVEN** pipeline に `loopFixerPairs` が定義されている  
**AND** code-fixer が 2 回呼び出される  
**WHEN** 各 fixer step の入場タイミングで counter がインクリメントされる  
**THEN** code-fixer 1 回目の入場後 `fixerIters.get("code-fixer") === 1`  
**AND** code-fixer 2 回目の入場後 `fixerIters.get("code-fixer") === 2`  
**AND** step 実行前（execute 呼び出し前）にインクリメントが行われる

---

## TC-N09 — bypass は構造的に 1 回のみ（二重 bypass 不可）

- **Category**: Invariant
- **Priority**: must
- **Source**: 設計 D6, 設計 Invariant #3

**GIVEN** `maxIterations = 2`、bypass が一度発動した後  
**AND** review iter 3（bypass）が `needs-fix` を返す  
**WHEN** pipeline が再び code-fixer へ遷移しようとする  
**THEN** `fixerIters["code-fixer"] = 2 >= 2` で fixer gate が発動する  
**AND** fixer は実行されない  
**AND** escalation が発生する（二度目の bypass は起きない）  
**AND** `resumePoint.exhaustionPhase === "review-after-final-fix"`

---

## TC-N10 — review-exhausted: fixer が maxIter に達する前の review exhaustion

- **Category**: Escalation Phase Distinction
- **Priority**: must
- **Source**: T-05, 設計 D4, 要件 §3

**GIVEN** `maxIterations = 3`、`loopFixerPairs` に pair が定義されている  
**AND** code-review が 3 回 needs-fix を返すが code-fixer は 1 回のみ走っている（fixer counter < 3）  
**WHEN** review の conventional exhaustion 判定が成立する（fixer bypass 条件不成立）  
**THEN** pipeline が escalate する  
**AND** `resumePoint.exhaustionPhase === "review-exhausted"`  
**AND** `"review-after-final-fix"` ではないこと

---

## TC-S01 — 旧 state ファイルとの後方互換: exhaustionPhase なしで deserialize 可能

- **Category**: Schema Compatibility
- **Priority**: should
- **Source**: T-01, 設計 D4 (optional field)

**GIVEN** `exhaustionPhase` フィールドを持たない旧フォーマットの `resumePoint` を含む state ファイル  
**WHEN** state ファイルを読み込む  
**THEN** deserialize がエラーなく成功する  
**AND** `resumePoint.exhaustionPhase === undefined`  
**AND** 既存の `iterationsExhausted` フィールドは維持されている

---

## TC-S02 — maxIterations=1 の edge case: fixer 1 回 → review +1 で approved 完走

- **Category**: Edge Case
- **Priority**: should
- **Source**: 設計 Invariants, 要件 §2

**GIVEN** `maxIterations = 1`、`loopFixerPairs` に `code-review → code-fixer` が定義されている  
**AND** code-review iter 1 が `needs-fix`  
**AND** code-fixer iter 1 が完了（fixer 最終 iter = 1 回目）  
**AND** code-review iter 2（bypass）が `approved`  
**WHEN** pipeline を実行する  
**THEN** `codeReviewArr.length === 2`  
**AND** `codeFixerArr.length === 1`  
**AND** `result.status === "awaiting-merge"`（escalate しない）

---

## TC-S03 — exhaustionPhase 分岐: fixer が 1 回も走らずに review exhaust → review-exhausted

- **Category**: Escalation Phase Distinction
- **Priority**: should
- **Source**: 設計 D4

**GIVEN** `maxIterations = 2`、pair が定義されているが code-fixer は一度も走らない構成  
**AND** code-review が 2 回 needs-fix を返すが直後に fixer へ遷移せず exhaustion に到達  
**WHEN** conventional exhaustion が成立する  
**THEN** `resumePoint.exhaustionPhase === "review-exhausted"`  
**AND** `fixerIters` には code-fixer のエントリーが存在しない（0 回）

---

## TC-S04 — 観測例再現: managed-reset-status-stale-guard 相当のシナリオが pass

- **Category**: Observed Failure Reproduction
- **Priority**: should
- **Source**: 要件背景, 受け入れ基準 (最終項)

**GIVEN** `maxIterations = 2`、fixer 最終 iter が実態として green な修正を行った  
**AND** 旧実装では fixer 最終 iter の成果物が review に渡らず halt していた  
**WHEN** 新実装で同等シナリオを実行する  
**THEN** fixer 最終 iter 後に review +1 が必ず実行される  
**AND** review が `approved` を返せば pipeline は完走する  
**AND** 旧来の「成果物が review されないまま halt」は発生しない

---

## TC-S05 — loopFixerPairs が STEP_NAMES 定数で正しく初期化される

- **Category**: Initialization
- **Priority**: should
- **Source**: T-06

**GIVEN** `src/core/pipeline/run.ts` の `createPipeline` 関数  
**WHEN** Pipeline constructor が呼び出される  
**THEN** `loopFixerPairs` に以下の 3 組が含まれる:
  - `STEP_NAMES.CODE_REVIEW → STEP_NAMES.CODE_FIXER`
  - `STEP_NAMES.SPEC_REVIEW → STEP_NAMES.SPEC_FIXER`
  - `STEP_NAMES.VERIFICATION → STEP_NAMES.BUILD_FIXER`  
**AND** リテラル文字列ではなく `STEP_NAMES.*` 定数を使用している

---

## TC-C01 — loopFixerPairs が省略された場合にデフォルト `{}` として扱われる

- **Category**: Default Behavior
- **Priority**: could
- **Source**: T-02, 設計 D3

**GIVEN** Pipeline constructor に `loopFixerPairs` パラメータを渡さない  
**WHEN** loop step が `maxIterations` に達する  
**THEN** `this.loopFixerPairs === {}` として動作する  
**AND** bypass は発生しない（fixer 不在として扱われる）  
**AND** 従来通り exhaustion で escalate する

---

## TC-C02 — TypeScript 型チェックが通る（exhaustionPhase optional）

- **Category**: Type Safety
- **Priority**: could
- **Source**: T-14, T-01

**GIVEN** `ResumePoint` に `exhaustionPhase?: "review-after-final-fix" | "review-exhausted"` が追加された  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件である  
**AND** `exhaustionPhase` を省略したコードも型エラーにならない  
**AND** `exhaustionPhase` に有効でない文字列を渡すと型エラーになる

---

## TC-C03 — delta spec が pipeline-orchestrator の Loop Guard requirement を MODIFIED で更新

- **Category**: Spec Authority
- **Priority**: could
- **Source**: T-13, 受け入れ基準

**GIVEN** `specrunner/changes/code-fixer-final-iter-reviewed/delta-spec/pipeline-orchestrator.md` が作成された  
**WHEN** delta spec の内容を確認する  
**THEN** "Pipeline Enforces Loop Guard via maxIterations" が `MODIFIED` セクションに含まれる  
**AND** `loopFixerPairs`・`fixerIters`・`exhaustionPhase` の仕様が明記されている  
**AND** fixer 最終 iter 後の review 1 回保証シナリオが GIVEN/WHEN/THEN 形式で記載されている
