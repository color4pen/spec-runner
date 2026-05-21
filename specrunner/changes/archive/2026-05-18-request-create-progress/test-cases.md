# Test Cases: request create / review のプログレス表示

## TC-PROG-01: request create — 開始メッセージ出力

- **Category**: Unit / Progress Output
- **Priority**: must
- **Source**: request.md 要件1 / tasks.md Task 3

**GIVEN** `manager.create` がスタブ化されており  
**AND** `loadConfig` が有効な config を返す  
**WHEN** `executeCreate("test text", ...)` を呼び出す  
**THEN** `process.stderr.write` に `"Generating request.md..."` を含む呼び出しが行われる

---

## TC-PROG-02: request create — 成功メッセージ出力

- **Category**: Unit / Progress Output
- **Priority**: must
- **Source**: request.md 要件1 / tasks.md Task 3

**GIVEN** `manager.create` がスタブ化されており slug `"test-slug"` を返す  
**AND** `loadConfig` が有効な config を返す  
**WHEN** `executeCreate("test text", ...)` を呼び出す  
**THEN** `process.stderr.write` に `"✓ Generated test-slug"` を含む呼び出しが行われる

---

## TC-PROG-03: request review — 開始メッセージ出力

- **Category**: Unit / Progress Output
- **Priority**: must
- **Source**: request.md 要件2 / tasks.md Task 4

**GIVEN** `runReview` がスタブ化されており  
**AND** `loadConfig` / `fs.readFile` / `parseRequestMdContent` がスタブ化されている  
**WHEN** `executeReview("dummy.md", { json: false })` を呼び出す  
**THEN** `process.stderr.write` に `"Reviewing request.md..."` を含む呼び出しが行われる

---

## TC-PROG-04: request create — 失敗メッセージ出力

- **Category**: Unit / Error Handling
- **Priority**: must
- **Source**: request.md 要件1 (失敗時) / tasks.md Task 1

**GIVEN** `manager.create` がスタブ化されており `Error("LLM timeout")` をスローする  
**AND** `loadConfig` が有効な config を返す  
**WHEN** `executeCreate("test text", ...)` を呼び出す  
**THEN** `process.stderr.write` に `"✗ Failed: LLM timeout"` を含む呼び出しが行われる  
**AND** 既存の `"Error: ..."` 出力は維持される

---

## TC-PROG-05: request review — 失敗メッセージ出力

- **Category**: Unit / Error Handling
- **Priority**: must
- **Source**: request.md 要件2 (失敗時) / tasks.md Task 2

**GIVEN** `runReview` がスタブ化されており例外をスローする  
**AND** `loadConfig` / `fs.readFile` / `parseRequestMdContent` がスタブ化されている  
**WHEN** `executeReview("dummy.md", { json: false })` を呼び出す  
**THEN** `process.stderr.write` に `"✗ Failed:"` を含む呼び出しが行われる

---

## TC-PROG-06: メッセージ出力順序 (request create)

- **Category**: Unit / Message Ordering
- **Priority**: should
- **Source**: design.md 設計判断 (失敗メッセージの位置)

**GIVEN** `manager.create` がスタブ化されており `Error("err")` をスローする  
**WHEN** `executeCreate("test text", ...)` を呼び出す  
**THEN** stderr への書き込み順序が `"Generating request.md..."` → `"✗ Failed: err"` → `"Error: ..."` の順になる

---

## TC-PROG-07: 開始メッセージは query() 呼び出し前に出力される (request create)

- **Category**: Unit / Timing
- **Priority**: should
- **Source**: request.md 設計判断 timing / design.md 方針

**GIVEN** `manager.create` の呼び出しを記録するスタブを用意する  
**WHEN** `executeCreate("test text", ...)` を呼び出す  
**THEN** `"Generating request.md..."` への stderr 書き込みが `manager.create` の呼び出しより先に行われる

---

## TC-PROG-08: 開始メッセージは query() 呼び出し前に出力される (request review)

- **Category**: Unit / Timing
- **Priority**: should
- **Source**: request.md 設計判断 timing / design.md 方針

**GIVEN** `runReview` の呼び出しを記録するスタブを用意する  
**WHEN** `executeReview("dummy.md", { json: false })` を呼び出す  
**THEN** `"Reviewing request.md..."` への stderr 書き込みが `runReview` の呼び出しより先に行われる

---

## TC-PROG-09: stdout への不要な出力がない (request create)

- **Category**: Unit / Output Isolation
- **Priority**: should
- **Source**: request.md 設計判断1 (stderr のみ)

**GIVEN** `manager.create` がスタブ化されており slug を返す  
**WHEN** `executeCreate("test text", ...)` を呼び出す  
**THEN** `"Generating request.md..."` / `"✓ Generated"` は stdout には出力されない

---

## TC-PROG-10: 既存 request review テストが regression しない

- **Category**: Regression
- **Priority**: must
- **Source**: request.md 受け入れ基準 (既存 test の regression なし)

**GIVEN** `request-review.test.ts` の既存テストケースがすべて存在する  
**WHEN** `bun run test` を実行する  
**THEN** 既存テストがすべて pass する  
**AND** 新規追加の TC-PROG-03 も pass する

---

## TC-PROG-11: delta spec ファイルが存在する

- **Category**: Artifact / Spec Authority
- **Priority**: must
- **Source**: request.md 要件4 / tasks.md Task 5

**GIVEN** 実装が完了している  
**WHEN** `specrunner/changes/request-create-progress/specs/cli-commands/spec.md` を確認する  
**THEN** ファイルが存在し `## MODIFIED Requirements` セクションを含む  
**AND** `specrunner request create` / `specrunner request review` のプログレス出力要件が記載されている  
**AND** baseline `specrunner/specs/cli-commands/spec.md` は直接編集されていない

---

## TC-PROG-12: typecheck & test が全体 green

- **Category**: Build / CI
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task 6

**GIVEN** すべての実装タスクが完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 型エラーが 0 件  
**AND** テストが全件 pass する
