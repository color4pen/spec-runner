# Test Cases: PrCreateStep の state 直接ミューテーション解消

## 対象ファイル

- `src/core/step/types.ts`
- `src/core/step/pr-create.ts`
- `src/core/step/executor.ts`
- `tests/unit/step/pr-create.test.ts`

---

## Group 1: PrCreateStep.run() — state 不変性

### TC-013 (must) — run() が created 状態で state.pullRequest を変更しない

**GIVEN** PR 作成が `status: "created"` で成功する mock 環境
**WHEN** `PrCreateStep.run(state, deps)` を呼び出す
**THEN** 呼び出し前後で `state.pullRequest` が `undefined` のまま変わらない

### TC-015 (must) — run() が existing-open 状態で state.pullRequest を変更しない

**GIVEN** PR 作成が `status: "existing-open"` を返す mock 環境
**WHEN** `PrCreateStep.run(state, deps)` を呼び出す
**THEN** 呼び出し前後で `state.pullRequest` が `undefined` のまま変わらない

### TC-021 (should) — run() が failed 状態で state.pullRequest を変更しない

**GIVEN** PR 作成が失敗（エラー throw）する mock 環境
**WHEN** `PrCreateStep.run(state, deps)` を呼び出す
**THEN** `state.pullRequest` が `undefined` のまま変わらない

---

## Group 2: result file の内容

### TC-016 (must) — success 時の result file に createdAt 行が含まれる

**GIVEN** PR 作成が `status: "created"` で成功し `url` と `number` が返る環境
**WHEN** `PrCreateStep.run(state, deps)` を呼び出す
**THEN** 書き込まれた result file に `- **CreatedAt**: <ISO8601文字列>` 行が含まれる
  かつ `- **URL**: <url>` 行が含まれる
  かつ `- **Number**: <number>` 行が含まれる

### TC-022 (should) — createdAt は ISO 8601 形式である

**GIVEN** PR 作成が成功する mock 環境
**WHEN** `PrCreateStep.run(state, deps)` を呼び出す
**THEN** result file の `CreatedAt` 値が ISO 8601 形式（`YYYY-MM-DDTHH:mm:ss.sssZ` パターン）に一致する

---

## Group 3: PrCreateStep.parseResult() — PR 情報抽出

### TC-018 (must) — success かつ全フィールドあり → pullRequest を返す

**GIVEN** 以下の content 文字列:
```
# pr-create Result — my-slug

## Status: success

## PR

- **URL**: https://github.com/owner/repo/pull/42
- **Number**: 42
- **CreatedAt**: 2026-05-09T00:00:00.000Z
- **Action**: created
```
**WHEN** `PrCreateStep.parseResult(content, deps)` を呼び出す
**THEN** 返り値の `verdict` が `"success"` である
  かつ `pullRequest.url` が `"https://github.com/owner/repo/pull/42"` である
  かつ `pullRequest.number` が `42` である
  かつ `pullRequest.createdAt` が `"2026-05-09T00:00:00.000Z"` である

### TC-019 (must) — failed → pullRequest を返さない

**GIVEN** 以下の content 文字列:
```
# pr-create Result — my-slug

## Status: failed
```
**WHEN** `PrCreateStep.parseResult(content, deps)` を呼び出す
**THEN** 返り値の `verdict` が `"error"` である
  かつ `pullRequest` が `undefined` である

### TC-020 (must) — URL が欠落した result file → pullRequest を undefined にする（defensive）

**GIVEN** `Status: success` だが `**URL**` 行が存在しない content 文字列
**WHEN** `PrCreateStep.parseResult(content, deps)` を呼び出す
**THEN** 返り値の `verdict` が `"success"` である
  かつ `pullRequest` が `undefined` である

### TC-023 (must) — Number が欠落した result file → pullRequest を undefined にする

**GIVEN** `Status: success` で `URL` と `CreatedAt` はあるが `**Number**` 行が存在しない content 文字列
**WHEN** `PrCreateStep.parseResult(content, deps)` を呼び出す
**THEN** `pullRequest` が `undefined` である

### TC-024 (must) — CreatedAt が欠落した result file → pullRequest を undefined にする

