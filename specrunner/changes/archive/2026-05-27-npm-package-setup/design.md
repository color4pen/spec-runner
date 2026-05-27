# Design: npm-package-setup

## Summary

spec-runner を GitHub Packages で `@color4pen/specrunner` として private 配布するためのパッケージメタデータ整備、ビルド成果物クリーンアップ、LICENSE 追加、publish CI 追加を行う。

## Background

spec-runner を別プロジェクトから `npm install @color4pen/specrunner` で利用したいが、現状は `private: true`、`files` / `exports` / `license` / `repository` フィールド未定義、LICENSE ファイル不在、publish CI 不在で npm publish できない。また tsconfig.build.json の `exclude` に tests / vitest.config.ts が未指定で、将来の include 変更時に dist 汚染リスクがある。

## Architecture Decision

アーキテクチャ決定なし。本変更はコードの振る舞い・インターフェース・構造に影響しない設定ファイルの変更とファイル追加のみ。

## Design Details

### D1: package.json の変更方針

既存フィールドの修正と新規フィールド追加を行う。

変更:
- `name`: `"spec-runner"` → `"@color4pen/specrunner"` (GitHub Packages scope)
- `private: true` を削除
- `engines`: `node >= 20` を追加 (bun >= 1.0.0 は維持)

追加:
- `publishConfig`: `{ "registry": "https://npm.pkg.github.com" }`
- `files`: `["dist/", "README.md", "LICENSE"]` (ホワイトリスト方式)
- `exports`: `{ ".": "./dist/bin/specrunner.js" }` (CLI ツールのため bin と同じエントリポイント)
- `license`: `"MIT"`
- `repository`: `{ "type": "git", "url": "https://github.com/color4pen/spec-runner" }`

**files ホワイトリスト方式の理由**: `.npmignore` は deny-list で将来のファイル追加時に漏れるリスクがある。`files` で allow-list 管理する方が安全。

### D2: tsconfig.build.json の exclude 追加

`exclude` に `"tests"` と `"vitest.config.ts"` を追加する。

現状の `include: ["src/**/*.ts", "bin/**/*.ts"]` で tests は build 対象外だが、`rootDir: "."` 構成では include 変更時に意図せず tests が dist に混入するリスクがある。exclude で明示的に除外する (belt and suspenders)。

`rootDir: "."` は変更しない。bin/ と src/ を含む現構造では rootDir を src/ に変更すると dist/bin/ への参照が壊れる。

### D3: LICENSE ファイル

MIT License でリポジトリルートに `LICENSE` を作成する。著作権者は `color4pen`、年は 2025 (プロジェクト開始年)。

### D4: GitHub Actions publish workflow

`.github/workflows/publish.yml` を新規作成する。

- **トリガー**: `v*` パターンの tag push
- **ステップ**: checkout → setup-node (registry-url 指定) → bun install → build → typecheck → test → npm publish
- **認証**: `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` (GitHub Packages 標準)
- **setup-node の registry-url**: `https://npm.pkg.github.com` (.npmrc 自動生成のため)

bun install でパッケージインストール後、build / typecheck / test をゲートとし、全 green で npm publish する。

## Delta Specs

なし。本変更はコードの振る舞い・ポート・アダプタに影響しない。`npm-distributable-bin` spec の既存 requirements はすべて維持される。

## Scope

### In scope
- package.json のメタデータ整備
- tsconfig.build.json の exclude 追加
- LICENSE ファイル作成
- .github/workflows/publish.yml 作成

### Out of scope
- バンドラ (tsup / esbuild) による single file 化
- release-please によるバージョニング自動化
- README 整備
- Node.js 互換性テスト
- npmjs.com への公開
