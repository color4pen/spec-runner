# Design: request-review parse 失敗時の診断コンテキスト保持

## Context

`src/core/request/reviewer.ts` の `parseReviewOutput(text)` は、reviewer agent の出力から最後の ```` ```json ```` ブロックを正規表現で抽出し `JSON.parse` する純関数である。

現状、失敗は 3 つのモードに分かれるが、すべて末尾の単一 fallback return（`verdict: "needs-discussion"` + 固定 finding `"Could not parse structured output from reviewer"` + 固定 summary `PARSE_FAILURE_SUMMARY`）に集約される。

- **block 不在**: 正規表現が ```` ```json ```` ブロックを見つけられず `lastMatch === null`。
- **JSON.parse throw**（`reviewer.ts:85` の `catch`）: ブロックはあるが本文が壊れた JSON。`catch` が error を握り潰し、error message も raw output も残らない。
- **verdict 不正/欠落**: valid な JSON だが `verdict` フィールドが無い、または許可値（approve / needs-discussion / reject）でない。

この結果、LLM が壊れた JSON を返したのか、verdict 欠落の valid JSON だったのか、そもそも空文字列だったのかを事後に区別できず、デバッグ情報が消えている。

production では `parseReviewOutput` は `runReview`（`reviewer.ts:217`）から 1 回だけ呼ばれる。戻り値は `specrunner request review` の出力（change folder の review 成果物 / pipeline log）に流れる。stderr への出力経路は既存 `src/logger/stdout.ts` の `stderrWrite`（`maskSensitive` 適用 + 改行付与）が標準である。

## Goals / Non-Goals

**Goals**:

- fallback finding の `description` に LLM raw output の先頭 500 文字を含め、`JSON.parse` が throw したケースでは parse error message も含める。
- parse 失敗時に `stderrWrite` で warning を stderr に出力し、pipeline log に残るようにする。
- 3 つの失敗モードを事後に区別可能にする。
- parse 成功時の戻り値・挙動を不変に保つ。
- 既存テストを green に保ちつつ、新規テストを追加する。

**Non-Goals**:

- structured output schema / parse 判定ロジックの変更（正規表現・`verdict` 判定・成功時マッピングは不変）。
- reviewer 以外の step の parse 失敗対応。
- 新規 logger の追加（既存 `stderrWrite` を使う）。
- `summary`（`PARSE_FAILURE_SUMMARY` 定数）の意味・文言変更。

## Decisions

### D1: 失敗診断は fallback パス全体に適用し、parse error message は catch で捕捉する

末尾の inline fallback return を `buildParseFailureResult(rawOutput, parseError?)` ヘルパに切り出す。`catch (err)` で `(err as Error).message` を `parseError` に捕捉し、fall through 後に同ヘルパへ渡す。block 不在 / verdict 不正の経路は `parseError` 未指定で同ヘルパを呼ぶ。`description` は base 文 + （`parseError` があれば）`Parse error: <msg>` + `Raw output (first 500 chars): <snippet>` を連結する。

- Rationale: 背景が要求する「壊れた JSON / verdict 欠落 / 空文字列」の区別は、`parseError` の有無と raw snippet の中身の組み合わせで達成できる。raw output は全失敗経路で有用なため catch ケースに限定しない。`verdict` は全ケースで `needs-discussion` のまま（判定は不変）であり、スコープ外の parse ロジック変更には当たらない。
- Alternatives considered: catch ケースだけ enrich する案。空文字列ケースが従来どおり区別不能で背景の要件を満たさないため不採用。

### D2: raw output truncate は 500 文字。超過時のみ truncation indicator を付す

`RAW_OUTPUT_TRUNCATE_LIMIT = 500` 定数を定義する。`truncateRawOutput(text)` は 500 文字以下ならそのまま返し、超過時は先頭 500 文字 + `[truncated, <元の length> total chars]` を返す。

