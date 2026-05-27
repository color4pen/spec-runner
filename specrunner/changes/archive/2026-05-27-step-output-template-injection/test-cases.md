# Test Cases: step-output-template-injection

## Overview

各 agent step 実行前に出力ファイルのテンプレートを change folder に配置することで、フォーマット遵守率を向上させる。テンプレートはコード内定数として管理し、executor の hook で書き出す。

テストは全て **静的 unit test（LLM 呼び出しなし、文字列 assert / fs assert）** で検証する。

---

## Category: template-constants — src/templates/step-output-templates.ts の定数内容

### TC-001: SPEC_REVIEW_RESULT_TEMPLATE — verdict 行フォーマットが HTML コメントで記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  SPEC_REVIEW_RESULT_TEMPLATE 定数の内容を確認する
THEN:  `- **verdict**: <approved|needs-fix|escalation>` の形式が
       HTML コメント内に記載されている
```

---

### TC-002: SPEC_REVIEW_RESULT_TEMPLATE — Findings テーブル 6 列定義が記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  SPEC_REVIEW_RESULT_TEMPLATE 定数の内容を確認する
THEN:  #, Severity, Category, File, Description, How to Fix の
       6 列定義が HTML コメント内に記載されている
```

---

### TC-003: SPEC_REVIEW_RESULT_TEMPLATE — severity 値が列挙されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  SPEC_REVIEW_RESULT_TEMPLATE 定数の内容を確認する
THEN:  CRITICAL / HIGH / MEDIUM / LOW の severity 値が HTML コメント内に含まれる
```

---

### TC-004: REVIEW_FEEDBACK_TEMPLATE — verdict 行フォーマットが HTML コメントで記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  REVIEW_FEEDBACK_TEMPLATE 定数の内容を確認する
THEN:  `- **verdict**: <approved|needs-fix|escalation>` の形式が
       HTML コメント内に記載されている
```

---

### TC-005: REVIEW_FEEDBACK_TEMPLATE — Findings テーブル 7 列定義（Fix 列含む）が記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  REVIEW_FEEDBACK_TEMPLATE 定数の内容を確認する
THEN:  #, Severity, Category, File, Description, How to Fix, Fix の
       7 列定義が HTML コメント内に記載されている
```

---

### TC-006: REVIEW_FEEDBACK_TEMPLATE — Scores テーブルと total 行が記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  REVIEW_FEEDBACK_TEMPLATE 定数の内容を確認する
THEN:  Category / Score / Weight の列を持つ Scores テーブルと
       total 行の定義が HTML コメント内に記載されている
```

---

### TC-007: TEST_CASES_TEMPLATE — TC-NNN 形式が HTML コメントで記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  TEST_CASES_TEMPLATE 定数の内容を確認する
THEN:  TC-NNN の番号付け形式および Category / Priority / Source 必須フィールドが
       HTML コメント内に記載されている
```

---

### TC-008: TEST_CASES_TEMPLATE — GIVEN/WHEN/THEN 構造が記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  TEST_CASES_TEMPLATE 定数の内容を確認する
THEN:  GIVEN / WHEN / THEN の各キーワードを含む構造説明が HTML コメント内にある
```

---

### TC-009: TEST_CASES_TEMPLATE — Summary 4 項目が記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  TEST_CASES_TEMPLATE 定数の内容を確認する
THEN:  Total / Automated / Manual / Priority の Summary 4 項目が
       HTML コメント内に記載されている
```

---

### TC-010: TEST_CASES_TEMPLATE — Result YAML の全キーが記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  TEST_CASES_TEMPLATE 定数の内容を確認する
THEN:  result / total / automated / manual / must / should / could / blocked_reasons の
       全キーが HTML コメント内に列挙されている
```

---

### TC-011: DESIGN_TEMPLATE — セクション構造が HTML コメントで記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  DESIGN_TEMPLATE 定数の内容を確認する
THEN:  Context / Goals / Non-Goals / Decisions / Risks / Trade-offs / Open Questions の
       各セクション名が HTML コメント内に記載されている
