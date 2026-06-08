# Spec: request-review parse 失敗時の診断コンテキスト保持

## Requirements

### Requirement: parse 失敗時に finding description へ診断コンテキストを含める

`parseReviewOutput` が structured output を抽出できなかった場合、fallback finding（category `parse-error`）の `description` に LLM raw output の先頭部分を含めなければならない (MUST)。`JSON.parse` が throw したケースでは、その parse error message も `description` に含めなければならない (MUST)。

#### Scenario: 壊れた JSON で parse error message と raw output が残る

**Given** reviewer の出力が ```` ```json ```` フェンス内に malformed JSON を含む
**When** `parseReviewOutput` が呼ばれる
**Then** 戻り値の `verdict` は `"needs-discussion"` である
**And** `findings` に category `"parse-error"` の finding が存在する
**And** その finding の `description` に `JSON.parse` が投げた error message が含まれる
**And** その finding の `description` に raw output の先頭部分が含まれる

#### Scenario: 空文字列でも raw output セクションが残り区別可能になる

**Given** reviewer の出力が空文字列である
**When** `parseReviewOutput` が呼ばれる
**Then** category `"parse-error"` の finding が返る
**And** その `description` は raw output セクションを含む（出力が空であったことが読み取れる）

### Requirement: raw output は 500 文字に truncate する

finding `description` および stderr warning に載せる raw output は、先頭 500 文字に truncate しなければならない (MUST)。500 文字を超える場合は truncate されたことを示す indicator を付さなければならない (MUST)。

#### Scenario: 500 文字超の output が truncate される

**Given** reviewer の raw output が 500 文字を超え、500 文字目以降に識別可能な sentinel 文字列を含む
**When** `parseReviewOutput` が呼ばれる
**Then** finding の `description` は raw output の先頭部分を含む
**And** finding の `description` は 500 文字目以降の sentinel 文字列を含まない
**And** finding の `description` は truncate されたことを示す indicator を含む

### Requirement: parse 失敗時に stderr へ warning を出力する

parse 失敗時、reviewer は `stderrWrite` 経由で raw output（truncate 済）を含む warning を stderr に出力しなければならない (MUST)。

#### Scenario: parse 失敗で stderr に warning が出る

**Given** reviewer の出力が parse 不能である
**When** `parseReviewOutput` が呼ばれる
**Then** `process.stderr` に warning が出力される
**And** その warning は raw output の先頭部分を含む

### Requirement: parse 成功時の挙動は不変

valid な structured output（許可された `verdict` を持つ JSON ブロック）を parse できた場合、戻り値は従来どおりとし、parse 失敗 warning を stderr に出力してはならない (MUST NOT)。

#### Scenario: 正常 parse では warning なしで構造化結果を返す

**Given** reviewer の出力が valid な `verdict` 付き JSON ブロックを含む
**When** `parseReviewOutput` が呼ばれる
**Then** 戻り値は抽出された `verdict` / `findings` / `summary` を持つ
**And** `process.stderr` に parse 失敗 warning は出力されない
