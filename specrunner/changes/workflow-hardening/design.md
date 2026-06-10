# Design: GitHub Actions workflow を強化する（OIDC publish 移行・SHA pin・CI の対象パス絞り込み）

## Context

`.github/workflows/` 配下に 3 つの workflow がある。本変更は source code を触らず、この 3 ファイル（+ それを守る guard test）だけを対象にした workflow hardening である。

公開前監査で確定した現状（実装事実）:

- **publish.yml（token 認証）**: `npm publish --provenance`（`:40`）の step に
  `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`（`:42-43`）が付く token 認証。
  `permissions.id-token: write`（`:23`）は設定済み、`--provenance` も付与済み。
  `setup-node`（`:29-32`）は `registry-url: https://registry.npmjs.org` を設定。
  npm パッケージ側には Trusted Publisher（OIDC、repo `color4pen/spec-runner` / workflow `publish.yml`）が登録済みで、
  publishing access は「2FA 必須・token 不可」に切り替わっている。よって publish.yml を OIDC へ移行する必要がある。
- **npm CLI のバージョン要件**: npm の Trusted Publishing は新しい npm CLI（OIDC 対応版、11.5.1 以降）を要求する。
  GitHub runner の node 20 に同梱される npm は古く、そのままでは OIDC publish ができない。npm の latest は 11.16.0。
- **action 参照が全てタグ**: 4 action × 全 7 出現箇所がタグ参照のまま。
  - `actions/checkout@v4` — publish.yml:25 / ci.yml:12
  - `actions/setup-node@v4` — publish.yml:29 / ci.yml:14
  - `oven-sh/setup-bun@v2` — publish.yml:34 / ci.yml:18
  - `google-github-actions/release-please-action@v4` — release-please.yml:16（`Contents:write` の PAT を受け取る最も権限の高い参照）
  リポジトリ公開でサプライチェーン面の重みが増したため、可変タグを不変の commit SHA に固定する。
- **ci.yml の push trigger**: `on.push.branches: [main]` のみで paths 制限なし（`:3-5`）。
  archive commit（`specrunner/changes/` の移動のみ）でもフル CI が走り無駄が出る。
  `on.pull_request:`（`:6`）は無条件（required check の安定性に寄与）。
- **PR body 生成経路**: pr-create は CLI step（agent なし）で、PR body は request.md の 背景/目的 + workflow table から
  template 生成される（`src/core/pr-create/body-template.ts`）。implementer は PR description を直接編集できない。
  一方 change folder `specrunner/changes/workflow-hardening/` は branch に commit され **PR の diff に含まれる**。
  → SHA 検証方法は本 design.md（= PR diff の一部）に durable な artifact として残すことで「PR に記載」を満たす。
- **既存 guard test の前例**: `tests/grep-no-bun-imports.test.ts` / `grep-no-step-name-hardcode.test.ts` 等、
  リポジトリ不変条件をファイル読取りで assert する test が既にある。workflow 不変条件の guard も同じ pattern に乗る。

## Goals / Non-Goals

**Goals**:

- publish.yml を OIDC（Trusted Publishing）認証へ移行する。`NODE_AUTH_TOKEN` env を削除し、publish 前に
  runner の npm を OIDC 対応版へ更新する step（`npm install -g npm@latest` 相当）を追加する。
  `id-token: write` と `--provenance` は維持する（長期 credential を持たない方向の標準化）。
- 全 workflow の action 参照（4 action × 7 出現箇所）を commit SHA に固定し、行末コメントで元のタグを併記する
  （`uses: actions/checkout@<sha> # v4` の形）。タグ参照ゼロにする。
- ci.yml の push（main）trigger に `paths-ignore: ["specrunner/changes/**"]` を追加する。
  pull_request trigger は **無変更**に保つ。
- SHA の解決・検証方法を design.md に記録し、PR diff を通じて検証可能にする。
- 上記不変条件を `bun run test` で機械的に守る guard test を追加し、`typecheck && test` を green に保つ。

