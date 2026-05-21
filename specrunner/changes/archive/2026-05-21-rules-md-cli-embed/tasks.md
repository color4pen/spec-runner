# Tasks: rules-md-cli-embed

## Task 1: `src/prompts/rules.ts` を新規作成

- [x] `src/prompts/rules.ts` を作成
- [x] `specrunner/rules.md` の全文を template literal で `export const RULES_MD_CONTENT` として配置
- [x] JSDoc: "Pipeline agent rules — source of truth for specrunner/changes/<slug>/rules.md"

**Note**: 文言は現状の `specrunner/rules.md` をそのまま移植。内容変更なし。

## Task 2: `src/util/copy-artifacts.ts` を書き換え

- [x] `import { rulesSourcePath, rulesDestPath }` → `import { rulesDestPath }` に変更（`rulesSourcePath` import 削除）
- [x] `import { RULES_MD_CONTENT } from "../../prompts/rules.js"` を追加（paths.ts の no-import 制約は copy-artifacts.ts には適用されない）
- [x] 関数内部: `fs.access(src)` + `fs.cp(src, dest)` → `fs.writeFile(dest, RULES_MD_CONTENT)` に置換
- [x] dest ディレクトリが存在しない場合に備え `fs.mkdir(path.dirname(dest), { recursive: true })` を writeFile 前に追加
- [x] try-catch の catch 節（ENOENT warning）を削除
- [x] `const src = ...` 行を削除
- [x] JSDoc を更新: "disk copy" → "writes embedded rules content"

## Task 3: `src/util/paths.ts` から `rulesSourcePath` を削除

- [x] `rulesSourcePath` 関数とその JSDoc を削除
- [x] `rulesDestPath` は残す

## Task 4: `specrunner/rules.md` をリポジトリから削除

- [x] `git rm specrunner/rules.md` で tracked file を削除

## Task 5: `tests/unit/rules-md.test.ts` を書き換え

- [x] `import * as fs from "node:fs/promises"` と `import * as path from "node:path"` を削除
- [x] `import { RULES_MD_CONTENT } from "../../src/prompts/rules.js"` を追加
- [x] `RULES_MD_PATH` 定数を削除
- [x] `"rules.md — file existence"` describe ブロック（TC-42: `fs.access` で存在確認）を削除
- [x] `"rules.md — ADR placement discipline section"` 内の各 test: `fs.readFile(RULES_MD_PATH, "utf-8")` → `RULES_MD_CONTENT` に置換

## Task 6: `tests/unit/core/runtime/local.test.ts` を更新

- [x] TC-LR-014 (L590〜): mock manager の `create` 内で `specrunner/rules.md` を worktree に書く行を削除（string constant 方式では worktree 上にファイルが不要）。assertion は「change folder に rules.md が writeFile される」ことの検証に変更
- [x] TC-LR-017 (L633〜): describe ブロックごと削除（string constant 前提では ENOENT 経路が unreachable）

## Task 7: delta spec — `prompt-fragment-registry`

- [x] `specrunner/changes/rules-md-cli-embed/specs/prompt-fragment-registry/spec.md` を作成
- [x] baseline `### Requirement: rules.md の存在と構造的保証` を MODIFIED として記載
- [x] 内容: source of truth は `src/prompts/rules.ts` の `RULES_MD_CONTENT` string constant。change folder への配置は CLI が `fs.writeFile` で行う。`specrunner/rules.md` ファイルは repo に存在しない
- [x] Scenario を CLI 内部 string constant ベースに書き換え（GIVEN の `specrunner/rules.md` が存在する → `RULES_MD_CONTENT` が export されている）