- Rationale: architect 確定値。500 文字あれば JSON の壊れ方の手掛かりには十分で、巨大な LLM output を丸ごと finding に入れて change folder 成果物が読みにくくなるのを防ぐ。元の総文字数を残すと truncate の有無を判別できる。
- Alternatives considered: (a) 無制限 → 成果物肥大。(b) 固定長で indicator なし → truncate されたか不明。

### D3: stderr warning は buildParseFailureResult 内で stderrWrite で出す

parse 失敗時の stderr 出力は `buildParseFailureResult` 内で `stderrWrite` を呼んで行う。warning には raw output（truncate 済）を含め、`parseError` があればそれも含める。

- Rationale: parse error message を手元に持つのはこのヘルパだけである。production の呼び出し元は `runReview` の 1 経路のみで二重出力しない。`stderrWrite` は `maskSensitive` 適用済みで、stderr に出るため pipeline log（stderr capture）に乗る。architect 指示どおり新規 logger は不要。
- Alternatives considered: `runReview` 側で stderr を出す案。parse error message を `runReview` から取得できず（`description` からの逆抽出は不健全）、失敗判定の再実装も必要になるため不採用。

### D4: 純関数性の喪失を許容し、stderr 副作用を parseReviewOutput の失敗パスに閉じ込める

`parseReviewOutput` は従来 I/O を持たない純関数だったが、本変更で fallback パスのみ stderr 副作用を持つ。

- Rationale: 副作用は失敗パスに限定され、成功パスは依然 I/O フリー。production 呼び出しは 1 回のみ。テストは `process.stderr.write` の spy で副作用を吸収・検証できる（既存 `pr-status.test.ts` の stderr 抑止パターンと同形）。parse(pure) と warn(side-effect) を完全分離すると `runReview` への parse error 受け渡し口が必要になり interface 変更が波及するため、最小差分方針上この閉じ込めを選ぶ。
- Alternatives considered: parse と warn を別関数に分離し `runReview` で warn する案。interface 波及が大きく不採用（Risks 参照）。

### D5: finding description の raw snippet にも maskSensitive を適用する

stderr 経路は `stderrWrite` が masking するが、finding `description`（ファイル成果物）に載せる raw snippet にも `maskSensitive` を適用する。

- Rationale: logger 全体が機微値を masking する project 規律に揃える。raw LLM output に token が混入する可能性は低いが、change folder 成果物は commit され得るため defensive に masking する。
- Alternatives considered: description を無 masking とする案。規律不整合かつ成果物への token 漏れ余地があるため不採用。

### D6: summary は PARSE_FAILURE_SUMMARY を維持する

診断情報は finding `description` に集約し、`summary`（`PARSE_FAILURE_SUMMARY` 定数）は変えない。

- Rationale: 既存テスト（TC-RVR-002 / 019 / 020）が `summary === PARSE_FAILURE_SUMMARY` かつ raw input を echo しないことを assert している。`summary` は「未確定 verdict、再実行を促す」固定メッセージとしての役割を保つべきである。
- Alternatives considered: `summary` に raw output を入れる案。既存テストを破壊し、`summary` の役割を逸脱するため不採用。

## Risks / Trade-offs

- [Risk] `parseReviewOutput` が純関数でなくなり、将来別経路から多重呼び出しすると stderr が重複する → Mitigation: production の呼び出し元は `runReview` の 1 経路のみであることを確認済み。将来 caller が増える場合は warn 経路を `runReview` 側へ集約する余地を残す（D3/D4 で接点を最小化）。
- [Risk] 既存 fallback テスト（TC-RVR-002 等）が stderr にノイズを出すようになる → Mitigation: テストで `process.stderr.write` を spy + restore（`pr-status.test.ts` の抑止パターン）し CI ログを汚さない。
- [Risk] raw output に token 等の機微情報が含まれる → Mitigation: stderr は `stderrWrite` が、description は `maskSensitive` がそれぞれ masking する。
- [Risk] truncate により壊れた JSON の核心が 500 文字以降にあると手掛かりが不足する → Mitigation: 元の総文字数を indicator に残し、必要時は verbose log で追跡可能。architect 確定の許容トレードオフ。

## Open Questions

なし。