**Non-Goals**:

- `NPM_TOKEN` secret の削除と npmjs 側 token の失効（人間が行う。token は 6/17 に自動失効）。
- workflow の構成変更（job の追加・分割）。トリガ条件・step 順序の最小変更に留め、job 構造は触らない。
- Dependabot / Renovate による action 更新の自動化。
- `setup-node` の `registry-url` 変更・publish トリガ（`on.push.tags`）変更・release-please.yml の PAT 設計変更。
- source code（`src/`）の挙動変更。本変更が触る `.ts` は guard test のみ。

## Decisions

### D1: publish.yml を OIDC（Trusted Publishing）へ移行する

`.github/workflows/publish.yml` を次のとおり変更する（job 構造・トリガ `on.push.tags` は据え置き）:

| 項目 | 現状 | 変更後 |
|------|------|--------|
| publish step の認証 env | `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` | env ごと削除（OIDC が credential を供給） |
| npm 更新 step | なし | `npm publish` の前に `npm install -g npm@latest` 相当の step を追加 |
| `permissions.id-token: write` | あり | **維持** |
| `npm publish --provenance` | あり | **維持** |
| `setup-node` `registry-url` | `https://registry.npmjs.org` | **維持**（.npmrc が正しい registry を指す。token は書かない） |

npm 更新 step の推奨配置は `setup-node` の直後（node/npm が存在し、かつ `npm publish` より前）。
唯一のハード要件は「`npm publish` より前であること」。

**Rationale**:

- npm 側の Trusted Publisher 登録で token publish が不可になったため、token 認証のままでは publish が失敗する。
  OIDC は短命 credential を CI 実行ごとに発行し、長期 secret を workflow から排除する（architect 評価済みの方向性。
  env-filter / maskSensitive と同じ「秘密情報を seam で封じ込める」既存方針と同方向）。
- runner 同梱 npm は OIDC 非対応の古い版なので、publish 前に OIDC 対応版へ更新する step が必須。
- `registry-url` を残すのは正しい: setup-node は `.npmrc` に registry を書くが、`NODE_AUTH_TOKEN` を unset にすれば
  token 行は無効化され、npm CLI が OIDC token を取得して publish する。req 1 の明示スコープ（env 削除 + npm 更新 step + provenance 維持）と
  完全一致し、構成変更を増やさない。

**Alternatives considered**:

- **npm を特定バージョンに固定（例 `npm@11.16.0`）する案** — 却下。req 1 が `npm install -g npm@latest` 相当を明示。
  ただし request-review の LOW finding（npm@latest はランタイム非固定で将来の破壊的変更リスク）を踏まえ、
  「OIDC 対応版を常に拾うため latest を選んだ」旨を PR 説明に一言添える（Migration Plan 参照）。
- **`setup-node` の registry-url を削除/変更する案** — 却下。OIDC publish には registry が正しく設定されている方が安全で、
  req 1 のスコープ外。構成変更を増やさない。

### D2: 全 workflow の action 参照を commit SHA に固定し、行末コメントでタグを併記する

4 action × 7 出現箇所すべてを `uses: <owner>/<repo>@<40桁 commit SHA> # <元タグ>` の形に置換する。タグ参照はゼロにする。

**解決方法（実装時に再実行して確定する）**: 各 action について
`git ls-remote https://github.com/<owner>/<repo> <tag> '<tag>^{}'` を実行し、tag が指す **commit** SHA に固定する。

> ⚠ **annotated tag は dereference する**: `release-please-action@v4` は annotated tag で、`refs/tags/v4` 行は
> **tag object** の SHA を指す。`<tag>^{}` 行に現れる **commit** SHA（dereference 後）に固定すること。
> 残り 3 action（checkout / setup-node / setup-bun）は lightweight tag で `refs/tags/<tag>` がそのまま commit を指す。

**design 時点で解決した SHA（参照値。実装時に上記コマンドで再検証すること — major タグは patch リリースで移動し得る）**:

