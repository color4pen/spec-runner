## Requirements

### Requirement: bin field points to built JS

`package.json` の `bin.specrunner` は `./dist/specrunner.js` を指さなければならない（SHALL）。TypeScript ソース (`./bin/specrunner.ts`) を直接指してはならない。

#### Scenario: bin field references tsup output

**Given** `tsup.config.ts` で entry が `bin/specrunner.ts`、outDir が `dist` に設定されている
**When** `package.json` の `bin.specrunner` を確認する
**Then** 値が `./dist/specrunner.js` である

### Requirement: tsconfig.build.json 分離

`tsconfig.build.json` はリポジトリに存在すること。ただし `bun run build` は `tsup` を実行する。`tsconfig.build.json` は tsc emit 用のリファレンスとして残置される。
- `extends: "./tsconfig.json"` で型チェック設定を継承する
- `compilerOptions.noEmit: false` で emit を有効化する
- `include: ["src/**/*.ts", "bin/**/*.ts"]` とし、tests/ を除外する
- `rootDir: "."` を維持する

The build script SHALL use `tsup` instead of `tsc -p tsconfig.build.json`.

#### Scenario: build script runs tsup

**Given** `package.json` の `scripts.build` が設定されている
**When** `bun run build` を実行する
**Then** tsup が実行され、`dist/specrunner.js` に single file バンドルが出力される

### Requirement: node 実行可能

`bun run build` 後に `node ./dist/specrunner.js --help` が USAGE を出力すること。出力ファイルの先頭に `#!/usr/bin/env node` shebang が含まれていなければならない（SHALL）。

#### Scenario: node で CLI ヘルプが表示される

**Given** `bun run build` が完了している
**When** `node ./dist/specrunner.js --help` を実行する
**Then** USAGE が標準出力に出力され、終了コード 0 で終了する
