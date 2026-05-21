# Test Cases: rules-md-cli-embed

## TC-01: RULES_MD_CONTENT が export されている

- **Category**: Unit / src/prompts/rules.ts
- **Priority**: must
- **Source**: Task 1, 受け入れ基準「src/prompts/rules.ts が source of truth として export を持ち、他ファイルから参照可能」

**GIVEN** `src/prompts/rules.ts` が存在する  
**WHEN** `import { RULES_MD_CONTENT } from "../../src/prompts/rules.js"` を実行する  
**THEN** `RULES_MD_CONTENT` が string 型で export されており、undefined でない

---

## TC-02: RULES_MD_CONTENT が空でなく有効なコンテンツを含む

- **Category**: Unit / src/prompts/rules.ts
- **Priority**: must
- **Source**: Task 1, Task 5, design.md D4

**GIVEN** `RULES_MD_CONTENT` が import されている  
**WHEN** コンテンツを検査する  
**THEN** 空文字でなく、かつ旧 `specrunner/rules.md` に含まれていたセクション見出し（例: Markdown ヘッダ）が含まれている

---

## TC-03: RULES_MD_CONTENT が既存 fragments と同パターンの export 形式

- **Category**: Unit / src/prompts/rules.ts
- **Priority**: should
- **Source**: design.md D1「src/prompts/fragments.ts の COMMIT_DISCIPLINE / PIPELINE_RULES と同パターン」

**GIVEN** `src/prompts/rules.ts` が存在する  
**WHEN** ファイルの export 構造を確認する  
**THEN** `export const RULES_MD_CONTENT = \`...\`` の template literal 形式であり、default export ではなく named export である

---

## TC-04: copyRulesToChangeFolder が change folder に rules.md を writeFile する

- **Category**: Unit / src/util/copy-artifacts.ts
- **Priority**: must
- **Source**: Task 2, 受け入れ基準「bun ./bin/specrunner.ts run を実行すると change folder に rules.md が writeFile される」

**GIVEN** `copyRulesToChangeFolder(repoRoot, slug, spawnFn)` が呼び出せる状態である  
**WHEN** 関数を呼び出す  
**THEN** `specrunner/changes/<slug>/rules.md` が `RULES_MD_CONTENT` と同一内容で作成される

---

## TC-05: copyRulesToChangeFolder が dest ディレクトリを事前に作成する

- **Category**: Unit / src/util/copy-artifacts.ts
- **Priority**: must
- **Source**: Task 2「fs.mkdir(path.dirname(dest), { recursive: true }) を writeFile 前に追加」

**GIVEN** `specrunner/changes/<slug>/` ディレクトリが存在しない状態  
**WHEN** `copyRulesToChangeFolder(repoRoot, slug, spawnFn)` を呼び出す  
**THEN** ディレクトリが自動作成され、rules.md が正常に書き込まれる

---

## TC-06: copyRulesToChangeFolder が fs.cp / fs.access を使わない

- **Category**: Unit / src/util/copy-artifacts.ts
- **Priority**: must
- **Source**: Task 2, design.md D3「disk read 起因の ENOENT は起きない」

**GIVEN** `copy-artifacts.ts` のソースコード  
**WHEN** ファイル内容を静的検査する  
**THEN** `fs.cp` および `fs.access` の呼び出しが存在しない

---

## TC-07: copyRulesToChangeFolder の ENOENT catch 節が存在しない

- **Category**: Unit / src/util/copy-artifacts.ts
- **Priority**: must
- **Source**: Task 2, design.md D3、TC-LR-017 削除の根拠

**GIVEN** `copy-artifacts.ts` のソースコード  
**WHEN** ファイル内容を静的検査する  
**THEN** `ENOENT` または `rules.md not found` を参照する catch / warning コードが存在しない

---

## TC-08: copyRulesToChangeFolder の signature が変更されていない

- **Category**: Unit / src/util/copy-artifacts.ts
- **Priority**: should
- **Source**: design.md D2「signature は変更しない（repoRoot, slug, spawnFn）」

**GIVEN** `copyRulesToChangeFolder` が定義されている  
**WHEN** 関数シグネチャを確認する  
**THEN** 引数が `(repoRoot: string, slug: string, spawnFn: ...)` の形であり、呼び出し側の変更が不要

---

## TC-09: rulesSourcePath が paths.ts から削除されている

- **Category**: Unit / src/util/paths.ts
- **Priority**: must
- **Source**: Task 3, 要件 3

**GIVEN** `src/util/paths.ts` が存在する  
**WHEN** ファイル内容を検査する  
**THEN** `rulesSourcePath` の関数定義および export が存在しない

---

## TC-10: rulesDestPath が paths.ts に残存している

- **Category**: Unit / src/util/paths.ts
- **Priority**: must
- **Source**: Task 3, 要件 3「rulesDestPath は残す MUST」

**GIVEN** `src/util/paths.ts` が存在する  
**WHEN** ファイル内容を検査する  
**THEN** `rulesDestPath` 関数が export されている

---

## TC-11: specrunner/rules.md がリポジトリから追跡されていない

- **Category**: Integration / git
- **Priority**: must
- **Source**: Task 4, 受け入れ基準「git ls-files specrunner/rules.md が空」

