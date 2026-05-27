# ADR: Step 実行前の出力ファイルテンプレート注入方式

- **Date**: 2026-05-27
- **Status**: Accepted
- **Slug**: step-output-template-injection

## Context

各 agent step の出力ファイル（spec-review-result, review-feedback, test-cases, design, tasks, delta spec）の書式制約は、これまで各 step の system prompt 内にインラインで記述されていた。

この方式の問題：

- prompt が長くなるとフォーマット指示が埋もれ、agent がフォーマットを逸脱する
- verdict パース失敗 → escalation という障害パスが発生していた
- 書式定義が prompt と実装コードに分散し、変更時の一貫性保証が困難

`2026-05-20-rules-md-injection` ADR で確立された「ファイルを change folder に配置し、agent に Read させる」パターン（acquired information は given 注入より遵守率が高い）を、出力テンプレートにも適用する。

既に `copyRulesToChangeFolder()` が `src/util/copy-artifacts.ts` に実装されており、同パターンの拡張として自然に実現できる。

## 決定

### D1: テンプレートはコード内定数として `src/templates/step-output-templates.ts` に定義する

テンプレート文字列を TypeScript モジュールのエクスポート定数として管理する。対象ファイルごとに定数（`SPEC_REVIEW_RESULT_TEMPLATE`, `REVIEW_FEEDBACK_TEMPLATE`, `TEST_CASES_TEMPLATE`, `DESIGN_TEMPLATE`, `TASKS_TEMPLATE`, `DELTA_SPEC_TEMPLATE`）を定義し、HTML コメントで machine-parsed フィールドの書式制約を埋め込む。

rules.md の管理方式（`src/prompts/rules.ts` の `RULES_MD_CONTENT`）と同一パターン。

### D2: テンプレート配置は StepExecutor.runAgentStep() の冒頭で実行する

`executor.ts` の `runAgentStep()` に以下の呼び出しを追加する：

1. `store.update()` 直後・`runner.run()` 前: `writeOutputTemplates(cwd, slug, stepName, state)`
2. `runner.run()` 成功後・`commitAndPush()` 前: `cleanupOutputTemplates(cwd, slug, stepName, state)`

両呼び出しは `deps.config.runtime === "local"` ガードで管理型 runtime では実行しない。

**Why executor and not setupWorkspace()**: `setupWorkspace` は job 開始時に一度だけ呼ばれる。iteration ごとにファイル名が変わる step（spec-review-result-NNN.md 等）では、step 実行直前に正確な iteration 番号でテンプレートを配置する必要がある。

**Why not AgentStep interface に hook を追加**: テンプレート配置は全 agent step に共通の executor の責務。Step は pure declaration であるべきで、ライフサイクル管理を委譲しない。

### D3: 出力先直接配置（A群）と参照用テンプレート（B群）の2方式を使い分ける

| 方式 | 対象ファイル | 動作 |
|------|------------|------|
| **A群（出力先直接配置）** | spec-review-result-NNN.md, review-feedback-NNN.md, test-cases.md, design.md, tasks.md | agent が上書きするパスに配置。上書き後のファイルが commit 対象になる |
| **B群（参照用テンプレート）** | delta-spec-template.md | capability 名が動的なため出力先が確定しない。`changes/<slug>/delta-spec-template.md` に配置し、design step 完了後に削除 |

**Why delta-spec は B群**: delta spec のパスは `specs/<capability>/spec.md` で capability 名が agent の判断で決まり、事前にパスを確定できない。

### D4: テンプレート解決は `getOutputTemplates(stepName, slug, state)` 関数で一元化する

step 名・slug・job state を受け取り `{ path, content, cleanup }[]` を返す lookup 関数を `src/templates/step-output-templates.ts` に定義する。iteration 番号の算出（`state.steps[stepName]?.length + 1`）をここに集約する。

