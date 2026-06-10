# Spec: 配布を GitHub Packages から npmjs.com に切り替える

## Requirements

### Requirement: 素の config で全 pipeline step 既定モデルが解決可能でなければならない

global config にモデル定義を持たない素の config（`mergeModelRegistry` が `BUILTIN_MODEL_REGISTRY` と等価になる状態）において、
pipeline step の既定モデル ID および README 設定例で提示するモデル ID は、`resolveProvider` で
`CONFIG_INVALID` を throw せず provider を解決できなければならない（MUST）。
具体的には `claude-opus-4-6[1m]` が `BUILTIN_MODEL_REGISTRY` に存在し、provider `anthropic` に解決されなければならない。

#### Scenario: 素の config で step 既定モデルが CONFIG_INVALID にならない

**Given** global config にモデル定義が無い素の config（`mergeModelRegistry` が `BUILTIN_MODEL_REGISTRY` と等価）
**When** `DesignStep` / `SpecReviewStep` / `CodeReviewStep` / `ConformanceStep` の `agent.model` を `resolveProvider` で解決する
**Then** いずれも `CONFIG_INVALID` を throw せず provider `anthropic` を返す

#### Scenario: README 設定例のモデル ID が CONFIG_INVALID にならない

**Given** global config にモデル定義が無い素の config
**When** README 設定例で提示するモデル ID `claude-opus-4-6[1m]` を `resolveProvider` で解決する
**Then** `CONFIG_INVALID` を throw せず provider `anthropic` を返す

### Requirement: 既存環境のモデル解決挙動を変更してはならない

global config に `claude-opus-4-6[1m]` を定義済みの既存環境において、registry へ同 ID を追加しても
モデル解決の結果（provider）を変更してはならない（MUST）。`mergeModelRegistry` は user-defined entry を優先する。

#### Scenario: global 定義済み環境で merge 結果が不変

**Given** global config の `models` に `claude-opus-4-6[1m]: { provider: "anthropic" }` を定義した環境
**When** `mergeModelRegistry` で registry を合成し `claude-opus-4-6[1m]` を `resolveProvider` で解決する
**Then** provider は `anthropic` であり、registry 追加前後で解決結果が変わらない

### Requirement: 配布パッケージは npmjs public registry を対象としなければならない

公開パッケージは npmjs.com の public registry（`https://registry.npmjs.org`）を対象とし、
scope 付き package を public access で公開する構成でなければならない（MUST）。
publish workflow は GitHub Packages（`npm.pkg.github.com` / `GITHUB_TOKEN` による publish 認証 / `packages: write`）を参照してはならない。

#### Scenario: publishConfig が npmjs public を指す

**Given** `package.json` の `publishConfig`
**When** registry と access を確認する
**Then** `registry` は `https://registry.npmjs.org`、`access` は `public` である

#### Scenario: publish workflow に GitHub Packages 参照が残っていない

**Given** `.github/workflows/publish.yml`
**When** workflow の内容を検査する
**Then** `npm.pkg.github.com` / publish 認証としての `GITHUB_TOKEN` / `packages: write` のいずれも含まれず、認証は `secrets.NPM_TOKEN` を参照し provenance（`--provenance` + `id-token: write`）が構成されている

### Requirement: パッケージ内容物を変更してはならない

本変更は配布先・認証・ドキュメント・registry 整合のみを対象とし、`npm pack` の内容物を変更してはならない（MUST）。

#### Scenario: npm pack の内容物が不変

**Given** 本変更を適用した `package.json`
**When** `npm pack --dry-run` を実行する
**Then** 内容物は変更前と同じ 4 ファイル（`package.json` / `README.md` / `LICENSE` / `dist/specrunner.js`）である