```

---

### TC-012: TASKS_TEMPLATE — T-NN 形式とチェックボックスが記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  TASKS_TEMPLATE 定数の内容を確認する
THEN:  T-NN の番号付け形式と `- [ ]` チェックボックス書式が
       HTML コメント内に記載されている
```

---

### TC-013: TASKS_TEMPLATE — Acceptance Criteria セクションが記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  TASKS_TEMPLATE 定数の内容を確認する
THEN:  Acceptance Criteria セクションの存在が HTML コメント内に記載されている
```

---

### TC-014: DELTA_SPEC_TEMPLATE — Requirements / Requirement / Scenario 見出し書式が記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  DELTA_SPEC_TEMPLATE 定数の内容を確認する
THEN:  `## Requirements` / `### Requirement:` / `#### Scenario:` の
       見出し書式が HTML コメント内に記載されている
```

---

### TC-015: DELTA_SPEC_TEMPLATE — SHALL/MUST 必須と Removed/Renamed 書式が記載されている

- **Priority**: must
- **Source**: T-01, AC#2

```
GIVEN: `src/templates/step-output-templates.ts` が存在する
WHEN:  DELTA_SPEC_TEMPLATE 定数の内容を確認する
THEN:  SHALL / MUST が必須キーワードである旨、
       `## Removed`（`- "requirement name"` リスト形式）、
       `## Renamed`（`- "old name" → "new name"` リスト形式）の書式が
       HTML コメント内に記載されている
```

---

## Category: template-lookup — getOutputTemplates() 関数の振る舞い

### TC-016: design step — design.md + tasks.md + delta-spec-template.md を返す

- **Priority**: must
- **Source**: T-01, AC#1

```
GIVEN: stepName = "design", slug = "test-slug", state.steps["design"] が未定義
WHEN:  getOutputTemplates("design", slug, state) を呼び出す
THEN:  返り値の配列が 3 要素を含み、
       各 path に design.md / tasks.md / delta-spec-template.md が含まれる
```

---

### TC-017: spec-review step (初回) — spec-review-result-001.md を返す

- **Priority**: must
- **Source**: T-01, AC#1

```
GIVEN: stepName = "spec-review", slug = "test-slug",
       state.steps["spec-review"] が未定義（初回実行）
WHEN:  getOutputTemplates("spec-review", slug, state) を呼び出す
THEN:  返り値の配列が 1 要素を含み、path が spec-review-result-001.md を含む
```

---

### TC-018: spec-review step (2 回目) — spec-review-result-002.md を返す

- **Priority**: must
- **Source**: T-01, AC#1（iteration 番号算出）

```
GIVEN: stepName = "spec-review", slug = "test-slug",
       state.steps["spec-review"] が要素 1 件の配列（1 回目完了済み）
WHEN:  getOutputTemplates("spec-review", slug, state) を呼び出す
THEN:  返り値の path が spec-review-result-002.md を含む
```

---

### TC-019: test-case-gen step — test-cases.md を返す

- **Priority**: must
- **Source**: T-01, AC#1

```
GIVEN: stepName = "test-case-gen", slug = "test-slug", 任意の state
WHEN:  getOutputTemplates("test-case-gen", slug, state) を呼び出す
THEN:  返り値が 1 要素を含み、path が test-cases.md を含む
```

---

### TC-020: code-review step (初回) — review-feedback-001.md を返す

- **Priority**: must
- **Source**: T-01, AC#1

```
GIVEN: stepName = "code-review", slug = "test-slug",
       state.steps["code-review"] が未定義（初回実行）
WHEN:  getOutputTemplates("code-review", slug, state) を呼び出す
THEN:  返り値が 1 要素を含み、path が review-feedback-001.md を含む
```

---

### TC-021: code-review step (2 回目) — review-feedback-002.md を返す

- **Priority**: must
- **Source**: T-01, AC#1（iteration 番号算出）

```
GIVEN: stepName = "code-review", slug = "test-slug",
       state.steps["code-review"] が要素 1 件の配列（1 回目完了済み）