### D5: prompt からインラインのフォーマット定義を削除し、テンプレート参照指示に置き換える

各 step の system prompt に「`<path>` のテンプレートを Read tool で読んでから出力を開始すること」を追記し、インラインのフォーマット例・テーブル定義・YAML キー列挙を削除する。verdict 行フォーマットへの言及はパース要件のため保持する。

## Alternatives Considered

### Alternative 1: setupWorkspace で全テンプレートを job 開始時に一括配置する

runtime の `setupWorkspace()` で、全 step 分のテンプレートをまとめて change folder に書き出す。

**Pros**:
- 実装箇所が executor でなく runtime に集約され、シンプル
- job 開始時に一度だけ実行されるため副作用が少ない

**Cons**:
- iteration-based ファイル名（spec-review-result-NNN.md 等）の NNN が setup 時点では未確定
- 全 step 分のテンプレートが最初から存在するため、agent が「既に出力済み」と誤認するリスクがある

**Why not**: spec-review や code-review は繰り返し実行され、iteration 番号が動的に変わる。正確なファイル名でテンプレートを配置するには step 実行直前のタイミングが必要。

### Alternative 2: テンプレートを外部ファイルとしてリポジトリ側に配置する

`specrunner/templates/` 等のディレクトリにテンプレートファイルを置き、specrunner が実行時にコピーする。

**Pros**:
- テンプレートを人間が直接編集しやすい
- git 履歴でテンプレートの変更を追跡できる

**Cons**:
- npm パッケージとして配布する際にテンプレートファイルをバンドルする仕組みが別途必要になる
- コード内定数（TypeScript モジュール）であればビルド時に自動包含されるが、外部ファイルは `package.json` の `files` フィールドや追加ロジックが必要

**Why not**: rules.md は `src/prompts/rules.ts` の `RULES_MD_CONTENT` として管理されており、同パターンに従う。外部ファイル管理は配布コストが高く、現時点の要件に対して過剰。

### Alternative 3: AgentStep interface にテンプレート配置 hook を追加する

`AgentStep` インターフェースに `getOutputTemplates?(): OutputTemplate[]` メソッドを追加し、各 step 実装がテンプレートを自己申告する。

**Pros**:
- 各 step が自分の出力テンプレートを宣言的に管理できる
- テンプレートと step 実装が同じファイルに共存し、変更時の locality が高い

**Cons**:
- Step は pure declaration であるべき（ライフサイクル管理は executor の責務）
- テンプレートを持たない step（implementer, spec-fixer 等）にも空の実装が必要になる
- テンプレート配置のタイミング制御（iteration 番号算出・runtime ガード）が各 step に分散する

**Why not**: テンプレート配置は全 agent step に共通の横断的関心事であり、executor の単一箇所で管理する方が変更の影響を局所化できる。

### Alternative 4: system prompt のフォーマット指示を MUST/CRITICAL で強調する

既存の system prompt 内のフォーマット定義をより強い言葉（MUST、CRITICAL、IMPORTANT）で強調し直す。

**Pros**:
- 実装変更が不要
- テンプレート注入の仕組みを追加する必要がない

**Cons**:
- Claude 4.x では aggressive language が逆効果になるリスクがある
- `rules-md-injection` ADR の実証結果として、given 注入よりも acquired information（agent 自身が Read したファイル）の方がフォーマット遵守率が高いことが確認されている
- 根本的な問題（prompt が長くなるほど書式指示が埋もれる）を解決しない

**Why not**: `2026-05-20-rules-md-injection` と同じ原理で、agent が能動的に Read したテンプレートの方が静的な system prompt 注入より遵守率が高い。強調は対症療法であり、本 ADR の方式が根本解決になる。

### Alternative 5: managed runtime にもテンプレート配置を実装する

local runtime と managed runtime の両方で `writeOutputTemplates` を実行し、対称性を保つ。

