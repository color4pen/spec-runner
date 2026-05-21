# Test Cases: resume-from-correct-loop-step

Generated from: request.md / design.md / tasks.md  
Date: 2026-05-18

---

## TC-01: fixer-empty mismatch — code-review needs-fix で中断 → code-review から再開

- **Category**: Unit — `resolveResumeStep`
- **Priority**: must
- **Source**: AC #2 / design.md D1 / tasks.md 3.1 / Issue #236 実バグ再現

**GIVEN** `resumePoint.step = "code-fixer"`, `iterationsExhausted = 0`  
**AND** `state.steps["code-fixer"]` が空 (fixer 未実行)  
**AND** `state.steps["code-review"]` の最終 verdict = `"needs-fix"`  
**WHEN** `resolveResumeStep(undefined, resumePoint, undefined, steps)` を呼ぶ  
**THEN** 戻り値が `"code-review"` であること

---

## TC-02: fixer-empty mismatch — spec-review needs-fix で中断 → spec-review から再開

- **Category**: Unit — `resolveResumeStep`
- **Priority**: must
- **Source**: AC #4 / design.md D5 / tasks.md 3.1

**GIVEN** `resumePoint.step = "spec-fixer"`, `iterationsExhausted = 0`  
**AND** `state.steps["spec-fixer"]` が空  
**AND** `state.steps["spec-review"]` の最終 verdict = `"needs-fix"`  
**WHEN** `resolveResumeStep(undefined, resumePoint, undefined, steps)` を呼ぶ  
**THEN** 戻り値が `"spec-review"` であること

---

## TC-03: fixer-empty mismatch — verification failed で中断 → verification から再開

- **Category**: Unit — `resolveResumeStep`
- **Priority**: must
- **Source**: AC #5 / design.md D5 / tasks.md 3.1

**GIVEN** `resumePoint.step = "build-fixer"`, `iterationsExhausted = 0`  
**AND** `state.steps["build-fixer"]` が空  
**AND** `state.steps["verification"]` の最終 verdict = `"failed"`  
**WHEN** `resolveResumeStep(undefined, resumePoint, undefined, steps)` を呼ぶ  
**THEN** 戻り値が `"verification"` であること

---

## TC-04: fixer が実行済み (non-empty) → fixer から再開 (regression なし)

- **Category**: Unit — `resolveResumeStep`
- **Priority**: must
- **Source**: AC #6 / tasks.md 3.2 / design.md D1

**GIVEN** `resumePoint.step = "code-fixer"`, `iterationsExhausted = 0`  
**AND** `state.steps["code-fixer"]` に 1 件以上のエントリがある (fixer 実行済み)  
**AND** `state.steps["code-review"]` の最終 verdict = `"needs-fix"`  
**WHEN** `resolveResumeStep(undefined, resumePoint, undefined, steps)` を呼ぶ  
**THEN** 戻り値が `"code-fixer"` であること (fixer crash restart — 既存挙動維持)

---

## TC-05: `--from fixer` 指定 → fixer-empty mismatch を上書きして fixer から再開

- **Category**: Unit — `resolveResumeStep`
- **Priority**: must
- **Source**: AC #7 / AC #8 / tasks.md 3.3

**GIVEN** `state.steps["code-fixer"]` が空  
**AND** `state.steps["code-review"]` の最終 verdict = `"needs-fix"`  
**AND** `resumePoint.step = "code-fixer"`  
**WHEN** `resolveResumeStep("fixer", resumePoint, undefined, steps)` を呼ぶ  
**THEN** 戻り値が `"code-fixer"` であること (`--from` が最優先で既定を上書き)

---

## TC-06: `steps` パラメータが undefined (legacy callers) → 既存挙動にフォールスルー

- **Category**: Unit — `resolveResumeStep`
- **Priority**: must
- **Source**: tasks.md 3.4 / design.md D1 後方互換

**GIVEN** `resumePoint.step = "code-fixer"`, `iterationsExhausted = 0`  
**AND** `steps = undefined` (4th 引数なし)  
**WHEN** `resolveResumeStep(undefined, resumePoint, undefined, undefined)` を呼ぶ  
**THEN** 戻り値が `"code-fixer"` であること (新ロジックはスキップ、既存 Tier 2 適用)

---

## TC-07: fixer-empty だが loop step の verdict が needs-fix でない → fixer から再開

- **Category**: Unit — `resolveResumeStep`
- **Priority**: must
- **Source**: tasks.md 3.5 / design.md D1 条件分岐

**GIVEN** `resumePoint.step = "code-fixer"`, `iterationsExhausted = 0`  
**AND** `state.steps["code-fixer"]` が空  
**AND** `state.steps["code-review"]` の最終 verdict = `"approved"` (needs-fix でない)  
**WHEN** `resolveResumeStep(undefined, resumePoint, undefined, steps)` を呼ぶ  
**THEN** 戻り値が `"code-fixer"` であること (mismatch 条件に合致しないため既存挙動)

---

## TC-08: fixer-empty かつ loop step の runs が 0 件 → fixer から再開

- **Category**: Unit — `resolveResumeStep`
- **Priority**: should
- **Source**: design.md D1 エッジケース (`loopRuns.length === 0` ガード)

