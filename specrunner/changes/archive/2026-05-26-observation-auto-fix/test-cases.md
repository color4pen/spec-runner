# Test Cases: observation-auto-fix

## Meta

- **source**: request.md / design.md / tasks.md
- **generated**: 2026-05-26

---

## Category: Parser — parseFixableFindings()

### TC-01 Fix yes 件数のカウント
- **Priority**: must
- **Source**: Task 2 完了条件 / D5

**GIVEN** `## Findings` section に table が存在し、header に `Fix` カラムがある  
**AND** data row が 3 件（Fix: yes, yes, no）  
**WHEN** `parseFixableFindings(content)` を呼ぶ  
**THEN** 2 を返す

---

### TC-02 全行 Fix: no
- **Priority**: must
- **Source**: Task 2 完了条件

**GIVEN** `## Findings` section に table が存在し、全 data row の Fix カラムが `no`  
**WHEN** `parseFixableFindings(content)` を呼ぶ  
**THEN** 0 を返す

---

### TC-03 Fix カラムが存在しない旧 format（後方互換）
- **Priority**: must
- **Source**: Task 2 完了条件 / D5 パース仕様 4

**GIVEN** `## Findings` section に table が存在するが、header に `Fix` カラムがない  
**WHEN** `parseFixableFindings(content)` を呼ぶ  
**THEN** 0 を返す（後方互換）

---

### TC-04 Findings section 自体が存在しない
- **Priority**: must
- **Source**: Task 2 完了条件 / D5 パース仕様 5

**GIVEN** content に `## Findings` section が存在しない  
**WHEN** `parseFixableFindings(content)` を呼ぶ  
**THEN** 0 を返す

---

### TC-05 Fix カラムの値が case-insensitive で認識される
- **Priority**: should
- **Source**: Task 2 作業内容 3（case-insensitive）

**GIVEN** `## Findings` table の Fix カラムの値が `YES` または `Yes`（大文字混じり）  
**WHEN** `parseFixableFindings(content)` を呼ぶ  
**THEN** `yes` と同じカウントとして加算される

---

### TC-06 Findings section に data row が 0 件
- **Priority**: should
- **Source**: D5 パース仕様（edge case）

**GIVEN** `## Findings` section に table header と separator のみ存在し、data row がない  
**WHEN** `parseFixableFindings(content)` を呼ぶ  
**THEN** 0 を返す

---

## Category: Verdict判定 — parseResult() / determineVerdict() 廃止

### TC-07 approved + fixCount > 0 → approved-with-fixes
- **Priority**: must
- **Source**: Task 3 完了条件 / D3 判定ロジック

**GIVEN** reviewer が verdict `approved` を出力し、Findings table に Fix: yes の行が 1 件以上ある content  
**WHEN** `code-review.ts` の `parseResult(content, deps)` を呼ぶ  
**THEN** `verdict === "approved-with-fixes"` を返す

---

### TC-08 approved + fixCount = 0 → approved
- **Priority**: must
- **Source**: Task 3 完了条件 / D3 判定ロジック

**GIVEN** reviewer が verdict `approved` を出力し、Findings table に Fix: yes の行が 0 件の content  
**WHEN** `parseResult(content, deps)` を呼ぶ  
**THEN** `verdict === "approved"` を返す

---

### TC-09 needs-fix → needs-fix（fixCount は無視）
- **Priority**: must
- **Source**: Task 3 完了条件

**GIVEN** reviewer が verdict `needs-fix` を出力し、Fix: yes の finding が含まれる content  
**WHEN** `parseResult(content, deps)` を呼ぶ  
**THEN** `verdict === "needs-fix"` を返す（fixCount に関わらず）

---

### TC-10 escalation → escalation
- **Priority**: must
- **Source**: Task 3 完了条件

**GIVEN** reviewer が verdict `escalation` を出力した content  
**WHEN** `parseResult(content, deps)` を呼ぶ  
**THEN** `verdict === "escalation"` を返す

---

