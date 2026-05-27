## Requirements

### Requirement: package.json に npm publish 用メタデータを設定する

`package.json` は以下の状態でなければならない（SHALL）。

- `private` フィールドを持たない（または `false`）
- `name` が `@color4pen/specrunner` である
- `publishConfig.registry` が `https://npm.pkg.github.com` である
- `files` が `["dist/", "README.md", "LICENSE"]` である
- `exports` に `./dist/specrunner.js` が指定されている
- `engines.node` が `>=20` である（`engines.bun` は `>=1.0.0` を維持）
- `license` が `"MIT"` である
- `repository` フィールドに `https://github.com/color4pen/spec-runner` が設定されている

#### Scenario: npm pack --dry-run で publish 対象ファイルを確認する

**Given** `bun run build` が完了している
**When** `npm pack --dry-run` を実行する
**Then** 出力に `dist/`、`README.md`、`LICENSE` が含まれ、`tests/`、`src/`、`vitest.config.*`、`tsconfig.*` が含まれない