**GIVEN** `resumePoint.step = "code-fixer"`, `iterationsExhausted = 0`  
**AND** `state.steps["code-fixer"]` が空  
**AND** `state.steps["code-review"]` も空 (loop step も未実行)  
**WHEN** `resolveResumeStep(undefined, resumePoint, undefined, steps)` を呼ぶ  
**THEN** 戻り値が `"code-fixer"` であること (lastLoopVerdict = null → mismatch 不成立)

---

## TC-09: reviewer step で `iterationsExhausted > 0` → fixer から再開 (既存挙動)

- **Category**: Unit — `resolveResumeStep`
- **Priority**: should
- **Source**: spec.md Scenario "reviewer step で exhaustion" / 既存挙動 regression

**GIVEN** `resumePoint.step = "code-review"`, `iterationsExhausted = 1`  
**AND** `state.steps["code-review"]` に needs-fix エントリが存在  
**WHEN** `resolveResumeStep(undefined, resumePoint, undefined, steps)` を呼ぶ  
**THEN** 戻り値が `"code-fixer"` であること (iteration 消費 exhaustion → fixer へ、既存 Tier 2b)

---

## TC-10: `--from critic` 指定 → fixer crash 状態から loop step へ上書き再開

- **Category**: Unit — `resolveResumeStep`
- **Priority**: should
- **Source**: spec.md Scenario "--from critic で fixer crash を上書き"

**GIVEN** `resumePoint.step = "code-fixer"` で fixer が実行済み  
**WHEN** `resolveResumeStep("critic", resumePoint, undefined, steps)` を呼ぶ  
**THEN** 戻り値が `"code-review"` であること (`--from critic` → Tier 1 mapping で loop step)

---

## TC-11: `resumePoint = null` かつ `--from` 未指定 → エラー終了

- **Category**: Unit — `resolveResumeStep` / Command layer
- **Priority**: must
- **Source**: spec.md Requirement "resumePoint が null かつ --from 未指定のとき resume を拒否する"

**GIVEN** `resumePoint = null`  
**AND** `--from` オプションなし  
**WHEN** `resolveResumeStep(undefined, null, undefined, steps)` を呼ぶ (or `specrunner resume <slug>` 実行)  
**THEN** 関数がエラー/例外を返す、またはコマンドが exit code 1 で終了すること  
**AND** stderr に再開位置不明のメッセージが出力されること

---

## TC-12: `resume.ts` が `state.steps` を `resolveResumeStep` に渡す

- **Category**: Unit — `resume.ts` 呼び出し側
- **Priority**: must
- **Source**: tasks.md Task 2 / design.md "File Changes"

**GIVEN** `resume.ts` の `resolveResumeStep` 呼び出し箇所 (line ~158)  
**WHEN** コードを静的検査する (or テスト内で spy する)  
**THEN** `state.steps` が第 4 引数として渡されていること

---

## TC-13: Integration — code-review needs-fix → kill → resume → completion

- **Category**: Integration — pipeline e2e
- **Priority**: must
- **Source**: AC "integration test で code-review needs-fix → resume → completion" / request.md 要件3

**GIVEN** pipeline が code-review で `verdict = "needs-fix"` を返した直後にプロセスが停止した state  
**AND** `state.steps["code-fixer"]` が空、`state.steps["code-review"][-1].verdict = "needs-fix"`  
**AND** `resumePoint.step = "code-fixer"`  
**WHEN** `specrunner resume <slug>` を `--from` なしで実行する  
**THEN** pipeline が `code-review` ステップから再開すること  
**AND** 最終的に pipeline が正常完了 (approved / success) すること  
**AND** `state.steps["code-review"]` に新たな実行エントリが追加されること

---

## TC-14: Integration — fixer 実行済み crash → resume → fixer から再開 (regression なし)

- **Category**: Integration — pipeline e2e
- **Priority**: should
- **Source**: AC #6 regression / design.md Risks

**GIVEN** pipeline が code-fixer 実行中にクラッシュした state  
**AND** `state.steps["code-fixer"]` に 1 件以上のエントリがある  
**AND** `resumePoint.step = "code-fixer"`  
**WHEN** `specrunner resume <slug>` を実行する  
**THEN** pipeline が `code-fixer` から再開すること (既存挙動維持)

---

## TC-15: Integration — `loopIters` カウンタが resume 後に 0 からスタートする

- **Category**: Integration — pipeline counter
- **Priority**: should
- **Source**: design.md D4 "each resume session gets a full budget"

**GIVEN** code-review iter 2 で needs-fix 中断した state (`state.steps["code-review"]` に 2 件)  
**WHEN** `specrunner resume <slug>` で code-review から再開する  
**THEN** resume セッション内の `loopIters` が 0 (= iter 1 扱い) からスタートすること  
**AND** `maxIterations` ガードが resume 直後に誤発火しないこと

---

## TC-16: Spec authority — `cli-resume-command/spec.md` が正しく作成されている

- **Category**: Spec / Static
- **Priority**: must
- **Source**: request.md 要件4 / tasks.md Task 4

**GIVEN** `specrunner/specs/cli-resume-command/spec.md` が存在する  
**WHEN** ファイルを検査する  
**THEN** 以下の Requirement が記述されていること:  
  - 「loop step needs-fix 中断 → 同 loop step から再開」  
  - 「`--from` 指定時は既定を上書き」  
  - 「resumePoint null + --from 未指定はエラー」  
**AND** fixer-empty mismatch / fixer-ran / --from override の各 Scenario が GIVEN/WHEN/THEN 形式で含まれること
