## ADDED Requirements

### Requirement: DynamicContext は specIndex フィールドを含む

`DynamicContext` 型は MUST `specIndex: SpecIndexEntry[]` フィールドを持つ。`SpecIndexEntry` は `{ capability: string; purpose: string; requirementCount: number }` で構成される。`collectDynamicContext()` は `specrunner/specs/*/spec.md` を走査し、各 spec から capability 名・Purpose 1行目・requirement 数を収集して `specIndex` に格納する。

`specrunner/specs/` ディレクトリが存在しない場合は空配列を返す（SHALL）。個別の spec.md 読み取り失敗時はそのエントリをスキップする（MUST）。結果は capability 名で昇順ソートされる。

#### Scenario: specrunner/specs/ が存在しない場合に空配列を返す

- **GIVEN** ワークスペースに `specrunner/specs/` ディレクトリが存在しない
- **WHEN** `collectDynamicContext()` を実行する
- **THEN** `specIndex` が空配列 `[]` になる

#### Scenario: spec.md を走査して正しい SpecIndexEntry を返す

- **GIVEN** `specrunner/specs/foo/spec.md` に `## Purpose` セクション（1行目: "Manage foo resources"）と `### Requirement:` が 3 つ存在する
- **WHEN** `collectDynamicContext()` を実行する
- **THEN** `specIndex` に `{ capability: "foo", purpose: "Manage foo resources", requirementCount: 3 }` が含まれる

#### Scenario: 読み取り不可の spec.md はスキップされる

- **GIVEN** `specrunner/specs/bar/` ディレクトリが存在するが `spec.md` が読めない
- **WHEN** `collectDynamicContext()` を実行する
- **THEN** `specIndex` に `bar` のエントリが含まれず、他のエントリは正常に返される

### Requirement: Propose specIndex Injection

`buildInitialMessage()` の第4引数は MUST `DynamicContext` 型（optional）を受け取る。従来の `{ changesList?: string[] }` partial pick 型から `DynamicContext` 型への統一により、`specIndex` を含む全フィールドを一貫して渡せるようにする。

`DynamicContext.specIndex` が非空の場合、初期メッセージの Repository Context セクションに Baseline Specs テーブルを MUST 含める。テーブルは capability 名・Purpose 1行目・requirement 数の 3 列で構成する。`specIndex` が空の場合はテーブルセクションを SHALL 省略する。

`changesList` と `specIndex` は独立に条件判定され、両方とも空の場合は Repository Context セクション自体を出力しない。

#### Scenario: specIndex が存在する場合に Baseline Specs テーブルが含まれる

- **GIVEN** `DynamicContext` に 2 つ以上の `SpecIndexEntry` がある
- **WHEN** `buildInitialMessage()` を呼び出す
- **THEN** 初期メッセージに `### Baseline Specs` セクションヘッダーと capability / Purpose / requirement 数のテーブルが含まれる

#### Scenario: specIndex が空の場合にテーブルが省略される

- **GIVEN** `DynamicContext` の `specIndex` が空配列
- **WHEN** `buildInitialMessage()` を呼び出す
- **THEN** 初期メッセージに `Baseline Specs` セクションが含まれない

#### Scenario: changesList のみ存在し specIndex が空

- **GIVEN** `DynamicContext` の `changesList` が非空で `specIndex` が空配列
- **WHEN** `buildInitialMessage()` を呼び出す
- **THEN** Repository Context セクションに Active Changes のみが含まれ、Baseline Specs テーブルは含まれない

#### Scenario: buildInitialMessage の引数型が DynamicContext に統一される

- **GIVEN** `buildInitialMessage()` の第4引数に `DynamicContext` 型のオブジェクトを渡す
- **WHEN** `changesList` と `specIndex` の両方が非空
- **THEN** Active Changes と Baseline Specs の両方が Repository Context セクションに含まれる

### Requirement: Baseline Spec Reference in System Prompt

propose agent のシステムプロンプトは MUST path-fence セクション直後に baseline spec 参照指示セクションを含む。`specrunner/specs/` 配下の baseline spec の Read は SHALL 許可される（path-fence の「編集禁止」ルールに該当しないため）。

agent は delta spec（MODIFIED / REMOVED）を書く前に、対応する baseline spec を Read して既存 Requirement を把握しなければならない（MUST）。initial message に specIndex テーブルが含まれている場合は、それを手がかりに関連する baseline spec を特定する。

#### Scenario: system prompt に baseline 参照指示が含まれる

- **WHEN** propose セッションのシステムプロンプトを参照する
- **THEN** `specrunner/specs/` 配下の baseline spec の Read 許可と、delta spec 作成前の参照指示がプロンプト内に存在する

#### Scenario: path-fence と baseline 参照の共存

- **GIVEN** path-fence が `specrunner/changes/<slug>/` 外のファイル編集を禁止している
- **WHEN** propose agent が `specrunner/specs/` 配下の baseline spec を Read する
- **THEN** Read は編集ではないため path-fence 違反にならない