WHEN:  getOutputTemplates("code-review", slug, state) を呼び出す
THEN:  返り値の path が review-feedback-002.md を含む
```

---

### TC-022: implementer step — 空配列を返す

- **Priority**: must
- **Source**: T-01, AC#1（テンプレート不要 step）

```
GIVEN: stepName = "implementer", slug = "test-slug", 任意の state
WHEN:  getOutputTemplates("implementer", slug, state) を呼び出す
THEN:  返り値が空配列 [] である
```

---

### TC-023: build-fixer / spec-fixer / code-fixer / adr-gen — 空配列を返す

- **Priority**: must
- **Source**: T-01, AC#1

```
GIVEN: stepName が "build-fixer" / "spec-fixer" / "code-fixer" / "adr-gen" のいずれか、
       slug = "test-slug", 任意の state
WHEN:  getOutputTemplates(stepName, slug, state) を呼び出す
THEN:  全ての場合において返り値が空配列 [] である
```

---

### TC-024: delta-spec-template.md エントリに cleanup: true が設定されている

- **Priority**: must
- **Source**: T-01, AC#1, design.md D3

```
GIVEN: stepName = "design", slug = "test-slug", 任意の state
WHEN:  getOutputTemplates("design", slug, state) を呼び出す
THEN:  path が delta-spec-template.md を含むエントリの cleanup フィールドが true である
```

---

### TC-025: design.md と tasks.md エントリに cleanup が設定されていない（A群）

- **Priority**: must
- **Source**: T-01, design.md D3（A群は cleanup 不要）

```
GIVEN: stepName = "design", slug = "test-slug", 任意の state
WHEN:  getOutputTemplates("design", slug, state) を呼び出す
THEN:  path が design.md / tasks.md を含むエントリの cleanup フィールドが
       false または undefined である
```

---

### TC-026: 返り値の path が changeFolderPath(slug) を基点とする

- **Priority**: must
- **Source**: T-01, design.md D4

```
GIVEN: stepName = "test-case-gen", slug = "my-feature", 任意の state
WHEN:  getOutputTemplates("test-case-gen", "my-feature", state) を呼び出す
THEN:  返り値の path が `specrunner/changes/my-feature/` を起点とする
```

---

## Category: template-write — writeOutputTemplates() の振る舞い

### TC-027: writeOutputTemplates — テンプレートファイルを change folder に書き出す

- **Priority**: must
- **Source**: T-02, AC（writeOutputTemplates がファイルを書き出すこと）

```
GIVEN: 一時ディレクトリを cwd として、slug = "write-test",
       stepName = "test-case-gen" で writeOutputTemplates を呼び出す
WHEN:  関数の実行が完了する
THEN:  `<cwd>/specrunner/changes/write-test/test-cases.md` が存在し、
       TEST_CASES_TEMPLATE の内容が書き込まれている
```

---

### TC-028: writeOutputTemplates — 出力先ディレクトリが存在しない場合も成功する

- **Priority**: must
- **Source**: T-02（fs.mkdir recursive）

```
GIVEN: change folder が存在しない状態で writeOutputTemplates を呼び出す
WHEN:  関数の実行が完了する
THEN:  ディレクトリが再帰的に作成され、テンプレートファイルが正常に書き出される
```

---

### TC-029: writeOutputTemplates — 書き出したファイルが git add されない

- **Priority**: must
- **Source**: T-02, AC, design.md D5（git add しない）

```
GIVEN: 一時 git リポジトリ内で writeOutputTemplates を実行する
WHEN:  関数の実行が完了した後、git status を確認する
THEN:  書き出されたテンプレートファイルが staged state に含まれない
       （git add は実行されていない）
```

---

## Category: template-cleanup — cleanupOutputTemplates() の振る舞い

### TC-030: cleanupOutputTemplates — cleanup: true のファイルのみ削除する

- **Priority**: must
- **Source**: T-02, AC（B群テンプレートのみ削除すること）

```
GIVEN: change folder に design.md / tasks.md / delta-spec-template.md が存在する状態で、
       stepName = "design", slug = "cleanup-test" で cleanupOutputTemplates を呼び出す