**GIVEN** `Status: success` で `URL` と `Number` はあるが `**CreatedAt**` 行が存在しない content 文字列
**WHEN** `PrCreateStep.parseResult(content, deps)` を呼び出す
**THEN** `pullRequest` が `undefined` である

### TC-025 (should) — Status 行が存在しない content → verdict: null かつ pullRequest: undefined

**GIVEN** `## Status:` 行を含まない任意の content 文字列
**WHEN** `PrCreateStep.parseResult(content, deps)` を呼び出す
**THEN** 返り値の `verdict` が `null` である
  かつ `pullRequest` が `undefined` である

### TC-026 (should) — existing-open の result file も parseResult が pullRequest を返す

**GIVEN** `Status: success` で `Action: existing-open (idempotent)` の content 文字列（URL/Number/CreatedAt あり）
**WHEN** `PrCreateStep.parseResult(content, deps)` を呼び出す
**THEN** `pullRequest.url` / `pullRequest.number` / `pullRequest.createdAt` がそれぞれ正しく抽出される

---

## Group 4: StepExecutor.finalizeStep() — pullRequest の immutable 反映

### TC-027 (must) — parsed.pullRequest が存在する場合、state に spread で反映される

**GIVEN** `parsed.pullRequest = { url, number, createdAt }` を返す step mock
  かつ初期 `state.pullRequest` が `undefined`
**WHEN** `finalizeStep()` が `parseResult()` の結果を処理する
**THEN** `store.persist()` に渡される state の `pullRequest` が `{ url, number, createdAt }` である
  かつ元の `state` オブジェクト参照は変更されていない（新しいオブジェクトが生成されている）

### TC-028 (must) — parsed.pullRequest が undefined の場合、state.pullRequest は変更されない

**GIVEN** `parseResult()` が `pullRequest` を含まない結果を返す step mock
  かつ初期 `state.pullRequest` が `undefined`
**WHEN** `finalizeStep()` が処理を完了する
**THEN** `store.persist()` に渡される state の `pullRequest` が `undefined` のまま

### TC-029 (should) — pullRequest の反映は pushStepResult / appendHistory の後、store.persist の前に行われる

**GIVEN** `parsed.pullRequest` が存在する step mock
**WHEN** `finalizeStep()` を実行する
**THEN** `store.persist(state)` が呼ばれる時点の state に `pullRequest` が含まれている

---

## Group 5: 型安全性

### TC-030 (must) — ParsedStepResult の pullRequest フィールドが型定義に存在する

**GIVEN** `ParsedStepResult` interface の型定義
**WHEN** `bun run typecheck` を実行する
**THEN** `pullRequest?: { url: string; number: number; createdAt: string }` フィールドが定義されており、型エラーが発生しない

### TC-031 (must) — PullRequestInfo 型と構造的に互換である

**GIVEN** `state.pullRequest` の型（`PullRequestInfo`）と `ParsedStepResult.pullRequest` の型
**WHEN** `finalizeStep()` 内で `state = { ...state, pullRequest: parsed.pullRequest }` を記述する
**THEN** 型エラーが発生しない（構造的型付けにより互換）

---

## Group 6: 受け入れ基準の統合検証

### TC-032 (must) — pipeline 完了後の finalState.pullRequest に url と number が格納される（AC2）

**GIVEN** PrCreate ステップが含まれる pipeline
  かつ PR 作成が成功する環境
**WHEN** `runner.ts` が pipeline を最後まで実行する
**THEN** `finalState.pullRequest.url` が PR の URL 文字列である
  かつ `finalState.pullRequest.number` が PR の番号である

### TC-033 (must) — runner.ts:172 の PR URL 表示が正常に動作する（AC3）

**GIVEN** `finalState.pullRequest` が `finalizeStep()` 経由で設定されている
**WHEN** runner が `finalState.pullRequest?.url` を参照する
**THEN** PR の URL が出力される（`undefined` にならない）

### TC-034 (must) — bun run typecheck && bun test が green（AC4）

**GIVEN** T1〜T5 の変更が全て適用済みの状態
**WHEN** `bun run typecheck && bun test` を実行する
**THEN** typecheck が exit 0 で終了する
  かつ `tests/unit/step/pr-create.test.ts` の全テストが pass する
  かつ テストスイート全体が green である
