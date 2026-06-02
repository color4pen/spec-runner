# Tasks: self-contained-change-spec

## T-01: pipeline から delta-spec-validation / delta-spec-fixer step を削除

- [ ] `src/kernel/step-names.ts`: `AGENT_STEP_NAMES` から `"delta-spec-fixer"` を削除
- [ ] `src/kernel/step-names.ts`: `CLI_STEP_NAMES` から `"delta-spec-validation"` を削除
- [ ] `src/kernel/step-names.ts`: `STEP_NAMES` から `DELTA_SPEC_VALIDATION` と `DELTA_SPEC_FIXER` を削除
- [ ] `src/kernel/agent-definition.ts`: `AgentStepName` union から `"delta-spec-fixer"` を削除
- [ ] `src/core/pipeline/run.ts`: `DeltaSpecValidationStep` / `DeltaSpecFixerStep` の import と steps Map 登録を削除
- [ ] `src/core/pipeline/run.ts`: `STANDARD_LOOP_FIXER_PAIRS` から `DELTA_SPEC_VALIDATION: DELTA_SPEC_FIXER` エントリを削除
- [ ] `src/core/pipeline/types.ts`: `STANDARD_TRANSITIONS` を再配線（D2 に従う）:
  - `design` → `spec-review`（直接）
  - `spec-fixer` → `spec-review`（直接）
  - `code-review approved (fixableCount=0)` → `adr-gen`（直接）
  - `code-fixer approved (after code-review approved)` → `adr-gen`（直接）
  - delta-spec-validation / delta-spec-fixer の全行を削除
- [ ] `src/core/pipeline/types.ts`: `LOOP_ERROR_CODES` から `DELTA_SPEC_VALIDATION` エントリを削除
- [ ] `src/core/step/delta-spec-validation.ts` を削除
- [ ] `src/core/step/delta-spec-fixer.ts` を削除

**Acceptance Criteria**:
- `STEP_NAMES` に `DELTA_SPEC_VALIDATION` / `DELTA_SPEC_FIXER` が存在しない
- `STANDARD_TRANSITIONS` に delta-spec-validation / delta-spec-fixer の行がない
- design → spec-review、spec-fixer → spec-review、code-review approved → adr-gen が直結
- 削除した 2 ファイルが存在しない
- TypeScript コンパイルが通る

## T-02: src/core/spec/ ディレクトリ（rules + validator）を全削除

- [ ] `src/core/spec/delta-spec-validator.ts` を削除
- [ ] `src/core/spec/rules/` ディレクトリを全削除（以下 16 ファイル）:
  - `index.ts`, `registry.ts`, `types.ts`, `spec-content-parser.ts`
  - `baseline-header-match.ts`, `canonical-spec-structure.ts`
  - `no-authority-spec-direct-edit.ts`, `no-legacy-flat-dir.ts`, `no-legacy-flat-file.ts`
  - `no-specs-for-required-type.ts`, `normative-keyword-required.ts`
  - `removed-section-format.ts`, `renamed-section-format.ts`
  - `requirement-header-required.ts`, `scenario-required-per-requirement.ts`
- [ ] `src/core/spec/` ディレクトリ自体が空なら削除

**Acceptance Criteria**:
- `src/core/spec/` ディレクトリが存在しない
- これらのファイルを import していた箇所がない（T-01 で delta-spec-validation.ts は削除済み）
- TypeScript コンパイルが通る

## T-03: テストファイル削除

- [ ] `tests/unit/core/spec/delta-spec-validator.test.ts` を削除
- [ ] `tests/unit/core/step/delta-spec-validation-step.test.ts` を削除
- [ ] `tests/unit/step/delta-spec-fixer.test.ts` を削除
- [ ] `tests/unit/step/delta-spec-validation.test.ts` を削除
- [ ] 上記削除後に空になる親ディレクトリがあれば削除

**Acceptance Criteria**:
- 上記 4 ファイルが存在しない
- `bun run test` で削除したテスト以外が green

## T-04: paths.ts から不要 helper を削除