WHEN:  関数の実行が完了する
THEN:  delta-spec-template.md が削除されている
       design.md / tasks.md は削除されていない
```

---

### TC-031: cleanupOutputTemplates — A群ファイルには触れない

- **Priority**: must
- **Source**: T-02, design.md D3（A群は回収不要）

```
GIVEN: change folder に test-cases.md が存在する状態で、
       stepName = "test-case-gen", slug = "cleanup-test" で cleanupOutputTemplates を呼び出す
WHEN:  関数の実行が完了する
THEN:  test-cases.md が削除されていない
```

---

### TC-032: cleanupOutputTemplates — 対象ファイルが存在しない場合は ENOENT を無視する（冪等）

- **Priority**: must
- **Source**: T-02, AC（ENOENT 無視）

```
GIVEN: delta-spec-template.md が存在しない状態で
       cleanupOutputTemplates("design", slug, state) を呼び出す
WHEN:  関数の実行が完了する
THEN:  ENOENT エラーが throw されず、正常終了する
```

---

## Category: executor-hook — StepExecutor のテンプレート配置フック

### TC-033: local runtime — agent step 実行前にテンプレートが change folder に存在する

- **Priority**: must
- **Source**: T-03, AC（agent step 実行前にテンプレートが存在すること）

```
GIVEN: local runtime の StepExecutor が設定されており、
       stepName = "test-case-gen" の agent step が開始する
WHEN:  runner.run が呼び出される前の時点を観測する
THEN:  `specrunner/changes/<slug>/test-cases.md` が既に存在する
```

---

### TC-034: local runtime — agent step 完了後・commitAndPush 前に B群テンプレートが削除されている

- **Priority**: must
- **Source**: T-03, AC（commit-push 前に B群テンプレートが削除されていること）

```
GIVEN: local runtime の StepExecutor が stepName = "design" の agent step を実行する
WHEN:  runner.run が成功し、commitAndPush が呼び出される前の時点を観測する
THEN:  `specrunner/changes/<slug>/delta-spec-template.md` が削除されている
       design.md / tasks.md は削除されていない
```

---

### TC-035: managed runtime — テンプレート配置が実行されない

- **Priority**: must
- **Source**: T-03, AC（managed runtime では配置・削除が実行されないこと）, request.md スコープ外

```
GIVEN: managed runtime の StepExecutor が設定されており、
       config.runtime = "managed"
WHEN:  runAgentStep() が実行される
THEN:  writeOutputTemplates() が呼び出されず、
       change folder にテンプレートファイルが書き出されない
```

---

### TC-036: managed runtime — テンプレート削除が実行されない

- **Priority**: must
- **Source**: T-03, AC（managed runtime では配置・削除が実行されないこと）

```
GIVEN: managed runtime の StepExecutor が設定されており、
       config.runtime = "managed"
WHEN:  runAgentStep() が runner.run 成功後の cleanup 処理を実行する
THEN:  cleanupOutputTemplates() が呼び出されない
```

---

### TC-037: writeOutputTemplates 呼び出しが store.update 直後・runner.run 前に配置されている

- **Priority**: should
- **Source**: T-03, design.md D2

```
GIVEN: `src/core/step/executor.ts` の runAgentStep() が存在する
WHEN:  実装を確認する
THEN:  writeOutputTemplates() の呼び出しが store.update より後、
       runner.run() より前のコード位置にある
```

---

## Category: prompt-simplification — system prompt からの重複フォーマット定義削減

### TC-038: spec-review-system.ts — テンプレート参照指示が追加されている

- **Priority**: must
- **Source**: T-04, AC（テンプレートに従って出力せよの指示が含まれること）

```
GIVEN: `src/prompts/spec-review-system.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  `spec-review-result-NNN.md` のテンプレートに従って出力せよ、
       または同等の指示文字列が含まれる
```