| action | tag | tag 種別 | 固定する commit SHA |
|--------|-----|---------|---------------------|
| `actions/checkout` | v4 | lightweight | `34e114876b0b11c390a56381ad16ebd13914f8d5` |
| `actions/setup-node` | v4 | lightweight | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `oven-sh/setup-bun` | v2 | lightweight | `0c5077e51419868618aeaa5fe8019c62421857d6` |
| `google-github-actions/release-please-action` | v4 | **annotated** | `e4dc86ba9405554aeba3c6bb2d169500e7d3b4ee`（tag object `a017ec70c7f1401744d60197f7577a0c51c8c1cf` ではない） |

置換後の各行（コメントは元タグそのまま）:

- `uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4` — publish.yml / ci.yml
- `uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4` — publish.yml / ci.yml
- `uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2` — publish.yml / ci.yml
- `uses: google-github-actions/release-please-action@e4dc86ba9405554aeba3c6bb2d169500e7d3b4ee # v4` — release-please.yml

**Rationale**: 可変タグ（`v4`）は所有者が任意に移動でき、リポジトリ公開後はサプライチェーン上の信頼点になる。
不変の commit SHA に固定すれば供給される action コードが固定され、`# v4` コメントで人間可読性を保てる（GitHub 公式の推奨方式）。
`with:` block・step 名・step 順序は変更しない（参照の固定のみ）。

**Alternatives considered**:

- **タグのまま据え置く案** — 却下。req 2 が SHA 固定を明示。
- **annotated tag の tag object SHA に固定する案** — 却下。tag object は GitHub が再作成し得るうえ、慣行（ratchet / pin-github-action）は
  commit に固定する。`^{}` dereference して commit に固定するのが正しい。

### D3: ci.yml の push trigger にのみ paths-ignore を追加する

`.github/workflows/ci.yml` の `on.push`（main）に `paths-ignore: ["specrunner/changes/**"]` を追加する。
`on.pull_request:` は **1 文字も変更しない**。

変更後の trigger:

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - "specrunner/changes/**"
  pull_request:
