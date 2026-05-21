# Test Cases: PR body に Fixes #N を自動付与

Generated from: request.md / design.md / tasks.md

---

## Category: body-template (renderPrBody)

### TC-01 — issue が存在するとき Fixes 行が body に含まれる

- **Priority**: must
- **Source**: Task 4 / Req 1 / Acceptance criteria

**GIVEN** `parsedRequest.issue = "#264"` で `renderPrBody` を呼び出す  
**WHEN** body 文字列を生成する  
**THEN** body に `"Fixes #264"` が含まれる

---

### TC-02 — issue が undefined のとき Fixes 行が body に含まれない

- **Priority**: must
- **Source**: Task 4 / Req 1 / Acceptance criteria

**GIVEN** `parsedRequest.issue = undefined` で `renderPrBody` を呼び出す  
**WHEN** body 文字列を生成する  
**THEN** body に `/Fixes #/` にマッチする行が存在しない

---

### TC-03 — Fixes 行は Summary section の直後、Workflow section の直前に挿入される

- **Priority**: should
- **Source**: Design D3 / Task 3

**GIVEN** `parsedRequest.issue = "#264"` で `renderPrBody` を呼び出す  
**WHEN** body 文字列を生成する  
**THEN** `"Fixes #264"` が `"## Summary"` ブロックの後、かつ `"## Workflow"` ブロックより前に出現する

---

### TC-04 — keyword は "Fixes" に固定される ("Closes" / "Resolves" は使用しない)

- **Priority**: must
- **Source**: 設計判断 (design.md D3 / request.md 設計判断 1)

**GIVEN** `parsedRequest.issue = "#264"` で `renderPrBody` を呼び出す  
**WHEN** body 文字列を生成する  
**THEN** body に `"Fixes #264"` が含まれ、`"Closes #264"` および `"Resolves #264"` は含まれない

---

### TC-05 — issue が存在するとき既存 section (Summary / Workflow / Test plan / signature) が変更されない

- **Priority**: must
- **Source**: Task 6 / Req 4 (regression)

**GIVEN** `parsedRequest.issue = "#264"` で `renderPrBody` を呼び出す  
**WHEN** body 文字列を生成する  
**THEN** 既存 section (`## Summary`, `## Workflow`, `## Test plan`, signature 行) がすべて出力に含まれる

---

### TC-06 — issue が undefined のとき既存 body 出力が一切変化しない (regression)

- **Priority**: must
- **Source**: Task 6 / Req 4 (regression)

**GIVEN** `parsedRequest.issue = undefined` で `renderPrBody` を呼び出す  
**WHEN** body 文字列を生成する  
**THEN** issue field を追加する前と同一の body 文字列が出力される

---

## Category: request-md-parser

### TC-07 — Meta section に issue field がある場合に "#N" 形式で抽出される

- **Priority**: must
- **Source**: Task 5 / Req 2 / Design D2

**GIVEN** request.md に `- **issue**: #264` が含まれる  
**WHEN** `parseRequestMdContent(content)` を呼び出す  
**THEN** `result.issue === "#264"` (# prefix 付き、trim のみ、正規化なし)

---

### TC-08 — issue field が不在のとき undefined が返り、エラーが発生しない

- **Priority**: must
- **Source**: Task 5 / Req 2 / Design D2

**GIVEN** request.md の Meta section に `issue` 行が存在しない  
**WHEN** `parseRequestMdContent(content)` を呼び出す  
**THEN** `result.issue === undefined` かつ例外が throw されない

---

### TC-09 — issue 抽出により既存フィールド (type / slug / baseBranch) の抽出が壊れない

- **Priority**: must
- **Source**: Task 6 (regression)

**GIVEN** `type`, `slug`, `base-branch`, `issue` をすべて含む request.md  
**WHEN** `parseRequestMdContent(content)` を呼び出す  
**THEN** `result.type`, `result.slug`, `result.baseBranch` が従来どおりに抽出される

---

### TC-10 — issue の値は trim されるが # prefix は正規化されない

- **Priority**: should
- **Source**: Design D2 (「`#` の正規化は行わない」)

**GIVEN** `- **issue**:   #279   ` (前後に空白を含む)  
**WHEN** `parseRequestMdContent(content)` を呼び出す  
**THEN** `result.issue === "#279"` (trim 後の値で、# は保持)

---

## Category: 型安全性

### TC-11 — ParsedRequest 型に issue?: string が追加されても型エラーが発生しない

- **Priority**: must
- **Source**: Task 1 / Task 6

**GIVEN** `src/core/request/types.ts` に `issue?: string` を追加した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件

---

### TC-12 — issue を参照しないコードが issue field 追加後も型エラーを出さない

- **Priority**: must
- **Source**: Task 1 / Task 6 (optional field なので既存コードを壊さない)

**GIVEN** `ParsedRequest` に `issue?: string` を追加し、issue を参照しない既存コードが存在する  
**WHEN** `bun run typecheck` を実行する  
**THEN** 既存コードに型エラーが発生しない

---

## Category: 全テスト回帰

### TC-13 — bun run test が全 green

- **Priority**: must
- **Source**: Req 4 / Task 6 / Acceptance criteria

**GIVEN** Task 1〜5 の実装が完了した状態  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 全テストが pass し、エラー・失敗が 0 件

---

## Category: spec authority

### TC-14 — request-md-parser/spec.md に issue 抽出 Requirement が追記されている

- **Priority**: should
- **Source**: Task 7a

**GIVEN** `specrunner/specs/request-md-parser/spec.md` を参照する  
**WHEN** ファイル内容を確認する  
**THEN** 「parser は Meta セクションの `issue` field を抽出する」旨の Requirement が存在する

---

### TC-15 — pr-create-runner/spec.md に Fixes 行挿入 Requirement が追記されている

- **Priority**: should
- **Source**: Task 7b

**GIVEN** `specrunner/specs/pr-create-runner/spec.md` を参照する  
**WHEN** ファイル内容を確認する  
**THEN** 「`renderPrBody` は `parsedRequest.issue` が存在する場合に `Fixes ${issue}` 行を挿入する」旨の Requirement が存在する

---

## Category: 境界値・エッジケース

### TC-16 — issue が空文字列のとき Fixes 行を挿入しない

- **Priority**: could
- **Source**: Design D3 (「`parsedRequest.issue` が存在する場合のみ挿入」)

**GIVEN** `parsedRequest.issue = ""` で `renderPrBody` を呼び出す  
**WHEN** body 文字列を生成する  
**THEN** body に `Fixes` 行が含まれない (空文字列は falsy として扱う)

---

### TC-17 — issue が "#0" などゼロ番号でも正常に出力される

- **Priority**: could
- **Source**: Design D3 (変換式 `Fixes ${issue}`)

**GIVEN** `parsedRequest.issue = "#0"` で `renderPrBody` を呼び出す  
**WHEN** body 文字列を生成する  
**THEN** body に `"Fixes #0"` が含まれる