---

### TC-039: spec-review-system.ts — Findings テーブル例が削除されている

- **Priority**: must
- **Source**: T-04, AC（テンプレートに移管した書式定義が prompt から削除されていること）

```
GIVEN: `src/prompts/spec-review-system.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  Findings テーブルの markdown 例（ヘッダー行 `| # | Severity | ...` 等）が
       インラインで記述されていない
```

---

### TC-040: spec-review-system.ts — verdict 行フォーマットへの言及が残存している

- **Priority**: must
- **Source**: T-04（verdict 行が `- **verdict**:` で始まる旨は残す）

```
GIVEN: `src/prompts/spec-review-system.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  verdict 行が `- **verdict**:` で始まることへの言及が残存している
       （パース要件のため削除不可）
```

---

### TC-041: code-review-system.ts — テンプレート参照指示が追加されている

- **Priority**: must
- **Source**: T-04, AC

```
GIVEN: `src/prompts/code-review-system.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  `review-feedback-NNN.md` のテンプレートに従って出力せよ、
       または同等の指示文字列が含まれる
```

---

### TC-042: code-review-system.ts — findings/scores テーブル例が削除されている

- **Priority**: must
- **Source**: T-04, AC

```
GIVEN: `src/prompts/code-review-system.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  Output Format セクション内の findings テーブル例・scores テーブル例が
       インラインで記述されていない
```

---

### TC-043: test-case-gen-system.ts — テンプレート参照指示が追加されている

- **Priority**: must
- **Source**: T-04, AC

```
GIVEN: `src/prompts/test-case-gen-system.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  `test-cases.md` のテンプレートに従って出力せよ、
       または同等の指示文字列が含まれる
```

---

### TC-044: test-case-gen-system.ts — Test Case Format の markdown 例が削除されている

- **Priority**: must
- **Source**: T-04, AC

```
GIVEN: `src/prompts/test-case-gen-system.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  "Test Case Format" セクション内の markdown フォーマット例、
       "Summary Section" "Result Section" の構造例が
       インラインで記述されていない
```

---

### TC-045: design-system.ts — テンプレート参照指示が追加されている

- **Priority**: must
- **Source**: T-04, AC

```
GIVEN: `src/prompts/design-system.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  design.md / tasks.md のテンプレートに従って出力せよ、
       または同等の指示文字列が含まれる
```

---

### TC-046: design-system.ts — delta-spec-template.md 参照指示が含まれる

- **Priority**: must
- **Source**: T-04

```
GIVEN: `src/prompts/design-system.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  `delta-spec-template.md` を参照して delta spec を書く旨の指示が含まれる
```

---

### TC-047: 全対象 prompt — Read tool でテンプレートを読んでから出力を開始する指示が含まれる

- **Priority**: must
- **Source**: T-04, AC

```
GIVEN: spec-review-system.ts / code-review-system.ts / test-case-gen-system.ts /
       design-system.ts の 4 ファイルが存在する
WHEN:  各ファイルの内容を確認する
THEN:  「テンプレートファイルを Read tool で読んでから出力を開始すること」または
       同等の指示文字列が各ファイルに含まれる
```

---

## Category: prompt-coverage — 全 step の prompt 網羅確認

### TC-048: spec-fixer-system.ts — テンプレート追加対象外であることが確認されている

- **Priority**: should
- **Source**: T-05

```
GIVEN: `src/prompts/spec-fixer-system.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  spec-fixer には出力ファイルの書式指示が含まれておらず、
       テンプレート配置が不要である（lookup 関数が空配列を返すことで確認済み）
```

---

### TC-049: implementer / build-fixer / code-fixer — 出力ファイル書式指示が含まれていない

- **Priority**: should
- **Source**: T-05

```
GIVEN: implementer-system.ts / build-fixer-system.ts / code-fixer-system.ts が存在する
WHEN:  各ファイルの内容を確認する
THEN:  出力ファイルのフォーマット定義（テーブル例・verdict 行例等）が
       インラインで記述されていない
