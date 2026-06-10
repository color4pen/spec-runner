# Spec: GitHub Actions workflow を強化する（OIDC publish 移行・SHA pin・CI の対象パス絞り込み）

## Requirements

### Requirement: publish workflow は OIDC 認証で publish しなければならない

`.github/workflows/publish.yml` は npm の Trusted Publishing（OIDC）で publish しなければならない（MUST）。
publish step に `NODE_AUTH_TOKEN` env を持ってはならず、workflow 全体に `NPM_TOKEN` への参照を残してはならない。
publish 前に runner の npm を OIDC 対応版へ更新する step（`npm install -g npm@latest` 相当）を持たなければならず、
`permissions.id-token: write` と `npm publish --provenance` を維持しなければならない。

#### Scenario: token 認証への参照が残っていない

**Given** `.github/workflows/publish.yml`
**When** workflow の内容を検査する
**Then** `NODE_AUTH_TOKEN` と `NPM_TOKEN` のいずれの文字列も含まれない

#### Scenario: OIDC publish の構成が揃っている

**Given** `.github/workflows/publish.yml`
**When** publish 関連の構成を検査する
**Then** `id-token: write` が設定され、`npm publish` に `--provenance` が付き、`npm publish` より前に
`npm install -g npm@latest` 相当の npm 更新 step が存在する

### Requirement: 全 workflow の action 参照はコメント付き commit SHA に固定しなければならない

`.github/workflows/` 配下の全 workflow において、すべての `uses:` 参照は 40 桁の commit SHA に固定し、
行末コメントで元のバージョンタグを併記しなければならない（MUST）。タグ参照（`@vN` 形式）が残ってはならない。
annotated tag は tag object ではなく dereference 後の commit SHA に固定しなければならない。

#### Scenario: 全 uses 行がコメント付き SHA pin である

**Given** `.github/workflows/` 配下の全 `.yml`
**When** 各 `uses:` 行を検査する
**Then** いずれも `<action>@<40桁 hex commit SHA> # <タグ>` の形であり、`@vN` のタグ参照は 1 件も存在しない

#### Scenario: 4 action 全出現箇所が対象になっている

**Given** publish.yml（checkout / setup-node / setup-bun）・ci.yml（checkout / setup-node / setup-bun）・release-please.yml（release-please-action）
**When** 全 7 出現箇所を検査する
**Then** すべて SHA 固定済みで、release-please-action は annotated tag の dereference commit に固定されている

### Requirement: ci.yml の push trigger のみ対象パスを絞り込み、pull_request trigger は無変更でなければならない

`.github/workflows/ci.yml` の `on.push`（main）trigger に `paths-ignore: ["specrunner/changes/**"]` を持たなければならず（MUST）、
`on.pull_request` trigger には paths / paths-ignore を一切加えてはならない（無変更）。

#### Scenario: push trigger が specrunner/changes を無視する

**Given** `.github/workflows/ci.yml`
**When** `on.push` trigger を検査する
**Then** `branches: [main]` を保ちつつ `paths-ignore` に `specrunner/changes/**` を含む

#### Scenario: pull_request trigger が無変更である

**Given** `.github/workflows/ci.yml`
**When** `on.pull_request` trigger を検査する
**Then** paths / paths-ignore を持たず、変更前と同一である