- [ ] `src/util/paths.ts`: `deltaSpecValidationResultPath` 関数を削除
- [ ] T-01 で delta-spec-validation step が消えたことにより参照元がないことを確認

**Acceptance Criteria**:
- `deltaSpecValidationResultPath` が `src/` 内に存在しない
- TypeScript コンパイルが通る

## T-05: template 配置を変更（delta-spec-template.md 廃止、spec.md A-group 化）

- [ ] `src/templates/step-output-templates.ts`: `DELTA_SPEC_TEMPLATE` 定数を削除
- [ ] `src/templates/step-output-templates.ts`: `getOutputTemplates` の `"design"` case から `delta-spec-template.md`（B-group, cleanup: true）エントリを削除
- [ ] `src/templates/step-output-templates.ts`: `getOutputTemplates` の `"design"` case に `spec.md` を A-group として追加。パス: `${changeFolder}/spec.md`。内容は新しい `SPEC_TEMPLATE` 定数（記述項目の指針を HTML コメントで持つ scaffold）
- [ ] `SPEC_TEMPLATE` を新規作成: Requirement / Scenario / normative keyword / Given-When-Then の書き方ガイダンスを HTML コメントで含む。request type が spec-change / new-feature の場合に agent が上書きする前提

**Acceptance Criteria**:
- `delta-spec-template.md` を配置・削除する処理がない
- design step の template に `spec.md`（A-group, cleanup なし）が含まれる
- `SPEC_TEMPLATE` に記述項目の指針が HTML コメントとして含まれる

## T-06: design step の prompt / followUpPrompt を更新

- [ ] `src/prompts/design-system.ts`: "delta spec" → "spec" に文言変更。`delta-spec-template.md` を Read する指示を削除
- [ ] `src/prompts/design-system.ts`: spec ファイルのパスを `specs/<capability>/spec.md` → `spec.md`（change folder 直下）に変更
- [ ] `src/prompts/design-system.ts`: "Delta Spec Content Guidance" / "Delta Spec Format Rules" セクションを "Spec Content Guidance" / "Spec Format Guidelines" に rename し、機械強制でなく指針として記述
- [ ] `src/prompts/design-system.ts`: Completion Checklist の delta spec 関連チェック項目を `spec.md` 用に更新
- [ ] `src/prompts/design-system.ts`: `DESIGN_INITIAL_MESSAGE_TEMPLATE` の "delta spec if needed" → "spec.md if needed" に更新
- [ ] `src/core/step/design.ts`: `followUpPrompt` から delta spec rules.md 参照 / self-fix pass の内容を削除（rule 検証前提のチェックが不要になるため。followUpPrompt 自体を削除するか空にする）
- [ ] `src/prompts/design-system.ts`: "Baseline Spec 参照" セクションを更新 — baseline を MODIFIED 分類のために読む指示を削除。baseline 参照は任意（context 把握のため Read 許可は残す）

**Acceptance Criteria**:
- design system prompt に "delta" を含む文言がない
- `delta-spec-template.md` への参照がない
- spec パスが `specrunner/changes/<slug>/spec.md` になっている
- `followUpPrompt` が delta spec rules に依存しない

## T-07: spec-review prompt を更新

- [ ] `src/prompts/spec-review-system.ts`: "Delta Spec Presence Check" セクションを書き換え — `specs/` ディレクトリの存在確認 → `spec.md` ファイルの存在確認に変更
- [ ] `src/prompts/spec-review-system.ts`: "Baseline Spec Consistency Check" セクション全体を削除
- [ ] `src/prompts/spec-review-system.ts`: spec.md の各定義セグメント（Requirement / Scenario）を意味的にレビューする指示を追加（記述の正しさ・不足の有無を判断する役割）
- [ ] "delta spec" → "spec" に文言変更（全箇所）

**Acceptance Criteria**:
- spec-review system prompt に "delta" / "baseline" を含む文言がない
- spec.md の存在確認指示がある
- 意味的レビュー（各セグメントの正しさ・不足）の指示がある