**Pros**:
- 全 runtime でテンプレート注入の恩恵を受けられる
- runtime による動作差異がなくなり、挙動が予測しやすい

**Cons**:
- managed runtime では CLI がリモート worktree に直接ファイルを書けない（エージェントがリモートで動作するため）
- 実現するには managed runtime 側に別の仕組み（API 経由のファイル書き込み等）が必要

**Why not**: request.md のスコープ外として明示的に除外。managed runtime 対応は別 issue で設計する。

## リスクと受容判断

**[Risk] A群テンプレートが agent に上書きされなかった場合にスケルトンが PR に含まれる**

agent が別パスにファイルを書いた場合や Write tool を呼ばずに終了した場合、A群テンプレートのスケルトンが `git add -A` で PR に含まれるリスクがある。

→ 受容判断：agent が上書きする前提を受け入れる。将来的には commitAndPush 前にテンプレート文字列との一致チェックを追加できる。現時点では spec-fixer での手動チェックを安全網とする。

**[Risk] B群テンプレートの削除漏れで PR に残骸が含まれる**

→ Mitigation：executor の design step 完了後の処理で明示的に `cleanupOutputTemplates()` を呼ぶ。commitAndPush の前に実行されるため、削除漏れのリスクは低い。

**[Risk] 全 step の prompt を同時に変更するため regression 範囲が広い**

→ Mitigation：既存テストが verdict パースの正常動作を保証。prompt 変更は「冗長な記述の削除」であり意味を変えない。`bun run typecheck && bun run test`（285 files / 3245 tests）が green であることを確認済み。

## Consequences

- `src/templates/step-output-templates.ts` に出力テンプレート定数と `getOutputTemplates()` 関数が集約され、書式定義の single source of truth が確立される
- StepExecutor のライフサイクルが「テンプレート配置 → agent 実行 → テンプレート削除 → commit」に拡張される
- spec-review-system.ts, code-review-system.ts, test-case-gen-system.ts, design-system.ts の system prompt からインラインのフォーマット定義が削除され、prompt が簡素化される
- managed runtime ではテンプレート注入はスキップされる（local runtime のみ有効）
- テンプレート内容の静的テストが `tests/templates/step-output-templates.test.ts` で CI 保護される

## Files Changed

| File | Change |
|------|--------|
| `src/templates/step-output-templates.ts` | 新設（テンプレート定数 6 種 + `getOutputTemplates()` + `writeOutputTemplates()` + `cleanupOutputTemplates()`） |
| `src/core/step/executor.ts` | `runAgentStep()` に `writeOutputTemplates` / `cleanupOutputTemplates` 呼び出し追加 |
| `src/util/copy-artifacts.ts` | `writeOutputTemplates()` / `cleanupOutputTemplates()` 実装追加 |
| `src/prompts/spec-review-system.ts` | インラインフォーマット定義削除、テンプレート参照指示追加 |
| `src/prompts/code-review-system.ts` | 同上 |
| `src/prompts/test-case-gen-system.ts` | 同上 |
| `src/prompts/design-system.ts` | 同上 + delta-spec-template.md 参照指示追加 |
| `tests/templates/step-output-templates.test.ts` | 新設（テンプレート内容の静的 assert + getOutputTemplates のシナリオ） |
| `tests/util/copy-artifacts.test.ts` | `writeOutputTemplates` / `cleanupOutputTemplates` のテスト追加 |

## 関連 ADR

- [2026-05-20-rules-md-injection](./2026-05-20-rules-md-injection.md) — 同パターンの先行実装。rules.md を change folder に配置し acquired information として agent に Read させる方式を確立。本 ADR はそのパターンを出力テンプレートに拡張する。
- [2026-05-23-executor-commit-push-extraction](./2026-05-23-executor-commit-push-extraction.md) — StepExecutor のライフサイクル管理に関連。本 ADR の D2 はこの ADR で確立されたライフサイクル構造に対する拡張となる。
