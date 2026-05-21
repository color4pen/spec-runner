# Test Cases: managed-key-present-rename

## Legend

- **Priority**: must / should / could
- **Source**: request.md / design.md / tasks.md (AC = 受け入れ基準)
- **Category**: filesystem / symbol / import / behavior / build

---

## TC-01: config ソースファイルの rename

- **Category**: filesystem
- **Priority**: must
- **Source**: request.md AC-1, tasks.md Task 1

**GIVEN** refactoring が完了した状態  
**WHEN** src/core/doctor/checks/config/ ディレクトリを確認する  
**THEN**
- `managed-key-present.ts` が存在すること
- `anthropic-key-present.ts` が存在しないこと

---

## TC-02: auth ソースファイルの rename

- **Category**: filesystem
- **Priority**: must
- **Source**: request.md AC-2, tasks.md Task 1

**GIVEN** refactoring が完了した状態  
**WHEN** src/core/doctor/checks/auth/ ディレクトリを確認する  
**THEN**
- `managed-key-valid.ts` が存在すること
- `anthropic-key-valid.ts` が存在しないこと

---

## TC-03: config テストファイルの rename

- **Category**: filesystem
- **Priority**: must
- **Source**: request.md AC-5, tasks.md Task 5

**GIVEN** refactoring が完了した状態  
**WHEN** tests/core/doctor/checks/config/ ディレクトリを確認する  
**THEN**
- `managed-key-present.test.ts` が存在すること
- `anthropic-key-present.test.ts` が存在しないこと

---

## TC-04: auth テストファイルの rename

- **Category**: filesystem
- **Priority**: must
- **Source**: request.md AC-5, tasks.md Task 5

**GIVEN** refactoring が完了した状態  
**WHEN** tests/core/doctor/checks/auth/ ディレクトリを確認する  
**THEN**
- `managed-key-valid.test.ts` が存在すること
- `anthropic-key-valid.test.ts` が存在しないこと

---

## TC-05: managed-key-present.ts の export symbol 名

- **Category**: symbol
- **Priority**: must
- **Source**: request.md AC-3, tasks.md Task 2

**GIVEN** `src/core/doctor/checks/config/managed-key-present.ts` を開く  
**WHEN** export 宣言を確認する  
**THEN**
- `managedKeyPresentCheck` としてエクスポートされていること
- `anthropicKeyPresentCheck` という識別子が存在しないこと

---

## TC-06: managed-key-valid.ts の export symbol 名

- **Category**: symbol
- **Priority**: must
- **Source**: request.md AC-3, tasks.md Task 3

**GIVEN** `src/core/doctor/checks/auth/managed-key-valid.ts` を開く  
**WHEN** export 宣言を確認する  
**THEN**
- `managedKeyValidCheck` としてエクスポートされていること
- `anthropicKeyValidCheck` という識別子が存在しないこと

---

## TC-07: check.name フィールドが保持されている (config)

- **Category**: behavior
- **Priority**: must
- **Source**: request.md 要件5, design.md Constraints

**GIVEN** `src/core/doctor/checks/config/managed-key-present.ts` を開く  
**WHEN** check オブジェクトの `name` フィールドを確認する  
**THEN**
- `name` フィールドが `"managed/api-key-present"` のまま変更されていないこと

---

## TC-08: check.name フィールドが保持されている (auth)

- **Category**: behavior
- **Priority**: must
- **Source**: request.md 要件5, design.md Constraints

**GIVEN** `src/core/doctor/checks/auth/managed-key-valid.ts` を開く  
**WHEN** check オブジェクトの `name` フィールドを確認する  
**THEN**
- `name` フィールドが `"managed/api-key-valid"` のまま変更されていないこと

---

## TC-09: index.ts の import path 更新

- **Category**: import
- **Priority**: must
- **Source**: request.md AC-4, tasks.md Task 4

**GIVEN** `src/core/doctor/checks/index.ts` を開く  
**WHEN** import 文を確認する  
**THEN**
- `./config/managed-key-present.js` を import していること
- `./auth/managed-key-valid.js` を import していること
- `./config/anthropic-key-present.js` の import が存在しないこと
- `./auth/anthropic-key-valid.js` の import が存在しないこと

---

## TC-10: index.ts の symbol 参照更新

- **Category**: symbol
- **Priority**: must
- **Source**: request.md AC-4, tasks.md Task 4

**GIVEN** `src/core/doctor/checks/index.ts` を開く  
**WHEN** import binding・配列使用・re-export を確認する  
**THEN**
- `managedKeyPresentCheck` が import binding・配列・re-export に使用されていること
- `managedKeyValidCheck` が import binding・配列・re-export に使用されていること
- `anthropicKeyPresentCheck` / `anthropicKeyValidCheck` という識別子が存在しないこと

