# Design: 配布を GitHub Packages から npmjs.com に切り替える

## Context

現在 `@color4pen/specrunner` は GitHub Packages（`https://npm.pkg.github.com`）で配布されている。
このため install には GitHub 認証と `.npmrc` の registry 設定が必要で、「install してすぐ使える」という North Star に反する。
本変更は配布先を npmjs.com の public registry に切り替える。

公開前監査で確定した現状（実装事実）:

- **publishConfig**: `package.json:10-12` の `publishConfig.registry` が `https://npm.pkg.github.com`。
  scope 付き package（`@color4pen/...`）の public 公開には `publishConfig.access: "public"` が必要。
- **publish workflow**: `.github/workflows/publish.yml` が GitHub Packages 前提。
  - workflow 名（`:1`）= "Publish to GitHub Packages"
  - `permissions.packages: write`（`:14`）
  - `setup-node` の `registry-url: https://npm.pkg.github.com`（`:21`）
  - `npm publish` の認証 `NODE_AUTH_TOKEN: secrets.GITHUB_TOKEN`（`:35`）
- **README**: `README.md:42-50` の Installation 節が GitHub Packages 前提（`.npmrc` への
  `@color4pen:registry=https://npm.pkg.github.com` 追記手順）。GitHub Packages への言及はこの節のみ。
- **モデル ID 不整合（公開前監査で特定）**: README の設定例（`README.md:286-287` / `:323`）と
  step 既定モデル（`src/core/step/design.ts:12` / `code-review.ts:13` / `conformance.ts:11` / `spec-review.ts:13`）が
  すべて `claude-opus-4-6[1m]` を使用する。しかしこの ID は `BUILTIN_MODEL_REGISTRY`
  （`src/config/model-registry.ts:14-27`）に**存在しない**（`claude-opus-4-8[1m]` と `claude-opus-4-6` はある）。
  `resolveProvider`（`model-registry.ts:42-51`）は merged registry を**完全一致**で引き、未知 ID で `CONFIG_INVALID` を throw する。
  → 新規ユーザーが README 例や step 既定値のまま実行すると `CONFIG_INVALID` で落ちる。
- **モデル ID の runtime 流路**: `DispatchingAgentRunner`（`src/adapter/dispatching/agent-runner.ts:29-40`）が
  `resolveProvider` で anthropic/openai を判定し、anthropic なら model 文字列を**そのまま** SDK の
  `query({ options: { model } })`（`src/adapter/claude-code/agent-runner.ts:236`）に渡す。
  `[1m]` の解釈は SDK 側（1M-context tier alias）。registry はルーティング用途のみで、`[1m]` の特別な parse は無い。
  → `CONFIG_INVALID` の唯一の原因は registry の key 欠落であり、key を 1 つ足せば解消する。
- **pricing**: `MODEL_PRICING`（`src/core/usage/pricing.ts:61-66`）は既に `claude-opus-4-6[1m]` を既知 SKU として持つ。
  registry 側だけがこの SKU を取りこぼしている。
- **既存テスト**: `tests/unit/step/step-model-maxturn-config.test.ts` の TC-004 が
  `DesignStep.agent.model === "claude-opus-4-6[1m]"` 等を assert している（step 既定値の現状を固定する契約）。
- **パッケージ内容**: `package.json:13-17` の `files` は `dist/` / `README.md` / `LICENSE`。
  npm は常に `package.json` を含めるため、`npm pack` の内容物は dist/specrunner.js を含め 4 ファイル。lifecycle script は無い（監査確認済み）。
- **release-please**: `.github/workflows/release-please.yml` / `release-please-config.json` は registry 非依存。変更不要。

## Goals / Non-Goals

**Goals**:

- 配布先を npmjs.com の public registry に切り替える（publishConfig / publish workflow / README）。
- provenance 付き公開に対応する（`npm publish --provenance` + `id-token: write`）。
- publish 実行・token 管理は人間の責務として CLI / CI の外に残す。workflow は secret 名（`NPM_TOKEN`）の**参照のみ**を持つ。
- 新規ユーザーが README 例または step 既定値（`claude-opus-4-6[1m]`）のままで `CONFIG_INVALID` にならないようにする。
- 上記モデル整合を機械的に保証する test を追加し、`typecheck && test` を green に保つ。
- `npm pack` の内容物（4 ファイル）を不変に保つ。