## T-08: spec-fixer / code-fixer / test-case-gen prompt を更新

- [ ] `src/prompts/spec-fixer-system.ts`: "Delta Spec Format Rules" セクションを "Spec Format Guidelines" に書き換え。`delta-spec-validation が parse に依存する` 前提の Critical 記述を削除し、指針レベルに変更
- [ ] `src/prompts/code-fixer-system.ts`: "Delta Spec Format Rules" セクションを同様に更新。"delta spec" → "spec" に文言変更
- [ ] `src/prompts/test-case-gen-system.ts`: "delta spec" → "spec" に文言変更。パスを `specs/<capability>/spec.md` → `spec.md` に変更。`buildTestCaseGenInitialMessage` のパス参照も更新
- [ ] `src/prompts/adr-gen-system.ts`: "delta spec" → "spec" に文言変更（パス参照更新）

**Acceptance Criteria**:
- 上記 4 ファイルに "delta" を含む文言がない
- spec-fixer / code-fixer の format rules が指針として残っている（機械強制ではない）
- test-case-gen が `specrunner/changes/<slug>/spec.md` を読む指示になっている

## T-09: rules.md 更新

- [ ] `src/prompts/rules.ts`: `RULES_MD_CONTENT` の以下を更新:
  - Pipeline Structure の step リストから delta-spec-validation / delta-spec-fixer を削除
  - "System Facts" の delta-spec-validation 関連記述（Baseline edit detection 等）を削除
  - "spec authority lifecycle" セクションの delta spec 記法を自己完結 spec.md の指針に書き換え
  - "delta spec 記法" セクションを "spec 記法" に rename し、自己完結 spec.md の書き方指針に更新
  - spec パスを `specrunner/changes/<slug>/spec.md` に統一
- [ ] `src/prompts/fragments.ts`: コメント中の "DELTA_SPEC_FORMAT" 言及を削除

**Acceptance Criteria**:
- `RULES_MD_CONTENT` に "delta-spec-validation" / "delta-spec-fixer" / "delta spec" を含む文言がない
- spec.md の書き方指針が指針として残っている

## T-10: commit-push.ts の authority spec violation 警告を更新

- [ ] `src/core/step/commit-push.ts`: `findAuthoritySpecViolations` は authority spec の直接編集を検出する機能であり、delta-spec-validation の廃止後も authority spec 保護として残す。ただしコメント中の "delta-spec-validation will handle" 文言を "authority spec edits are not permitted" 等に更新

**Acceptance Criteria**:
- commit-push.ts のコメントに "delta-spec-validation" への言及がない
- authority spec violation の警告自体は維持される

## T-11: その他の "delta" 残存参照を除去

- [ ] `src/errors.ts`: delta spec 関連のエラーメッセージ文言を更新（authority spec edit のメッセージから "delta spec" 文言を整理）
- [ ] `src/prompts/request-generate-system.ts`: "delta spec path" の文言を "spec path" に更新
- [ ] `src/prompts/request-review-system.ts`: "delta spec" → "spec"、"delta-spec-validation" 参照を削除
- [ ] `src/prompts/rules.ts` 内のパスを `specrunner/changes/<slug>/spec.md` 形式に統一
- [ ] `src/cli/command-registry.ts`: delta 系 step 名への参照があれば削除（AGENT_STEP_NAMES / CLI_STEP_NAMES の re-export で自動解決される可能性あり — 確認）
- [ ] `src/core/command/request.ts`: delta spec 関連参照があれば更新
- [ ] プロジェクト全体で `grep -r "delta" src/` を実行し、残存する "delta" を含む文言を確認・更新

**Acceptance Criteria**:
- `src/` 内に "delta-spec-validation" / "delta-spec-fixer" / "delta-spec-template" / "delta spec" を含む文言が残らない（"delta" 単体はコンテキスト次第で許容 — git diff 等）
- TypeScript コンパイルが通る

## T-12: 型チェック・テスト green 確認

- [ ] `bun run typecheck` が green
- [ ] `bun run test` が green（削除したテスト以外）

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が exit 0
