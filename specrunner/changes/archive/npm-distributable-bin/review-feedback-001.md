# Code Review Feedback: npm-distributable-bin — Iteration 1

- **verdict**: approved
- **reviewer**: code-reviewer
- **date**: 2026-05-19

---

## Summary

変更スコープは 3 ファイル（`tsconfig.build.json` 新設、`package.json` 修正、`docs/adr/001-tsconfig-build-separation.md` 新設）のみ。設計と実装が一致しており、verification-result は build/typecheck/test すべて green。すべての must-priority テストケースが満たされている。

---

## Test Case Coverage (must)

| TC | 内容 | 結果 |
|----|------|------|
| TC-001 | `bun run build` → `dist/bin/specrunner.js` 生成 | ✓ (verification build: passed, exit 0) |
| TC-002 | `dist/tests/` が存在しない | ✓ (`tsconfig.build.json` が `tests/**` を include しない) |
| TC-004 | `node ./dist/bin/specrunner.js --help` が USAGE 出力 | ✓ (build 成功 + shebang 維持 + import 解決) |
| TC-006 | shebang = `#!/usr/bin/env node` | ✓ (`bin/specrunner.ts` L1 確認済み、tsc が保持) |
| TC-007 | import パスが実行時に解決 | ✓ (`rootDir: "."` で dist/bin → dist/src が正しくマップ) |
| TC-008 | `bun ./bin/specrunner.ts --help` が動作 | ✓ (ソース未変更) |
| TC-009 | `package.json.bin.specrunner` = `./dist/bin/specrunner.js` | ✓ |
| TC-010 | `scripts.build` = `tsc -p tsconfig.build.json` | ✓ |
| TC-011 | `scripts.start` が存在しない | ✓ |
| TC-012 | `tsconfig.build.json` が存在 | ✓ |
| TC-013 | `extends: "./tsconfig.json"` | ✓ |
| TC-014 | `noEmit: false` | ✓ |
| TC-015 | `include` に `src/**` と `bin/**` のみ | ✓ |
| TC-016 | `rootDir: "."` | ✓ |
| TC-017 | `dist/` が `.gitignore` 済み | ✓ (`.gitignore` L5 確認) |
| TC-018 | `bun run typecheck` green | ✓ (exit 0) |
| TC-019 | `bun run test` green | ✓ (2293 passed) |
| TC-020 | `docs/adr/001-tsconfig-build-separation.md` が存在 | ✓ |
| TC-021 | ADR に tsconfig 分離の決定が記録 | ✓ |
| TC-022 | ADR に bin 出力パスの決定が記録 | ✓ |

---

## Findings

### INFO: `tsconfig.build.json` の `outDir` / `rootDir` は親から継承済み

`tsconfig.json` に `outDir: "./dist"` と `rootDir: "."` が既に定義されているため、`tsconfig.build.json` での明示は冗長。ただし自己文書化の観点では有用であり、動作に悪影響はない。変更不要。

### INFO: `moduleResolution: "Bundler"` が継承される

親 `tsconfig.json` の `moduleResolution: "Bundler"` がビルド時にも継承される。emit される JS は `type: "module"` 環境の Node.js で正しく動作する（import path が `.js` 拡張子付きで記述されている）。spec-review でも確認済みのため問題なし。

---

## 変更評価

| 観点 | 評価 |
|------|------|
| 要件充足 | 全 must 要件を満たす |
| スコープ遵守 | スコープ内のみ変更（`private: true` / engines / publish 設定は未変更） |
| ADR 記録 | tsconfig 分離・bin 出力パスの両決定が ADR に正しく記録 |
| 後退リスク | bun 実行経路はソース未変更のため影響なし |
