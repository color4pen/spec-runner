# Design: tsup による single file バンドル化

## Context

現在の `bun run build` は `tsc -p tsconfig.build.json` で `dist/` に 500+ ファイルを出力する。
npm パッケージとしての install サイズと startup 時間を改善するため、tsup（esbuild wrapper）で single file にバンドルする。

現状の構成:
- `build` スクリプト: `tsc -p tsconfig.build.json` → `dist/bin/specrunner.js` + `dist/src/**/*.js`（500+ files）
- `typecheck` スクリプト: `tsc --noEmit`（`tsconfig.json` を使用）
- `bin.specrunner`: `./dist/bin/specrunner.js`
- `exports["."]`: `./dist/bin/specrunner.js`
- path alias `@/*` は未使用（全 import が相対パス or `node:` prefix）
- dynamic `await import()` は `node:fs/promises`（external）と local module lazy-load（bundler が inline）の 2 種のみ

## Goals / Non-Goals

**Goals**:
- tsup で CLI エントリポイントを single file にバンドルする
- `bun run build` の出力ファイル数を 500+ → 1 に削減する
- `node dist/specrunner.js --help` が動作する状態を維持する
- 型チェックは `tsc --noEmit` で継続する

**Non-Goals**:
- dependencies（`@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`）の bundle 化
- source map の生成
- DTS（型定義）の生成
- `tsconfig.build.json` の削除（build に使われなくなるが、削除は別 scope）

## Decisions

### D1: tsup をバンドラとして採用する

tsup（esbuild wrapper）を使用する。esbuild の高速性と tsup の config convenience を兼ね備える。

**Rationale**: architect 評価済み。DTS 不要な CLI ツールには tsup の薄い wrapper が適切。raw esbuild は config が verbose になる。rollup/webpack は CLI バンドルには過剰。

**Alternatives considered**:
- raw esbuild: config が JSON/JS で冗長。shebang 挿入に plugin が必要
- rollup: tree-shaking 優秀だが設定が複雑、CLI バンドルには過剰
- webpack: 同上

### D2: 出力パスを `dist/specrunner.js` に変更する

tsup は entry filename ベースで出力するため、`bin/specrunner.ts` → `dist/specrunner.js` となる。
現在の `dist/bin/specrunner.js` から変更になるため、`package.json` の `bin` と `exports` を更新する。

**Rationale**: single file バンドルでは `dist/bin/` のサブディレクトリ構造は不要。`dist/specrunner.js` がシンプル。

### D3: dependencies は external にする

`@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk` を tsup の `external` に指定し、node_modules から解決する。

**Rationale**: architect 評価済み。bundle するとライセンス問題と更新追従が複雑になる。npm install 時に node_modules に入るため external で十分。

### D4: shebang は entry file から esbuild が自動引き継ぎ

`bin/specrunner.ts` の先頭に `#!/usr/bin/env node` が存在するため、esbuild がバンドル時に自動的に出力先先頭へ引き継ぐ。`banner.js` オプションは不要。

**Rationale**: entry file に shebang が存在する場合、esbuild はその shebang をバンドル出力の先頭に保持する（verified: `dist/specrunner.js` 先頭に正しく出力される）。`banner.js` に同じ shebang を指定すると二重出力になるため省略する。

### D5: tsconfig.build.json は残置する

`build` スクリプトは tsup に移行するが、`tsconfig.build.json` は削除しない。将来 tsc emit が必要になった場合のリファレンスとして残す。

**Rationale**: 削除は harmless だが、この change のスコープは「tsup 導入」であり、既存ファイルの掃除は別 scope。

## Risks / Trade-offs

[Risk] esbuild が一部の TypeScript パターン（const enum, decorator 等）を未サポート → **Mitigation**: codebase に const enum / decorator は存在しない。standard TS のみ使用。

[Risk] dynamic `await import()` がバンドルに含まれない → **Mitigation**: 調査済み。local module の lazy import は esbuild が inline する。`node:` builtins は自動 external。

[Risk] `dist/` パス変更で既存の開発者ワークフローが壊れる → **Mitigation**: `bun ./bin/specrunner.ts` の開発時実行経路は変わらない。`node dist/specrunner.js --help` で動作確認。

## Open Questions

なし（architect 評価済みの設計判断に準拠）
