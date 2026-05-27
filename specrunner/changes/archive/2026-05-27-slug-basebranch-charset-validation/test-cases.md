# Test Cases: slug-basebranch-charset-validation

## TC-01 slug path traversal を reject する

- **Category**: slug-charset-validation
- **Priority**: must
- **Source**: T-02, T-07

**GIVEN** `slug: "../etc/passwd"` を含む request input  
**WHEN** `slug-required` rule の `check()` を実行する  
**THEN** severity `error`、rule `slug-required`、field `slug` の violation が 1 件返る

---

## TC-02 slug git option injection を reject する

- **Category**: slug-charset-validation
- **Priority**: must
- **Source**: T-02, T-07

**GIVEN** `slug: "--upload-pack=evil"` を含む request input  
**WHEN** `slug-required` rule の `check()` を実行する  
**THEN** severity `error`、rule `slug-required`、field `slug` の violation が 1 件返る

---

## TC-03 slug 大文字を reject する

- **Category**: slug-charset-validation
- **Priority**: must
- **Source**: T-02, T-07

**GIVEN** `slug: "UPPERCASE"` を含む request input  
**WHEN** `slug-required` rule の `check()` を実行する  
**THEN** severity `error`、rule `slug-required`、field `slug` の violation が 1 件返る

---

## TC-04 slug スペースを reject する

- **Category**: slug-charset-validation
- **Priority**: must
- **Source**: T-07

**GIVEN** `slug: "a b c"` を含む request input  
**WHEN** `slug-required` rule の `check()` を実行する  
**THEN** severity `error`、rule `slug-required`、field `slug` の violation が 1 件返る

---

## TC-05 有効な slug は violation なしを返す（英数字+ハイフン）

- **Category**: slug-charset-validation
- **Priority**: must
- **Source**: T-02, T-07

**GIVEN** `slug: "valid-slug-123"` を含む request input  
**WHEN** `slug-required` rule の `check()` を実行する  
**THEN** violations が空配列 `[]` で返る

---

## TC-06 最短有効 slug（1文字）は violation なしを返す

- **Category**: slug-charset-validation
- **Priority**: should
- **Source**: T-07

**GIVEN** `slug: "a"` を含む request input  
**WHEN** `slug-required` rule の `check()` を実行する  
**THEN** violations が空配列 `[]` で返る

---

## TC-07 slug null は既存の missing エラーを返す（既存挙動維持）

- **Category**: slug-charset-validation
- **Priority**: must
- **Source**: T-02

**GIVEN** `slug: null` を含む request input  
**WHEN** `slug-required` rule の `check()` を実行する  
**THEN** severity `error`、rule `slug-required` の violation が返る（charset エラーではなく missing エラー）

---

## TC-08 slug が空文字は既存の missing エラーを返す（既存挙動維持）

- **Category**: slug-charset-validation
- **Priority**: must
- **Source**: T-02

**GIVEN** `slug: ""` を含む request input  
**WHEN** `slug-required` rule の `check()` を実行する  
**THEN** severity `error`、rule `slug-required` の violation が返る（charset エラーではなく missing エラー）

---

## TC-09 baseBranch git option injection を reject する

- **Category**: basebranch-charset-validation
- **Priority**: must
- **Source**: T-03, T-08

**GIVEN** `baseBranch: "--upload-pack=evil"` を含む request input  
**WHEN** `base-branch-required` rule の `check()` を実行する  
**THEN** severity `error`、rule `base-branch-required`、field `baseBranch` の violation が 1 件返る

---

## TC-10 baseBranch 先頭ダッシュを reject する

- **Category**: basebranch-charset-validation
- **Priority**: must
- **Source**: T-03, T-08

**GIVEN** `baseBranch: "-flag"` を含む request input  
**WHEN** `base-branch-required` rule の `check()` を実行する  
**THEN** severity `error`、rule `base-branch-required`、field `baseBranch` の violation が 1 件返る

---

## TC-11 baseBranch シェルメタ文字を reject する

- **Category**: basebranch-charset-validation
- **Priority**: must
- **Source**: T-03, T-08

**GIVEN** `baseBranch: "main; rm -rf /"` を含む request input  
**WHEN** `base-branch-required` rule の `check()` を実行する  
**THEN** severity `error`、rule `base-branch-required`、field `baseBranch` の violation が 1 件返る

---

## TC-12 baseBranch スペースを reject する

- **Category**: basebranch-charset-validation
- **Priority**: must
- **Source**: T-08

**GIVEN** `baseBranch: "branch name"` を含む request input  
**WHEN** `base-branch-required` rule の `check()` を実行する  
**THEN** severity `error`、rule `base-branch-required`、field `baseBranch` の violation が 1 件返る

---

## TC-13 baseBranch `main` は violation なしを返す

- **Category**: basebranch-charset-validation
- **Priority**: must
- **Source**: T-03, T-08

**GIVEN** `baseBranch: "main"` を含む request input  
**WHEN** `base-branch-required` rule の `check()` を実行する  
**THEN** violations が空配列 `[]` で返る

