# Tasks: codex adapter の outputSchema を OpenAI strict mode 互換に変換する

## T-01: strict-mode schema 変換の純関数を新設する

- [x] `src/adapter/codex/strict-schema.ts` を新規作成する。
- [x] 純関数 `toOpenAIStrictSchema(schema: object): object` を export する。入力を破壊せず、変換後の新しい JSON Schema を返す（deep clone してから変換、または再帰的に新オブジェクトを構築）。
- [x] 再帰走査ロジック（design.md D2）:
  - `type === "object"` かつ `properties` を持つ node: (1) 元の `required`（無ければ `[]`）を `originalRequired` として保持 → (2) 各 property schema を先に再帰変換 → (3) `originalRequired` に含まれない key を nullable 化（T-02 の規則） → (4) `required` を `properties` の全 key に設定 → (5) `additionalProperties: false` を保持。
  - `type === "array"` かつ `items` を持つ node: `items` に再帰適用。
  - `anyOf` を持つ node: 各要素に再帰適用。
- [x] 既に `required` に含まれる（= 元から必須の）property は nullable 化しない。
- [x] 純関数（I/O なし）として実装し、codex adapter ディレクトリ外（core/port/step）には一切依存・変更を持ち込まない。

**Acceptance Criteria**:
- `src/adapter/codex/strict-schema.ts` が存在し `toOpenAIStrictSchema` を export している。
- 関数は引数の schema オブジェクトを mutate しない（呼び出し後も入力が元の形を保つ）。
- `src/core/port/` および `src/core/step/report-tool.ts` への import / 変更が発生していない。

## T-02: optional property の nullable 化規則を実装する

- [x] T-01 の nullable 化ステップ（design.md D3）を実装する。対象 property schema に対し:
  - `anyOf` を持つ場合 → `anyOf` 配列に `{ type: "null" }` を追加（既に null branch があれば重複追加しない）。
  - `type`（string）を持つ場合 → `type` を `[元の type, "null"]` の配列にする。
  - `type` が既に配列の場合 → `"null"` を含まなければ末尾に追加する。
- [x] nullable 化は property schema の再帰変換が完了した後に適用する（nested object/array の中身を先に strict 化してから、その property 自身を nullable にする）。

**Acceptance Criteria**:
- string 型 optional（例 `reason`）→ `type: ["string", "null"]`。
- boolean 型 optional（例 `approved`）→ `type: ["boolean", "null"]`。
- number 型 optional（例 `line`）→ `type: ["number", "null"]`。
- array 型 optional（例 `findings`）→ `type: ["array", "null"]` かつ `items` は strict 化済み。
- union 型 optional（例 `status` / `verdict`、`anyOf` 形式）→ `anyOf` に `{ type: "null" }` が追加されている。

## T-03: tool 結果から null を再帰除去する純関数を新設する

- [x] `src/adapter/codex/strict-schema.ts`（または同 adapter 内の適切なモジュール）に純関数 `stripNullDeep(value: unknown): unknown` を export する。
- [x] object の場合: 値が `null` の key を除去し、残る値に再帰適用した新オブジェクトを返す。
- [x] array の場合: 各要素に再帰適用した新配列を返す（findings 配列要素内の `line: null` 等を除去対象に含める）。
- [x] それ以外（プリミティブ）: そのまま返す。`undefined` は object key として通常現れないが、現れても無害に扱う。
- [x] 入力を mutate しない。

**Acceptance Criteria**:
- `stripNullDeep({ ok: true, reason: null })` が `{ ok: true }` を返す。
- `stripNullDeep({ ok: true, findings: [{ severity:"high", resolution:"fixable", file:"a.ts", title:"t", rationale:"r", line: null }] })` の findings 要素が `line` を持たない。
- ネストした array of object 内の null key も除去される。
- 入力オブジェクトが mutate されない。

## T-04: codex agent-runner に変換・正規化を結線する

