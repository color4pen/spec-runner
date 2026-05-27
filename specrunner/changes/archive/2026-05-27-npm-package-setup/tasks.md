# Tasks: npm-package-setup

## T-01: package.json のメタデータ整備

**File**: `package.json`

以下を変更する:

1. `"name"` を `"@color4pen/specrunner"` に変更
2. `"private": true` を削除
3. `"license": "MIT"` を追加
4. `"repository"` を追加:
   ```json
   "repository": {
     "type": "git",
     "url": "https://github.com/color4pen/spec-runner"
   }
   ```
5. `"publishConfig"` を追加:
   ```json
   "publishConfig": {
     "registry": "https://npm.pkg.github.com"
   }
   ```
6. `"files"` を追加:
   ```json
   "files": ["dist/", "README.md", "LICENSE"]
   ```
7. `"exports"` を追加:
   ```json
   "exports": {
     ".": "./dist/bin/specrunner.js"
   }
   ```
8. `"engines"` に `"node": ">=20"` を追加 (`"bun": ">=1.0.0"` は維持)

**Acceptance**:
- [x] `name` が `@color4pen/specrunner`
- [x] `private` フィールドが存在しない
- [x] `license`, `repository`, `publishConfig`, `files`, `exports` が定義済み
- [x] `engines` に `node` と `bun` の両方が存在
- [x] `bun install` が成功する (lockfile の整合性)

---

## T-02: tsconfig.build.json の exclude 追加

**File**: `tsconfig.build.json`

`exclude` 配列に `"tests"` と `"vitest.config.ts"` を追加する。

変更前:
```json
"exclude": ["node_modules", "dist"]
```

変更後:
```json
"exclude": ["node_modules", "dist", "tests", "vitest.config.ts"]
```

`rootDir: "."` は変更しない。

**Acceptance**:
- [x] `exclude` に `tests` と `vitest.config.ts` が含まれる
- [x] `bun run build` が成功する
- [x] `bun run build` 後の `dist/` に `tests/` ディレクトリや `vitest.config.js` が存在しない

---

## T-03: LICENSE ファイルの作成

**File**: `LICENSE` (新規、リポジトリルート)

MIT License テンプレートで作成する。著作権者: `color4pen`、年: `2025`。

**Acceptance**:
- [x] `LICENSE` ファイルがリポジトリルートに存在する
- [x] MIT License の標準文面が含まれる

---

## T-04: GitHub Actions publish workflow の作成

**File**: `.github/workflows/publish.yml` (新規)

```yaml
name: Publish to GitHub Packages

on:
  push:
    tags:
      - "v*"

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          registry-url: "https://npm.pkg.github.com"

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - run: bun run build

      - run: bun run typecheck

      - run: bun run test

      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

ポイント:
- `permissions.packages: write` が必要 (GitHub Packages publish)
- `setup-node` の `registry-url` で `.npmrc` を自動生成
- `setup-bun` で bun をインストール (test は vitest via bun で実行)
- `--frozen-lockfile` で lockfile 整合性を保証

**Acceptance**:
- [x] `.github/workflows/publish.yml` が存在する
- [x] `v*` tag push でトリガーされる
- [x] build → typecheck → test → npm publish の順で実行される
- [x] `NODE_AUTH_TOKEN` に `secrets.GITHUB_TOKEN` が設定される

---

## T-05: 全体検証

**Commands**:
1. `bun run build` — ビルド成功 + dist に tests/ や vitest.config.js が混入しないこと
2. `bun run typecheck` — 型チェック green
3. `bun run test` — テスト green
4. `npm pack --dry-run` — publish 対象に dist/, README.md, LICENSE のみ含まれ、tests/, src/, vitest.config.*, tsconfig.* が含まれないこと

**Acceptance**:
- [x] `bun run build` 後の `dist/` に `tests/` や `vitest.config.js` が存在しない
- [x] `bun run typecheck` が green
- [ ] `bun run test` が green（pre-existing failure: requires-commit-flags.test.ts / CodeFixerStep.requiresCommit — 本変更とは無関係）
- [x] `npm pack --dry-run` の出力に `dist/`, `README.md`, `LICENSE` が含まれる
- [x] `npm pack --dry-run` の出力に `tests/`, `src/`, `vitest.config.*`, `tsconfig.*` が含まれない

---

## Task Dependencies

```
T-01 ─┐
T-02 ─┤
T-03 ─┼→ T-05
T-04 ─┘
```

T-01〜T-04 は並列可能。T-05 は全タスク完了後に実行。
