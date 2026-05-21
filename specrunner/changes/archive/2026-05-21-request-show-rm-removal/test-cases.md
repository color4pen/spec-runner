# Test Cases: request-show-rm-removal

## TC-01: `request show` が unknown subcommand エラーで終了する

- **Category**: CLI Behavior
- **Priority**: must
- **Source**: request.md 受け入れ基準

**GIVEN** `specrunner` がインストール済みで `show` サブコマンドが削除されている  
**WHEN** `specrunner request show some-slug` を実行する  
**THEN** unknown subcommand エラーメッセージを出力して非ゼロ exit code で終了する

---

## TC-02: `request rm` が unknown subcommand エラーで終了する

- **Category**: CLI Behavior
- **Priority**: must
- **Source**: request.md 受け入れ基準

**GIVEN** `specrunner` がインストール済みで `rm` サブコマンドが削除されている  
**WHEN** `specrunner request rm some-slug` を実行する  
**THEN** unknown subcommand エラーメッセージを出力して非ゼロ exit code で終了する

---

## TC-03: `request --help` に `show` が含まれない

- **Category**: Help Output
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 2

**GIVEN** USAGE 定数から `request show <slug>` 行が削除されている  
**WHEN** `specrunner request --help` を実行する  
**THEN** 出力に `show` という文字列が含まれない

---

## TC-04: `request --help` に `rm` が含まれない

- **Category**: Help Output
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 2

**GIVEN** USAGE 定数から `request rm <slug>` 行が削除されている  
**WHEN** `specrunner request --help` を実行する  
**THEN** 出力に `rm` という文字列が含まれない

---

## TC-05: `request-show.ts` ソースファイルが git 管理外になっている

- **Category**: Source File Deletion
- **Priority**: must
- **Source**: request.md 要件 1, 受け入れ基準

**GIVEN** `src/core/command/request-show.ts` が削除されている  
**WHEN** `git ls-files src/core/command/request-show.ts` を実行する  
**THEN** 出力が空である

---

## TC-06: `request-rm.ts` ソースファイルが git 管理外になっている

- **Category**: Source File Deletion
- **Priority**: must
- **Source**: request.md 要件 2, 受け入れ基準

**GIVEN** `src/core/command/request-rm.ts` が削除されている  
**WHEN** `git ls-files src/core/command/request-rm.ts` を実行する  
**THEN** 出力が空である

---

## TC-07: `command-registry.ts` に `executeShow` の import が存在しない

- **Category**: Source File Deletion
- **Priority**: must
- **Source**: request.md 要件 3, tasks.md Task 2

**GIVEN** `command-registry.ts` から `executeShow` の import が削除されている  
**WHEN** `src/cli/command-registry.ts` の内容を確認する  
**THEN** `import { executeShow }` という文字列が含まれない

---

## TC-08: `command-registry.ts` に `executeRm` の import が存在しない

- **Category**: Source File Deletion
- **Priority**: must
- **Source**: request.md 要件 3, tasks.md Task 2

**GIVEN** `command-registry.ts` から `executeRm as executeRequestRm` の import が削除されている  
**WHEN** `src/cli/command-registry.ts` の内容を確認する  
**THEN** `import { executeRm` という文字列が含まれない

---

## TC-09: `command-registry.ts` の `show` subcommand 定義ブロックが存在しない

- **Category**: Source File Deletion
- **Priority**: must
- **Source**: tasks.md Task 2

**GIVEN** `command-registry.ts` から `show` subcommand 定義が削除されている  
**WHEN** `src/cli/command-registry.ts` の内容を確認する  
**THEN** `show` subcommand 登録コード（`case "show":` 等）が含まれない

---

## TC-10: `command-registry.ts` の `rm` subcommand 定義ブロックが存在しない

- **Category**: Source File Deletion
- **Priority**: must
- **Source**: tasks.md Task 2

**GIVEN** `command-registry.ts` から `rm` subcommand 定義が削除されている  
**WHEN** `src/cli/command-registry.ts` の内容を確認する  
**THEN** `rm` subcommand 登録コード（`case "rm":` 等）が含まれない

---

## TC-11: `request-show.test.ts` テストファイルが git 管理外になっている

- **Category**: Test File Deletion
- **Priority**: must
- **Source**: request.md 要件 5, tasks.md Task 3

**GIVEN** `tests/unit/core/command/request-show.test.ts` が削除されている  
**WHEN** `git ls-files tests/unit/core/command/request-show.test.ts` を実行する  
**THEN** 出力が空である

---

## TC-12: `request-rm.test.ts` テストファイルが git 管理外になっている

- **Category**: Test File Deletion
- **Priority**: must
- **Source**: request.md 要件 5, tasks.md Task 3

**GIVEN** `tests/unit/core/command/request-rm.test.ts` が削除されている  
**WHEN** `git ls-files tests/unit/core/command/request-rm.test.ts` を実行する  
**THEN** 出力が空である

---

## TC-13: `help-output-tc.test.ts` が `request show` の不在を assert している

- **Category**: Test Modification
- **Priority**: must
- **Source**: request.md 要件 6, tasks.md Task 4