### TC-11 agent verdict が parse 不能 (null) → escalation fallback
- **Priority**: must
- **Source**: Task 3 完了条件

**GIVEN** content に verdict が含まれていない（`parseReviewVerdict` が null を返す）  
**WHEN** `parseResult(content, deps)` を呼ぶ  
**THEN** `verdict === "escalation"` を返す

---

### TC-12 `determineVerdict()` が code-review.ts に存在しない
- **Priority**: must
- **Source**: Task 3 完了条件 / 要件 3

**GIVEN** `src/core/step/code-review.ts` を開く  
**WHEN** `determineVerdict` という関数定義を探す  
**THEN** 存在しない

---

### TC-13 score table の値が verdict に影響しない
- **Priority**: must
- **Source**: Task 3 完了条件 / D4（score 計算廃止）

**GIVEN** reviewer が verdict `approved` を出力し、score table の total が 6.0（閾値未満）の content  
**AND** Fix: yes の finding が 0 件  
**WHEN** `parseResult(content, deps)` を呼ぶ  
**THEN** `verdict === "approved"` を返す（score による override なし）

---

### TC-14 `parseReviewScores` / `parseFindingSeverityCounts` の import が存在しない
- **Priority**: should
- **Source**: Task 3 作業内容 2-3

**GIVEN** `src/core/step/code-review.ts` を開く  
**WHEN** `parseReviewScores` または `parseFindingSeverityCounts` の import を探す  
**THEN** どちらも存在しない

---

## Category: Verdict型 — Verdict union

### TC-15 Verdict union が `approved-with-fixes` を含む
- **Priority**: must
- **Source**: Task 1 完了条件 / D2

**GIVEN** `src/state/schema.ts` の `Verdict` type  
**WHEN** literal の一覧を確認する  
**THEN** `"approved-with-fixes"` が含まれる

---

### TC-16 Verdict union が 8 literal を持つ
- **Priority**: should
- **Source**: Task 1 完了条件

**GIVEN** `src/state/schema.ts` の `Verdict` type  
**WHEN** literal を数える  
**THEN** `approved`, `approved-with-fixes`, `needs-fix`, `escalation`, `passed`, `failed`, `success`, `error` の 8 literal を持つ

---

## Category: Pipeline遷移 — transition table

### TC-17 `code-review --approved-with-fixes→ code-fixer` 行が存在する
- **Priority**: must
- **Source**: Task 4 完了条件 / D1

**GIVEN** `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS`  
**WHEN** `step === CODE_REVIEW` かつ `on === "approved-with-fixes"` の行を探す  
**THEN** `to === CODE_FIXER` の行が存在する

---

### TC-18 `code-fixer --approved→ delta-spec-validation` (when 条件あり) が fallback より前に配置
- **Priority**: must
- **Source**: Task 4 完了条件 / D1（Array.find first-match ルール）

**GIVEN** `STANDARD_TRANSITIONS` の配列  
**WHEN** `step === CODE_FIXER` かつ `on === "approved"` の行を順番に確認する  
**THEN** `when` predicate 付きの `to === DELTA_SPEC_VALIDATION` 行が、`when` なし fallback（`to === CODE_REVIEW`）行より前に配置されている

---

### TC-19 code-fixer 出口: 直前 review が `approved-with-fixes` → delta-spec-validation に遷移
- **Priority**: must
- **Source**: Task 4 完了条件 / D1

**GIVEN** pipeline state の `steps["code-review"]` 最新 outcome の verdict が `"approved-with-fixes"`  
**WHEN** code-fixer が verdict `approved` を返す  
**THEN** `when` predicate が true を返し、次ステップが `delta-spec-validation` になる

---

### TC-20 code-fixer 出口: 直前 review が `needs-fix` → code-review (loop) に遷移
- **Priority**: must
- **Source**: Task 4 完了条件 / D1 / 要件（regression なし）

**GIVEN** pipeline state の `steps["code-review"]` 最新 outcome の verdict が `"needs-fix"`  
**WHEN** code-fixer が verdict `approved` を返す  
**THEN** `when` predicate が false を返し、fallback 行が適用されて次ステップが `code-review` になる

