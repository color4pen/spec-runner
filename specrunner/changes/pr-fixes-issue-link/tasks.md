# Tasks: PR の Fixes 行を job state の issueNumber から導出する

## T-01: renderPrBody の Fixes 行を issueNumber 優先に置き換える

- [x] `src/core/pr-create/body-template.ts` の Fixes 行ブロック（現状の `if (parsedRequest.issue) { sections.push(\`Fixes ${parsedRequest.issue}\`); }`、72-74 行付近）を以下の 3 分岐に置き換える（D1 / D2 / D3）:
  - `jobState.issueNumber != null` のとき `sections.push(\`Fixes #${jobState.issueNumber}\`)`
  - else if `parsedRequest.issue` のとき `sections.push(\`Fixes ${parsedRequest.issue}\`)`（従来出力を維持）
  - どちらも無ければ何も push しない
- [x] 判定は truthy check ではなく `!= null`（null / undefined 双方を不在扱い）を使う（D2）
- [x] issueNumber 側のみ `#` を明示付与し、`parsedRequest.issue` 側は既存の文字列前提（`#` 込み）を変えない（D3）
- [x] Fixes 行のコメント（`// --- Fixes line ...`）を「issueNumber 優先、無ければ request.md の issue」を説明する内容に更新する
- [x] `renderPrBody` の signature・`src/core/step/pr-create.ts` の呼び出しは変更しない（jobState は既に渡っている）

**Acceptance Criteria**:
- `jobState.issueNumber` が設定済みの呼び出しで body に `Fixes #<issueNumber>` が含まれる
- issueNumber 未設定 + `parsedRequest.issue` 設定済みで body に `Fixes <issue>`（従来出力）が含まれる
- 両方未設定で Fixes 行が出力されない
- 新規 import を追加しない（jobState / ParsedRequest は既存 import）
- `bun run typecheck` が green

## T-02: renderPrBody の Fixes 行ユニットテストを追加・更新する

- [x] `tests/unit/core/pr-create/body-template.test.ts` に issueNumber 起点のケースを追加する（既存の `makeMinimalState` / `makeParsedRequest` ヘルパーを利用。`makeMinimalState({ issueNumber: 42 })` で設定）
- [x] ケース: `issueNumber` 設定済み → body が `Fixes #42` を含む（受け入れ基準 1）
- [x] ケース: `issueNumber` 設定済み + `parsedRequest.issue` も設定済み → body が `Fixes #42` を含み `Fixes #264` を含まない（precedence、D1）
- [x] ケース: `issueNumber` 未設定 + `parsedRequest.issue` 設定済み → body が `Fixes #264` を含む（従来出力維持、受け入れ基準 2。既存テストでカバー済みなら維持）
- [x] ケース: `issueNumber` 未設定 + `parsedRequest.issue` 未設定 → body が `Fixes #` を含まない（受け入れ基準 3。既存テストでカバー済みなら維持）
- [x] 既存の Fixes 系テスト（132-147 行付近）が precedence 追加後も regression なく pass することを確認する

**Acceptance Criteria**:
- 上記 4 ケースが pass する
- 既存テストが regression なく pass する
- `bun run test` で当該テストファイルが pass

## T-03: 最終検証

- [x] `bun run typecheck` が green
- [x] `bun run test` で全テストが pass（regression なし）
- [x] `grep -rn "issueNumber" src/core/pr-create/body-template.ts` で Fixes 行が issueNumber を参照していることを確認する

**Acceptance Criteria**:
- `typecheck && test` が green
- spec.md の全 Requirement / Scenario が満たされる
- 受け入れ基準（issueNumber で Fixes 出力 / 無ければ従来維持 / 両方無しで非出力）がすべて満たされる