**GIVEN** `help-output-tc.test.ts` の L29 が `not.toContain("request show")` に書き換えられている  
**WHEN** `bun run test` を実行する  
**THEN** help-output のテストケースが pass する

---

## TC-14: `help-output-tc.test.ts` が `request rm` の不在を assert している

- **Category**: Test Modification
- **Priority**: must
- **Source**: request.md 要件 6, tasks.md Task 4

**GIVEN** `help-output-tc.test.ts` の L30 が `not.toContain("request rm")` に書き換えられている  
**WHEN** `bun run test` を実行する  
**THEN** help-output のテストケースが pass する

---

## TC-15: `validation-tc.test.ts` から TC-46〜TC-48 が削除されている

- **Category**: Test Modification
- **Priority**: must
- **Source**: tasks.md Task 4

**GIVEN** `tests/unit/core/command/validation-tc.test.ts` から `request-rm.js` および `request-show.js` を対象とする TC-46 / TC-47 / TC-48 が削除されている  
**WHEN** `tests/unit/core/command/validation-tc.test.ts` の内容を確認する  
**THEN** `request-rm.js` および `request-show.js` への参照が存在しない

---

## TC-16: `bun run typecheck` が green

- **Category**: Build Verification
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 5

**GIVEN** 全ての削除・修正が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーなしで正常終了する（exit code 0）

---

## TC-17: `bun run test` が green

- **Category**: Build Verification
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 5

**GIVEN** 全ての削除・修正が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass して正常終了する（exit code 0）

---

## TC-18: delta spec に `request show` Requirement が REMOVED として宣言されている

- **Category**: Spec Delta
- **Priority**: must
- **Source**: request.md 要件 7

**GIVEN** `cli-commands` の delta spec ファイルが存在する  
**WHEN** delta spec の内容を確認する  
**THEN** baseline の `specrunner request show <slug> は request.md の本文を表示する` Requirement が REMOVED として宣言されている

---

## TC-19: delta spec に `request rm` Requirement が REMOVED として宣言されている

- **Category**: Spec Delta
- **Priority**: must
- **Source**: request.md 要件 7

**GIVEN** `cli-commands` の delta spec ファイルが存在する  
**WHEN** delta spec の内容を確認する  
**THEN** baseline の `specrunner request rm <slug> は drafts 配下から request を削除する` Requirement が REMOVED として宣言されている

---

## TC-20: delta spec の slug validation Requirement が `show` / `rm` を除いた形に MODIFIED されている

- **Category**: Spec Delta
- **Priority**: must
- **Source**: request.md 要件 8

**GIVEN** `cli-commands` の delta spec が更新されている  
**WHEN** delta spec の内容を確認する  
**THEN** slug validation の Requirement が `request new / request validate / request review` のみを対象とする形で MODIFIED として宣言されており、`show` / `rm` への言及が含まれない

---

## TC-21: 残存する `request` サブコマンドが正常動作する

- **Category**: Regression
- **Priority**: should
- **Source**: request.md スコープ外（他サブコマンドを壊さない）

**GIVEN** `show` / `rm` が削除されているが他のサブコマンドは変更なし  
**WHEN** `specrunner request ls` / `specrunner request new` / `specrunner request validate` / `specrunner request review` / `specrunner request template` / `specrunner request generate` を実行する  
**THEN** それぞれが従来どおり正常に動作する（コマンド not found にならない）

---

## TC-22: `request new` の slug validation が引き続き動作する

- **Category**: Slug Validation
- **Priority**: should
- **Source**: request.md 要件 8（MODIFIED 後の残存 Requirement）

**GIVEN** slug validation の対象が `request new / request validate / request review` に絞られている  
**WHEN** `specrunner request new` に不正な slug（path traversal を含む文字列等）を渡す  
**THEN** validation エラーが返され、処理が実行されない

---

## TC-23: `request validate` の slug validation が引き続き動作する

- **Category**: Slug Validation
- **Priority**: should
- **Source**: request.md 要件 8（MODIFIED 後の残存 Requirement）

**GIVEN** slug validation の対象が `request new / request validate / request review` に絞られている  
**WHEN** `specrunner request validate` に不正な slug（`../` を含む文字列等）を渡す  
**THEN** validation エラーが返され、処理が実行されない

---

## TC-24: `request review` の slug validation が引き続き動作する

- **Category**: Slug Validation
- **Priority**: should
- **Source**: request.md 要件 8（MODIFIED 後の残存 Requirement）

**GIVEN** slug validation の対象が `request new / request validate / request review` に絞られている  
**WHEN** `specrunner request review` に不正な slug（`../` を含む文字列等）を渡す  
**THEN** validation エラーが返され、処理が実行されない

---

## TC-25: `validation-tc.test.ts` のファイル冒頭コメントから TC-46〜TC-48 の記載が消えている

- **Category**: Test Modification
- **Priority**: could
- **Source**: tasks.md Task 4

**GIVEN** `validation-tc.test.ts` のファイル冒頭コメントが更新されている  
**WHEN** `tests/unit/core/command/validation-tc.test.ts` の先頭部分を確認する  
**THEN** `TC-46` / `TC-47` / `TC-48` の記載が存在しない
