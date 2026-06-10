# codex adapter の outputSchema を OpenAI strict mode 互換に変換する

## Meta

- **type**: bug-fix
- **slug**: codex-strict-schema-compat
- **base-branch**: main
- **adr**: false

## 背景

codex adapter で agent step を実行すると、OpenAI API が report_result の出力スキーマを `invalid_json_schema` で拒否し、step が即時エラーになる（実測: `In context=(), 'required' is required to be supplied and to be an array including every key in properties. Missing 'reason'.`）。OpenAI の structured output（strict mode）は全 property を `required` に列挙することを要求し、optional は型を null との union にして表現する流儀のため、zod の素直な JSON Schema 変換（optional を required から除外する）と互換性がない。Claude 側の tool input_schema は optional をそのまま受けるため、この差は codex adapter でのみ顕在化する。

## 現状コードの前提

- codex adapter は `buildOutputSchema`（`src/adapter/codex/agent-runner.ts:90-92`）で `toJSONSchema(object(reportTool.zodSchema))` をそのまま `thread.run()` の outputSchema に渡している
- この変換は `report-tool.ts` の `toCustomToolSpec` と同一で、optional フィールド（`reason?` / `status?` / `approved?` / `findings?` / `fixableCount?` / `verdict?`）は `required` に含まれない
- parse 側（`parseBaseReportInput` 等、`src/core/port/report-result.ts`）は手書きの typeof チェックで、フィールド欠落と型不一致を許容的に扱う

## 要件

1. codex adapter の outputSchema 構築時に、OpenAI strict mode 互換への変換を行う: 全 property を `required` に列挙し、optional だったフィールドの型を null との union（`type: [..., "null"]` または `anyOf` + `null`）にする。nested object（findings 配列の要素）にも再帰的に適用する
2. 変換は codex adapter 内に閉じる: port の `ReportToolSpec.zodSchema` と Claude 側（`toCustomToolSpec`）の変換は変更しない
3. codex 経由の tool 結果で optional フィールドが `null` で返ってきた場合に、parse 側で undefined と同様に扱えること（既存 parse が `null` を不正値として弾かないことの確認、必要なら adapter 側で null を除去してから parse に渡す）

## スコープ外

- Claude / managed adapter の schema 変換
- report_result スキーマ自体の変更
- codex で使用するモデルの選定・config

## 受け入れ基準

- [ ] 変換後の JSON Schema が「全 property が required に含まれ、optional 相当は nullable」の形になっているテストがある（JUDGE_REPORT_TOOL の findings 配列を含むケースで検証）
- [ ] optional フィールドが null の tool 結果が、undefined と同じ typed outcome に parse されるテストがある
- [ ] Claude 側の CustomToolSpec 出力（toCustomToolSpec）が変更されていない
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- provider 固有のスキーマ方言は adapter 内で吸収する（B-2 と同方向: SDK / provider の都合を port の外に漏らさない）