---

### TC-21 code-fixer 出口: 直前 review の steps が空 → when predicate が false
- **Priority**: should
- **Source**: D1 / edge case（state に code-review 結果がない状況）

**GIVEN** pipeline state の `steps["code-review"]` が undefined または空配列  
**WHEN** `code-fixer --approved→ delta-spec-validation` の `when` predicate を評価する  
**THEN** false を返す（fallback 行が適用される）

---

### TC-22 既存行 `code-review --approved→ delta-spec-validation` が変更されていない
- **Priority**: must
- **Source**: Task 4 完了条件 / 要件（regression なし）

**GIVEN** `STANDARD_TRANSITIONS`  
**WHEN** `step === CODE_REVIEW` かつ `on === "approved"` の行を確認する  
**THEN** `to === DELTA_SPEC_VALIDATION` の行が存在する（既存行が残っている）

---

### TC-23 既存行 `code-review --needs-fix→ code-fixer` が変更されていない
- **Priority**: must
- **Source**: Task 4 完了条件

**GIVEN** `STANDARD_TRANSITIONS`  
**WHEN** `step === CODE_REVIEW` かつ `on === "needs-fix"` の行を確認する  
**THEN** `to === CODE_FIXER` の行が存在する

---

### TC-24 既存行 `code-fixer --error→ escalate` が変更されていない
- **Priority**: must
- **Source**: Task 4 完了条件

**GIVEN** `STANDARD_TRANSITIONS`  
**WHEN** `step === CODE_FIXER` かつ `on === "error"` の行を確認する  
**THEN** `to === escalate` の行が存在する

---

## Category: Pipeline統合 — approved + observation → fixer → finish

### TC-25 reviewer approved + fix:yes finding → fixer が自動発火する
- **Priority**: must
- **Source**: 受け入れ基準 1 / 要件 1

**GIVEN** code-review step が実行され、reviewer が verdict `approved` + Fix: yes の finding 1 件以上を出力  
**WHEN** pipeline が次ステップを決定する  
**THEN** code-fixer step が発火する（delta-spec-validation には進まない）

---

### TC-26 fixer 適用後、`fix:yes` の finding が実際に resolve されている
- **Priority**: must
- **Source**: 受け入れ基準 2

**GIVEN** code-fixer が approved-with-fixes 由来で発火し、Fix: yes finding の対象ファイルを修正した  
**WHEN** fixer の commit を確認する  
**THEN** finding が指摘した対象ファイルの修正が commit に含まれる

---

### TC-27 approved-with-fixes 由来の fixer 完了後、re-review しない
- **Priority**: must
- **Source**: 要件 1 / D8（1 回のみ実行）

**GIVEN** code-fixer が approved-with-fixes 由来で発火し、verdict `approved` を返した  
**WHEN** pipeline が次ステップを決定する  
**THEN** code-review (re-review) には戻らず delta-spec-validation に進む

---

### TC-28 fixer が失敗した場合は escalation に進む
- **Priority**: must
- **Source**: D8 / 要件 1（ケース整理: approved + failed → escalation）

**GIVEN** code-fixer が approved-with-fixes 由来で発火し、verdict `error` を返した  
**WHEN** pipeline が次ステップを決定する  
**THEN** escalate step に進む

---

### TC-29 reviewer approved + Fix: yes なし → fixer 発火しない（直接 finish）
- **Priority**: must
- **Source**: 受け入れ基準 1（observation なし: 既存挙動）

**GIVEN** code-review step が verdict `approved` を出力し、Fix: yes の finding が 0 件  
**WHEN** pipeline が次ステップを決定する  
**THEN** code-fixer を発火せず delta-spec-validation に進む

---

## Category: 後方互換 — needs-fix loop regression なし

### TC-30 needs-fix → fixer → reviewer の既存 loop が変更なしで動く
- **Priority**: must
- **Source**: 受け入れ基準 6 / 要件（regression なし）

