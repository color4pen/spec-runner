# Test Cases: one-shot-query-wrapper

## Summary

| ID | Category | Priority | Source |
|----|----------|----------|--------|
| TC-OSQ-01 | unit / queryOneShot | must | tasks.md T-05 |
| TC-OSQ-02 | unit / queryOneShot | must | tasks.md T-05 |
| TC-OSQ-03 | unit / queryOneShot | must | tasks.md T-05 |
| TC-OSQ-04 | unit / queryOneShot | must | tasks.md T-05 |
| TC-OSQ-05 | unit / queryOneShot | must | tasks.md T-05 |
| TC-OSQ-06 | unit / queryOneShot | should | design.md D1 |
| TC-OSQ-07 | unit / queryOneShot | should | design.md D2 |
| TC-OSQ-08 | unit / queryOneShot | should | design.md D4 |
| TC-OSQ-09 | unit / queryOneShot | could | design.md D1 |
| TC-ERR-01 | unit / errors | must | tasks.md T-03 |
| TC-RR-01 | integration / reviewer | must | tasks.md T-04 |
| TC-RR-02 | integration / reviewer | must | tasks.md T-06 |
| TC-RR-03 | integration / reviewer | should | design.md D5 |
| TC-TYPE-01 | type / interface | must | tasks.md T-01 |
| TC-TYPE-02 | type / interface | must | tasks.md T-01 |

---

## TC-OSQ-01: 正常系 — success result を QueryOneShotResult に変換

- **Category**: unit / queryOneShot
- **Priority**: must
- **Source**: tasks.md T-05, request.md 要件4

**GIVEN**:
- `queryFn` が `{ type: "result", subtype: "success", result: "hello", session_id: "sess-1" }` を yield する mock
- `opts.systemPrompt = "sys"`, `opts.prompt = "hello"` の最小 options

**WHEN**:
- `queryOneShot(opts, config, mockQueryFn)` を呼ぶ

**THEN**:
- 返却値の `result.text === "hello"`
- `result.sessionId === "sess-1"`
- `result.stopReason === "success"`
- Promise が resolve する (throw しない)

---

## TC-OSQ-02: timeout で SpecRunnerError("QUERY_ONE_SHOT_TIMEOUT") を throw

- **Category**: unit / queryOneShot
- **Priority**: must
- **Source**: tasks.md T-05, design.md D6

**GIVEN**:
- `queryFn` が AbortController.abort() で中断されるまで yield しない無限 async generator
- `opts.timeoutMs = 100`

**WHEN**:
- `queryOneShot(opts, config, mockQueryFn)` を呼ぶ

**THEN**:
- `SpecRunnerError` が throw される
- `error.code === "QUERY_ONE_SHOT_TIMEOUT"`
- AbortController が abort されている

---

## TC-OSQ-03: config 解決 — maxTurns / timeoutMs が query options に反映

- **Category**: unit / queryOneShot
- **Priority**: must
- **Source**: tasks.md T-05, design.md D2

**GIVEN**:
- `config.steps["request-review"].maxTurns = 10` を設定した SpecRunnerConfig
- `mockQueryFn` は渡された options を capture して success result を返す
- `opts.stepName = "request-review"`

**WHEN**:
- `queryOneShot(opts, config, mockQueryFn)` を呼ぶ

**THEN**:
- capture した query options に `maxTurns: 10` が含まれる
- `result.text` が正常に返る

---

## TC-OSQ-04: session_id が result に伝播

- **Category**: unit / queryOneShot
- **Priority**: must
- **Source**: tasks.md T-05, request.md 要件4 TC-OSQ-04

**GIVEN**:
- `queryFn` が `{ type: "result", subtype: "success", result: "ok", session_id: "managed-sess-42" }` を yield する mock

**WHEN**:
- `queryOneShot(opts, config, mockQueryFn)` を呼ぶ

**THEN**:
- `result.sessionId === "managed-sess-42"`

---

## TC-OSQ-05: 非 success result で SpecRunnerError("QUERY_ONE_SHOT_FAILED") を throw

- **Category**: unit / queryOneShot
- **Priority**: must
- **Source**: tasks.md T-05, design.md D6

**GIVEN**:
- `queryFn` が `{ type: "result", subtype: "error_during_execution" }` を yield する mock

**WHEN**:
- `queryOneShot(opts, config, mockQueryFn)` を呼ぶ

**THEN**:
- `SpecRunnerError` が throw される
- `error.code === "QUERY_ONE_SHOT_FAILED"`

---

## TC-OSQ-06: maxTurns が null の場合 query options に maxTurns を含めない

- **Category**: unit / queryOneShot
- **Priority**: should
- **Source**: design.md D1 ("null → omit"), tasks.md T-02 step 2

**GIVEN**:
- config の `maxTurns` が `null` (= unlimited)
- `opts.maxTurns` を渡さない
- `mockQueryFn` は渡された options を capture して success を返す

**WHEN**:
- `queryOneShot(opts, config, mockQueryFn)` を呼ぶ

**THEN**:
- capture した query options に `maxTurns` key が存在しない

---

## TC-OSQ-07: opts の maxTurns / timeoutMs が config chain の stepDefaults に入る

- **Category**: unit / queryOneShot
- **Priority**: should
- **Source**: design.md D2 (resolution chain)

**GIVEN**:
- `config.steps` に "one-shot" エントリが存在しない (= fallback to defaults)
- `opts.maxTurns = 5`, `opts.timeoutMs = 60_000` を指定
- `mockQueryFn` は options を capture して success を返す

