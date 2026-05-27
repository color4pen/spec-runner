## Purpose

TBD
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

### Requirement: tsconfig.build.json から tests/ と vitest.config.ts を除外する

`tsconfig.build.json` の `exclude` は `tests/` と `vitest.config.ts` を含まなければならない（MUST）。`rootDir` は変更しない。

#### Scenario: bun run build 後の dist/ にテストファイルが含まれない

- Given: `tsconfig.build.json` に `exclude: ["tests/", "vitest.config.ts"]` が設定されている
- When: `bun run build` を実行する
- Then: `dist/` に `tests/` ディレクトリおよび `vitest.config.js` が存在しない

### Requirement: MIT LICENSE ファイルを作成する

リポジトリルートに MIT License の `LICENSE` ファイルが存在しなければならない（SHALL）。

#### Scenario: LICENSE ファイルの存在確認

- Given: リポジトリルートを参照する
- When: `ls LICENSE` を実行する
- Then: `LICENSE` ファイルが存在し、"MIT License" の文字列を含む

### Requirement: GitHub Actions の publish ワークフローを作成する

`.github/workflows/publish.yml` が存在しなければならない（SHALL）。

- トリガーは `v*` パターンの git tag push である
- ステップは `bun install` → `bun run build` → `bun run typecheck` → `bun run test` → `npm publish` の順である
- `NODE_AUTH_TOKEN` に `secrets.GITHUB_TOKEN` を使用する
- `registry-url` に `https://npm.pkg.github.com` を指定する

#### Scenario: v* タグ push で publish ワークフローがトリガーされる

- Given: `.github/workflows/publish.yml` が存在する
- When: `v1.0.0` タグを push する
- Then: GitHub Actions の publish ジョブが起動し、npm publish まで実行される
