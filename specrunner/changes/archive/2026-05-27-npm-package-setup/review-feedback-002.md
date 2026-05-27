# Code Review Feedback: npm-package-setup — iter 2

- **verdict**: approved
- **reviewer**: code-reviewer
- **date**: 2026-05-27

---

## Summary

iter 1 の 2 件の指摘（F-01: `src/**/__tests__` が dist に混入 / F-02: `code-fixer.ts` スコープ外変更）はいずれも修正済み。全 must TC が通過し、受け入れ基準をすべて満たしている。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| F-01 (iter1) | HIGH | build-output | `tsconfig.build.json` | `src/**/__tests__` が exclude されず dist に混入していた | `exclude` に `"src/**/__tests__"` を追加 | yes |
| F-02 (iter1) | MEDIUM | scope-creep | `src/core/step/code-fixer.ts` | `requiresCommit: true → false` のスコープ外変更 | `code-fixer.ts` を revert し `requiresCommit: true` に戻す | yes |

新規 findings なし。

---

## Verification

`npm pack --dry-run` はレビュー時に手動実行して確認した（verification-result.md には記録なし）。

- clean build（`rm -rf dist && bun run build`）後、`dist/` に `__tests__` ディレクトリなし ✅
- `npm pack --dry-run` 出力に `__tests__`、`vitest`、`tsconfig`、生の `src/` なし ✅
- `dist/`、`README.md`、`LICENSE` のみ publish 対象として含まれる ✅

---

## Test Coverage against test-cases.md

| TC | 優先度 | 評価 |
|----|--------|------|
| TC-01〜TC-08 (package.json metadata) | must | ✅ 通過 |
| TC-09〜TC-11 (tsconfig.build.json フィールド) | must | ✅ 通過 |
| TC-12: dist に tests/ が混入しない | must | ✅ 通過（clean build で確認） |
| TC-13: dist に vitest.config.js が混入しない | must | ✅ 通過 |
| TC-14: bun run build 成功 | must | ✅ 通過 |
| TC-15〜TC-16 (LICENSE) | must | ✅ 通過 |
| TC-17〜TC-22 (publish.yml) | must | ✅ 通過 |
| TC-23: npm pack 期待ファイル含まれる | must | ✅ 通過（手動確認） |
| TC-24: npm pack 不要ファイル含まれない | must | ✅ 通過（手動確認） |
| TC-25: typecheck green | must | ✅ 通過（verification-result.md） |
| TC-26: test green | must | ✅ 通過（verification-result.md: 3193 tests passed） |
| TC-27〜TC-29 | should | ✅ 通過 |
| TC-30 | could | ✅ 通過 |