**GIVEN** リポジトリの git 追跡状態  
**WHEN** `git ls-files specrunner/rules.md` を実行する  
**THEN** 出力が空（= 追跡ファイルとして存在しない）

---

## TC-12: specrunner/rules.md ファイルが物理的に存在しない

- **Category**: Integration / git
- **Priority**: must
- **Source**: Task 4, 受け入れ基準「specrunner/rules.md ファイルが repo から削除されている」

**GIVEN** リポジトリのファイルシステム  
**WHEN** `specrunner/rules.md` のパスを確認する  
**THEN** ファイルが存在しない

---

## TC-13: rules-md.test.ts が disk read なしで content を検証する

- **Category**: Unit / tests/unit/rules-md.test.ts
- **Priority**: must
- **Source**: Task 5, design.md D4

**GIVEN** `tests/unit/rules-md.test.ts` のソースコード  
**WHEN** ファイル内容を検査する  
**THEN** `fs.readFile` の呼び出しが存在せず、`RULES_MD_CONTENT` の import が存在する

---

## TC-14: rules-md.test.ts の file existence テストが削除されている

- **Category**: Unit / tests/unit/rules-md.test.ts
- **Priority**: must
- **Source**: Task 5「"rules.md — file existence" describe ブロック（TC-42）を削除」

**GIVEN** `tests/unit/rules-md.test.ts` のソースコード  
**WHEN** ファイル内容を検査する  
**THEN** `rules.md — file existence` describe ブロックおよび `fs.access` を使うテストが存在しない

---

## TC-15: TC-LR-014 が string → writeFile 方式の assertion に更新されている

- **Category**: Unit / tests/unit/core/runtime/local.test.ts
- **Priority**: must
- **Source**: Task 6「TC-LR-014 (L590〜): assertion は change folder に rules.md が writeFile されることの検証に変更」

**GIVEN** `tests/unit/core/runtime/local.test.ts` の TC-LR-014  
**WHEN** テストを実行する  
**THEN** change folder に `rules.md` が書き込まれたことを検証し、worktree 上に事前ファイルを配置する setup が存在しない

---

## TC-16: TC-LR-017 が削除されている

- **Category**: Unit / tests/unit/core/runtime/local.test.ts
- **Priority**: must
- **Source**: Task 6「TC-LR-017 (L633〜): describe ブロックごと削除」

**GIVEN** `tests/unit/core/runtime/local.test.ts` のソースコード  
**WHEN** ファイル内容を検査する  
**THEN** `TC-LR-017` および `specrunner/rules.md not found` を参照する describe ブロックが存在しない

---

## TC-17: delta spec が prompt-fragment-registry に存在する

- **Category**: Spec / delta
- **Priority**: must
- **Source**: Task 7

**GIVEN** `specrunner/changes/rules-md-cli-embed/specs/prompt-fragment-registry/spec.md`  
**WHEN** ファイルの存在を確認する  
**THEN** ファイルが存在する

---

## TC-18: delta spec が MODIFIED として rules.md 要件を更新している

- **Category**: Spec / delta
- **Priority**: must
- **Source**: Task 7, 要件 7「baseline ... を MODIFIED として更新」

**GIVEN** delta spec `specrunner/changes/rules-md-cli-embed/specs/prompt-fragment-registry/spec.md`  
**WHEN** ファイル内容を確認する  
**THEN** `### Requirement: rules.md の存在と構造的保証` に対応する MODIFIED セクションがあり、「source of truth は `RULES_MD_CONTENT` string constant」および「CLI が `fs.writeFile` で配置する」旨の記述が含まれる

---

## TC-19: delta spec の Scenario が CLI 内部 string constant ベースに書き換えられている

- **Category**: Spec / delta
- **Priority**: should
- **Source**: Task 7「Scenario を CLI 内部 string constant ベースに書き換え」

**GIVEN** delta spec の Scenario セクション  
**WHEN** 内容を確認する  
**THEN** GIVEN 条件が `specrunner/rules.md が存在する` ではなく `RULES_MD_CONTENT が export されている` ベースになっている

---

## TC-20: typecheck が通る

- **Category**: Build
- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck && bun run test が green」

**GIVEN** 変更後のソースコード全体  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-21: テストスイート全体が green

- **Category**: Build
- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck && bun run test が green」

**GIVEN** 変更後のソースコード全体  
**WHEN** `bun run test` を実行する  
**THEN** すべてのテストが pass し、失敗 0 件で終了する

---

## TC-22: rulesSourcePath への参照がコードベース全体に残っていない

- **Category**: Static Analysis
- **Priority**: should
- **Source**: Task 3「rulesSourcePath export を削除」

**GIVEN** コードベース全体  
**WHEN** `rulesSourcePath` を grep する  
**THEN** `src/util/paths.ts` 以外のファイルに参照が存在しない（paths.ts 自体も定義を持たない）

---

## TC-23: copy-artifacts.ts が RULES_MD_CONTENT を正しく import している

- **Category**: Unit / src/util/copy-artifacts.ts
- **Priority**: must
- **Source**: Task 2「import { RULES_MD_CONTENT } from "../../prompts/rules.js" を追加」

**GIVEN** `src/util/copy-artifacts.ts` のソースコード  
**WHEN** import 宣言を確認する  
**THEN** `RULES_MD_CONTENT` が `../../prompts/rules.js` から import されており、`rulesSourcePath` の import が存在しない
