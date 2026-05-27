# Code Review Feedback: npm-package-setup — iter 3

- **verdict**: approved
- **reviewer**: code-reviewer
- **date**: 2026-05-27

---

## Summary

iter 1 / iter 2 の 2 件の指摘（F-01: `src/**/__tests__` が dist に混入 / F-02: `code-fixer.ts` スコープ外変更）はいずれも修正済みで維持されている。全 must TC が通過し、受け入れ基準をすべて満たしている。新規 findings なし。

---

## Findings

新規 findings なし。iter 1 の指摘はすべて修正済み。

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| F-01 (iter1) | HIGH | build-output | `tsconfig.build.json` | `src/**/__tests__` が exclude されず dist に混入していた | `exclude` に `"src/**/__tests__"` を追加 | yes |
| F-02 (iter1) | MEDIUM | scope-creep | `src/core/step/code-fixer.ts` | `requiresCommit: false` のスコープ外変更 | `requiresCommit: true` に戻す | yes |

---

## Implementation Verification

| File | Status | Notes |
|------|--------|-------|
| `package.json` | ✅ | name / private削除 / license / repository / publishConfig / files / exports / engines.node すべて定義済み |
| `tsconfig.build.json` | ✅ | exclude に `tests`, `src/**/__tests__`, `vitest.config.ts` 含む。rootDir `"."` 維持 |
| `LICENSE` | ✅ | MIT License。著作権者 `color4pen`、年 `2025` |
| `.github/workflows/publish.yml` | ✅ | `v*` tag push トリガー / `packages: write` / `setup-node` registry-url / `--frozen-lockfile` / `NODE_AUTH_TOKEN` すべて正しい |
| `src/core/step/code-fixer.ts` | ✅ | main と差分なし（スコープ外変更なし） |

---

## Test Coverage against test-cases.md

| TC | 優先度 | 評価 |
|----|--------|------|
| TC-01: name = @color4pen/specrunner | must | ✅ |
| TC-02: private フィールド削除 | must | ✅ |
| TC-03: publishConfig.registry 正しい | must | ✅ |
| TC-04: files ホワイトリスト | must | ✅ |
| TC-05: exports エントリポイント | must | ✅ |
| TC-06: engines.node >= 20 / engines.bun 維持 | must | ✅ |
| TC-07: license = MIT | must | ✅ |
| TC-08: repository フィールド | must | ✅ |
| TC-09: exclude に tests | must | ✅ |
| TC-10: exclude に vitest.config.ts | must | ✅ |
| TC-11: rootDir = "." 維持 | must | ✅ |
| TC-12: dist に tests/ 混入なし | must | ✅（exclude に `src/**/__tests__` 追加済み） |
| TC-13: dist に vitest.config.js 混入なし | must | ✅ |
| TC-14: bun run build 成功 | must | ✅（verification-result: exit 0） |
| TC-15: LICENSE ファイル存在 | must | ✅ |
| TC-16: LICENSE 内容が MIT | must | ✅ |
| TC-17: publish.yml 存在 | must | ✅ |
| TC-18: v* tag push トリガー | must | ✅ |
| TC-19: ステップ実行順序 | must | ✅ |
| TC-20: NODE_AUTH_TOKEN = GITHUB_TOKEN | must | ✅ |
| TC-21: packages: write パーミッション | must | ✅ |
| TC-22: setup-node registry-url | must | ✅ |
| TC-23: npm pack に dist/ / README.md / LICENSE 含む | must | ✅（files ホワイトリスト） |
| TC-24: npm pack に tests/ / src/ / vitest.config.* / tsconfig.* 含まない | must | ✅（files ホワイトリスト + exclude） |
| TC-25: typecheck green | must | ✅（verification-result: exit 0） |
| TC-26: test green | must | ✅（verification-result: 3193 tests passed） |
| TC-27: --frozen-lockfile | should | ✅ |
| TC-28: setup-bun が bun install より前 | should | ✅ |
| TC-29: bun install lockfile 整合性 | should | ✅ |
| TC-30: npmjs.com に publish しない | could | ✅ |
