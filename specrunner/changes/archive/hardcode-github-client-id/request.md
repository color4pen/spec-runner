# GitHub OAuth client_id を CLI コードに hardcode し、spec の既定動作に合わせる

## Meta

- **type**: bug-fix
- **slug**: hardcode-github-client-id
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen

## 背景

`specrunner/specs/github-device-flow-auth/spec.md:25-37` の Requirement「GitHub OAuth client_id は CLI コードに固定で埋め込まれる」は以下を定めている。

- client_id は MUST CLI コードの定数として埋め込まれる
- 環境変数 `SPECRUNNER_GITHUB_CLIENT_ID` で SHALL 上書き可能（テスト用）
- 既定動作: env が未設定なら CLI コードに埋め込まれた client_id が使われる

しかし現在の `src/auth/constants.ts:11-21` の `getGithubClientId()` は env var が未設定だと `SpecRunnerError("GITHUB_CLIENT_ID_MISSING")` を throw する。これは PR #42 で placeholder fallback を消した時の暫定形が残ったもので、spec が定める「既定動作」を満たしていない。

GitHub OAuth Device Flow の client_id は public knowledge（client_secret を使わない仕様）であり、`gh` CLI も client_id を OSS に hardcode している。spec に従い hardcode default を持つのが正しい姿。

## 要件

1. `src/auth/constants.ts` に SpecRunner 公式 GitHub OAuth App の client_id を文字列定数として埋め込む
2. `getGithubClientId()` は env `SPECRUNNER_GITHUB_CLIENT_ID` が設定されていればそれを返し、未設定なら hardcode 定数を返す
3. env 未設定時の throw を削除する
4. doctor の `SPECRUNNER_GITHUB_CLIENT_ID` チェック (`src/core/doctor/checks/env/github-client-id.ts`) は「未設定」を warn ではなく ok 扱いにする（hardcode default が使われる旨を message に含める）
5. spec の既定動作・環境変数オーバーライドの 2 scenario が code で満たされていることを test で確認する

## スコープ外

- GitHub Enterprise Server サポート（env override は残るが GHES 向けの追加配線は本 request では行わない）
- `src/errors.ts` の `GITHUB_CLIENT_ID_MISSING` error code 定数の削除（throw を消すと参照箇所はなくなるが、定数自体は残してよい）
- 公式 OAuth App の新規作成手順（実装時にユーザーが用意した client_id 値を埋め込む）

## 受け入れ基準

- [ ] `SPECRUNNER_GITHUB_CLIENT_ID` を unset した状態で `getGithubClientId()` が hardcode 値を返す（throw しない）
- [ ] `SPECRUNNER_GITHUB_CLIENT_ID=Iv1.test123` で `getGithubClientId()` が `Iv1.test123` を返す
- [ ] `bun run typecheck && bun run test` が green
- [ ] `specrunner doctor` で `SPECRUNNER_GITHUB_CLIENT_ID` 未設定が warn にならない

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD（spec 側に既に定義済みなので追加の設計判断は不要）
