# Tasks: step-output-template-injection

## T-01: テンプレート定数モジュールの作成

- [x] `src/templates/step-output-templates.ts` を新規作成する
- [x] 以下の各出力ファイルについてテンプレート文字列を定数としてエクスポートする:
  - `SPEC_REVIEW_RESULT_TEMPLATE` — verdict 行フォーマット（`- **verdict**: <approved|needs-fix|escalation>`）、Findings テーブル 6 列定義（#, Severity, Category, File, Description, How to Fix）、severity 値（CRITICAL/HIGH/MEDIUM/LOW）を HTML コメントで記載
  - `REVIEW_FEEDBACK_TEMPLATE` — verdict 行フォーマット、Findings テーブル 7 列定義（#, Severity, Category, File, Description, How to Fix, Fix）、Scores テーブル（Category, Score, Weight）、total 行を HTML コメントで記載
  - `TEST_CASES_TEMPLATE` — TC-NNN 形式、Category/Priority/Source 必須フィールド、GIVEN/WHEN/THEN 構造、Summary 4 項目（Total, Automated, Manual, Priority）、Result YAML 全キー（result, total, automated, manual, must, should, could, blocked_reasons）を HTML コメントで記載
  - `DESIGN_TEMPLATE` — セクション構造（Context, Goals / Non-Goals, Decisions, Risks / Trade-offs, Open Questions）を HTML コメントで記載
  - `TASKS_TEMPLATE` — T-NN 形式、チェックボックス（`- [x]`）、Acceptance Criteria セクションを HTML コメントで記載
  - `DELTA_SPEC_TEMPLATE` — `## Requirements` / `### Requirement:` / `#### Scenario:` / SHALL・MUST 必須 / `## Removed`（`- "requirement name"` リスト形式）/ `## Renamed`（`- "old name" → "new name"` リスト形式）の書式を HTML コメントで記載
- [x] テンプレート lookup 関数 `getOutputTemplates(stepName: string, slug: string, state: JobState): Array<{ path: string; content: string; cleanup?: boolean }>` をエクスポートする
  - `stepName` から配置すべきテンプレートのリストを返す
  - `path` は worktree 相対パス（`changeFolderPath(slug)` ベース）
  - `cleanup: true` は B群テンプレート（step 完了後に削除する）
  - iteration 番号は `(state.steps[stepName]?.length ?? 0) + 1` から算出（spec-review, code-review）
  - step ごとのマッピング:
    - `design`: design.md テンプレート + tasks.md テンプレート + delta-spec-template.md（cleanup: true）
    - `spec-review`: spec-review-result-NNN.md テンプレート
    - `test-case-gen`: test-cases.md テンプレート
    - `code-review`: review-feedback-NNN.md テンプレート
    - その他の step（spec-fixer, implementer, build-fixer, code-fixer, adr-gen）: 空配列（テンプレート不要）

**Acceptance Criteria**:
- 各テンプレート定数が HTML コメント形式の書式制約を含むこと
- lookup 関数が step 名に応じた正しいテンプレートリストを返すこと
- `bun run typecheck` が green

## T-02: テンプレート配置関数の実装

- [x] `src/util/copy-artifacts.ts` に `writeOutputTemplates()` 関数を追加する
  - シグネチャ: `async function writeOutputTemplates(cwd: string, slug: string, stepName: string, state: JobState): Promise<void>`
  - `getOutputTemplates()` で取得したテンプレートリストを順に `fs.writeFile` で書き出す
  - 書き出し先ディレクトリが存在しない場合は `fs.mkdir({ recursive: true })` で作成する
  - git add しない（テンプレートは中間成果物。agent が上書きした最終ファイルが commit-push で add される）
- [x] `cleanupOutputTemplates()` 関数を追加する
  - シグネチャ: `async function cleanupOutputTemplates(cwd: string, slug: string, stepName: string, state: JobState): Promise<void>`
  - `getOutputTemplates()` で `cleanup: true` のテンプレートを取得し、`fs.unlink` で削除する
  - ファイルが存在しない場合は ENOENT を無視する（冪等）

**Acceptance Criteria**:
- `writeOutputTemplates()` がテンプレートファイルを change folder に書き出すこと
- `cleanupOutputTemplates()` が B群テンプレートを削除し、A群テンプレートには触れないこと
- ファイルが git add されないこと

## T-03: StepExecutor にテンプレート配置フックを組み込む

- [x] `src/core/step/executor.ts` の `runAgentStep()` 冒頭（store.update 直後、runner.run 前）に `writeOutputTemplates()` 呼び出しを追加する
  - `import { writeOutputTemplates, cleanupOutputTemplates } from "../../util/copy-artifacts.js"`
  - `await writeOutputTemplates(cwd, deps.slug, step.name, state)`
  - local runtime のみ実行（`deps.config.runtime === "local"` ガード）