**Non-Goals**:

- npmjs のアカウント・token 発行・organization / scope 確保・`NPM_TOKEN` secret 登録・publish 実行（すべて人間が行う）。
- リポジトリの public 化作業（provenance は public repo で有効になるが、その手続きは人間の責務）。
- `engines.bun` の要否見直し。
- README のその他の記載修正（コマンド名の誤記等、別件）。
- step 既定モデルの**値**の変更（D1 参照）。

## Decisions

### D1: モデル整合は「registry へ ID 追加」で解消し、参照側（step 既定値 / README 例）は変更しない

`BUILTIN_MODEL_REGISTRY`（`src/config/model-registry.ts`）に
`"claude-opus-4-6[1m]": { provider: "anthropic" }` を 1 エントリ追加する。
step 既定値（design / spec-review / code-review / conformance）と README 設定例の `claude-opus-4-6[1m]` は据え置く。

**Rationale**:

- `CONFIG_INVALID` の唯一の原因は registry の key 欠落（Context のとおり `[1m]` の特別 parse は無い）。
  key を 1 つ足せば、新規ユーザーが触る全経路（step 既定値・README 例）が同時に解消する。
- **既存環境の挙動を変えない**（要件 4 の制約）。`mergeModelRegistry` は `{ ...BUILTIN, ...config.models }` で、
  global config に同 ID を定義済みのユーザーはその entry が勝つ（provider は同じ anthropic）。merge 結果は不変。
- step 既定値を「実際に走るモデル」として変えない。新規ユーザーも既存ユーザーも同じ `claude-opus-4-6[1m]` で走る。
- 既存テスト TC-004（`step-model-maxturn-config.test.ts`）が step 既定値 `claude-opus-4-6[1m]` を固定しており、
  参照側を変えるとこの契約を破る。registry 追加なら TC-004 は green のまま。
- pricing 表が既に同 SKU を持つ（`pricing.ts:61`）。registry 側の取りこぼしを埋める対称な修正で、データの一貫性が増す。

**Alternatives considered**:

- **参照側の ID を registry に在る ID（`claude-opus-4-6` / `claude-opus-4-8[1m]` 等）へ変更する案** — 却下。
  (a) 新規ユーザーが実際に走るモデル（context tier / 世代）を変えてしまう。
  (b) 既存テスト TC-004 を破る。
  (c) README 例・`specrunner/project.md` の同 ID も連動修正が必要になり、影響範囲が広がる。

### D2: publishConfig を npmjs public registry に切り替える

`package.json` の `publishConfig` を次に変更する:

```jsonc
"publishConfig": {
  "registry": "https://registry.npmjs.org",
  "access": "public"
}
```

`files` / `exports` / `bin` は変更しない（パッケージ内容の不変性を構造的に担保）。

**Rationale**: scope 付き package は既定で restricted 公開になるため、public 公開には `access: "public"` が必須。
`files` を触らないことで「`npm pack` の内容物が 4 ファイルから変わらない」を構造的に保証する。
**Alternatives considered**: `access` を workflow の `npm publish --access public` だけで与える案 — publishConfig に持たせる方が
ローカル publish でも一貫し、要件 1 の明示指定にも合致するため publishConfig 側を採用。

### D3: publish workflow を npmjs + provenance 前提に書き換える

`.github/workflows/publish.yml` を次のとおり変更する（トリガ `on.push.tags` は据え置き）:

| 項目 | 現状 | 変更後 |
|------|------|--------|
| workflow `name` | `Publish to GitHub Packages` | npmjs を示す名称（例: `Publish to npm`） |
| `permissions` | `contents: read` + `packages: write` | `contents: read` + `id-token: write`（`packages: write` 削除） |
| `setup-node` `registry-url` | `https://npm.pkg.github.com` | `https://registry.npmjs.org` |
| publish コマンド | `npm publish` | `npm publish --provenance` |
| 認証 env | `NODE_AUTH_TOKEN: secrets.GITHUB_TOKEN` | `NODE_AUTH_TOKEN: secrets.NPM_TOKEN` |

