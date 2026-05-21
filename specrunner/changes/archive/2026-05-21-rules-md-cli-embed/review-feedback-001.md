# Code Review Feedback — rules-md-cli-embed — iter 1

- **verdict**: approved

## Summary

要件・設計に沿った実装で、must TC 19/19 すべてカバー済み。verification も 227 test files / 2462 tests green。

---

## Findings

### [INFO] rules.ts テンプレートリテラル内に stale wording

- **File**: `src/prompts/rules.ts` L10
- **Content**: `pipeline 実行時に \`specrunner/changes/<slug>/rules.md\` としてコピーされます。`
- **Issue**: 「コピーされます」は旧 `fs.cp` 方式の表現。現在は `fs.writeFile` で書き込む。agent がこの文を読んでも動作に影響はないが、メカニズムの説明として不正確。
- **Action**: fix-optional（機能影響なし）

### [INFO] tasks.md の import path と実装の乖離

- **tasks.md**: `import { RULES_MD_CONTENT } from "../../prompts/rules.js"` と指定
- **実装**: `import { RULES_MD_CONTENT } from "../prompts/rules.js"` を使用
- **判断**: `src/util/copy-artifacts.ts` から `src/prompts/rules.ts` への正しい相対パスは `../prompts/rules.js`。実装が正しく、task spec の誤記を実装が修正済み。問題なし。

---

## TC Coverage Check (must only)

| TC | Description | Status |
|----|-------------|--------|
| TC-01 | RULES_MD_CONTENT が export されている | ✅ `src/prompts/rules.ts` 確認済み |
| TC-02 | RULES_MD_CONTENT が空でなく有効なコンテンツを含む | ✅ ~153 行の template literal |
| TC-04 | copyRulesToChangeFolder が change folder に writeFile する | ✅ `copy-artifacts.ts` 実装確認 + `local.test.ts` TC-LR-014 |
| TC-05 | dest ディレクトリを事前に mkdir する | ✅ `fs.mkdir(..., { recursive: true })` 確認 |
| TC-06 | fs.cp / fs.access を使わない | ✅ grep で不在確認 |
| TC-07 | ENOENT catch 節が存在しない | ✅ grep で不在確認 |
| TC-09 | rulesSourcePath が paths.ts から削除 | ✅ grep で不在確認 |
| TC-10 | rulesDestPath が paths.ts に残存 | ✅ L114 確認 |
| TC-11 | git ls-files specrunner/rules.md が空 | ✅ 確認済み |
| TC-12 | specrunner/rules.md が物理的に存在しない | ✅ ls で不在確認 |
| TC-13 | rules-md.test.ts が disk read なし / RULES_MD_CONTENT import あり | ✅ 確認 |
| TC-14 | file existence テストが削除されている | ✅ `fs.access` / "file existence" describe なし |
| TC-15 | TC-LR-014 が string→writeFile 方式の assertion | ✅ `local.test.ts` L591〜628 確認 |
| TC-16 | TC-LR-017 が削除されている | ✅ grep で不在確認 |
| TC-17 | delta spec が prompt-fragment-registry に存在する | ✅ ファイル存在確認 |
| TC-18 | delta spec が MODIFIED として rules.md 要件を更新 | ✅ `RULES_MD_CONTENT`・`fs.writeFile` の記述確認 |
| TC-20 | typecheck が通る | ✅ verification-result.md: passed |
| TC-21 | テストスイート全体が green | ✅ 2462 passed |
| TC-23 | copy-artifacts.ts が RULES_MD_CONTENT を正しく import | ✅ `../prompts/rules.js` (正しいパス) |
