# Design: npm-distributable-bin

## Summary

`bin/specrunner.ts` (TypeScript ソース) はそのまま残し、ビルド成果物 `dist/bin/specrunner.js` を `package.json` の `bin` field が指すように変更する。これにより `npx specrunner` が node 単体環境でも動作する。

## 現状分析

### 既にうまくいっていること

- `bun run build` (`tsc --noEmit false --outDir dist`) で `dist/bin/specrunner.js` が**既に生成される**
- `rootDir: "."` のおかげで dist/ 配下のディレクトリ構造がソースと一致し、`../src/...` の相対 import が**そのまま解決する**
- `node dist/bin/specrunner.js --help` は**既に動作する** (検証済み)
- shebang `#!/usr/bin/env node` は tsc が保持する
- `dist/` は `.gitignore` 済み
- `@/*` path alias はソース中で未使用 → tsc の path rewrite 問題なし

### 変更が必要な箇所

| 箇所 | 現状 | 変更後 |
|------|------|--------|
| `package.json` `bin` | `./bin/specrunner.ts` | `./dist/bin/specrunner.js` |
| `package.json` `scripts.start` | `node dist/cli.js` (存在しないファイル) | 削除 |
| `package.json` `scripts.build` | `tsc --noEmit false --outDir dist` | `tsc -p tsconfig.build.json` |
| tsconfig build | なし (main tsconfig を flag override) | `tsconfig.build.json` を新設 |

## ADR: tsconfig.build.json 分離

### 決定

`tsconfig.build.json` を新設し、`tsc -p tsconfig.build.json` でビルドする。

### 根拠

現状の `tsc --noEmit false --outDir dist` は動作するが以下の問題がある:

1. **不要な成果物**: `tests/**/*.ts` と `vitest.config.ts` が dist/ に出力される (現状 dist/tests/ に 40+ ファイル)
2. **フラグ override の脆弱性**: `noEmit: true` を CLI flag で上書きする手法は tsconfig の意図と矛盾する
3. **慣習との乖離**: TypeScript プロジェクトでは `tsconfig.build.json` で emit 範囲を制御するのが標準的

`tsconfig.build.json`:
- `extends: "./tsconfig.json"` で型チェック設定を継承
- `compilerOptions.noEmit: false` で emit を有効化
- `include: ["src/**/*.ts", "bin/**/*.ts"]` で tests を除外
- `rootDir: "."` を維持 → `dist/bin/`, `dist/src/` 構造を保持

コストは 1 ファイル追加のみ。

### 却下した代替案

- **現状維持 (flag override)**: dist/ に tests が混入し続ける。npm publish 時に余計なファイルが含まれるリスク。
- **rootDir を src に変更**: bin/ が include 範囲外になり、別途コピーが必要になる。複雑性が増す。

## ADR: bin 出力パス (dist/bin/ vs dist/)

### 決定

`dist/bin/specrunner.js` (= ソース構造をそのまま保持)。

### 根拠

- `rootDir: "."` で `bin/specrunner.ts` → `dist/bin/specrunner.js`、`src/**` → `dist/src/**` と自然にマッピングされる
- import path `../src/cli/command-registry.js` が dist/ 配下でもそのまま解決する
- 別途 `dist/specrunner.js` に配置する場合、import path の書き換えまたは rootDir の変更が必要になり、複雑性が増す

## 影響範囲

### 変更なし (確認のみ)

- `bin/specrunner.ts` — ソースファイルはそのまま残る
- `.gitignore` — `dist/` は既に無視対象
- shebang — `#!/usr/bin/env node` は既に node 指定
- テスト — bin を import しているテストは TypeScript ソースを参照しており、ビルド出力とは無関係

### package.json の `files` field

現状 `files` field は未定義。npm publish 時にはデフォルトで全ファイルが含まれる。`files` field の設定は publish workflow (別 request) のスコープとする。

## リスク

- **prepublishOnly script 未設定**: `npm publish` 前に自動ビルドが走らない。ただし publish 自体がスコープ外のため、今回は設定しない。
- **`private: true` のまま**: 意図的にスコープ外。publish 可能にするのは別 request。
