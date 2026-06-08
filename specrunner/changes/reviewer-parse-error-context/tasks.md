# Tasks: request-review parse 失敗時の診断コンテキスト保持

## T-01: reviewer.ts の fallback パスに診断コンテキスト保持を実装する

- [x] `src/core/request/reviewer.ts` 冒頭に `import { stderrWrite, maskSensitive } from "../../logger/stdout.js";` を追加する
- [x] モジュールスコープに定数 `const RAW_OUTPUT_TRUNCATE_LIMIT = 500;` を定義する
- [x] ヘルパ `truncateRawOutput(text: string): string` を追加する。`text.length <= RAW_OUTPUT_TRUNCATE_LIMIT` ならそのまま返し、超過時は先頭 `RAW_OUTPUT_TRUNCATE_LIMIT` 文字 + ` [truncated, ${text.length} total chars]` を返す
- [x] ヘルパ `buildParseFailureResult(rawOutput: string, parseError?: string): RequestReviewResult` を追加する。
  - `description` を組み立てる: base 文 `"Could not parse structured output from reviewer."` + （`parseError` があれば）` Parse error: ${parseError}.` + ` Raw output (first ${RAW_OUTPUT_TRUNCATE_LIMIT} chars): ${maskSensitive(truncateRawOutput(rawOutput))}` を連結する
  - 戻り値は `verdict: "needs-discussion"`、`findings: [{ number: 1, severity: "HIGH", category: "parse-error", description }]`、`summary: PARSE_FAILURE_SUMMARY` とする
  - 関数内で `stderrWrite` を呼び、`parseError`（あれば）と `truncateRawOutput(rawOutput)` を含む warning を 1 行出力する
- [x] `parseReviewOutput` 内に `let parseError: string | undefined;` を宣言する
- [x] `reviewer.ts:85` の `catch {` を `catch (err) {` に変え、本文を `parseError = (err as Error).message;` にして fall through させる（握り潰しをやめる）
- [x] 末尾の inline fallback `return { verdict: "needs-discussion", ... }` を `return buildParseFailureResult(text, parseError);` に置換する（block 不在 / verdict 不正 / parse throw の全失敗経路がこの 1 行に集約される）
- [x] 成功時の戻り値・正規表現・`verdict` 判定・findings マッピングは一切変更しないこと
- [x] `summary` は `PARSE_FAILURE_SUMMARY` のまま不変とすること

**Acceptance Criteria**:
- `catch` が parse error を握り潰さず、`description` と stderr に残す
- parse 失敗時の finding `description` に raw output 先頭が含まれ、`JSON.parse` throw 時は parse error message も含まれる
- parse 成功時の戻り値・挙動が変わらない（成功パスに stderr 副作用がない）
- 変更は `src/core/request/reviewer.ts` のみ（他 `src/` ファイルに差分なし）

## T-02: reviewer.test.ts に診断テストを追加する

- [x] `tests/unit/core/request/reviewer.test.ts` のインポートに `beforeEach`, `afterEach` を追加する（既存 `vi` は利用）
- [x] describe スコープに `let stderrSpy: ReturnType<typeof vi.spyOn>;` を用意し、`beforeEach` で `stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);`、`afterEach` で `vi.restoreAllMocks();` を行い、既存 fallback テストの stderr ノイズを抑止しつつ assert に使えるようにする
- [x] TC-RVR-021: malformed JSON（例 `` ```json\n{ verdict: approve }\n``` ``）→ `description` が `"Parse error"` を含み、かつ raw output 内の識別可能な substring（例 `"verdict: approve"`）を含むことを assert する
- [x] TC-RVR-022: parse 失敗（malformed JSON）→ `stderrSpy` が raw output の substring を含む引数で呼ばれたことを `expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(...))` で assert する
- [x] TC-RVR-023: 600 文字程度の raw output（500 文字目以降に `"SENTINEL_TAIL"` を埋め込み、全体を ```` ```json ```` ブロックで囲んで malformed にする）→ `description` が先頭部分を含み、`"SENTINEL_TAIL"` を含まず、truncation indicator（`"truncated"`）を含むことを assert する
- [x] TC-RVR-024: valid JSON（`verdict: "approve"` 等）→ 構造化結果（`verdict` / `findings` / `summary`）が返り、かつ `expect(stderrSpy).not.toHaveBeenCalled()`（成功時は parse 失敗 warning なし）を assert する
- [x] TC-RVR-025: 空文字列入力 → category `"parse-error"` の finding が返り、`description` が raw output セクション（`"Raw output"`）を含むことを assert する
- [x] 各テスト冒頭のコメントヘッダ（`// TC-RVR-0NN: ...`）を既存ファイルの記法に合わせて追加する

**Acceptance Criteria**:
- 追加した TC-RVR-021〜025 が green
- 既存 TC-RVR-001〜020 が green のまま（summary 関連 assert を壊さない）
- テスト実行時に parse 失敗 warning の stderr 出力が spy で抑止されている

## T-03: 品質ゲートを green にする

- [x] `bun run typecheck` が pass する（`parseError` の型・ヘルパのシグネチャに型エラーがない）
- [x] `bun run test` が pass する（新規 + 既存すべて green）
- [x] `bun run lint` が pass する（`eslint ./src ./tests --max-warnings 0`、warning 0）

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- `bun run lint` が green
- 変更は `src/core/request/reviewer.ts` と `tests/unit/core/request/reviewer.test.ts` の 2 ファイルのみ
