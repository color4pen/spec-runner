# Code Review Feedback: npm-package-setup — iter 1

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **date**: 2026-05-27

---

## Summary

npm-package-setup の実装は概ね正しく、package.json・LICENSE・publish.yml はすべて正確に作成されている。ただし2点の問題が見つかった。1点は受け入れ基準違反（HIGH）、1点はスコープ外変更（MEDIUM）。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| F-01 | HIGH | build-output / publish-artifact | `tsconfig.build.json` | `include: ["src/**/*.ts"]` が `src/**/__tests__/*.ts` を拾い、`dist/src/**/__tests__/*.test.js` として10ファイルがコンパイルされる。`npm pack --dry-run` でこれらが publish 対象に含まれ AC 違反（「dist/ に tests/ ディレクトリが存在しないこと」「npm pack 出力に tests/ が含まれないこと」）。`exclude` に `tests`（top-level）を追加したが `src/` 配下のインライン `__tests__` ディレクトリが抜けていた | `tsconfig.build.json` の `exclude` に `"src/**/__tests__"` を追加: `["node_modules", "dist", "tests", "src/**/__tests__", "vitest.config.ts"]` | yes |
| F-02 | MEDIUM | scope-creep | `src/core/step/code-fixer.ts` | `requiresCommit: true → false` の変更がリクエストスコープ外。request.md に記載なく、tasks.md でも「本変更とは無関係」と明記された pre-existing テスト失敗を、スコープ外のコード変更で修正している。`CodeFixerStep` のコミット強制ガードをオフにするパイプライン動作変更であり、別リクエストで設計・レビューが必要 | `code-fixer.ts` を revert し `requiresCommit: true` に戻す | yes |

---

## Test Coverage against test-cases.md

| TC | 優先度 | 評価 |
|----|--------|------|
| TC-01〜TC-08 (package.json) | must | ✅ すべて通過 |
| TC-09〜TC-11 (tsconfig.build.json) | must | ⚠️ TC-12/13（dist に tests/ が混入しないこと）が **F-01 により違反** |
| TC-12: dist に tests/ が混入しない | must | ❌ `dist/src/**/__tests__/` が存在する |
| TC-13: dist に vitest.config.js が混入しない | must | ✅ 通過 |
| TC-14: bun run build 成功 | must | ✅ 通過 |
| TC-15〜TC-16 (LICENSE) | must | ✅ すべて通過 |
| TC-17〜TC-22 (publish.yml) | must | ✅ すべて通過 |
| TC-23: npm pack 期待ファイル含まれる | must | ✅ dist/, README.md, LICENSE は含まれる |
| TC-24: npm pack 不要ファイル含まれない | must | ❌ `dist/src/**/__tests__/*.test.js` が10件含まれる |
| TC-25: typecheck green | must | ✅ 通過 |
| TC-26: test green | must | ✅ 通過（F-02 の変更込みのため、revert 後に再確認が必要） |
| TC-27〜TC-29 | should | ✅ 通過 |
| TC-30 | could | ✅ 通過 |
