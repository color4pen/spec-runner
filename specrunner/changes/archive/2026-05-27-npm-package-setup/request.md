# GitHub Packages への npm publish 整備（パッケージメタデータ + CI + ビルドクリーンアップ）

## Meta

- **type**: new-feature
- **slug**: npm-package-setup
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

spec-runner を別プロジェクトから `npm install @color4pen/specrunner` で利用できるようにする。配布先は GitHub Packages（private、認証済みユーザーのみアクセス可能）。npmjs.com には公開しない。

### 現状の問題

- `package.json` の `private: true` により npm publish 不可
- `files` フィールドがなく、publish 時に不要なファイル（src/, tests/, config 等）が含まれる
- `exports` / `main` フィールドがなく、パッケージとしての ESM エントリが未定義
- `engines` が `bun >= 1.0.0` のみ。Node.js でも動くが宣言がない
- `tsconfig.build.json` の `rootDir: "."` により dist/ に `tests/` と `vitest.config.js` が混入
- LICENSE ファイルが存在しない
- publish の CI が存在しない

## 要件

### 1. package.json の整備

- `private: true` を削除する
- `name` を `@color4pen/specrunner` に変更する（GitHub Packages のスコープ付きパッケージ）
- `publishConfig` に `"registry": "https://npm.pkg.github.com"` を追加する
- `files` フィールドを追加し、publish 対象を `dist/`, `README.md`, `LICENSE` に限定する
- `exports` フィールドを追加する。CLI ツールのため `bin` エントリと同じ `./dist/bin/specrunner.js` を指定する
- `engines` に `node >= 20` を追加する（`bun >= 1.0.0` は維持）
- `license: "MIT"` を追加する
- `repository` フィールドに `"https://github.com/color4pen/spec-runner"` を追加する（GitHub Packages がリポジトリ紐付けに使用）

### 2. tsconfig.build.json の修正

- `exclude` に `tests/` と `vitest.config.ts` を追加し、dist にテストファイルが含まれないようにする
- `rootDir: "."` は変更しない（bin/ を含む現構造では rootDir 変更で dist/bin/ への参照が壊れるため）

### 3. LICENSE ファイルの作成

- MIT License で `LICENSE` ファイルをリポジトリルートに作成する

### 4. GitHub Actions で publish CI

- `.github/workflows/publish.yml` を作成する
- トリガー: git tag push（`v*` パターン）
- ステップ: bun install → bun run build → bun run typecheck → bun run test → npm publish
- `NODE_AUTH_TOKEN` に `secrets.GITHUB_TOKEN` を使用する（GitHub Packages は自動で認証される）
- registry-url に `https://npm.pkg.github.com` を指定する

## スコープ外

- バンドラ（tsup / esbuild）による single file 化（別リクエストで対応）
- release-please によるバージョニング自動化（手動で `npm version` + `git tag` で運用開始）
- README の整備（別リクエスト）
- Node.js 互換性テスト（別リクエスト）
- npmjs.com への公開

## 受け入れ基準

- [ ] `npm pack --dry-run` で publish 対象に `dist/`, `README.md`, `LICENSE` のみが含まれること
- [ ] `npm pack --dry-run` の出力に `tests/`, `src/`, `vitest.config.*`, `tsconfig.*` が含まれないこと
- [ ] `bun run build` 後の `dist/` に `tests/` ディレクトリや `vitest.config.js` が存在しないこと
- [ ] `package.json` に `name: @color4pen/specrunner`, `publishConfig`, `exports`, `files`, `license`, `engines.node` が定義されていること
- [ ] `LICENSE` ファイルがリポジトリルートに存在すること
- [ ] `.github/workflows/publish.yml` が存在し、`v*` tag push で publish が実行されること
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- 配布先は GitHub Packages のみ（private 配布）。npmjs.com には公開しない
- `files` フィールドで publish 対象をホワイトリスト管理する（`.npmignore` ではなく）
- `engines` は `bun` と `node` 両方を宣言する。現時点で Bun API は使っていないが、テスト実行は Bun 前提のため
- ライセンスは MIT を選択する
- publish トリガーは git tag push。release-please は別リクエストで導入する
