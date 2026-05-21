# Test Cases: hardcode-github-client-id

## TC-001: getGithubClientId — env unset returns hardcode value

- **Category**: Unit
- **Priority**: must
- **Source**: request.md 受け入れ基準 #1 / tasks.md Task 4

**GIVEN** `SPECRUNNER_GITHUB_CLIENT_ID` が process.env に存在しない  
**WHEN** `getGithubClientId()` を呼び出す  
**THEN** throw せず文字列を返す  
**AND** 返値が `"Ov23li"` で始まる（hardcode 定数）  
**AND** 返値の length が 0 より大きい

---

## TC-002: getGithubClientId — env set returns env value

- **Category**: Unit
- **Priority**: must
- **Source**: request.md 受け入れ基準 #2 / tasks.md Task 4

**GIVEN** `SPECRUNNER_GITHUB_CLIENT_ID` に `"Iv1.test123"` を設定した  
**WHEN** `getGithubClientId()` を呼び出す  
**THEN** `"Iv1.test123"` を返す  
**AND** hardcode 定数は返さない

---

## TC-003: getGithubClientId — env empty string falls back to hardcode

- **Category**: Unit
- **Priority**: must
- **Source**: tasks.md Task 3.5 / tasks.md Task 4（`"" || GITHUB_CLIENT_ID` の挙動）

**GIVEN** `SPECRUNNER_GITHUB_CLIENT_ID` に空文字列 `""` を設定した  
**WHEN** `getGithubClientId()` を呼び出す  
**THEN** hardcode 定数を返す（`"Ov23li"` で始まる）  
**AND** throw しない

---

## TC-004: getGithubClientId — env unset で SpecRunnerError を throw しない

- **Category**: Unit
- **Priority**: must
- **Source**: request.md 要件 #3 / 背景（PR #42 の暫定形の削除）

**GIVEN** `SPECRUNNER_GITHUB_CLIENT_ID` が process.env に存在しない  
**WHEN** `getGithubClientId()` を呼び出す  
**THEN** `SpecRunnerError` を throw しない  
**AND** `GITHUB_CLIENT_ID_MISSING` エラーコードを伴う例外が発生しない

---

## TC-005: doctor check — env unset が pass ステータスを返す

- **Category**: Unit
- **Priority**: must
- **Source**: request.md 受け入れ基準 #4 / tasks.md Task 2, Task 3

**GIVEN** `SPECRUNNER_GITHUB_CLIENT_ID` が process.env に存在しない  
**WHEN** `github-client-id` doctor check を実行する（TC-016 相当）  
**THEN** `result.status` が `"pass"` である  
**AND** `result.message` に `"built-in"` が含まれる  
**AND** `result.hint` フィールドが存在しない（または undefined）

---

## TC-006: doctor check — env unset が warn ステータスを返さない

- **Category**: Unit
- **Priority**: must
- **Source**: request.md 受け入れ基準 #4

**GIVEN** `SPECRUNNER_GITHUB_CLIENT_ID` が process.env に存在しない  
**WHEN** `github-client-id` doctor check を実行する  
**THEN** `result.status` が `"warn"` でない

---

## TC-007: doctor check — env set の既存 pass 動作が変わらない

- **Category**: Unit
- **Priority**: should
- **Source**: tasks.md Task 2（「env が設定されている場合の既存 pass 動作は変更しない」）/ tasks.md Task 3 TC-017

**GIVEN** `SPECRUNNER_GITHUB_CLIENT_ID` に有効な値（e.g. `"Iv1.test123"`）を設定した  
**WHEN** `github-client-id` doctor check を実行する（TC-017 相当）  
**THEN** `result.status` が `"pass"` である  
**AND** 動作が変更前と同じである

---

## TC-008: typecheck — 型エラーがない

- **Category**: Static Analysis
- **Priority**: must
- **Source**: request.md 受け入れ基準 #3 / tasks.md Task 5

**GIVEN** constants.ts, github-client-id.ts, テストファイルの変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code が 0 である  
**AND** 型エラーが 0 件である

---

## TC-009: test suite — 全テストが green

- **Category**: Integration
- **Priority**: must
- **Source**: request.md 受け入れ基準 #3 / tasks.md Task 5

**GIVEN** 全変更が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** exit code が 0 である  
**AND** 失敗テストが 0 件である

---

## TC-010: GITHUB_CLIENT_ID_MISSING エラーコードが errors.ts に残存する

- **Category**: Unit
- **Priority**: could
- **Source**: request.md スコープ外（「定数自体は残してよい」）

**GIVEN** src/errors.ts が変更されていない  
**WHEN** `GITHUB_CLIENT_ID_MISSING` の定義を確認する  
**THEN** 定数がファイルに残存している  
**AND** throw する箇所への参照がないことを確認（参照ゼロでも削除不要）
