# Tasks: tsup による single file バンドル化

## T-01: tsup を devDependencies に追加する

- [x] `bun add -d tsup` を実行する

**Acceptance Criteria**:
- `package.json` の `devDependencies` に `tsup` が含まれている

## T-02: tsup.config.ts を作成する

- [x] リポジトリルートに `tsup.config.ts` を作成する
- [x] entry: `['bin/specrunner.ts']`
- [x] format: `['esm']`
- [x] target: `'node20'`
- [x] outDir: `'dist'`
- [x] clean: `true`（ビルド前に dist/ をクリア）
- [x] banner.js: 不要（`bin/specrunner.ts` の `#!/usr/bin/env node` を esbuild が自動引き継ぎ。banner を指定すると二重 shebang になるため省略）、splitting: false で single file 化
- [x] external: `['@anthropic-ai/sdk', '@anthropic-ai/claude-agent-sdk', '@openai/codex-sdk']`

**Acceptance Criteria**:
- `tsup.config.ts` が存在し、上記設定を含む
- `bun run build` で `dist/specrunner.js` が生成される

## T-03: package.json の build スクリプトと参照パスを更新する

- [x] `scripts.build` を `"tsup"` に変更する
- [x] `bin.specrunner` を `"./dist/specrunner.js"` に変更する
- [x] `exports["."]` を `"./dist/specrunner.js"` に変更する
- [x] `scripts.typecheck` が `"tsc --noEmit"` のまま維持されていることを確認する

**Acceptance Criteria**:
- `bun run build` が tsup を実行する
- `bin.specrunner` が `./dist/specrunner.js` を指している
- `exports["."]` が `./dist/specrunner.js` を指している

## T-04: 動作検証

- [x] `bun run build` で single file バンドルが生成されることを確認する
- [x] `node dist/specrunner.js --help` が USAGE を出力することを確認する
- [x] `bun run typecheck` が green であることを確認する
- [x] `bun run test` が green であることを確認する（1件の pre-existing failure を除く）
- [ ] `npm pack --dry-run` でパッケージサイズが tsc 出力時より削減されていることを確認する

**Acceptance Criteria**:
- `dist/specrunner.js` が single file として存在する
- `node dist/specrunner.js --help` が正常終了する
- `bun run typecheck && bun run test` が green
- `npm pack --dry-run` の出力サイズが削減されている
