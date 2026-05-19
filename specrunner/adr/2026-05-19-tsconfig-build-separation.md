# ADR: tsconfig.build.json 分離と bin 出力パス

**Date**: 2026-05-19
**Status**: Accepted
**Request**: npm-distributable-bin

## Context

`bin/specrunner.ts` を TypeScript のまま `package.json` の `bin` field に指定していたため、node 単体環境（bun 未インストール）では `npx specrunner` が動作しなかった。ビルド成果物 `dist/bin/specrunner.js` を `bin` field が指すように変更するにあたり、2 点の設計判断が必要だった。

### 既存の状態

- `package.json scripts.build`: `tsc --noEmit false --outDir dist`（flag で強引に emit）
- `tsconfig.json`: `noEmit: true`（ビルド成果物が出ない設定）
- `tsconfig.json include`: `["src/**/*.ts", "bin/**/*.ts", "tests/**/*.ts", ...]`（tests も emit 対象）
- `package.json bin.specrunner`: `./bin/specrunner.ts`（.ts ソース直指定）

## Decision 1: tsconfig.build.json を分離する

### 決定

`tsconfig.build.json` を新設し、`tsc -p tsconfig.build.json` でビルドする。

### 根拠

現状の `tsc --noEmit false --outDir dist` は動作するが以下の問題がある:

1. **不要な成果物の混入**: `tests/**/*.ts` と `vitest.config.ts` が `dist/` に出力される（現状 `dist/tests/` に 40+ ファイル）。npm publish 時に余計なファイルが含まれるリスクがある。
2. **フラグ override の脆弱性**: `noEmit: true` を CLI flag で上書きする手法は tsconfig の意図と矛盾し、将来の設定変更で意図せず壊れる可能性がある。
3. **慣習との乖離**: TypeScript プロジェクトでは `tsconfig.build.json` で emit 範囲を制御するのが標準的。

`tsconfig.build.json` の設計:
- `extends: "./tsconfig.json"` で型チェック設定を継承
- `compilerOptions.noEmit: false` で emit を有効化
- `include: ["src/**/*.ts", "bin/**/*.ts"]` で `tests/` を除外
- `rootDir: "."` を維持 → `dist/bin/`, `dist/src/` 構造を保持

コストは 1 ファイル追加のみ。

### 却下した代替案

| 案 | 却下理由 |
|---|---|
| 現状維持（flag override） | `dist/` に tests が混入し続ける。npm publish 時に余計なファイルが含まれるリスク |
| `rootDir` を `src` に変更 | `bin/` が include 範囲外になり、別途コピーが必要になる。複雑性が増す |

## Decision 2: bin 出力パスは `dist/bin/specrunner.js`

### 決定

`dist/bin/specrunner.js`（ソース構造をそのまま保持）。`package.json` の `bin.specrunner` をこのパスに変更する。

### 根拠

- `rootDir: "."` で `bin/specrunner.ts` → `dist/bin/specrunner.js`、`src/**` → `dist/src/**` と自然にマッピングされる
- `bin/specrunner.ts` 内の import path `../src/cli/command-registry.js` が `dist/bin/specrunner.js` からも同じ相対パスで解決する（ソース構造が dist/ 配下で保たれるため）
- 別途 `dist/specrunner.js` にフラット配置する場合、import path の書き換えまたは `rootDir` の変更が必要になり、複雑性が増す

### 却下した代替案

| 案 | 却下理由 |
|---|---|
| `dist/specrunner.js`（フラット配置） | `../src/...` の import path が壊れる。rootDir 変更か path 書き換えが必要 |

## Consequences

### Positive

- `bun run build` で `dist/bin/specrunner.js` が生成される
- `dist/tests/` は生成されなくなる（npm publish 時のクリーンな出力）
- `node ./dist/bin/specrunner.js --help` が動作する（node 単体環境で `npx specrunner` が可能になる）
- `bun ./bin/specrunner.ts` での開発時実行は引き続き可能（ソースファイルはそのまま残る）

### Neutral

- npm publish 自体（`"private": true` を外す、CI リリース自動化）は別 request のスコープ
- `package.json scripts.start`（`node dist/cli.js` という存在しないファイルを指す誤記）を削除
