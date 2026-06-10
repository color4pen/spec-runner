# Design: codex adapter の outputSchema を OpenAI strict mode 互換に変換する

## Context

codex adapter（`src/adapter/codex/agent-runner.ts`）は、`reportTool` が設定された step の本作業 turn で
`buildOutputSchema(reportTool)` を `thread.run()` の `outputSchema` に渡す。現状の `buildOutputSchema` は
`toJSONSchema(object(reportTool.zodSchema))`（report-tool.ts の `toCustomToolSpec` と同一変換）の結果を
そのまま渡している。

この変換結果は zod の標準流儀に従い、optional フィールドを `required` から除外する。実測した JSON Schema は次の形:

- top-level `required: ["ok"]` のみ（`reason` / `approved` / `findings` など optional は含まれない）
- nested findings item では `required: [severity, resolution, file, title, rationale]`（`line` は含まれない）

一方 OpenAI の structured output（strict mode）は **全 property を `required` に列挙**することを要求し、
optional は「型を null との union にする」流儀で表現する。両者が非互換なため、OpenAI API は
report_result の outputSchema を `invalid_json_schema` で拒否し、codex step が即時エラーになる
（実測メッセージ: `'required' is required to be supplied and to be an array including every key in properties. Missing 'reason'.`）。

Claude 側の tool `input_schema` は optional を required から外した形をそのまま受けるため、この差は
codex adapter でのみ顕在化する。

加えて parse 側（`src/core/port/report-result.ts`）は手書きの typeof チェックで、optional フィールドが
`null` で返ってきても多くは undefined と同様に無視する。ただし `parseFindings` の `line` 判定のみ
`"line" in f && f["line"] !== undefined && typeof f["line"] !== "number"` という条件のため、
**`line: null` だと findings 配列全体が不正と判定される**（実測確認済み: `line: null` → `{ ok: false }` /
`line: undefined` → `{ ok: true }`）。strict schema 化で全フィールドが nullable になると、codex が
optional findings の `line` を `null` で返したときにこの差が顕在化する。

設計判断（architect 評価済み）: **provider 固有のスキーマ方言は adapter 内で吸収する**（B-2 と同方向。
SDK / provider の都合を port の外に漏らさない）。したがって変換も null 正規化も codex adapter 内に閉じ、
port の `ReportToolSpec.zodSchema` と Claude 側 `toCustomToolSpec` は一切変更しない。

## Goals / Non-Goals

**Goals**:

- codex adapter が `thread.run()` に渡す outputSchema を OpenAI strict mode 互換に変換する。
  - 各 object node について全 property を `required` に列挙する。
  - 元々 optional だった property の型を nullable（`type: [..., "null"]` または `anyOf` に `{ type: "null" }` 追加）にする。
  - nested object（findings 配列の要素）にも再帰適用する。
- codex 経由で optional フィールドが `null` で返った tool 結果を、undefined と同じ typed outcome に parse できるようにする
  （`line: null` を含む findings ケースで顕在化するため、adapter 側で null を正規化してから既存 parse に渡す）。
- 変換・正規化を codex adapter 内に閉じ、port と Claude 側変換を不変に保つ。

**Non-Goals**:

- Claude / managed adapter の schema 変換（変更しない）。
- report_result スキーマ自体（`zodSchema` / 各 `*_REPORT_TOOL` の shape）の変更。
- `src/core/port/report-result.ts` の parse 関数のシグネチャ・挙動の変更（adapter 側で正規化することで port を不変に保つ）。
- codex で使用するモデルの選定・config。

## Decisions

### D1: 変換ロジックを codex adapter 内の専用モジュールに新設する

`src/adapter/codex/strict-schema.ts`（新規）に純関数 `toOpenAIStrictSchema(schema: object): object` を実装し、
`agent-runner.ts` の `buildOutputSchema` がこれを `toJSONSchema(...)` の出力に適用する。

- **Rationale**: provider 固有のスキーマ方言は adapter 内で吸収する（architect 評価済み）。`toCustomToolSpec` や
  `zodSchema` を触らずに codex だけ別表現を得るには、変換を codex adapter に局在させるのが唯一スコープに収まる選択。
  純関数として切り出すことで単体テスト（受け入れ基準 AC1）が容易になる。
- **Alternatives considered**:
  - port の `zodSchema` を strict 互換に書き換える → Claude / managed の input_schema も変わり、スコープ外かつ
    受け入れ基準「toCustomToolSpec が変更されていない」に違反。却下。
  - `toCustomToolSpec` を分岐させ codex 用に別 schema を返す → core/step に provider 知識が漏れる（B-2 違反）。却下。
  - 変換ロジックを `agent-runner.ts` 内のローカル関数に直書き → テスト容易性が下がり、責務が肥大化。専用モジュールに分離する。

### D2: object node を再帰的に走査し「全 property required + optional は nullable」へ変換する

`toOpenAIStrictSchema` は JSON Schema を再帰的に走査する純関数とする（入力を破壊しないようクローンして返す）:

- `type === "object"` かつ `properties` を持つ node:
  1. 元の `required`（無ければ空配列）を `originalRequired` として記録。
  2. 各 property schema を**先に再帰変換**する。
  3. `originalRequired` に含まれない property（= optional だったもの）を nullable 化する。
  4. `required` を `properties` の全 key に設定する。`additionalProperties: false` は保持。
- `type === "array"` かつ `items` を持つ node: `items` に再帰適用。
- `anyOf` を持つ node: 各要素に再帰適用。

これにより top-level（`ok` のみ required → 全 key required）と findings item（`line` を含む全 key required）の双方に適用される。

- **Rationale**: OpenAI strict mode は「全階層の object で全 property を required にする」ことを要求するため、
  top-level だけでなく nested object の再帰処理が必須（findings item の `line` が代表ケース）。
