# Design: step-output-template-injection

## Context

agent step の出力ファイル（spec-review-result, review-feedback, test-cases, design, tasks, delta-spec-template）の書式制約は、現在各 step の system prompt 内にインラインで記述されている。prompt が長くなると書式指示が埋もれ、agent がフォーマットを逸脱する → verdict パース失敗 → escalation という障害パスが発生している。

既に `copyRulesToChangeFolder()` で rules.md を change folder に配置するパターンが確立されており（`src/util/copy-artifacts.ts`）、テンプレート配置も同じアーキテクチャパターンに従える。

## Goals / Non-Goals

### Goals

- 各 agent step 実行前に出力ファイルのテンプレートを change folder に配置する
- テンプレートに machine-parsed フィールドの正確なフォーマットを HTML コメントとして含める
- テンプレート配置後の system prompt から重複するフォーマット定義を削減する

### Non-Goals

- CLI step（verification, pr-create, delta-spec-validation）の出力テンプレート化（コードが直接書き出すため不要）
- adr-gen のテンプレート化（judge 判定＋任意生成のため複雑。別 issue）
- テンプレートの外部ファイル管理（リポジトリ側配置）
- managed runtime 対応（CLI がリモート worktree に直接書けない）

## Decisions

### D1: テンプレートはコード内定数として `src/templates/` モジュールに定義する

テンプレート文字列を `src/templates/step-output-templates.ts` にエクスポートする。各テンプレートは step name をキーとする Map またはオブジェクトで管理する。

**Why D1 and not external files**: テンプレートをリポジトリ側ファイルとして管理すると、specrunner の配布物（npm パッケージ）にバンドルする仕組みが必要になる。コード内定数であればビルド時に自動的に含まれる。rules.md (`src/prompts/rules.ts` の `RULES_MD_CONTENT`) と同じパターン。

### D2: テンプレート配置は StepExecutor.runAgentStep() の冒頭で実行する

`executor.ts` の `runAgentStep()` に、step 実行前のテンプレート書き出しフックを追加する。テンプレート配置ロジック自体は `src/util/copy-artifacts.ts`（既存の `copyRulesToChangeFolder` と同居）に `writeOutputTemplate()` 関数として定義する。

**Why executor and not runtime.setupWorkspace()**: setupWorkspace は一度だけ呼ばれ、全 step 分のテンプレートを事前配置する設計になる。しかし iteration ごとにファイル名が変わる step（spec-review-result-NNN, review-feedback-NNN）がある。step 実行直前に必要なテンプレートだけを配置する方が正確で無駄がない。

**Why not AgentStep interface に hook を追加**: テンプレート配置は全 agent step に共通の executor の責務であり、各 step 実装に委譲する必要がない。Step は pure declaration であるべき。

### D3: 出力先直接配置（A群）と参照用テンプレート（B群）の2方式

- **A群（出力先直接配置）**: spec-review-result-NNN.md, review-feedback-NNN.md, test-cases.md, design.md, tasks.md — agent が上書きするファイルパスにテンプレートを配置。agent が出力を書き出す際に自然に上書きされるため回収不要。
- **B群（参照用テンプレート）**: delta-spec-template.md — capability 名が動的なため出力先パスが確定しない。`specrunner/changes/<slug>/delta-spec-template.md` に配置し、agent は「このテンプレートを参照して delta spec を書け」と指示される。design step 完了後に specrunner が削除する。

**Why delta-spec-template is B群**: delta spec のパスは `specs/<capability>/spec.md` で capability 名が agent の判断で決まるため、事前に出力先パスを確定できない。参照用テンプレートとして配置し、agent が参照だけする方式が適切。

### D4: テンプレート配置のタイミングは step 名と step の `outputTemplatePath` で決定する

各テンプレートの配置先パスを決定するために、step 名からテンプレート内容と出力パスを解決する lookup 関数を `src/templates/step-output-templates.ts` に用意する。パス計算に iteration number や slug が必要なため、lookup は `(stepName, slug, state) => { path, content }[]` のシグネチャとする。

### D5: テンプレートは git add の対象にしない

A群テンプレートは agent が上書きした出力ファイルが commit 対象になる。テンプレートファイル自体が中間成果物として commit されるリスクは、agent が必ず上書きすることで自然に回避される（上書き後のファイルが commit される）。

B群テンプレート（delta-spec-template.md）は design step 完了後に executor が削除する。commit-push の git add -A の前に削除されるため、commit 対象にならない。

### D6: prompt 簡素化は段階的に実施する

テンプレートに書式制約を移動した分、各 step の system prompt からフォーマット定義の重複記述を削減する。ただし prompt からフォーマット指示を完全に削除するのではなく、「`<path>` のテンプレートに従って出力せよ」という一文に置き換える。agent が Read tool でテンプレートを読むインセンティブを与えるため。

## Risks / Trade-offs

### [Risk] agent がテンプレートを無視して独自フォーマットで出力する
→ Mitigation: prompt に「テンプレートに従え」と明記 + テンプレートの HTML コメントに具体的なフォーマット要件を含める。既存の prompt ベースの指示よりもフォーマット遵守率は向上する（テンプレートファイルは agent の Write 操作の起点になるため）。

### [Risk] A群テンプレートが agent に上書きされなかった場合にスケルトンが PR に含まれる

agent が別パスにファイルを書いた場合や、Write ツールを呼ばずに終了した場合、A群テンプレートのスケルトンが commit-push の `git add -A` によって PR に含まれるリスクがある。
→ Mitigation: A群テンプレートのうちファイル名が確定しているもの（spec-review-result-NNN.md, review-feedback-NNN.md 等）については、commitAndPush 前に該当ファイルのテンプレート文字列との一致チェック（git diff で変更があるか確認）を将来的に追加できる。現時点では「agent が上書きする」という前提を受け入れ、spec-fixer での手動チェックを安全網とする。

### [Risk] B群テンプレートの削除漏れで PR に残骸が含まれる
→ Mitigation: executor の design step 完了後の処理で明示的に削除する。commit-push の前に実行されるため、削除漏れのリスクは低い。

### [Risk] 全 step の prompt を同時に変更するため regression の範囲が広い
→ Mitigation: 既存テストが verdict パースの正常動作を保証している。prompt 変更は「冗長な記述の削除」であり、意味を変えない。

## Open Questions

なし — architect 評価済みの設計判断に従う。
