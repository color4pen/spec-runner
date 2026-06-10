# Tasks: GitHub Actions workflow を強化する（OIDC publish 移行・SHA pin・CI の対象パス絞り込み）

> 人間の責務（実装しない）: `NPM_TOKEN` secret の削除と npmjs 側 token の失効（6/17 自動失効）。実 publish の OIDC 実行検証（次回 tag push 時）。
> 本変更は source の挙動を変えない。touch するのは `.github/workflows/*.yml` 3 ファイルと guard test 1 ファイルのみ。

## T-01: action の commit SHA を解決・検証する

> 実装の最初に実行する。以降の T-03 で使う SHA を確定し、検証ログを残す。

- [x] 4 action それぞれで `git ls-remote https://github.com/<owner>/<repo> <tag> '<tag>^{}'` を実行して SHA を解決する
  - `actions/checkout` v4 / `actions/setup-node` v4 / `oven-sh/setup-bun` v2 / `google-github-actions/release-please-action` v4
- [x] annotated tag（`release-please-action@v4`）は `<tag>^{}` 行の **commit** SHA を採用する（`refs/tags/v4` の tag object SHA は採用しない）
- [x] 残り 3 action（lightweight tag）は `refs/tags/<tag>` の SHA を採用する
- [x] design.md D2 の参照表と一致するか確認し、ズレていれば実解決値を最終とする（major タグ移動の可能性があるため実解決値が正）

**Acceptance Criteria**:
- 4 action それぞれの 40 桁 commit SHA が確定している
- release-please-action は dereference 後の commit SHA（tag object SHA ではない）が選ばれている
- 採用した SHA → タグの対応が記録され、design.md Migration Plan の検証方法と整合している

## T-02: publish.yml を OIDC（Trusted Publishing）へ移行する

対象: `.github/workflows/publish.yml`（job 構造・トリガ `on.push.tags` は据え置き）

- [x] `npm publish --provenance` step（現状 `:40-43`）から `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` を **env ごと**削除する
- [x] `npm publish` より前に npm を OIDC 対応版へ更新する step を追加する（`run: npm install -g npm@latest` 相当）。推奨配置は `setup-node` の直後
- [x] `permissions.id-token: write`（`:23`）と `npm publish --provenance`（`:40`）は変更しない（維持する）
- [x] `setup-node` の `registry-url: https://registry.npmjs.org` は変更しない
- [x] workflow 全体に `NODE_AUTH_TOKEN` / `NPM_TOKEN` 文字列が残っていないことを確認する

**Acceptance Criteria**:
- publish.yml に `NODE_AUTH_TOKEN` / `NPM_TOKEN` への参照が残っていない
- `npm publish` より前に `npm install -g npm@latest` 相当の step がある
- `id-token: write` と `npm publish --provenance` が維持されている
- job 数・step 順序（npm 更新 step 追加を除く）に構成変更がない

## T-03: 全 workflow の action 参照をコメント付き SHA に固定する

対象: `.github/workflows/publish.yml` / `ci.yml` / `release-please.yml`（全 7 出現箇所）

- [x] T-01 で確定した SHA を使い、各 `uses:` を `<action>@<40桁 SHA> # <元タグ>` の形に置換する
  - publish.yml: checkout（`:25`）/ setup-node（`:29`）/ setup-bun（`:34`）
  - ci.yml: checkout（`:12`）/ setup-node（`:14`）/ setup-bun（`:18`）
  - release-please.yml: release-please-action（`:16`）
- [x] 行末コメントは元のタグそのまま（`# v4` / `# v2`）にする
- [x] `with:` block・step 名・step 順序・トリガは変更しない（参照の固定のみ）
- [x] `@vN` 形式のタグ参照が全 workflow からゼロになっていることを確認する

**Acceptance Criteria**:
- 全 workflow の `uses:` がコメント付き SHA 参照になっている（タグ参照ゼロ）
- 各 SHA が T-01 で解決したタグの実 commit と一致している
- release-please-action は annotated tag の dereference commit に固定されている
- `uses:` 以外の差分（with / 名前 / 順序）が無い

## T-04: ci.yml の push trigger に paths-ignore を追加する

対象: `.github/workflows/ci.yml`

- [x] `on.push`（`:4-5`）に `paths-ignore: ["specrunner/changes/**"]` を追加する（`branches: [main]` は残す）
- [x] `on.pull_request:`（`:6`）は 1 文字も変更しない（paths / paths-ignore を加えない）

**Acceptance Criteria**:
- `on.push` が `branches: [main]` を保ちつつ `paths-ignore` に `specrunner/changes/**` を含む
- `on.pull_request` trigger が変更前と同一（paths / paths-ignore なし）

## T-05: workflow 不変条件の guard test を追加する

対象: `tests/`（既存 `grep-no-*.test.ts` の pattern に倣う。例: `tests/grep-workflow-actions-pinned.test.ts`）

- [x] `.github/workflows/*.yml` を読み取り、次を assert する vitest test を 1 ファイル追加する:
  - publish.yml に `NODE_AUTH_TOKEN` / `NPM_TOKEN` 文字列が無い。`id-token: write` / `npm publish --provenance` / `npm install -g npm@latest` 相当が在る
  - 全 workflow の各 `uses:` 行が `@<40桁 hex SHA> # <タグ>` の形であり、`@vN` タグ参照が 1 件も無い（SHA 値そのものは assert しない）
  - ci.yml の push trigger に `paths-ignore` があり `specrunner/changes/**` を含む。pull_request trigger に paths / paths-ignore が無い
- [x] test はファイル read のみで source の挙動を変えない

**Acceptance Criteria**:
- 追加 test が上記 3 不変条件を assert する
- SHA 値ではなく構造（40桁 hex + コメント）を検証するため、将来のタグ移動で test が壊れない
- `bun run test` で当該 test が green

## T-06: 品質ゲートと検証方法の記録を確認する

- [x] `bun run typecheck` が green
- [x] `bun run test` が green（T-05 の guard test を含む）
- [x] design.md Migration Plan に SHA 検証方法（`git ls-remote ... '<tag>^{}'` と annotated-tag 注意点）と npm@latest 採用理由が記載され、change folder として PR diff に含まれることを確認する
- [x] 全 workflow を grep し、タグ参照（`@v` 直後が数字）と `NODE_AUTH_TOKEN` / `NPM_TOKEN` が残っていないことを確認する

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- SHA 検証方法が design.md（= PR diff）に記載されている
- タグ参照・token 参照の残存がゼロ