- **Alternatives considered**:
  - top-level のみ変換 → findings item が strict 非互換のまま残り、JUDGE / CODE_REVIEW / REQUEST_REVIEW で再び拒否される。却下。
  - 入力を in-place mutate → `toJSONSchema` の出力は毎回新規生成なので実害は小さいが、純関数（クローン）の方が
    テスト・将来の再利用で安全。クローン方式を採る。

### D3: nullable 表現を「scalar は type 配列に "null" 追加 / union は anyOf に null branch 追加」とする

optional property を nullable 化する規則:

- property schema が `anyOf` を持つ（zod の `union(...)` 由来。例: PRODUCER の `status`, REQUEST_REVIEW の `verdict`）
  → `anyOf` 配列に `{ type: "null" }` を追加する。
- property schema が `type`（string）を持つ（例: `reason` string, `approved` boolean, `findings` array, `line` number）
  → `type` を `[元の type, "null"]` の配列にする。
- property schema の `type` が既に配列 → `"null"` を含まなければ追加する。

- **Rationale**: OpenAI strict mode が公式に案内する「optional は null との union で表現する」流儀に一致。
  scalar は `type: [..., "null"]`、合併型は `anyOf` への null branch 追加が自然で、zod が生成する 2 形態
  （`type` 直書き / `anyOf`）を網羅できる。
- **Alternatives considered**:
  - 全 property を一律 `anyOf: [<orig>, { type: "null" }]` でラップ → 動作はするが schema が冗長になり、
    元 schema との差分が読みにくい。最小変形を選ぶ。
  - `nullable: true`（OpenAPI 流儀）→ JSON Schema 2020-12 / OpenAI strict mode では非対応。却下。

### D4: tool 結果は adapter 側で null を再帰除去してから既存 parse に渡す

`agent-runner.ts` の `tryParseToolResult` で、`JSON.parse` 結果を `reportTool.parseInput` に渡す**前に**、
null 値の key を再帰的に除去する純関数 `stripNullDeep(value: unknown): unknown` を新設し適用する
（findings 配列要素内の `line: null` まで除去対象に含める）。

- **Rationale**: strict schema 化により codex は optional 欠落を `null` で返す。既存 parse の typeof チェックは
  scalar optional の `null` を概ね undefined と同等に扱うが、`parseFindings` の `line` 判定のみ `null` を不正値として
  弾く（実測確認済み）。adapter で null を undefined（= 欠落）に正規化すれば、port の parse を一切変えずに
  「null === undefined」の等価性を構造的に保証できる。schema 生成と結果正規化を adapter 内で対称に閉じる形となり、
  architect 評価済みの「provider 方言を adapter で吸収」と整合する。
- **Alternatives considered**:
  - 既存 typeof チェックに依存し正規化しない → `line: null` で findings 配列全体が `{ ok: false }` になり、
    無用な follow-up retry を誘発。受け入れ基準「null が undefined と同じ outcome」を満たせない。却下。
  - `parseFindings` / `parseBaseReportInput` を null 許容に修正 → port 変更。全 adapter に影響しスコープ外、
    Non-Goal に反する。却下。
  - schema 側で findings の `line` だけ nullable から除外 → strict mode は全 property required を要求するため不可。却下。

### D5: 変換・正規化の適用点を本作業 turn と retry turn の双方に効かせる

`buildOutputSchema`（D1/D2/D3 適用後）の戻り値は、既に `agent-runner.ts` の本作業 turn・resume 失敗時の
fresh thread 再実行・schema 再要求 retry turn の全箇所で同一変数 `outputSchema` として使い回されている。
`tryParseToolResult`（D4 適用後）も本作業 turn と retry turn の双方で呼ばれている。よって D1〜D4 の適用は
`buildOutputSchema` / `tryParseToolResult` の改修だけで全 turn に波及し、追加の呼び出し箇所変更は不要。

- **Rationale**: 既存コードが単一の `outputSchema` 変数と単一の `tryParseToolResult` を共有しているため、
  変更点を 2 関数に集約でき、リグレッション面が最小化される。
- **Alternatives considered**: turn ごとに個別変換 → 重複と適用漏れリスク。集約を選ぶ。

## Risks / Trade-offs

- [Risk] `toOpenAIStrictSchema` の再帰が `toJSONSchema` の出力に現れうる他構造（`$ref` / `allOf` / `oneOf` /
  `enum` 単独 / プリミティブ配列）を取りこぼし、変換不足で strict 拒否が残る。
  → Mitigation: 対象は report_result 系の固定 schema（object / array / anyOf / scalar の組み合わせ）に限定される。
  現行の `*_REPORT_TOOL` 全 spec が生成する JSON Schema を unit test の入力に使い、全 spec で
  「全 property required + optional nullable」を検証する。未対応構造が現れたら fail で検知できる。
- [Risk] null 再帰除去が、本来 `null` を有効値として持つフィールドまで消す。
  → Mitigation: report_result schema に「null が有効値」のフィールドは存在しない（全 optional は欠落 = undefined 意味論）。
  strict schema 化で付与した nullable は「欠落の代替表現」であり、null === 欠落として除去するのが正しい。
- [Risk] schema 変換が Claude 側 `toCustomToolSpec` に波及していないことの担保。
  → Mitigation: 受け入れ基準 AC3 として `toCustomToolSpec(JUDGE_REPORT_TOOL).input_schema.required` が従来どおり
  `["ok"]` のままであることを test で固定し、codex 変換の漏れを検知する。

## Open Questions

なし。要件・受け入れ基準・現状コードの挙動（`line: null` の parse 差を含む）はすべて実測で確認済み。
