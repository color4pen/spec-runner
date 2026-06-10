# GitHub Actions workflow を強化する（OIDC publish 移行・SHA pin・CI の対象パス絞り込み）

## Meta

- **type**: chore
- **slug**: workflow-hardening
- **base-branch**: main
- **adr**: false

## 背景

npm パッケージに Trusted Publisher（OIDC、repo: color4pen/spec-runner / workflow: publish.yml）が設定され、publishing access は「2FA 必須・token 不可」になった。publish workflow は token 認証のままなので OIDC へ切り替える。あわせて、リポジトリ公開に伴い重みが増した 2 点 — action のタグ参照（サプライチェーン面）と、docs のみの commit でフル CI が走る無駄 — を同じ workflow 群の変更として処理する。

## 現状コードの前提

- `publish.yml:43` が `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` で token 認証。`id-token: write` は設定済み、`--provenance` 付き publish
- npm の Trusted Publishing は npm CLI の新しい版を要求するが、runner（node 20）同梱の npm は古い。npm の latest は 11.16.0
- action 参照は全てタグ: `actions/checkout@v4`（publish.yml:25 / ci.yml:12）、`actions/setup-node@v4`（publish.yml:29 / ci.yml:14）、`oven-sh/setup-bun@v2`（publish.yml:34 / ci.yml:18）、`google-github-actions/release-please-action@v4`（release-please.yml:16、Contents:write の PAT を受け取る）
- `ci.yml` の push trigger は `branches: [main]` のみ（paths 制限なし）。archive commit（`specrunner/changes/` の移動のみ）でもフル CI が走る

## 要件

1. publish.yml を OIDC（Trusted Publishing）認証に切り替える: `NODE_AUTH_TOKEN` の env を削除し、publish 前に runner の npm を Trusted Publishing 対応版へ更新する step を追加する（`npm install -g npm@latest` 相当）。`id-token: write` と `--provenance` は維持する
2. 全 workflow の action 参照を commit SHA に固定し、行末コメントで元のバージョンタグを併記する（例: `uses: actions/checkout@<sha> # v4`）。対象は現状前提に列挙した 4 action × 全出現箇所
3. ci.yml の push trigger（main）に `paths-ignore: ["specrunner/changes/**"]` を追加する。pull_request trigger には paths 制限を加えない（required check が pending のまま残る事故を防ぐため）

## スコープ外

- `NPM_TOKEN` secret の削除と npmjs 側 token の失効（人間が行う。token は 6/17 に自動失効）
- workflow の構成変更（job の追加・分割）
- Dependabot / Renovate による action 更新の自動化

## 受け入れ基準

- [ ] publish.yml に NODE_AUTH_TOKEN / NPM_TOKEN への参照が残っていない
- [ ] 全 workflow の `uses:` がコメント付き SHA 参照になっている（タグ参照ゼロ）
- [ ] SHA が各タグの実際の commit と一致している（検証方法を PR に記載）
- [ ] ci.yml の pull_request trigger が無変更である
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- token 認証から OIDC への切り替えは「長期credential を持たない」方向の標準化。秘密情報を seam で封じ込める既存方針（env-filter / maskSensitive）と同方向
