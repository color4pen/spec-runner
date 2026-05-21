# Test Cases: resume-from-step-name

Generated from: request.md, design.md, tasks.md  
Date: 2026-05-18

---

## TC-RESUME-FROM-01: step 名 `design` を直接指定

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-01 / 受け入れ基準「resolveResumeStep が step 名を直接受け付け、mapping なしで返す」

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from design` を指定し、resumePoint の phase が `code-review`（= code phase）のとき  
**THEN** `"design"` を返す（phase に関わらず step 名直接指定が優先される）

---

## TC-RESUME-FROM-02: step 名 `code-review` を直接指定

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-02

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from code-review` を指定し、resumePoint の phase が `implementer` のとき  
**THEN** `"code-review"` を返す（phase mapping は行わない）

---

## TC-RESUME-FROM-03: deterministic step `delta-spec-validation` を直接指定

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-03 / request.md「新しい step (test-case-gen / delta-spec-validation 等) は alias が無く resume できない」問題の解消

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from delta-spec-validation` を指定し、resumePoint の phase が `spec-review` のとき  
**THEN** `"delta-spec-validation"` を返す（deterministic step も step 名直接経路で解決される）

---

## TC-RESUME-FROM-04: step 名 `spec-fixer` を直接指定

- **Category**: Unit
- **Priority**: should
- **Source**: design.md「全 pipeline step 名 + legacy alias の union に拡張する」/ `STEP_NAMES` 全体のカバレッジ

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from spec-fixer` を指定し、resumePoint の phase が `implementer` のとき  
**THEN** `"spec-fixer"` を返す（phase に関わらず step 名直接指定が優先される）

---

## TC-RESUME-FROM-05: step 名 `test-case-gen` を直接指定

- **Category**: Unit
- **Priority**: should
- **Source**: request.md「新しい step (test-case-gen) は alias が無く resume できない」問題の解消

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from test-case-gen` を指定する  
**THEN** `"test-case-gen"` を返す

---

## TC-RESUME-FROM-06: step 名 `pr-create` を直接指定

- **Category**: Unit
- **Priority**: could
- **Source**: design.md 全 step 名一覧（`pr-create` を含む）

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from pr-create` を指定する  
**THEN** `"pr-create"` を返す

---

## TC-RESUME-FROM-07: legacy alias `critic` — spec phase context

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-04 / 受け入れ基準「legacy alias 3 種が既存 mapping 通りに動く」

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from critic` を指定し、resumePoint の phase が `spec-review`（= spec phase）のとき  
**THEN** `"spec-review"` を返す（既存 STEP_MAPPING 経路が維持されている）

---

## TC-RESUME-FROM-08: legacy alias `critic` — code phase context

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-04 / 後方互換維持

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from critic` を指定し、resumePoint の phase が `implementer`（= code phase）のとき  
**THEN** `"code-review"` を返す

---

## TC-RESUME-FROM-09: legacy alias `fixer` — spec phase context

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-05 / 後方互換維持

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from fixer` を指定し、resumePoint の phase が `spec-review` のとき  
**THEN** `"spec-fixer"` を返す

---

## TC-RESUME-FROM-10: legacy alias `fixer` — code phase context

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-05 / 後方互換維持

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from fixer` を指定し、resumePoint の phase が `implementer` のとき  
**THEN** `"code-fixer"` を返す

---

## TC-RESUME-FROM-11: legacy alias `creator` — spec phase context

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-06 / 後方互換維持

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from creator` を指定し、resumePoint の phase が `spec-review` のとき  
**THEN** `"design"` を返す

---

## TC-RESUME-FROM-12: legacy alias `creator` — code phase context

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-06 / 後方互換維持

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from creator` を指定し、resumePoint の phase が `implementer` のとき  
**THEN** `"implementer"` を返す

---

## TC-RESUME-FROM-13: 不正値で Error throw — message に無効値を含む

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-07 / 受け入れ基準「不正値の error message に利用可能 step 名 + legacy alias 一覧が含まれる」

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from invalid-name` を指定する（`STEP_NAMES` にも legacy alias にも存在しない値）  
**THEN** `Error` が throw され、message に `"invalid-name"` が含まれる

---

## TC-RESUME-FROM-14: 不正値 Error — message に step 名一覧を含む

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-07 / design.md Error Message 設計

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from invalid-name` を指定する  
**THEN** throw された Error の message に `"design"` が含まれる（step 名一覧が動的に列挙されている）

---