`id-token: write` は provenance 用の OIDC 署名に必要。`access: public` は publishConfig（D2）が供給するため publish コマンドには付けない。

**Rationale**: provenance 付き公開（sigstore 署名）はサプライチェーンの信頼性を上げ、npmjs 上でビルド由来を示せる。
token は `NPM_TOKEN` secret の**参照のみ**を workflow に残し、発行・登録・publish 実行は人間が行う（architect 評価済みの人間ゲート）。
**Alternatives considered**: provenance を付けない素の `npm publish` 案 — 要件 2 が provenance を明示要求するため却下。

### D4: README Installation 節を npmjs 標準手順に書き換える

`README.md:42-50` の Installation 節から `.npmrc` registry 追記手順（GitHub Packages への唯一の言及）を削除し、
npmjs 標準の install 手順（`npm install -g @color4pen/specrunner` / `npm install -D @color4pen/specrunner`）に置き換える。
GitHub Packages・`npm.pkg.github.com`・`@color4pen:registry=...` への言及を残さない。

**Rationale**: 「install してすぐ使える」North Star。npmjs public registry は追加の registry 設定・認証なしで install できる。
**Alternatives considered**: `.npmrc` 行を残しつつ registry だけ書き換える案 — npmjs はデフォルト registry なので不要な手順。削除が正しい。

### D5: 素の config でモデル既定値が解決することを test で固定する

`tests/` に test を追加し、**global 定義なしの素の config**（`mergeModelRegistry` が `BUILTIN_MODEL_REGISTRY` と等価になる config）で
次が `CONFIG_INVALID` を throw せず provider を返すことを assert する:

- step 既定モデル: `DesignStep` / `SpecReviewStep` / `CodeReviewStep` / `ConformanceStep` の `agent.model`
  （いずれも `claude-opus-4-6[1m]`。step 定義から import して値の取りこぼしを防ぐ）。
- README 設定例で提示するモデル ID（`claude-opus-4-6[1m]`）。

**Rationale**: 受け入れ基準「素の config で README 設定例と step 既定モデルが `CONFIG_INVALID` にならないことのテストがある」を直接満たす。
step 定義から model を import することで、将来 step 既定値が registry 外 ID に変わると test が落ち、ドリフトを継続的に検出できる。
**Alternatives considered**: `BUILTIN_MODEL_REGISTRY` に key が在ることだけを assert する案 — step 既定値との連動が切れて
「README 例 / step 既定が解決する」という受け入れ基準の意図を取りこぼすため、参照側から逆引きする形にする。

## Risks / Trade-offs

- [Risk] provenance は public repo + npmjs でのみ成立する。repo がまだ private なら publish が失敗し得る。
  → Mitigation: repo public 化は人間の責務（Non-Goals）。workflow は provenance 構成を持つに留め、公開実行は人間ゲート。design では構成のみ提供する。
- [Risk] `access: public` を付け忘れると scope 付き package が restricted で公開され失敗する。
  → Mitigation: D2 で publishConfig に `access: public` を明示する。
- [Risk] `files` を不用意に触ると `npm pack` 内容物が変わり受け入れ基準を破る。
  → Mitigation: D2 で `files` / `exports` / `bin` を変更しない。実装後に `npm pack --dry-run` で 4 ファイルを確認する。
- [Risk] registry へ ID 追加すると既存ユーザーの挙動が変わる懸念。
  → Mitigation: D1 のとおり merge は user entry 優先で provider 同一。merge 結果は不変であり挙動は変わらない。
- [Risk] GitHub Packages 参照の取りこぼし（grep 漏れ）。
  → Mitigation: 実装後に `npm.pkg.github.com` / `GitHub Packages` / `packages: write` を grep し、in-scope 3 箇所以外に残らないことを確認する
    （CLI 自身の GitHub API 認証用 `GITHUB_TOKEN` 参照は無関係なので対象外）。

## Open Questions

なし。
