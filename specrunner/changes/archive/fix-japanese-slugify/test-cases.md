# Test Cases: fix-japanese-slugify

Generated from: request.md, design.md, tasks.md

## TC-SL-007: 日本語混在 description から ASCII 部分で意味のある slug を生成する

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md §2.1 / request.md 受け入れ基準

**GIVEN** description が `"pipeline完了時にPR URLをstdoutに表示する"` である  
**WHEN** `slugify()` を呼び出す  
**THEN** `"pipeline-pr-url-stdout"` を返す

> 連続 non-ASCII をスペースに置換することで、`pipeline`・`PR URL`・`stdout` が独立したトークンとして kebab-case に変換される。

---

## TC-SL-008: 日本語混在入力で slug が 50 文字以下になる

- **Category**: correctness / boundary
- **Priority**: must
- **Source**: tasks.md §2.1 / request.md 要件 3

**GIVEN** description が `"very-long" + "日本語".repeat(10) + "description-that-is-long-enough-to-exceed-limit"` である  
**WHEN** `slugify()` を呼び出す  
**THEN** 返り値の length が 50 以下である

---

## TC-SL-REG-001: ASCII のみの description（既存動作の維持）

- **Category**: regression
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md §2.2

**GIVEN** description が `"add user authentication"` である  
**WHEN** `slugify()` を呼び出す  
**THEN** `"add-user-authentication"` を返す

---

## TC-SL-REG-002a: 日本語 + 末尾英語の description（既存動作の維持）

- **Category**: regression
- **Priority**: must
- **Source**: tasks.md §2.2（TC-SL-002 回帰確認）

**GIVEN** description が `"新しい機能を追加する add feature"` である  
**WHEN** `slugify()` を呼び出す  
**THEN** `"add-feature"` を返す

---

## TC-SL-REG-002b: 日本語のみの description は untitled（既存動作の維持）

- **Category**: regression
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md §2.2（TC-SL-002, TC-SL-005c 回帰確認）

**GIVEN** description が `"日本語のみの説明"` である  
**WHEN** `slugify()` を呼び出す  
**THEN** `"untitled"` を返す

---

## TC-SL-REG-002c: 先頭英語 + 末尾日本語の description（既存動作の維持）

- **Category**: regression
- **Priority**: must
- **Source**: tasks.md §2.2（TC-SL-002 回帰確認）

**GIVEN** description が `"request-create コマンドを実装する"` である  
**WHEN** `slugify()` を呼び出す  
**THEN** `"request-create"` を返す

---

## TC-SL-009: 日本語が ASCII トークン間の単語境界として機能する

- **Category**: correctness
- **Priority**: must
- **Source**: design.md Decision D1

**GIVEN** description が `"foo日本語bar"` である（日本語が ASCII トークンを隣接させている）  
**WHEN** `slugify()` を呼び出す  
**THEN** `"foo-bar"` を返す（`"foobar"` や `"foo"` ではなく、ハイフンで区切られる）

---

## TC-SL-010: 日本語のみ → untitled（空文字フォールバック）

- **Category**: correctness
- **Priority**: should
- **Source**: design.md Risks / request.md 要件 2

**GIVEN** description が `"あいうえお"` のような ASCII 英数字を含まない日本語のみである  
**WHEN** `slugify()` を呼び出す  
**THEN** `"untitled"` を返す

---

## TC-SL-011: non-ASCII 1 文字を挟んだ ASCII が 3 文字未満の場合

- **Category**: correctness / boundary
- **Priority**: should
- **Source**: design.md Risks（"Non-ASCII 文字間に 1 文字だけ ASCII がある場合"）

**GIVEN** description が `"日本a語"` である（non-ASCII に囲まれた 1 文字の ASCII）  
**WHEN** `slugify()` を呼び出す  
**THEN** `"a"` を返す（`"untitled"` ではなく 1 文字の slug になる）

> これは仕様上許容される挙動（design.md 明記）。slug 未指定時のフォールバックとして実用上問題なし。

---

## TC-SL-012: 連続する日本語ブロックが複数ある場合は 1 つのハイフンに折りたたまれる

- **Category**: correctness
- **Priority**: should
- **Source**: design.md Decision D1（連続 non-ASCII を 1 スペースに置換）

**GIVEN** description が `"start日本語middle漢字end"` である  
**WHEN** `slugify()` を呼び出す  
**THEN** `"start-middle-end"` を返す（各 non-ASCII ブロックが 1 ハイフンになる）

---

## TC-SL-013: 日本語混在で truncation 後に trailing hyphen が付かない

- **Category**: boundary
- **Priority**: should
- **Source**: tasks.md §2.1（TC-SL-008）/ slugify.ts truncation ロジック

**GIVEN** ASCII トークンと日本語が混在する 50 文字超の description である  
**WHEN** `slugify()` を呼び出す  
**THEN** 返り値が `-` で終わらない、かつ length ≤ 50 である

---

## TC-SL-014: 空文字 description は untitled（回帰）

- **Category**: regression
- **Priority**: must
- **Source**: tasks.md §2.2（TC-SL-005 回帰確認）

**GIVEN** description が `""` （空文字）である  
**WHEN** `slugify()` を呼び出す  
**THEN** `"untitled"` を返す

---

## TC-SL-015: カスタム maxLength が日本語混在入力に対しても機能する

- **Category**: boundary
- **Priority**: could
- **Source**: tasks.md §2.1（TC-SL-008 拡張）

**GIVEN** description が `"hello日本語world"` で maxLength = 5 を指定する  
**WHEN** `slugify("hello日本語world", 5)` を呼び出す  
**THEN** 返り値の length ≤ 5、かつ `"-"` で終わらない
