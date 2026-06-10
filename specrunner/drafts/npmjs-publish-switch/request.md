# 配布を GitHub Packages から npmjs.com に切り替える

## Meta

- **type**: chore
- **slug**: npmjs-publish-switch
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

現在の配布は GitHub Packages で、install に GitHub 認証と .npmrc の registry 設定が必要であり、「install してすぐ使える」という North Star に反する。npmjs.com への公開に切り替える。公開前監査により、切り替えに必要な修正箇所と、新規ユーザーが README の設定例をコピーすると CONFIG_INVALID で落ちるモデル ID の問題が特定済み。

## 現状コードの前提

- `package.json:10-12` の publishConfig.registry が `https://npm.pkg.github.com`
- `.github/workflows/publish.yml` が GitHub Packages 前提: registry-url（`:21`）、`NODE_AUTH_TOKEN: secrets.GITHUB_TOKEN`（`:35`）、`packages: write` permission（`:14`）
- `README.md:42-50` の Installation 節が GitHub Packages 前提（.npmrc への registry 追記手順）
- README の設定例（`README.md:286-287` / `:323`）と step 既定モデル（`src/core/step/design.ts:12`、`code-review.ts:13`、`conformance.ts:11`、`spec-review.ts:13`）が `claude-opus-4-6[1m]` を使用しているが、この ID は `BUILTIN_MODEL_REGISTRY`（`src/config/model-registry.ts:14-20`）に存在しない（`claude-opus-4-8[1m]` と `claude-opus-4-6` はある）。未知 ID は CONFIG_INVALID を throw する
- npm pack の内容は LICENSE / README.md / dist/specrunner.js / package.json の 4 ファイルのみで、lifecycle scripts なし（監査確認済み）。release-please は registry 非依存で変更不要

## 要件

1. publishConfig を `https://registry.npmjs.org` に変更し、scoped package のため `"access": "public"` を追加する
2. publish workflow を npmjs 前提に変更する: registry-url の差し替え、認証を `secrets.NPM_TOKEN` 参照に変更、不要になる `packages: write` permission の削除、`npm publish --provenance` と `id-token: write` の追加（provenance 付き公開）
3. README の Installation 節を npmjs 前提に書き換える（.npmrc 手順の削除、`npm install -g @color4pen/specrunner` 等の標準手順）
4. モデル ID の整合を解消する: 新規ユーザーが README 例または step 既定値の `claude-opus-4-6[1m]` で CONFIG_INVALID にならないようにする。registry への ID 追加か参照側の ID 変更かは design 判断とするが、既存環境（global config で同 ID を定義済み）の挙動を変えないこと

## スコープ外

- npmjs のアカウント・token 発行・organization / scope の確保・`NPM_TOKEN` secret の登録・publish の実行（いずれも人間が行う）
- `engines.bun` の要否見直し
- README のその他の記載修正（コマンド名の誤記等、別件）
- リポジトリ public 化に関する作業

## 受け入れ基準

- [ ] `npm pack --dry-run` の内容物が現状（4 ファイル）から変わらない
- [ ] publish workflow に GitHub Packages への参照（npm.pkg.github.com / GITHUB_TOKEN による publish 認証 / packages: write）が残っていない
- [ ] README に GitHub Packages への言及が残っていない
- [ ] 素の config（global 定義なし）で README の設定例とstep 既定モデルが CONFIG_INVALID にならないことのテストがある
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- publish の実行と token 管理は人間の責務として CLI / CI の外に残す（外向きの不可逆操作に人間ゲートを置く運用と整合）。workflow は secret 名の参照のみを持つ
