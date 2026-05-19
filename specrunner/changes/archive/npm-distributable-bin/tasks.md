# Tasks: npm-distributable-bin

## Task 1: [x] tsconfig.build.json を新設

**ファイル**: `tsconfig.build.json` (新規作成)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "bin/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**意図**: tests/ と vitest.config.ts を build 対象から除外し、dist/ に src/ と bin/ のみ出力する。

## Task 2: [x] package.json を修正

**ファイル**: `package.json`

変更点:
1. `scripts.build` を `"tsc -p tsconfig.build.json"` に変更
2. `bin.specrunner` を `"./dist/bin/specrunner.js"` に変更
3. `scripts.start` を削除 (存在しない `dist/cli.js` を指す誤記)

**変更前**:
```json
{
  "bin": { "specrunner": "./bin/specrunner.ts" },
  "scripts": {
    "build": "tsc --noEmit false --outDir dist",
    "start": "node dist/cli.js",
    ...
  }
}
```

**変更後**:
```json
{
  "bin": { "specrunner": "./dist/bin/specrunner.js" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    ...
  }
}
```

## Task 3: [x] ADR を作成

**ファイル**: `docs/adr/001-tsconfig-build-separation.md` (新規作成、ディレクトリも作成)

内容: design.md の ADR セクション 2 つ (tsconfig.build.json 分離 / bin 出力パス) を ADR フォーマットで記録する。

## Task 4: [x] 検証

以下をすべて通すこと:

1. `rm -rf dist && bun run build` → `dist/bin/specrunner.js` が存在する
2. `ls dist/tests/` → ディレクトリが存在しない (tests が build 対象外になった)
3. `node ./dist/bin/specrunner.js --help` → USAGE を表示する
4. `bun ./bin/specrunner.ts --help` → 同じ USAGE を表示する
5. `bun run typecheck` → green
6. `bun run test` → green