---

## TC-14 baseBranch `release/v1.0` はスラッシュとドットを許容する

- **Category**: basebranch-charset-validation
- **Priority**: must
- **Source**: T-03, T-08

**GIVEN** `baseBranch: "release/v1.0"` を含む request input  
**WHEN** `base-branch-required` rule の `check()` を実行する  
**THEN** violations が空配列 `[]` で返る

---

## TC-15 baseBranch `feature/foo-bar` はスラッシュとハイフンを許容する

- **Category**: basebranch-charset-validation
- **Priority**: must
- **Source**: T-03, T-08

**GIVEN** `baseBranch: "feature/foo-bar"` を含む request input  
**WHEN** `base-branch-required` rule の `check()` を実行する  
**THEN** violations が空配列 `[]` で返る

---

## TC-16 baseBranch `my_branch` はアンダースコアを許容する

- **Category**: basebranch-charset-validation
- **Priority**: should
- **Source**: T-08

**GIVEN** `baseBranch: "my_branch"` を含む request input  
**WHEN** `base-branch-required` rule の `check()` を実行する  
**THEN** violations が空配列 `[]` で返る

---

## TC-17 baseBranch null は既存の missing エラーを返す（既存挙動維持）

- **Category**: basebranch-charset-validation
- **Priority**: must
- **Source**: T-03

**GIVEN** `baseBranch: null` を含む request input  
**WHEN** `base-branch-required` rule の `check()` を実行する  
**THEN** severity `error`、rule `base-branch-required` の violation が返る（charset エラーではなく missing エラー）

---

## TC-18 SLUG_REGEX は共有定数として1箇所で定義される

- **Category**: shared-constant
- **Priority**: must
- **Source**: T-01, T-04, T-05, T-06

**GIVEN** リポジトリの `src/` ディレクトリ  
**WHEN** `grep -rn "SLUG_REGEX\s*=" src/` を実行する  
**THEN** 定義がヒットするのは `src/util/validation-patterns.ts` のみで、`request-new.ts`, `rules-new.ts`, `command-registry.ts` にローカル定義が存在しない

---

## TC-19 SLUG_REGEX の正規表現は `/^[a-z0-9][a-z0-9-]{0,63}$/` と一致する

- **Category**: shared-constant
- **Priority**: must
- **Source**: T-01

**GIVEN** `src/util/validation-patterns.ts`  
**WHEN** `SLUG_REGEX` の値を参照する  
**THEN** `/^[a-z0-9][a-z0-9-]{0,63}$/` と等価な正規表現が定義されている

---

## TC-20 BASE_BRANCH_REGEX は先頭 `-` を reject し通常のブランチ名を accept する

- **Category**: shared-constant
- **Priority**: must
- **Source**: T-01

**GIVEN** `src/util/validation-patterns.ts` の `BASE_BRANCH_REGEX`  
**WHEN** `"-bad"` にマッチさせる / `"main"`, `"release/v1.0"`, `"feature/foo-bar"`, `"origin/main"` にマッチさせる  
**THEN** `-bad` は false を返し、残りはすべて true を返す

---

## TC-21 `request-new.ts` は SLUG_REGEX を共有定数から import する

- **Category**: shared-constant
- **Priority**: must
- **Source**: T-04

**GIVEN** `src/core/command/request-new.ts`  
**WHEN** ファイルの import 宣言と SLUG_REGEX 利用箇所を確認する  
**THEN** ローカル定義 `const SLUG_REGEX` が存在せず、`../../util/validation-patterns.js` からの import が存在する

---

## TC-22 `rules-new.ts` は SLUG_REGEX を共有定数から import する

- **Category**: shared-constant
- **Priority**: must
- **Source**: T-05

**GIVEN** `src/core/command/rules-new.ts`  
**WHEN** ファイルの import 宣言と SLUG_REGEX 利用箇所を確認する  
**THEN** ローカル定義 `const SLUG_REGEX` が存在せず、`../../util/validation-patterns.js` からの import が存在する

---

## TC-23 `command-registry.ts` は SLUG_REGEX を共有定数から import する

- **Category**: shared-constant
- **Priority**: must
- **Source**: T-06

**GIVEN** `src/cli/command-registry.ts`  
**WHEN** ファイルの import 宣言と SLUG_REGEX 利用箇所を確認する  
**THEN** ローカル定義 `const SLUG_REGEX` が存在せず、`../util/validation-patterns.js` からの import が存在し、L261/L287/L302 付近の参照が動作する

---

## TC-24 typecheck が全ファイルで green を維持する

- **Category**: regression
- **Priority**: must
- **Source**: T-09

**GIVEN** 全変更が適用された状態のリポジトリ  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなしで終了する

---

## TC-25 テストスイートが全 green を維持する

- **Category**: regression
- **Priority**: must
- **Source**: T-09

**GIVEN** 全変更が適用された状態のリポジトリ  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、既存テストの修正は不要なまま green である
