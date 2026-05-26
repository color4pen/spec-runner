# Tasks: design-request-followup

## T-01: 汎用 section 抽出ユーティリティを作成

- [x] `src/parser/extract-section.ts` を新規作成
- [x] `extractMarkdownSections(content: string, headings: string[]): Map<string, string>` を実装
  - `content`: markdown テキスト全文
  - `headings`: 抽出対象の `##` heading 名の配列（`##` prefix なし）
  - 戻り値: heading 名 → section 本文の Map（heading 不在の場合はエントリなし）
  - section 本文は heading 行の次行から次の `##` heading (or EOF) まで、先頭末尾の空行を trim
- [x] pure function, no I/O, no 外部依存（既存 `extractSections` と同じ方針）
- [x] `tests/unit/parser/extract-section.test.ts` にユニットテストを追加
  - heading が存在する case
  - heading が存在しない case（Map にエントリなし）
  - 複数 heading を同時抽出する case
  - heading 直下が空（本文なし）の case（Map にエントリなし or 空文字列）
  - `###` レベルの heading は section 境界にならない case

**受け入れ基準:** `extractMarkdownSections` が request.md 形式のテキストから `##` heading 指定で section を正しく抽出できる。テストが green。

## T-02: 対象 heading を定数定義

- [x] `src/parser/extract-section.ts` に `REQUEST_CONSTRAINT_HEADINGS` 定数を export
  - 値: `["スコープ外", "受け入れ基準", "architect 評価済みの設計判断"]`
- [x] `buildRequestConstraintsBlock(requestContent: string): string | undefined` ヘルパーを同ファイルに追加
  - `extractMarkdownSections(requestContent, REQUEST_CONSTRAINT_HEADINGS)` を呼び出し
  - 抽出結果が 0 件 → `undefined` を返す
  - 1 件以上 → 以下のフォーマットで文字列を構築して返す:

```
## Request Constraints (CLI-injected)

以下は request.md から CLI が抽出した制約情報です。設計・レビュー時に必ず参照してください。

### スコープ外

<extracted content>

### 受け入れ基準

<extracted content>

### architect 評価済みの設計判断

<extracted content>
```

**受け入れ基準:** `buildRequestConstraintsBlock` が request.md テキストから 3 section を抽出し、ラベル付きブロックとして返す。section が存在しない場合は `undefined`。

## T-03: design step の buildInitialMessage に section 注入

- [x] `src/prompts/design-system.ts` の `buildInitialMessage` 関数を修正
- [x] `buildRequestConstraintsBlock(requestContent)` を呼び出す
- [x] 結果が `undefined` でない場合、`<user-request>` タグ閉じの後（Repository Context の前）に挿入
- [x] `requestContent` は `<user-request>` タグ内にすでに存在するため、注入は**タグ外**に行う（D2）
- [x] 既存の Repository Context section との配置順: `<user-request>` → `Request Constraints` → `Repository Context`

**受け入れ基準:** design step の initial message に `## Request Constraints (CLI-injected)` セクションが含まれる。スコープ外 / 受け入れ基準 / architect 設計判断の 3 section が `<user-request>` タグ外に存在する。

## T-04: code-review step の buildCodeReviewInitialMessage に section 注入

- [x] `src/core/step/code-review.ts` の `buildCodeReviewInitialMessage` 関数を修正
- [x] `buildRequestConstraintsBlock(opts.requestContent)` を呼び出す
- [x] 結果が `undefined` でない場合、`<user-request>` タグ閉じの後に挿入
- [x] Branch Context section との配置順: `<user-request>` → `Request Constraints` → `Branch Context`

**受け入れ基準:** code-review step の initial message に `## Request Constraints (CLI-injected)` セクションが含まれる。

## T-05: design-system の既存テスト更新 + 新規テスト追加

- [x] `tests/unit/prompts/design-system.test.ts` の既存テストが引き続き green であることを確認
- [x] 以下のテストケースを追加:
  - スコープ外 / 受け入れ基準 / architect 設計判断の 3 section を含む request.md → initial message に `Request Constraints (CLI-injected)` が含まれる
  - 補助 section が存在しない request.md → `Request Constraints` セクションが含まれない
  - `Request Constraints` が `<user-request>` タグ外に存在する

**受け入れ基準:** テストが green。補助 section の有無で initial message の内容が正しく変わる。

## T-06: code-review の既存テスト更新 + 新規テスト追加

- [x] `tests/unit/step/code-review.test.ts` の既存テストが引き続き green であることを確認
- [x] 以下のテストケースを追加:
  - 補助 section を含む request.md → initial message に `Request Constraints (CLI-injected)` が含まれる
  - 補助 section が存在しない request.md → `Request Constraints` セクションが含まれない

**受け入れ基準:** テストが green。

## T-07: typecheck + test

- [x] `bun run typecheck` が green
- [x] `bun run test` が green（既存の 2 件の pre-existing failure を除く）
- [x] 既存 pipeline step (design / code-review 以外) に regression なし（テスト変更不要）

**受け入れ基準:** `bun run typecheck && bun run test` が clean pass。
