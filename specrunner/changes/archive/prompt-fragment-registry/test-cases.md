# Test Cases: prompt-fragment-registry

Generated from: request.md, design.md, tasks.md

---

## TC-FRAG: Fragment Aggregation (`src/prompts/fragments.ts`)

### TC-FRAG-01

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1

```
GIVEN  fragments.ts が存在する
WHEN   AUTHORITY_SPEC_GUARD を import する
THEN   non-empty string が返る
```

### TC-FRAG-02

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1

```
GIVEN  fragments.ts が存在する
WHEN   COMMIT_DISCIPLINE を import する
THEN   non-empty string が返る
```

### TC-FRAG-03

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1

```
GIVEN  fragments.ts が存在する
WHEN   DELTA_SPEC_FORMAT を import する
THEN   non-empty string が返る
```

### TC-FRAG-04

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1

```
GIVEN  fragments.ts が存在する
WHEN   PIPELINE_RULES を import する
THEN   non-empty string が返る
```

### TC-FRAG-05

- **Category**: structural
- **Priority**: must
- **Source**: design.md D4, tasks.md Task 1

```
GIVEN  fragments.ts の const 名を確認する
WHEN   export 名の一覧を取得する
THEN   AUTHORITY_SPEC_GUARD_RULE / COMMIT_DISCIPLINE_RULE / DELTA_SPEC_FORMAT_RULES という suffix 付き名は存在しない
  AND  AUTHORITY_SPEC_GUARD / COMMIT_DISCIPLINE / DELTA_SPEC_FORMAT / PIPELINE_RULES の 4 名が存在する
```

### TC-FRAG-06

- **Category**: structural
- **Priority**: must
- **Source**: design.md D5, request.md 要件 2

```
GIVEN  fragments.ts を確認する
WHEN   CANONICAL_DELTA_SPEC_PATH_PATTERN / BANNED_DELTA_SPEC_PATHS / VALID_SECTION_HEADERS の有無を確認する
THEN   これらの const は fragments.ts に存在しない (D5 決定: 移行しない)
```

### TC-FRAG-07

- **Category**: regression
- **Priority**: must
- **Source**: request.md 要件 1 (content は既存と振る舞い同等)

```
GIVEN  旧 authority-spec-guard.ts の AUTHORITY_SPEC_GUARD_RULE の内容が既知
WHEN   fragments.ts の AUTHORITY_SPEC_GUARD の内容と比較する
THEN   テキスト内容が同一である
```

### TC-FRAG-08

- **Category**: regression
- **Priority**: must
- **Source**: request.md 要件 1 (content は既存と振る舞い同等)

```
GIVEN  旧 delta-spec-format.ts の DELTA_SPEC_FORMAT_RULES の内容が既知
WHEN   fragments.ts の DELTA_SPEC_FORMAT の内容と比較する
THEN   テキスト内容が同一である
```

### TC-FRAG-09

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md Task 7, design.md D6 (旧 TC-01〜TC-08 移行)

```
GIVEN  fragments.ts の PIPELINE_RULES を import する
WHEN   内容を確認する
THEN   "Severity" セクションが含まれる
  AND  "CRITICAL" / "HIGH" / "MEDIUM" / "LOW" の記述が含まれる
```

### TC-FRAG-10

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md Task 7 (旧 TC-03 移行)

```
GIVEN  fragments.ts の PIPELINE_RULES を import する
WHEN   内容を確認する
THEN   9 categories の記述が含まれる
```

### TC-FRAG-11

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md Task 7 (旧 TC-04 移行)

```
GIVEN  fragments.ts の PIPELINE_RULES を import する
WHEN   内容を確認する
THEN   "Findings Format" セクションが含まれる
  AND  "path:line" 形式の記述が含まれる
```

### TC-FRAG-12

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md Task 7 (旧 TC-05 移行)

```
GIVEN  fragments.ts の PIPELINE_RULES を import する
WHEN   内容を確認する
THEN   Scoring の weights と threshold 7.0 の記述が含まれる
```

### TC-FRAG-13

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md Task 7 (旧 TC-06 移行)

```
GIVEN  fragments.ts の PIPELINE_RULES を import する
WHEN   内容を確認する
THEN   "approved" / "needs-fix" / "escalation" の verdict 記述が含まれる
```

### TC-FRAG-14

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md Task 7 (旧 TC-07 移行)

```
GIVEN  fragments.ts の PIPELINE_RULES を import する
WHEN   内容を確認する
THEN   "improving" / "plateaued" / "regressing" の iteration comparison 記述が含まれる
  AND  stagnation detection の記述が含まれる
```

---

## TC-BLD: Builder Function (`src/prompts/builder.ts`)

### TC-BLD-01

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 5, request.md 要件 7

