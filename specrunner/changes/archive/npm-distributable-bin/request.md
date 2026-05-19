# bin/specrunner.ts をビルド済み JS に置き換えて npm 配布可能にする

## Meta

- **type**: spec-change
- **slug**: npm-distributable-bin
- **base-branch**: main
- **adr**: true

## 背景

`bin/specrunner.ts` が TypeScript のまま git 管理されており、`bun ./bin/specrunner.ts` で直接実行している。npm パッケージとして配布する場合、TypeScript を直接実行できない環境 (= node 単体、bun 未インストール環境) では動かない。

### 現状の構成

- `package.json`:
  - `"bin": { "specrunner": "./bin/specrunner.ts" }` (= .ts そのまま)
  - `"engines": { "bun": ">=1.0.0" }` (= bun 前提)
  - `"private": true` (= npm publish 不可)
  - `"scripts.start": "node dist/cli.js"` (= 存在しないファイル名、現状で死んでいる)
- `tsconfig.json`:
  - `"noEmit": true` (= ビルド成果物が出ない設定)
  - `"include": ["src/**/*.ts", "bin/**/*.ts", ...]` (= bin も型 check 対象)
- `package.json scripts.build`: `"tsc --noEmit false --outDir dist"` (= flag で強引に emit、build 専用 tsconfig はない)

### 問題

- node 環境で `npx specrunner` 等が動かない (= bin が .ts)
- start script が誤記 (= `cli.js` という名のファイルが存在しない、おそらく旧名残)
- build 出力は dist/ に出るが、bin field が .ts を指したまま = ビルドしても解決しない

## 思想

CLI を **node 直接実行可能** な状態にして、配布手段の選択肢を広げる (= 内部開発は bun 継続可、配布は node も対応)。
bun 専用機能 ([[feedback-mainstream-toolchain]]) は使わない規律はすでにあるため、tsc build 成果物をそのまま node で実行できる前提。

## 要件

### 1. ビルド構成の整理

- `bin/specrunner.ts` はソースとして残す (= 開発時は `bun ./bin/specrunner.ts` で実行可能)
- ビルド時は `dist/bin/specrunner.js` を生成する
- shebang は `#!/usr/bin/env node` (= 既に node 指定済、確認のみ)
- build 専用 tsconfig (= `tsconfig.build.json`) を分けるか、現状の `tsc --noEmit false` を活かすかは design で決定 (= ADR で記録)

### 2. package.json の修正

- `"bin": { "specrunner": "./dist/bin/specrunner.js" }` (= ビルド成果物を指す)
- `"scripts.start"` は削除する (= 現状 `cli.js` という存在しないファイルを指していて死んでいる、復活させる用途もない)
- `"private": true` の扱いは本 request のスコープ外 (= 後続の publish workflow で外す、別 request)

### 3. gitignore 整理

- `dist/` は既に `.gitignore` 済の前提で確認、未対応なら追加
- ビルド成果物が git に入らないことを確認

### 4. 既存実行経路の維持

- `bun ./bin/specrunner.ts` での開発時実行は引き続き可能 (= ts ソースは残す)
- CI / dogfooding で `bun` 経由実行している箇所が壊れないこと
- `bin/specrunner.ts` 内の import path (= `../src/cli/command-registry.js` 等) は build 後も解決すること (= rootDir / outDir の扱いを正しく設定)

### 5. 検証

- `bun run build` で `dist/bin/specrunner.js` が生成される
- `node ./dist/bin/specrunner.js --help` が USAGE を出力する
- `bun run typecheck && bun run test` が green

## スコープ外

- npm publish 自体の workflow (= `"private": true` を外す、CI でのリリース自動化、別 request)
- bun 依存 (= `"engines": { "bun": ">=1.0.0" }`) を外すか否か (= 内部開発は bun 継続前提、別議論)
- Windows サポート (= 既存に Windows 動作保証はなく、本 request は POSIX 前提)

## 受け入れ基準

- [ ] `bun run build` 後に `dist/bin/specrunner.js` が生成される
- [ ] `node ./dist/bin/specrunner.js --help` が USAGE を表示する
- [ ] `bun ./bin/specrunner.ts --help` も引き続き同じ USAGE を表示する (= 既存開発フロー破壊なし)
- [ ] `package.json.bin.specrunner` が `./dist/bin/specrunner.js` を指す
- [ ] `package.json.scripts.start` が削除される (= 現状の誤記が解消される)
- [ ] `dist/` が `.gitignore` 済
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「build 専用 tsconfig 分離 vs 既存 build script 流用」「bin の出力パス決定 (= dist/bin/ vs dist/)」が記録される

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