**GIVEN** code-review が verdict `needs-fix` を返した  
**WHEN** code-fixer が verdict `approved` を返す  
**THEN** pipeline が code-review（re-review）に戻る loop が成立する（delta-spec-validation には進まない）

---

### TC-31 Fix カラムなしの旧 format review-feedback で needs-fix verdict → needs-fix 維持
- **Priority**: must
- **Source**: TC-03 の complement / 後方互換

**GIVEN** reviewer が `Fix` カラムなしの旧 format で verdict `needs-fix` を出力した content  
**WHEN** `parseResult(content, deps)` を呼ぶ  
**THEN** `verdict === "needs-fix"` を返す（旧 format でも動作変化なし）

---

### TC-32 Fix カラムなしの旧 format review-feedback で approved verdict → approved 維持
- **Priority**: should
- **Source**: D5 パース仕様 4（Fix カラムなし → 0）/ 後方互換

**GIVEN** reviewer が `Fix` カラムなしの旧 format で verdict `approved` を出力した content  
**WHEN** `parseResult(content, deps)` を呼ぶ  
**THEN** `verdict === "approved"` を返す（fixCount=0 として扱い、既存挙動と同等）

---

## Category: プロンプト — Fix カラム出力指示

### TC-33 reviewer prompt の Findings Format に Fix カラムがある
- **Priority**: must
- **Source**: Task 5 完了条件 / D7

**GIVEN** `src/prompts/fragments.ts` の `PIPELINE_RULES` fragment  
**WHEN** `Findings Format` section の table header を確認する  
**THEN** `Fix` カラムが含まれている

---

### TC-34 reviewer prompt の example data row に Fix カラムがある
- **Priority**: should
- **Source**: Task 5 作業内容 2

**GIVEN** `src/prompts/fragments.ts` の `PIPELINE_RULES` fragment  
**WHEN** Findings Format の例示 data row を確認する  
**THEN** 各行に Fix カラムの値（`yes` または `no`）が含まれている

---

### TC-35 reviewer prompt に Fix カラムの判定ガイドラインが含まれる
- **Priority**: should
- **Source**: Task 5 作業内容 4 / D7

**GIVEN** `src/prompts/fragments.ts` の `PIPELINE_RULES` fragment  
**WHEN** Fix カラムの説明を確認する  
**THEN** `yes`（この PR で修正すべき）と `no`（pre-existing / 設計判断 / 別 scope）の説明が含まれる

---

### TC-36 `code-review-system.ts` の Output Format example に Fix カラムがある
- **Priority**: must
- **Source**: Task 5 完了条件

**GIVEN** `src/prompts/code-review-system.ts`  
**WHEN** Output Format の example Findings table を確認する  
**THEN** `Fix` カラムが含まれている

---

### TC-37 code-fixer prompt が Fix カラム準拠の修正方針を記述している
- **Priority**: must
- **Source**: Task 6 完了条件 / D6

**GIVEN** `src/prompts/code-fixer-system.ts`  
**WHEN** 修正方針の section を確認する  
**THEN** `Fix: yes → すべて修正` / `Fix: no → 無視` の指示が含まれる

---

### TC-38 code-fixer prompt に旧 format（Fix カラムなし）への fallback 指示がある
- **Priority**: must
- **Source**: Task 6 完了条件 / D6

**GIVEN** `src/prompts/code-fixer-system.ts`  
**WHEN** 修正方針の section を確認する  
**THEN** Fix カラムが存在しない旧 format の場合は severity に基づいて判断する指示が含まれる

---

## Category: typecheck + test

### TC-39 `bun run typecheck` が green
- **Priority**: must
- **Source**: Task 9 完了条件 / 受け入れ基準 7

**GIVEN** 全 task の実装が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code 0 で完了する

---

### TC-40 `bun run test` が green
- **Priority**: must
- **Source**: Task 9 完了条件 / 受け入れ基準 7

**GIVEN** 全 task の実装が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN** exit code 0 で完了する（既存テストが regression していない）
