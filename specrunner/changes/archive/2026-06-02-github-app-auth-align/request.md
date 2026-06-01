# GitHub device flow を GitHub App 前提に整合する（spec / doctor / login）

## Meta

- **type**: spec-change
- **slug**: github-app-auth-align
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

GitHub 認証を OAuth App から GitHub App の device flow に移行済み（main: `src/auth/constants.ts` の client_id を `Iv23liyDmS0r1qxXDewd` に差し替え、device code request の scope 送信を除去）。だが behavior 側がコードに追従しておらず、差分が生じている:

- `github-device-flow-auth` capability の spec が OAuth App + scope のまま。
- `doctor` の `github-token-valid` チェックが classic scope（`repo`）を `verifyTokenScopes()` で検証する。GitHub App の user access token（`ghu_`）は classic scope を返さないため **FAIL する**。
- `src/cli/login.ts` が `repo` scope 不在時に誤った警告を出す。

device flow 本体コードは main 適用済みのため、本 request は spec / doctor / login を GitHub App に整合させる。

## 要件

1. `github-device-flow-auth` capability の spec を GitHub App device flow 前提に更新する（user access token `ghu_`、scope 概念なし、token のアクセス権は GitHub App の install permissions ∩ user 権限、app は対象 repo に install 必須）。
2. `doctor` の token 有効性チェックを classic scope 依存から外す。`verifyTokenScopes()` の scope 検査ではなく、認証付き API 呼び出し（例: `GET /user` が 200）で有効性を判定し、`repo` scope 不在を理由に FAIL しない。
3. `src/cli/login.ts` の scope 警告ロジックを GitHub App token 向けに修正する（classic scope 前提の誤警告を出さない）。
4. 上記に伴い不要化する scope 関連アーティファクトを本 request で cleanup する: `src/auth/constants.ts` の `GITHUB_SCOPE` 定数と `src/auth/github-device.ts` の `data.scope ?? GITHUB_SCOPE` フォールバック（未使用なら削除）。

### 外部制約（GitHub App device flow）

- device code / token endpoint は OAuth App と同一（`github.com/login/device/code`, `github.com/login/oauth/access_token`）。
- GitHub App は scope を使わない（device code request に scope を含めない。実装済み）。
- 返る token は user-to-server token（`ghu_`）。GitHub App 設定の "Expire user authorization tokens" は OFF のため非期限・`refresh_token` なし。

## スコープ外

- token 解決順（gh 契約: `GH_TOKEN`/env 優先/gh 委譲）= 別 request `github-token-gh-contract`。
- host の config 化 = 別 request `github-host-config`。
- device flow 本体コード（client_id 差し替え・scope 除去）は main 適用済み。

## 受け入れ基準

- [ ] `doctor` が GitHub App user token（`ghu_`）で `github-token-valid` を pass する（classic scope に依存しない）。
- [ ] `login` が GitHub App token で誤った scope 警告を出さない。
- [ ] `github-device-flow-auth` の spec が GitHub App device flow 前提に更新されている。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

GitHub App device flow への移行は決定済み（device flow は interactive CLI の best practice、GitHub は OAuth App より GitHub App を推奨）。構造判断は `architecture/adr/2026-06-02-github-auth-host-decoupling.md`。本 request は behavior 側（spec / doctor / login）をコードに整合させるのみで、新たな設計判断を含まない。