- [x] `runAgentStep()` の runner.run 成功後、commitAndPush 前に `cleanupOutputTemplates()` 呼び出しを追加する
  - `await cleanupOutputTemplates(cwd, deps.slug, step.name, state)`
  - local runtime のみ実行

**Acceptance Criteria**:
- agent step 実行前にテンプレートが change folder に存在すること
- agent step 完了後、commit-push 前に B群テンプレートが削除されていること
- managed runtime では配置・削除が実行されないこと

## T-04: system prompt からフォーマット定義の重複記述を削減する

- [x] `src/prompts/spec-review-system.ts`: "Your Output" セクション内の verdict 行フォーマット例、Findings テーブル定義（テーブル例含む）を削除し、「`spec-review-result-NNN.md` のテンプレートに従って出力してください。テンプレートの HTML コメントにフォーマット要件が記載されています。」に置換する。verdict 行が `- **verdict**:` で始まる旨の一文は残す（パース要件のため）
- [x] `src/prompts/code-review-system.ts`: "Output Format" セクション内の findings テーブル例、scores テーブル例を削除し、「`review-feedback-NNN.md` のテンプレートに従って出力してください。」に置換する。verdict 行フォーマットの一文は残す
- [x] `src/prompts/test-case-gen-system.ts`: "Test Case Format"、"Summary Section"、"Result Section" の markdown 例を削除し、「`test-cases.md` のテンプレートに従って出力してください。」に置換する。各セクションの意味説明は残す
- [x] `src/prompts/design-system.ts`: "design.md" のセクション構成リスト、"tasks.md" のフォーマット記述を削減し、テンプレート参照指示を追加する。delta spec については「`delta-spec-template.md` を参照して delta spec を書いてください」の指示を追加する
- [x] 全対象 prompt で「テンプレートファイルを Read tool で読んでから出力を開始すること」という指示を追加する

**Acceptance Criteria**:
- 各 step の system prompt に「テンプレートに従って出力せよ」の指示が含まれること
- テンプレートに移管した書式定義が prompt から削除されていること
- prompt の意味（role、constraint、delivery 手順）が保たれていること

## T-05: 全 step の system prompt 網羅確認

- [x] request.md の「上記以外にもプロンプト内で書式指示を行っているファイルがないか、全 step の system prompt を網羅確認すること」を実施する
- [x] 以下の step の prompt ファイルを確認し、T-04 で対応済みでないフォーマット指示が残っていれば対処する:
  - `spec-fixer-system.ts` — delta spec format rules は rules.md 参照指示のみなのでテンプレート不要
  - `implementer-system.ts` — 出力ファイルの書式指示なし。テンプレート不要
  - `build-fixer-system.ts` — 出力ファイルの書式指示なし。テンプレート不要
  - `code-fixer-system.ts` — 出力ファイルの書式指示なし。テンプレート不要
  - `adr-gen-system.ts` — スコープ外（request.md で明示的に除外）
  - `request-generate-system.ts` — request.md の書式指示あるが CLI step（specrunner request generate）であり pipeline agent step ではないため対象外
  - `request-review-system.ts` — one-shot コマンド（specrunner request review）であり pipeline agent step ではないため対象外
  - `fragments.ts` の `PIPELINE_RULES` — 全 review step が共有する severity/category/verdict 定義。テンプレートではなく prompt 共有フラグメントとして残すのが適切（verdict 判定ロジックの定義はテンプレートに含めない）
- [x] 確認結果を design.md の末尾にメモとして追記する（発見があった場合）

**Acceptance Criteria**:
- 全 agent step の prompt ファイルが確認済みであること
- テンプレート化すべきフォーマット指示の漏れがないこと

## T-06: テスト

- [x] `tests/templates/step-output-templates.test.ts` — テンプレート lookup 関数のユニットテスト:
  - 各 step 名に対して正しいテンプレートリストが返ること
  - iteration 番号に応じた正しいファイル名が生成されること（spec-review iteration 2 → spec-review-result-002.md）
  - テンプレート不要な step（implementer 等）に対して空配列が返ること
  - design step で delta-spec-template.md に `cleanup: true` が設定されていること
- [x] `tests/util/copy-artifacts.test.ts` にテンプレート配置・削除のテストを追加:
  - `writeOutputTemplates()` がテンプレートファイルを書き出すこと
  - `cleanupOutputTemplates()` が cleanup: true のファイルのみ削除すること
  - 存在しないファイルの削除で ENOENT が無視されること
- [x] 既存の executor テストが green であることを確認する（regression チェック）

**Acceptance Criteria**:
- 新規テストが全て green
- `bun run typecheck && bun run test` が green