## TC-RESUME-FROM-15: 不正値 Error — message に legacy alias 一覧を含む

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md TC-RESUME-FROM-07 / design.md Error Message 設計

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from invalid-name` を指定する  
**THEN** throw された Error の message に `"critic"` が含まれる（legacy alias 一覧が列挙されている）

---

## TC-RESUME-FROM-16: step 名と legacy alias の識別 — `design` は step 名経路で解決

- **Category**: Unit
- **Priority**: should
- **Source**: design.md「step 名判定には既存の STEP_NAMES 定数の values を使う」/ 解決ロジックの順序保証

**GIVEN** `resolveResumeStep` の解決順が「1. StepName チェック → 2. LegacyResumeRole チェック → 3. Error」である  
**WHEN** `--from design` を指定し、resumePoint を任意の phase にしたとき  
**THEN** STEP_MAPPING を参照せず `"design"` をそのまま返す（phase-aware 変換が起きない）

---

## TC-RESUME-FROM-17: `from` 未指定時の自動解決に変更なし（regression）

- **Category**: Unit / Regression
- **Priority**: must
- **Source**: 受け入れ基準「既存 resume 関連 test が regression していない」/ design.md「from 未指定時の自動解決経路（Tier 2a/2b/2c/3）に変更なし」

**GIVEN** `resolveResumeStep` が拡張済みである  
**WHEN** `--from` を指定せず（`from = undefined`）、resumePoint が設定されているとき  
**THEN** 既存の Tier 2a/2b/2c/3 自動解決ロジックが従前通りに動作する

---

## TC-RESUME-FROM-18: CLI flag `--from` が step 名を受け付ける

- **Category**: CLI
- **Priority**: must
- **Source**: 受け入れ基準「command-registry.ts の --from parsing が拡張された signature を受け付ける」

**GIVEN** `command-registry.ts` の `resume.flags.from.values` が `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES, "critic", "fixer", "creator"]` に更新されている  
**WHEN** CLI で `specrunner resume --from=code-review` を実行する  
**THEN** flag-parser の enum validation を通過し、`code-review` が `resolveResumeStep` に渡される

---

## TC-RESUME-FROM-19: CLI flag `--from` が legacy alias を引き続き受け付ける

- **Category**: CLI / Regression
- **Priority**: must
- **Source**: 受け入れ基準 / 後方互換維持

**GIVEN** `command-registry.ts` の `resume.flags.from.values` が拡張済みである  
**WHEN** CLI で `specrunner resume --from=critic` を実行する  
**THEN** flag-parser の enum validation を通過し、`critic` が `resolveResumeStep` に渡される

---

## TC-RESUME-FROM-20: CLI flag `--from` が不正値を拒否する

- **Category**: CLI
- **Priority**: must
- **Source**: design.md「flag-parser.ts の既存 enum validation がそのまま利用できる（values 配列に含まれるかチェック）」

**GIVEN** `command-registry.ts` の `resume.flags.from.values` が拡張済みである  
**WHEN** CLI で `specrunner resume --from=not-a-step` を実行する  
**THEN** flag-parser の enum validation でエラーとなり、利用可能値を含むエラーメッセージが表示される

---

## TC-RESUME-FROM-21: USAGE 文字列が更新されている

- **Category**: CLI / Static
- **Priority**: must
- **Source**: 受け入れ基準「command-registry.ts の USAGE 文字列が --from=<step-or-alias> 形式に更新されている（legacy 3 値固定の表記が解消されている）」

**GIVEN** `command-registry.ts` の USAGE 文字列が更新されている  
**WHEN** `specrunner resume --help` または USAGE 定数を参照する  
**THEN**  
- `--from=<step|alias>` または `--from=<step-or-alias>` 形式の表記が含まれる  
- `critic | fixer | creator` のみを列挙する旧表記は存在しない  
- `code-review` / `implementer` などの代表的な step 名または alias が例示されている

---

## TC-RESUME-FROM-22: 型定義 — `ResumeFrom` が export されている

- **Category**: Static / Type
- **Priority**: must
- **Source**: 受け入れ基準「`ResumeFrom = StepName | LegacyResumeRole` 型が resolve-step.ts で定義されている」

**GIVEN** `src/core/resume/resolve-step.ts` が変更済みである  
**WHEN** `bun run typecheck` を実行する  
**THEN** `ResumeFrom`、`LegacyResumeRole` が export され、`ResumeRole` → `LegacyResumeRole` の rename が完了しており、型エラーが発生しない

---

## TC-RESUME-FROM-23: 型定義 — `STEP_MAPPING` の key 型が `LegacyResumeRole` に更新されている

- **Category**: Static / Type
- **Priority**: should
- **Source**: tasks.md T-01 1-d「STEP_MAPPING の Record key 型を ResumeRole → LegacyResumeRole に更新する」

**GIVEN** `src/core/resume/resolve-step.ts` が変更済みである  
**WHEN** `bun run typecheck` を実行する  
**THEN** `STEP_MAPPING` の key 型が `LegacyResumeRole` であり型エラーが発生しない

---

## TC-RESUME-FROM-24: delta spec が作成されている

- **Category**: Static / Spec
- **Priority**: must
- **Source**: 受け入れ基準「delta spec specrunner/changes/<slug>/specs/cli-resume-command/spec.md が `## MODIFIED Requirements` を持つ形で作成されている」

**GIVEN** 実装が完了している  
**WHEN** `specrunner/changes/resume-from-step-name/specs/cli-resume-command/spec.md` を参照する  
**THEN**  
- ファイルが存在する  
- `## MODIFIED Requirements` セクションが含まれる  
- `--from` が step 名または legacy alias を受け付ける旨の Requirement が記述されている  
- baseline `specrunner/specs/cli-resume-command/spec.md` は直接変更されていない

---

## TC-RESUME-FROM-25: `bun run typecheck && bun run test` が green

- **Category**: Static / Integration
- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck && bun run test が green」

**GIVEN** T-01〜T-03 の実装がすべて完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 型エラーなし、テスト全件 pass（既存テストの regression なし）
