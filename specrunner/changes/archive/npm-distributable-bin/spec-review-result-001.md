# Spec Review Result: npm-distributable-bin

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-19

---

## Summary

変更スコープは小さく、設計判断は明確で、リスクは適切にスコープ外へ先送りされている。問題なし。

---

## Coverage Check

| request.md 要件 | spec.md 対応 | 評価 |
|---|---|---|
| bin field → dist/bin/specrunner.js | Requirement: bin field points to built JS | ✓ |
| tsconfig.build.json 分離 | Requirement: tsconfig.build.json 分離 | ✓ |
| scripts.start 削除 | Requirement: start script 削除 | ✓ |
| dist/ gitignore 確認 | Requirement: dist/ は gitignore 済み | ✓ (実ファイル確認済) |
| bun ./bin/specrunner.ts 維持 | Requirement: 開発時実行経路の維持 | ✓ |
| node 実行可能 | Requirement: node 実行可能 | ✓ |

tasks.md の Task 4 に `bun run typecheck && bun run test` が検証手順として含まれており、受け入れ基準と整合している。

---

## Design Correctness

- **tsconfig.build.json**: `extends: "./tsconfig.json"` で型チェック設定を継承しつつ `noEmit: false` で emit を有効化、`include` で tests/ を除外。設計は正確。
- **rootDir: "."**: 親 tsconfig.json に既存であり、tsconfig.build.json での明示は冗長だが害はない。`dist/bin/specrunner.js` からの `../src/...` import が正しく解決される。
- **moduleResolution: "Bundler"**: tsc の emit 出力には影響しない（型解決の指定のみ）。emitted ESM は `"type": "module"` 済みの package.json 下で node により実行可能。
- **shebang**: `#!/usr/bin/env node` は tsc が emit 時に保持する。確認済み。
- **gitignore**: `.gitignore` の `dist/` エントリを実ファイルで確認済み。要件を既に満たしている。
- **ADR 配置**: `docs/adr/001-tsconfig-build-separation.md` — `docs/adr/` ディレクトリは未存在だが、Task 3 でディレクトリ作成込みで指定されており問題なし。

---

## Security

ビルド設定の変更のみ。認証・入力バリデーション・外部 API の変更なし。OWASP Top 10 非該当。

---

## Findings (非ブロッカー)

1. **spec.md に typecheck/test green の要件がない** — tasks.md の Task 4 検証手順には含まれているため実装上は担保される。spec としての明示性は低いが blocking ではない。
2. **prepublishOnly 未設定** — design.md に既知リスクとして明記されており、publish スコープ外として適切に先送り済み。
