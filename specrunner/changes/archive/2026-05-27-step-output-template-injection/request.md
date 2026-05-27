# pipeline step 実行前に出力ファイルのテンプレートを change folder に配置する

## Meta

- **type**: new-feature
- **slug**: step-output-template-injection
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

各 agent step の出力ファイル（spec-review-result, review-feedback, test-cases, design, tasks, delta spec 等）の書式制約は現在 system prompt 内に埋め込まれている。prompt が長くなるとフォーマット指示が埋もれ、agent がフォーマットを逸脱して verdict パース失敗 → escalation に至るケースがある。

テンプレートファイルを step 実行前に change folder へ配置し、agent には「テンプレートに従え」と伝えるだけにすることで、フォーマット遵守率を向上させる。

## 要件

### 1. テンプレート定数の定義

以下の出力ファイルについて、書式制約を HTML コメントとして含むテンプレートをコード内定数として定義する。テンプレートには machine-parsed フィールドの正確なフォーマット（verdict 行の書式、テーブルのカラム定義、必須セクション等）をコメントで記載する。

対象ファイル:

| ファイル | 配置方式 | テンプレートに含める書式制約 |
|---------|---------|------------------------|
| `spec-review-result-NNN.md` | 出力先に直接配置 | verdict 行フォーマット、findings テーブル6列定義、severity 値 |
| `review-feedback-NNN.md` | 出力先に直接配置 | verdict 行フォーマット、findings テーブル7列定義（Fix列）、scores テーブル、total 行 |
| `test-cases.md` | 出力先に直接配置 | TC-NNN 形式、GIVEN/WHEN/THEN、Summary 4項目、Result YAML 全キー |
| `design.md` | 出力先に直接配置 | セクション構造（Context / Goals / Decisions / Risks） |
| `tasks.md` | 出力先に直接配置 | T-NN 形式、チェックボックス、Acceptance Criteria |
| `delta-spec-template.md` | 参照用テンプレート | `## Requirements` / `### Requirement:` / `#### Scenario:` / SHALL・MUST / `## Removed` / `## Renamed` の書式 |

**注意**: 上記以外にもプロンプト内で書式指示を行っているファイルがないか、全 step の system prompt を網羅確認すること。

### 2. テンプレート配置メカニズム

- 各 agent step の実行前に、specrunner が該当テンプレートを change folder に書き出す
- 出力先直接配置のファイル（A群）: agent が上書きするため回収不要
- 参照用テンプレート（delta-spec-template.md）: `specrunner/changes/<slug>/delta-spec-template.md` に配置し、design step 完了後に specrunner が削除する
- テンプレートは `git add` の対象にしない

### 3. prompt の簡素化

テンプレートファイルに書式制約を移動した分、各 step の system prompt からフォーマット定義の重複記述を削減する。prompt には「`<path>` のテンプレートに従って出力せよ」と記載する。

## スコープ外

- CLI step が出力するファイル（delta-spec-validation-result, verification-result, pr-create-result）はコードが直接書き出すためテンプレート不要
- adr-gen のテンプレート（生成が任意かつ judge 判定を含むため、テンプレート配置が複雑になる。別 issue で検討）
- テンプレートの外部ファイル管理（リポジトリ側への配置）。テンプレートはコード内定数として specrunner に同梱する
- managed runtime（エージェントがリモート worktree で動作するため CLI が直接ファイルを書けない）。本 feature は local runtime のみ対象

## 受け入れ基準

- [ ] 各 agent step 実行前に対応するテンプレートファイルが change folder に存在すること
- [ ] テンプレートに machine-parsed フィールドの正確なフォーマットが HTML コメントとして記載されていること
- [ ] agent が出力したファイルでテンプレートが上書きされ、テンプレート残骸が PR に含まれないこと
- [ ] delta-spec-template.md が design step 完了後に削除されていること
- [ ] テンプレートに移管された書式制約が、対象 step の system prompt から削除されていること
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- テンプレートはコード内定数として管理する。リポジトリ側ファイルやテンプレートエンジンは使わない
- 出力先直接配置（A群）と参照用テンプレート（B群）の2方式を使い分ける
- delta spec は capability 名が動的なため参照用テンプレートとし、propose 完了後に削除する
