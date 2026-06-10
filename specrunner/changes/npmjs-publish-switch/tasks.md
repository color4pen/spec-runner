# Tasks: 配布を GitHub Packages から npmjs.com に切り替える

> 人間の責務（実装しない）: npmjs アカウント / token 発行 / organization・scope 確保 / `NPM_TOKEN` secret 登録 / publish 実行 / repo public 化。
> workflow は `NPM_TOKEN` の**参照のみ**を持つ。

## T-01: publishConfig を npmjs public registry に切り替える

- [x] `package.json` の `publishConfig.registry` を `https://npm.pkg.github.com` → `https://registry.npmjs.org` に変更する
- [x] `publishConfig` に `"access": "public"` を追加する
- [x] `files` / `exports` / `bin` / `name` / `version` は変更しない（パッケージ内容の不変性を保つ）

**Acceptance Criteria**:
- `publishConfig.registry` が `https://registry.npmjs.org`
- `publishConfig.access` が `"public"`
- `files` 配列（`dist/` / `README.md` / `LICENSE`）が変更前と同一

## T-02: publish workflow を npmjs + provenance 前提に書き換える

対象: `.github/workflows/publish.yml`（トリガ `on.push.tags` は据え置き）

- [x] workflow `name` を GitHub Packages を示す文言から npmjs を示す文言（例: `Publish to npm`）に変更する
- [x] `permissions` から `packages: write` を削除し、`id-token: write` を追加する（`contents: read` は残す）
- [x] `setup-node` の `registry-url` を `https://npm.pkg.github.com` → `https://registry.npmjs.org` に変更する
- [x] publish 手順を `npm publish` → `npm publish --provenance` に変更する
- [x] 認証 env を `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` → `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` に変更する
- [x] `npm.pkg.github.com` / publish 認証としての `GITHUB_TOKEN` / `packages: write` を残さない

**Acceptance Criteria**:
- workflow に `npm.pkg.github.com` が含まれない
- workflow の publish 認証が `secrets.NPM_TOKEN` を参照する（`secrets.GITHUB_TOKEN` を publish 認証に使わない）
- `permissions` に `packages: write` が無く `id-token: write` がある
- `npm publish` に `--provenance` が付いている
- `setup-node` の `registry-url` が `https://registry.npmjs.org`

## T-03: README Installation 節を npmjs 標準手順に書き換える

対象: `README.md`（現状 `:42-50` の Installation 節）

- [x] `.npmrc` への registry 追記手順（`@color4pen:registry=https://npm.pkg.github.com`）と "published to GitHub Packages" の記述を削除する
- [x] npmjs 標準の install 手順に置き換える（追加の registry 設定・認証なしで install できる旨）。例: `npm install -g @color4pen/specrunner` / dev dependency 用 `npm install -D @color4pen/specrunner`
- [x] 既存体裁（英語・`##` 見出し・` ```bash ` コードブロック）に合わせる
- [x] Installation 節以外（Quick Start 等）の既存記述は変更しない

**Acceptance Criteria**:
- README に `GitHub Packages` / `npm.pkg.github.com` / `@color4pen:registry=...` への言及が残っていない
- Installation 節に npmjs 標準の `npm install` 手順がある
- Installation 節以外の既存節に差分がない

## T-04: BUILTIN_MODEL_REGISTRY に claude-opus-4-6[1m] を追加する

対象: `src/config/model-registry.ts`

- [x] `BUILTIN_MODEL_REGISTRY` に `"claude-opus-4-6[1m]": { provider: "anthropic" }` を追加する
- [x] step 既定値（`src/core/step/design.ts` / `code-review.ts` / `conformance.ts` / `spec-review.ts`）と README 設定例の `claude-opus-4-6[1m]` は**変更しない**（D1）

**Acceptance Criteria**:
- `BUILTIN_MODEL_REGISTRY["claude-opus-4-6[1m]"].provider === "anthropic"`
- step 既定値の model 文字列が変更前と同一（`claude-opus-4-6[1m]` のまま）
- 既存テスト `tests/unit/step/step-model-maxturn-config.test.ts`（TC-004）が green のまま

## T-05: 素の config でモデル既定値が解決することの test を追加する

- [x] test を追加する（既存構成に倣う。例: `tests/config/model-registry.test.ts` に describe を追加、または新規ファイル）
- [x] global 定義なしの素の config（`mergeModelRegistry` が `BUILTIN_MODEL_REGISTRY` と等価になる config）を用意する
- [x] step 既定モデルを step 定義から import して逆引きする: `DesignStep` / `SpecReviewStep` / `CodeReviewStep` / `ConformanceStep` の `agent.model` を `resolveProvider` で解決し、throw せず `"anthropic"` を返すことを assert する
- [x] README 設定例のモデル ID `claude-opus-4-6[1m]` を `resolveProvider` で解決し、throw せず `"anthropic"` を返すことを assert する
- [x] 既存環境不変性: `models` に `claude-opus-4-6[1m]: { provider: "anthropic" }` を定義した config でも merge 結果の provider が `anthropic` で不変であることを assert する

**Acceptance Criteria**:
- 素の config で 4 step 既定モデルと README 例モデル ID が `CONFIG_INVALID` を throw しないことを検証する test がある
- step 既定値が registry 外 ID に変わると当該 test が落ちる（step 定義から import しているため）
- `bun run test` で当該 test が green

## T-06: 内容物不変性と品質ゲートを確認する

- [x] `npm run build` 後に `npm pack --dry-run` を実行し、内容物が 4 ファイル（`package.json` / `README.md` / `LICENSE` / `dist/specrunner.js`）で変更前と同一であることを確認する
- [x] `npm.pkg.github.com` / `GitHub Packages` / `packages: write` を grep し、in-scope 3 箇所（package.json / publish.yml / README）以外に新たな残存が無いことを確認する（CLI 自身の GitHub API 認証用 `GITHUB_TOKEN` 参照は無関係なので対象外）
- [x] `bun run typecheck` が green
- [x] `bun run test` が green

**Acceptance Criteria**:
- `npm pack --dry-run` の内容物が現状（4 ファイル）から変わらない
- publish workflow と README に GitHub Packages への言及が残っていない
- `bun run typecheck && bun run test` が green