```

---

### TC-050: fragments.ts の PIPELINE_RULES — テンプレート化されず prompt フラグメントとして残存している

- **Priority**: must
- **Source**: T-05, design.md（PIPELINE_RULES は verdict 判定ロジックを含むため残す）

```
GIVEN: `src/prompts/fragments.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  `PIPELINE_RULES` の export が存在し、
       severity / category / verdict 定義が含まれている
```

---

### TC-051: adr-gen-system.ts — テンプレート追加対象外のままである

- **Priority**: should
- **Source**: T-05, request.md スコープ外（adr-gen は別 issue）

```
GIVEN: `src/prompts/adr-gen-system.ts` が存在する
WHEN:  getOutputTemplates("adr-gen", slug, state) を呼び出す
THEN:  空配列 [] が返り、adr-gen に対してテンプレートが配置されない
```

---

## Category: test-impl — テスト実装の存在確認

### TC-052: tests/templates/step-output-templates.test.ts が存在する

- **Priority**: must
- **Source**: T-06, AC

```
GIVEN: 実装が完了している
WHEN:  `tests/templates/step-output-templates.test.ts` のパスを確認する
THEN:  ファイルが存在する
```

---

### TC-053: テンプレート lookup 関数の step 別テストが存在する

- **Priority**: must
- **Source**: T-06

```
GIVEN: `tests/templates/step-output-templates.test.ts` が存在する
WHEN:  テストファイルの内容を確認する
THEN:  design / spec-review / test-case-gen / code-review / implementer の
       各 step 名に対するテストケースが存在する
```

---

### TC-054: tests/util/copy-artifacts.test.ts にテンプレート配置・削除のテストが追加されている

- **Priority**: must
- **Source**: T-06, AC

```
GIVEN: `tests/util/copy-artifacts.test.ts` が存在する
WHEN:  テストファイルの内容を確認する
THEN:  writeOutputTemplates の書き出し確認テスト、
       cleanupOutputTemplates の削除確認テスト（cleanup: true のみ削除）、
       ENOENT 無視テストが存在する
```

---

## Category: build — typecheck + test green

### TC-055: bun run typecheck が green になる

- **Priority**: must
- **Source**: T-01 AC, T-06 AC, request.md 受け入れ基準

```
GIVEN: T-01 〜 T-05 の全変更が適用されている
WHEN:  `bun run typecheck` を実行する
THEN:  型エラーが 0 件で終了する
```

---

### TC-056: bun run test が green になる（新規テスト含む）

- **Priority**: must
- **Source**: T-06 AC, request.md 受け入れ基準

```
GIVEN: T-01 〜 T-06 の全変更が適用されている
WHEN:  `bun run test` を実行する
THEN:  step-output-templates.test.ts / copy-artifacts.test.ts（追加分）の
       新規テストを含む全テストが green で終了する
```

---

### TC-057: 既存の executor テストが regression しない

- **Priority**: must
- **Source**: T-06 AC（regression チェック）

```
GIVEN: T-03 の executor 変更が適用されている
WHEN:  executor 関連の既存テストを実行する
THEN:  既存テストが全て green で終了し、新たな失敗が発生しない
```

---

## Summary

| Category | must | should | could | 合計 |
|----------|------|--------|-------|------|
| template-constants | 15 | 0 | 0 | 15 |
| template-lookup | 11 | 0 | 0 | 11 |
| template-write | 3 | 0 | 0 | 3 |
| template-cleanup | 3 | 0 | 0 | 3 |
| executor-hook | 4 | 1 | 0 | 5 |
| prompt-simplification | 10 | 0 | 0 | 10 |
| prompt-coverage | 1 | 3 | 0 | 4 |
| test-impl | 3 | 0 | 0 | 3 |
| build | 3 | 0 | 0 | 3 |
| **合計** | **53** | **4** | **0** | **57** |

```yaml
result: pending
total: 57
automated: 54
manual: 3
must: 53
should: 4
could: 0
blocked_reasons: []
```