```
GIVEN  buildSystemPrompt 関数が存在する
WHEN   buildSystemPrompt("base", ["f1", "f2"]) を呼び出す
THEN   "base\n\nf1\n\nf2" を返す
```

### TC-BLD-02

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 5, request.md 要件 7

```
GIVEN  buildSystemPrompt 関数が存在する
WHEN   buildSystemPrompt("base", []) を呼び出す
THEN   "base" のみを返す (trailing \n\n なし)
```

### TC-BLD-03

- **Category**: unit
- **Priority**: should
- **Source**: design.md D2

```
GIVEN  buildSystemPrompt 関数が存在する
WHEN   buildSystemPrompt("base", ["f1"]) を 2 回呼び出す
THEN   同じ引数に対して毎回同じ文字列を返す (純粋関数)
  AND  副作用がない
```

### TC-BLD-04

- **Category**: structural
- **Priority**: must
- **Source**: design.md D2, request.md 要件 3

```
GIVEN  builder.ts のソースコードを確認する
WHEN   export の一覧を取得する
THEN   buildSystemPrompt 関数のみが export されている
  AND  class / interface / registry は存在しない
```

### TC-BLD-05

- **Category**: unit
- **Priority**: could
- **Source**: design.md D2 (型安全性)

```
GIVEN  buildSystemPrompt の型シグネチャを確認する
WHEN   第 2 引数が readonly string[] であることを確認する
THEN   TypeScript の型チェックが通る
  AND  mutable な string[] も受け入れる (readonly は covariant)
```

---

## TC-PROMPT: Prompt Builder Migration (8 prompts)