**WHEN**:
- `queryOneShot(opts, config, mockQueryFn)` を呼ぶ

**THEN**:
- capture した query options に `maxTurns: 5` が含まれる
- timeout は 60_000 ms の setTimeout が設定される (mock timer で確認)

---

## TC-OSQ-08: queryFn を省略した場合 SDK の query がデフォルト使用される

- **Category**: unit / queryOneShot
- **Priority**: should
- **Source**: design.md D4 (DI for test)

**GIVEN**:
- `queryFn` パラメータを渡さない
- SDK の `query` をモジュールレベルで mock している

**WHEN**:
- `queryOneShot(opts, config)` を呼ぶ (3 引数目省略)

**THEN**:
- SDK の `query` mock が呼ばれる

---

## TC-OSQ-09: finally で clearTimeout が必ず実行される

- **Category**: unit / queryOneShot
- **Priority**: could
- **Source**: tasks.md T-02 step 6 ("finally で clearTimeout")

**GIVEN**:
- `mockQueryFn` が success result を yield する
- `opts.timeoutMs = 10_000`
- fake timer を使用

**WHEN**:
- `queryOneShot(opts, config, mockQueryFn)` が resolve した後

**THEN**:
- setTimeout の timer がクリアされている (pending timer が残らない)

---

## TC-ERR-01: ERROR_CODES に QUERY_ONE_SHOT_FAILED / QUERY_ONE_SHOT_TIMEOUT が存在する

- **Category**: unit / errors
- **Priority**: must
- **Source**: tasks.md T-03

**GIVEN**:
- `src/errors.ts` の `ERROR_CODES` オブジェクトを import する

**WHEN**:
- `ERROR_CODES.QUERY_ONE_SHOT_FAILED` および `ERROR_CODES.QUERY_ONE_SHOT_TIMEOUT` を参照する

**THEN**:
- `ERROR_CODES.QUERY_ONE_SHOT_FAILED === "QUERY_ONE_SHOT_FAILED"`
- `ERROR_CODES.QUERY_ONE_SHOT_TIMEOUT === "QUERY_ONE_SHOT_TIMEOUT"`

---

## TC-RR-01: reviewer.ts — queryOneShot 経由に置き換えても振る舞いが同等

- **Category**: integration / reviewer
- **Priority**: must
- **Source**: tasks.md T-04, request.md 受け入れ基準

**GIVEN**:
- 既存の `tests/unit/command/request-review.test.ts` (TC-RR-001 〜 TC-RR-010)
- `executeReview()` が `queryOneShot` 経由に置き換え済み

**WHEN**:
- `bun test tests/unit/command/request-review.test.ts` を実行する

**THEN**:
- 全テストが green (regression なし)

---

## TC-RR-02: reviewer.ts — boilerplate (AbortController / for await / config 解決) が削除されている

- **Category**: integration / reviewer
- **Priority**: must
- **Source**: tasks.md T-04, design.md D5

**GIVEN**:
- `src/core/request/reviewer.ts` を静的検査する

**WHEN**:
- `getStepExecutionConfig`, `AbortController`, `for await` の使用箇所を確認する

**THEN**:
- `reviewer.ts` 内に `getStepExecutionConfig` の直接 import/呼び出しが存在しない
- `reviewer.ts` 内に `new AbortController()` が存在しない
- `reviewer.ts` 内に `for await` による query loop が存在しない

---

## TC-RR-03: reviewer.ts — review 固有ロジック (prompt 構成 / findings parse) は残る

- **Category**: integration / reviewer
- **Priority**: should
- **Source**: design.md D5, tasks.md T-04

**GIVEN**:
- `src/core/request/reviewer.ts` を確認する

**WHEN**:
- `buildInitialMessage` と `parseReviewOutput` の呼び出し箇所を確認する

**THEN**:
- `buildInitialMessage()` の呼び出しが `reviewer.ts` 内に残っている
- `parseReviewOutput()` の呼び出しが `reviewer.ts` 内に残っている
- `queryOneShot` の返却値 `result.text` が `parseReviewOutput` に渡される

---

## TC-TYPE-01: QueryOneShotOptions の必須/optional フィールドが正しい

- **Category**: type / interface
- **Priority**: must
- **Source**: tasks.md T-01, request.md 受け入れ基準

**GIVEN**:
- `src/adapter/claude-code/query-one-shot.ts` の `QueryOneShotOptions` 型

**WHEN**:
- TypeScript コンパイラで型チェックする

**THEN**:
- `systemPrompt: string` — 必須
- `prompt: string` — 必須
- `allowedTools?: string[]` — optional
- `maxTurns?: number` — optional
- `timeoutMs?: number` — optional
- `cwd?: string` — optional
- `stepName?: string` — optional
- `model?: string` — optional
- `systemPrompt` または `prompt` を省いた場合に型エラーになる

---

## TC-TYPE-02: QueryOneShotResult の必須/optional フィールドが正しい

- **Category**: type / interface
- **Priority**: must
- **Source**: tasks.md T-01, request.md 受け入れ基準

**GIVEN**:
- `src/adapter/claude-code/query-one-shot.ts` の `QueryOneShotResult` 型

**WHEN**:
- TypeScript コンパイラで型チェックする

**THEN**:
- `text: string` — 必須
- `sessionId?: string` — optional
- `turnCount?: number` — optional
- `stopReason?: string` — optional
- `text` を持たないオブジェクトへの代入は型エラーになる