---

## TC-11: managed-key-present.test.ts の import パス

- **Category**: import
- **Priority**: must
- **Source**: request.md AC-5, tasks.md Task 6

**GIVEN** `tests/core/doctor/checks/config/managed-key-present.test.ts` を開く  
**WHEN** import 文を確認する  
**THEN**
- `managed-key-present.js` からのインポートになっていること
- `anthropic-key-present.js` の参照が存在しないこと

---

## TC-12: managed-key-present.test.ts の describe 文字列

- **Category**: symbol
- **Priority**: should
- **Source**: tasks.md Task 6

**GIVEN** `tests/core/doctor/checks/config/managed-key-present.test.ts` を開く  
**WHEN** describe の第一引数を確認する  
**THEN**
- `"managedKeyPresentCheck (managed/api-key-present)"` になっていること

---

## TC-13: managed-key-valid.test.ts の import パス

- **Category**: import
- **Priority**: must
- **Source**: request.md AC-5, tasks.md Task 7

**GIVEN** `tests/core/doctor/checks/auth/managed-key-valid.test.ts` を開く  
**WHEN** import 文を確認する  
**THEN**
- `managed-key-valid.js` からのインポートになっていること
- `anthropic-key-valid.js` の参照が存在しないこと

---

## TC-14: managed-key-valid.test.ts の describe 文字列

- **Category**: symbol
- **Priority**: should
- **Source**: tasks.md Task 7

**GIVEN** `tests/core/doctor/checks/auth/managed-key-valid.test.ts` を開く  
**WHEN** describe の第一引数を確認する  
**THEN**
- `"managedKeyValidCheck (managed/api-key-valid)"` になっていること

---

## TC-15: remove-session-timeout.test.ts の path 文字列更新

- **Category**: import
- **Priority**: must
- **Source**: request.md AC-6, tasks.md Task 8

**GIVEN** `tests/unit/remove-session-timeout.test.ts` を開く  
**WHEN** 旧パス参照 (L191 相当) を確認する  
**THEN**
- `"../../src/core/doctor/checks/auth/managed-key-valid.ts"` になっていること
- `"../../src/core/doctor/checks/auth/anthropic-key-valid.ts"` の文字列が存在しないこと

---

## TC-16: remove-session-timeout.test.ts の it description 更新

- **Category**: symbol
- **Priority**: should
- **Source**: tasks.md Task 8

**GIVEN** `tests/unit/remove-session-timeout.test.ts` を開く  
**WHEN** 該当 it() の description 文字列 (L188 相当) を確認する  
**THEN**
- `"managed-key-valid.ts に..."` を含む description になっていること
- `"anthropic-key-valid.ts に..."` という文字列が存在しないこと

---

## TC-17: src/ および tests/ に旧識別子が残っていない

- **Category**: symbol
- **Priority**: must
- **Source**: request.md AC-8

**GIVEN** リポジトリのソースコードが最終状態  
**WHEN** `grep -rn "anthropicKeyPresentCheck\|anthropicKeyValidCheck\|anthropic-key-present\|anthropic-key-valid" src/ tests/` を実行する  
**THEN**
- 出力が 0 件であること

---

## TC-18: TypeScript 型チェックが通る

- **Category**: build
- **Priority**: must
- **Source**: request.md AC-7

**GIVEN** rename と symbol 更新が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN**
- エラーなしで完了すること

---

## TC-19: テストスイートが green

- **Category**: build
- **Priority**: must
- **Source**: request.md AC-7

**GIVEN** rename と symbol 更新が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN**
- 全テストが pass すること
- 新しい test file 2 件 (`managed-key-present.test.ts`, `managed-key-valid.test.ts`) が実行対象に含まれること

---

## TC-20: specrunner/specs/ が変更されていない

- **Category**: behavior
- **Priority**: should
- **Source**: request.md スコープ外, design.md Constraints

**GIVEN** refactoring が完了した状態  
**WHEN** `git diff main -- specrunner/specs/` を確認する  
**THEN**
- specrunner/specs/ 配下のファイルに差分がないこと

---

## TC-21: 他 request の参照が変更されていない

- **Category**: behavior
- **Priority**: should
- **Source**: request.md スコープ外

**GIVEN** refactoring が完了した状態  
**WHEN** `specrunner/requests/active/credentials-provider-parity/request.md` を確認する  
**THEN**
- 本 request による変更が加えられていないこと (旧 path 参照のままであること)