### TC-PROMPT-01

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 3-1, request.md 要件 5 (#304 構造的解決)

```
GIVEN  implementer-system.ts が builder 経由化されている
WHEN   IMPLEMENTER_SYSTEM_PROMPT の内容を確認する
THEN   DELTA_SPEC_FORMAT の内容が含まれる (新規追加 — #304 解決)
  AND  AUTHORITY_SPEC_GUARD の内容が含まれる
  AND  COMMIT_DISCIPLINE の内容が含まれる
```

### TC-PROMPT-02

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 3-2, request.md 要件 5

```
GIVEN  design-system.ts が builder 経由化されている
WHEN   DESIGN_SYSTEM_PROMPT (または buildDesignSystemPrompt() の戻り値) の内容を確認する
THEN   DELTA_SPEC_FORMAT の内容が含まれる
  AND  AUTHORITY_SPEC_GUARD の内容が含まれる (新規追加)
```

### TC-PROMPT-03

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 3-3

```
GIVEN  spec-fixer-system.ts が builder 経由化されている
WHEN   buildSpecFixerSystemPrompt() の戻り値の内容を確認する
THEN   DELTA_SPEC_FORMAT の内容が含まれる
  AND  AUTHORITY_SPEC_GUARD の内容が含まれる
  AND  COMMIT_DISCIPLINE の内容が含まれる
```

### TC-PROMPT-04

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 3-4, request.md 要件 5

```
GIVEN  code-fixer-system.ts が builder 経由化されている
WHEN   CODE_FIXER_SYSTEM_PROMPT の内容を確認する
THEN   COMMIT_DISCIPLINE の内容が含まれる
  AND  AUTHORITY_SPEC_GUARD の内容が含まれる (新規追加)
  AND  DELTA_SPEC_FORMAT の内容が含まれる (新規追加)
```

### TC-PROMPT-05

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 3-5

```
GIVEN  build-fixer-system.ts が builder 経由化されている
WHEN   BUILD_FIXER_SYSTEM_PROMPT の内容を確認する
THEN   COMMIT_DISCIPLINE の内容が含まれる
  AND  DELTA_SPEC_FORMAT の内容が含まれない (対象外)
  AND  AUTHORITY_SPEC_GUARD の内容が含まれない (対象外)
```

### TC-PROMPT-06

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 3-6, request.md 要件 5

```
GIVEN  adr-gen-system.ts が builder 経由化されている
WHEN   ADR_GEN_SYSTEM_PROMPT の内容を確認する
THEN   COMMIT_DISCIPLINE の内容が含まれる (新規追加 — 元は fragment ゼロ)
  AND  PIPELINE_RULES の内容が含まれない (対象外)
```

### TC-PROMPT-07

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 3-7

```
GIVEN  spec-review-system.ts が builder 経由化されている
WHEN   buildSpecReviewSystemPrompt() の戻り値の内容を確認する
THEN   PIPELINE_RULES の内容が含まれる
  AND  buildSpecReviewInitialMessage() 関数は引き続き存在する (変更なし)
```

### TC-PROMPT-08

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 3-8

```
GIVEN  code-review-system.ts が builder 経由化されている
WHEN   CODE_REVIEW_SYSTEM_PROMPT の内容を確認する
THEN   PIPELINE_RULES の内容が含まれる
```

### TC-PROMPT-09

- **Category**: regression
- **Priority**: must
- **Source**: design.md D8 (末尾連結で意味が変わらないこと)

```
GIVEN  spec-review-system.ts の PIPELINE_RULES が末尾連結に変更された
WHEN   buildSpecReviewSystemPrompt() の戻り値全体を確認する
THEN   旧 template literal 埋め込み時と意味的に同等の内容が含まれる
  AND  セクション構成が崩れていない
```

### TC-PROMPT-10

- **Category**: structural
- **Priority**: must
- **Source**: tasks.md Task 3, request.md 要件 4

```
GIVEN  対象 8 prompt ファイルのソースコードを確認する
WHEN   各ファイルの import 文を確認する
THEN   authority-spec-guard.js / commit-discipline.js / delta-spec-format.js / pipeline-rules.js への import が存在しない
  AND  fragments.js / builder.js からの import に切り替えられている
```

### TC-PROMPT-11

- **Category**: structural
- **Priority**: should
- **Source**: request.md 要件 4 (各 file で base prompt を const 化)

```
GIVEN  対象 8 prompt ファイルのソースコードを確認する
WHEN   各ファイルの const 定義を確認する
THEN   base prompt 部分が named const として切り出されている
  AND  最終 export は buildSystemPrompt(BASE, [...]) の戻り値である
```

### TC-PROMPT-12

- **Category**: regression
- **Priority**: must
- **Source**: tasks.md Task 3-2 (buildInitialMessage は変更なし)

```
GIVEN  design-system.ts が builder 経由化されている
WHEN   buildInitialMessage() 関数の存在を確認する
THEN   関数が引き続き存在する
  AND  動作が変わっていない
```

---

## TC-COV: Fragment Coverage Test (`tests/unit/prompts/fragment-coverage.test.ts`)

### TC-COV-01

- **Category**: structural
- **Priority**: must
- **Source**: tasks.md Task 6, request.md 要件 6

```
GIVEN  fragment-coverage.test.ts が存在する
WHEN   test.each の対応表エントリを確認する
THEN   8 prompt のエントリがすべて存在する (IMPLEMENTER / DESIGN / SPEC_FIXER / CODE_FIXER / BUILD_FIXER / ADR_GEN / SPEC_REVIEW / CODE_REVIEW)
```

### TC-COV-02

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md Task 6, request.md 要件 6

```
GIVEN  fragment-coverage.test.ts が実行される
WHEN   test.each の全エントリが評価される
THEN   全 assert が green になる (各 prompt が必須 fragment 文字列を含む)
```

### TC-COV-03

- **Category**: unit
- **Priority**: must
- **Source**: request.md 要件 6 (inject 漏れ検出の構造的保証)

```
GIVEN  IMPLEMENTER_SYSTEM_PROMPT から DELTA_SPEC_FORMAT を意図的に除去した場合を仮定する
WHEN   fragment-coverage.test.ts を実行する
THEN   "IMPLEMENTER contains required fragments" テストが失敗する
```

### TC-COV-04

- **Category**: structural
- **Priority**: should
- **Source**: design.md D3 (真実源は test 側)

```
GIVEN  fragment-coverage.test.ts の import を確認する
WHEN   assert の方法を確認する
THEN   expect(prompt).toContain(fragment) の形式で直接 assert している
  AND  fragment 側の metadata (applicableTo 等) には依存していない
```

---

## TC-DEL: File Deletion (旧 4 fragment files)

### TC-DEL-01

- **Category**: structural
- **Priority**: must
- **Source**: request.md 要件 2, tasks.md Task 4

```
GIVEN  Task 3 で 8 prompt の import 切り替えが完了している
WHEN   ファイルシステムを確認する
THEN   src/prompts/authority-spec-guard.ts が存在しない
  AND  src/prompts/commit-discipline.ts が存在しない
  AND  src/prompts/delta-spec-format.ts が存在しない
  AND  src/prompts/pipeline-rules.ts が存在しない
```

### TC-DEL-02

- **Category**: structural
- **Priority**: must
- **Source**: request.md 要件 2 (後方互換 export は残さない)

```
GIVEN  削除後の src/prompts/ ディレクトリを確認する
WHEN   AUTHORITY_SPEC_GUARD_RULE / COMMIT_DISCIPLINE_RULE / DELTA_SPEC_FORMAT_RULES の export を検索する
THEN   これらの名前は src/prompts/ 内のどのファイルにも存在しない
```

### TC-DEL-03

- **Category**: structural
- **Priority**: must
- **Source**: tasks.md Task 4 (active code に import が残っていないこと)

```
GIVEN  旧 4 fragment file の削除前に grep を実行する
WHEN   active code から authority-spec-guard.js / commit-discipline.js / delta-spec-format.js / pipeline-rules.js への import を検索する
THEN   archive 参照以外の active code に import が残っていない
```

---

## TC-TEST: Test File Migration

### TC-TEST-01

- **Category**: structural
- **Priority**: must
- **Source**: request.md 要件 8, design.md D6, tasks.md Task 7

```
GIVEN  Task 7 が完了している
WHEN   ファイルシステムを確認する
THEN   tests/prompts/pipeline-rules.test.ts が存在しない (削除済み)
  AND  tests/unit/prompts/fragments.test.ts が存在する
```

### TC-TEST-02

- **Category**: regression
- **Priority**: must
- **Source**: tasks.md Task 7 (TC-01〜TC-08 移行)

```
GIVEN  tests/unit/prompts/fragments.test.ts が存在する
WHEN   テストを実行する
THEN   PIPELINE_RULES の内容検証テスト (旧 TC-01〜TC-08 相当) が green になる
```

### TC-TEST-03

- **Category**: structural
- **Priority**: must
- **Source**: tasks.md Task 8

```
GIVEN  既存 prompt test ファイルを確認する
WHEN   各 test ファイルの import を確認する (design-system / implementer-system / spec-fixer-system / spec-review-system / test-case-gen-system / dynamic-context-prompts)
THEN   削除済み 4 fragment file (authority-spec-guard.js / commit-discipline.js / delta-spec-format.js / pipeline-rules.js) への import が存在しない
```

### TC-TEST-04

- **Category**: regression
- **Priority**: must
- **Source**: request.md 受け入れ基準 (既存 prompt test の regression なし)

```
GIVEN  Task 3-8 および Task 7-8 が完了している
WHEN   bun run test tests/prompts/ を実行する
THEN   既存 prompt test が全て green になる
```

---

## TC-BUILD: Build & Typecheck

### TC-BUILD-01

- **Category**: structural
- **Priority**: must
- **Source**: request.md 受け入れ基準 (bun run typecheck && bun run test が green)

```
GIVEN  全 Task が完了している
WHEN   bun run typecheck を実行する
THEN   型エラーが 0 件である
```

### TC-BUILD-02

- **Category**: structural
- **Priority**: must
- **Source**: request.md 受け入れ基準

```
GIVEN  全 Task が完了している
WHEN   bun run test を実行する
THEN   全テストが green になる
  AND  失敗テストが 0 件である
```

---

## TC-SPEC: Delta Spec

### TC-SPEC-01

- **Category**: structural
- **Priority**: must
- **Source**: request.md 要件 9, tasks.md Task 9

```
GIVEN  Task 9 が完了している
WHEN   ファイルシステムを確認する
THEN   specrunner/changes/prompt-fragment-registry/specs/prompt-fragment-registry/spec.md が存在する
```

### TC-SPEC-02

- **Category**: structural
- **Priority**: must
- **Source**: request.md 要件 9, tasks.md Task 9

```
GIVEN  delta spec ファイルが存在する
WHEN   内容を確認する
THEN   ## ADDED Requirements セクションが存在する
  AND  REQ-PFR-001〜REQ-PFR-005 の 5 requirement が記述されている
```

### TC-SPEC-03

- **Category**: structural
- **Priority**: must
- **Source**: request.md 要件 9 (AUTHORITY_SPEC_GUARD_RULE 準拠)

```
GIVEN  delta spec ファイルが存在する
WHEN   baseline specrunner/specs/prompt-fragment-registry/spec.md の存在を確認する
THEN   baseline spec が本 PR では直接作成されていない (spec-merge が finish 時に作成する経路)
```

---

## TC-SCOPE: Out-of-Scope Verification

### TC-SCOPE-01

- **Category**: structural
- **Priority**: should
- **Source**: request.md スコープ外 (3 prompt は対象外)

```
GIVEN  test-case-gen-system.ts / request-generate-system.ts / request-review-system.ts を確認する
WHEN   builder.js / fragments.js への import を確認する
THEN   これらのファイルは buildSystemPrompt を使っていない (本 request のスコープ外)
  AND  既存の template literal 形式が維持されている
```

### TC-SCOPE-02

- **Category**: structural
- **Priority**: should
- **Source**: request.md スコープ外 (fragment 内容編集なし)

```
GIVEN  fragments.ts の 4 const の内容を確認する
WHEN   旧ファイルの内容と比較する
THEN   いずれの fragment テキストも編集されていない (振る舞い同等)
```

### TC-SCOPE-03

- **Category**: structural
- **Priority**: should
- **Source**: design.md D1 (metadata なし)

```
GIVEN  fragments.ts のソースコードを確認する
WHEN   interface / class / applicableTo / category / description の有無を確認する
THEN   これらの抽象化レイヤは存在しない (string const のみ)
```
