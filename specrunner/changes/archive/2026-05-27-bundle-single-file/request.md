# tsup によるビルド出力の single file バンドル化

## Meta

- **type**: spec-change
- **slug**: bundle-single-file
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

現在の `bun run build`（tsc）は dist/ に 500+ ファイルを出力する。npm パッケージとしての install サイズとstartup 時間を改善するため、tsup（esbuild wrapper）で single file にバンドルする。

## 要件

### 1. tsup の導入

- `tsup` を devDependencies に追加する
- `tsup.config.ts` を作成する
- エントリポイント: `bin/specrunner.ts`（CLI 本体。`src/bin/` は存在しない）
- フォーマット: ESM
- ターゲット: Node.js 20
- shebang: `#!/usr/bin/env node` を先頭に付与
- dependencies（`@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`）は external にする（node_modules から解決）

### 2. build スクリプトの更新

- `package.json` の `build` スクリプトを tsup に変更する
- 型チェックは `typecheck` スクリプト（`tsc --noEmit`）で継続する
- `bin` フィールドと `exports` フィールドの参照先を tsup 出力パスに合わせる

### 3. 出力の検証

- single file で `node dist/specrunner.js --help` が動作すること

## スコープ外

- dependencies の bundle 化（external のまま）
- source map の生成
- DTS（型定義）の生成

## 受け入れ基準

- [ ] `bun run build` で tsup による single file バンドルが生成されること
- [ ] `node dist/specrunner.js --help` が正常動作すること
- [ ] `npm pack --dry-run` のパッケージサイズが tsc 出力時より削減されていること
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- バンドラは tsup を選択する。esbuild wrapper で DTS 生成もできるが、CLI ツールのため DTS は不要
- Anthropic SDK 等の dependencies は external にする。bundle するとライセンス問題と更新追従が複雑になるため
- tsc は型チェック専用に残す。バンドルと型チェックを分離することで責務が明確になる