```

**Rationale**: archive commit は `specrunner/changes/` の移動のみで、フル CI を走らせる価値がない。
push に限り paths-ignore で skip する。pull_request に paths 制限を加えると、対象外パスだけを変更した PR で required check が
**pending のまま残り merge できなくなる**事故が起きるため、pull_request は無変更に保つ（req 3 の明示制約）。

**Alternatives considered**:

- **pull_request にも paths-ignore を付ける案** — 却下。required check pending デッドロックを誘発する（req 3 が明示的に禁止）。
- **paths（allowlist）方式** — 却下。req 3 は paths-ignore（denylist）を指定。新規ディレクトリ追加時の取りこぼしも denylist の方が安全。

### D4: SHA 検証方法は design.md に記録し、PR diff を通じて「PR に記載」を満たす

pr-create は template 生成で implementer は PR body を直接編集できない（Context 参照）。
そこで SHA 解決・検証コマンド（D2 の `git ls-remote ... '<tag>^{}'`）と annotated-tag 注意点を本 design.md に記録する。
change folder は branch に commit され PR の diff に含まれるため、検証方法は PR 上で参照可能になる。

**Rationale**: pipeline の構造（templated pr-create）を尊重しつつ、受け入れ基準「検証方法を PR に記載」を満たす最小の手段。
検証手順を durable な artifact 化することで、後日の再 pin（タグ移動時）でも同じ手順を再現できる。

**Alternatives considered**:

- **pr-create template を改修して任意ファイルを PR body に注入する案** — 却下。本 request のスコープ（workflow hardening）外で、
  source code 改修を伴う。design.md（PR diff）への記録で十分。

### D5: workflow 不変条件を守る guard test を追加する

`tests/` に既存の `grep-no-*` 系 guard test と同じ pattern で、`.github/workflows/*.yml` を読み取り
spec.md の Layer-1 不変条件を assert する test を 1 ファイル追加する。assert する内容は **SHA 値そのものではなく構造**:

1. publish.yml に `NODE_AUTH_TOKEN` / `NPM_TOKEN` 文字列が存在しない。`id-token: write` と `npm publish --provenance` と
   npm 更新 step（`npm install -g npm@latest` 相当）が存在する。
2. 全 workflow の各 `uses:` 行が `@<40桁 hex SHA> # <タグ>` の形（コメント付き SHA pin）であり、`@vN` タグ参照が存在しない。
3. ci.yml の push trigger に `paths-ignore` があり `specrunner/changes/**` を含む。pull_request trigger が存在し
   paths / paths-ignore を持たない（無変更）。

**Rationale**: spec の scenario を実行可能にし、受け入れ基準を `bun run test` で機械強制する。
SHA 値ではなく構造（40桁 hex + コメント）を見るため、将来タグ移動で SHA が変わっても test は壊れない。
既存 `grep-no-*` 前例に沿うため新規パターンではない。source の挙動は変えず、test はファイルを read するだけ。

**Alternatives considered**:

- **test を追加せず grep/diff の手動確認のみで済ます案** — 却下。本変更は source 変更を伴わず、test を足さないと
  「test green」が workflow 不変条件を一切担保しない。spec scenario の実行先としても guard test が自然。

## Risks / Trade-offs

- [Risk] major タグは patch リリースで移動するため、design.md に記録した SHA が実装時点で古い可能性がある。
  → Mitigation: D2 の解決コマンドを実装時に再実行し、出力 SHA に固定する。design.md の表は参照値として扱う。
- [Risk] annotated tag（release-please-action@v4）を tag object SHA に固定すると不正な pin になる。
  → Mitigation: D2 で `^{}` dereference を必須化し、guard test（D5）が 40桁 hex 形式を強制する。実装時に当該 action が
    annotated か `git ls-remote` の `^{}` 行有無で確認する。
- [Risk] OIDC publish は npmjs 側 Trusted Publisher 登録（repo/workflow 一致）と npm CLI の OIDC 対応版が揃って初めて成立する。
  runner の npm が古いままだと失敗する。
  → Mitigation: D1 で publish 前の npm 更新 step を必須化する。Trusted Publisher 登録は登録済（背景）。実 publish 検証は tag push 時に
    人間が行う（CI では publish を実行しないため design では構成のみ提供）。
- [Risk] `npm install -g npm@latest` は版固定でないため将来の npm 破壊的変更を拾い得る（request-review LOW finding）。
  → Mitigation: 許容範囲（req 1 の明示要件）。PR 説明に latest 採用理由を一言添えて追跡性を確保する。
- [Risk] ci.yml の paths-ignore 記法ミス（push に付けるべきを pull_request に付ける等）。
  → Mitigation: D5 guard test が「push に paths-ignore あり / pull_request に paths 制限なし」を両方 assert する。

## Open Questions

なし。

## Migration Plan

実 publish の OIDC 検証は CI 自動では行わず、次回 tag push 時に人間が行う（publish step は CI では走らない）。
本変更が CI で保証するのは構成（OIDC 認証・SHA pin・paths-ignore）の正しさと guard test の green まで。

**PR 説明に含める検証方法（受け入れ基準「検証方法を PR に記載」用 — change folder は PR diff に含まれる）**:

- 各 action の SHA は次で解決・検証した:
  `git ls-remote https://github.com/<owner>/<repo> <tag> '<tag>^{}'`。
  lightweight tag は `refs/tags/<tag>` の SHA、annotated tag（release-please-action@v4）は `<tag>^{}`（dereference 後の commit）に固定。
- 固定した SHA → タグの対応は D2 の表のとおり（実装時に再解決した値を最終とする）。
- npm 更新 step に `npm install -g npm@latest` を採用した理由: runner 同梱 npm が OIDC 非対応のため、
  Trusted Publishing 対応版（11.5.1+）を常に拾う目的。版固定しないトレードオフは許容。