- [x] `src/adapter/codex/agent-runner.ts` の `buildOutputSchema`（90-92 行）を、`toJSONSchema(object(reportTool.zodSchema))` の出力に `toOpenAIStrictSchema(...)` を適用して返すよう変更する。
- [x] `tryParseToolResult`（98-106 行）で、`JSON.parse(finalResponse)` の結果を `reportTool.parseInput(...)` に渡す前に `stripNullDeep(...)` を適用する。
- [x] 本作業 turn・resume 失敗時の fresh thread 再実行・schema 再要求 retry turn の全てが既存の単一 `outputSchema` 変数と単一 `tryParseToolResult` を共有していることを確認し、追加の結線が不要なことを担保する（design.md D5）。
- [x] `reportTool` が未設定（`outputSchema === undefined`）の場合の既存挙動を変えない。

**Acceptance Criteria**:
- `buildOutputSchema` の戻り値が strict-mode 互換（全 property required + optional nullable）になっている。
- `tryParseToolResult` が null 正規化後の入力で `parseInput` を呼ぶ。
- `reportTool` 未設定時は `outputSchema` を渡さない既存挙動が維持されている。

## T-05: 変換のテストを追加する（受け入れ基準 AC1）

- [x] `tests/adapter/codex/strict-schema.test.ts` を新規作成する（vitest）。
- [x] JUDGE_REPORT_TOOL から `toJSONSchema(object(JUDGE_REPORT_TOOL.zodSchema))` を生成 → `toOpenAIStrictSchema` を適用し、次を検証:
  - top-level `required` が `ok` / `reason` / `approved` / `findings` を全て含む。
  - `reason`/`approved`/`findings` が nullable（`type` に `"null"` を含む）。
  - findings item の `required` が severity/resolution/file/title/rationale/line を全て含む。
  - findings item の `line` が `type: ["number","null"]`。
  - findings item の severity/resolution/file/title/rationale は nullable 化されていない。
  - `additionalProperties: false` が保持されている。
- [x] PRODUCER_REPORT_TOOL（union 型 optional `status`）について、`status` が required に含まれ `anyOf` に null branch が追加されていることを検証する。
- [x] 入力 schema が mutate されていないことを検証する。

**Acceptance Criteria**:
- 上記アサーションを含むテストが green。
- 「全 property が required に含まれ、optional 相当は nullable」が JUDGE の findings 配列を含むケースで検証されている。

## T-06: null 正規化と parse の等価性テストを追加する（受け入れ基準 AC2）

- [x] `stripNullDeep` + 既存 parse 関数を組み合わせ、optional フィールドが `null` の入力が undefined の入力と同じ typed outcome に parse されることを検証する。
- [x] scalar optional ケース: `parseBaseReportInput(stripNullDeep({ ok: true, reason: null }))` が `{ ok: true }` の入力と同一の value になる。
- [x] findings の `line: null` ケース: `ok: true` + findings（うち1要素が `line: null`）を `stripNullDeep` 後に `parseJudgeReportInput` へ渡すと `{ ok: true, value: { ok: true, findings: [...] } }` となり、当該 finding が `line` を持たない（`{ ok: false, missingFields: ["findings"] }` にならない）。
- [x] 比較対象として、`line` を最初から省いた入力と同一 outcome になることを示す。

**Acceptance Criteria**:
- optional フィールドが null の tool 結果が undefined と同じ typed outcome に parse されるテストが green。
- `line: null` を含む findings が有効として parse されることが検証されている。

## T-07: Claude 側 toCustomToolSpec 不変のガードテストを追加する（受け入れ基準 AC3）

- [x] `toCustomToolSpec(JUDGE_REPORT_TOOL).input_schema.required` が `["ok"]` のみであることを検証するテストを追加する（codex 変換が Claude 側に波及していないことの回帰検知）。
- [x] optional フィールド（reason / approved / findings）が nullable 化されていない（`type` が `"null"` を含まない）ことを検証する。

**Acceptance Criteria**:
- `toCustomToolSpec` の出力が従来どおり（optional を required から除外、nullable 化なし）であることのテストが green。

## T-08: 検証（受け入れ基準 AC4）

- [x] `typecheck`（tsc）が green。
- [x] `test`（vitest）が green。新規テスト（T-05/T-06/T-07）と既存 codex / report-result テストの双方を含む。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 既存の codex agent-runner テスト・report-result テストにリグレッションがない。
