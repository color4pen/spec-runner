# CI の package smoke を初回接触契約の assert に拡張する — npm 配布物・任意 cwd・隔離 XDG で実運用条件を歩く

## Meta

- **type**: new-feature
- **slug**: packaged-smoke-contract
- **base-branch**: main
- **adr**: false

<!-- 既存 CI job 内の smoke step の拡張。新しい設計要素は無い -->

## 背景

開発検証は「bun + TS ソース + repo root」で走るが、利用者は「node + dist bundle + npx + 任意 cwd」で使う。実変数がすべて異なるのに、既存の package smoke（`.github/workflows/ci.yml:42-49`）は `npm pack` → clean install → `--help` の起動確認のみで、初回接触の契約を何も assert していない。

このギャップにより、公開物にだけ存在する欠陥（init の無言スキップ・subdirectory 起動での入れ子生成・doctor の XDG 非認識）が dogfooding では構造的に検出不能だった。いずれも修正済みで、その契約は現在 unit / contract テストが固定しているが、**配布物（dist bundle を node で実行）での成立**を歩くゲートは依然として無い。

## 現状コードの前提

- `.github/workflows/ci.yml:42-49` — 既存 smoke: `npm pack` → mktemp dir で `npm init -y` → tarball install → `./node_modules/.bin/specrunner --help` のみ
- 配布物は `dist/specrunner.js`（`package.json` の bin）で、node で実行される。bun 依存はない
- `specrunner init` は git repo 外で exit 1・無書き込み、repo 内で created / already-exists を項目別報告する（merge 済み契約）
- `specrunner request new <slug>` は subdirectory から実行しても repo root の `specrunner/drafts/<slug>/request.md` に作成する（merge 済み契約）
- doctor の `config-file-exists` check は `getConfigPath()` 経由で `XDG_CONFIG_HOME` を尊重する（merge 済み契約）。`doctor --json` は check ごとの `name` / `status` を含む JSON を出力する
- doctor は token 不在環境では該当 check が fail し exit 1 になる（smoke では全体 exit でなく per-check で判定する必要がある）

## 要件

1. **smoke を契約 assert に拡張する**: 既存 step を置き換え、packed tarball のみを使って（repo の TS ソース・bun に依存せず）次を assert する:
   - **repo 外 init**: git repo でないディレクトリで `init` が非ゼロ exit し、ファイルを一切作らない（隔離した `XDG_CONFIG_HOME` 配下も含めて空のまま）
   - **subdirectory init**: fixture git repo の subdirectory から `init` を実行すると exit 0 で、scaffold が repo root に作られ（subdirectory 配下に `specrunner/` が生成されない）、出力に created の項目報告が含まれる
   - **XDG 契約**: 隔離した `XDG_CONFIG_HOME` で `init` した後の `doctor --json` で、`config-file-exists` check が `pass` である（全体 exit code ではなく該当 check の status で判定する）
   - **subdirectory request new**: subdirectory から `request new` した request.md が repo root 側に作成され、subdirectory 配下に入れ子の `specrunner/` が無い
   - 既存の `--help` 起動確認は維持する
2. **ローカル実行可能なスクリプトに切り出す**: assert 本体は repo 内のスクリプト（例: `scripts/`）に置き、CI からはそれを呼ぶ。開発者がローカルで同じ smoke を実行・デバッグできること。
3. **環境隔離**: fixture は mktemp 配下に作り、`XDG_CONFIG_HOME` / `HOME` 等を隔離して、CI runner や開発者機の実際の設定・認証状態に依存しないこと（token 不在でも成立する assert のみで構成する）。

## スコープ外

- CI の他 job / step の変更（既存 build・test・lint 構成には触れない）
- login / run など認証を要する経路の smoke（token 不在で成立しないため対象外）
- npm publish 経路（publish.yml）の変更

## 受け入れ基準

- [ ] **T1**: repo 外 init の非ゼロ exit と無書き込み（XDG 配下含む）が smoke で assert される。
- [ ] **T2**: subdirectory init の root 着地・入れ子なし・created 報告が smoke で assert される。
- [ ] **T3**: 隔離 XDG → init → `doctor --json` の `config-file-exists` = pass が smoke で assert される。
- [ ] **T4**: subdirectory request new の root 着地・入れ子なしが smoke で assert される。
- [ ] **T5**: smoke が packed tarball と node のみで動く（`bun` / repo の `src/` を参照しない）。スクリプトがローカル実行可能である。
- [ ] **T6（破壊確認・ローカル）**: スクリプトの assert がそれぞれ実際に失敗し得ることを、期待値を意図的に反転して落ちることで確認する（確認後に戻す）。
- [ ] **T7**: CI が green（本 smoke を含む）。`typecheck && test` が green。

## architect 評価済みの設計判断

- **assert 本体はスクリプトに切り出し、CI は呼ぶだけ**。→ 却下: workflow YAML に直書き（ローカルで再現・デバッグできず、YAML 内 bash は破壊確認も実質不可能）。
- **doctor は per-check の status で判定**。→ 却下: 全体 exit code で判定（token 不在環境では常に exit 1 のため、判定が XDG 契約と無関係に固定される）。
- **認証を要する経路は対象外**。→ 却下: secrets を smoke に注入して login / run まで歩く（CI へ長期 token を増やす方が新たなリスクで、認証系は unit / 実運用 dogfooding が担う）。
