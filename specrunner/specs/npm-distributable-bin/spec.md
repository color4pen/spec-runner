## Purpose

TBD

## Requirements

### Requirement: bin field points to built JS

`package.json` の `bin.specrunner` は `./dist/bin/specrunner.js` を指すこと。TypeScript ソース (`./bin/specrunner.ts`) を直接指してはならない。

### Requirement: tsconfig.build.json 分離

`tsconfig.build.json` を新設し、`bun run build` は `tsc -p tsconfig.build.json` を実行すること。
- `extends: "./tsconfig.json"` で型チェック設定を継承する
- `compilerOptions.noEmit: false` で emit を有効化する
- `include: ["src/**/*.ts", "bin/**/*.ts"]` とし、tests/ を除外する
- `rootDir: "."` を維持し、`dist/bin/`・`dist/src/` 構造を保持する

### Requirement: start script 削除

`package.json` の `scripts.start` を削除すること（現状 `node dist/cli.js` という存在しないファイルを指しており、復活させる用途もない）。

### Requirement: dist/ は gitignore 済み

`dist/` が `.gitignore` に含まれており、ビルド成果物が git に追跡されないこと。

### Requirement: 開発時実行経路の維持

`bun ./bin/specrunner.ts` による開発時実行が引き続き動作すること（TypeScript ソースは削除しない）。

### Requirement: node 実行可能

`bun run build` 後に `node ./dist/bin/specrunner.js --help` が USAGE を出力すること。
