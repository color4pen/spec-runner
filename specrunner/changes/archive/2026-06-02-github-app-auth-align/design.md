## Context

GitHub 認証を OAuth App から GitHub App の device flow に移行済み（main: `src/auth/constants.ts` の client_id を GitHub App のものに差し替え、device code request の scope 送信を除去）。しかし behavior 側がコードに追従しておらず、以下の差分が生じている:

1. `github-device-flow-auth` capability の spec が OAuth App + `scope=repo` 前提のまま
2. `doctor` の `github-token-valid` check が `verifyTokenScopes()` で classic `repo` scope を検証する。GitHub App の user access token（`ghu_`）は `X-OAuth-Scopes` ヘッダに classic scope を返さないため **常に FAIL する**
3. `src/cli/login.ts` が `result.scopes.includes("repo")` で scope を検査し、`ghu_` token に対して誤った警告を出す
4. `src/auth/github-device.ts` の `AccessTokenResponse.scope` フィールドと `data.scope ?? GITHUB_SCOPE` フォールバック、`src/auth/constants.ts` の `GITHUB_SCOPE` 定数が不要化している

device flow 本体コード（client_id 差し替え・scope パラメータ除去）は main 適用済みのため、本 change は spec / doctor / login の 3 レイヤーを GitHub App に整合させる。

### GitHub App token の特性（外部制約）

- user access token は `ghu_` prefix
- `X-OAuth-Scopes` ヘッダを返さない（classic scope 概念がない）
- アクセス権は GitHub App の install permissions ∩ user 権限で決定
- app が対象 repo に install されていることが前提
- device code / token endpoint は OAuth App と同一
- "Expire user authorization tokens" OFF → 非期限・`refresh_token` なし

## Goals / Non-Goals

**Goals**:

- `doctor` の `github-token-valid` check を scope 依存から脱却させ、`GET /user` の HTTP status のみで有効性を判定する
- `login` の scope 警告ロジックを削除し、GitHub App token で誤警告を出さない
- `github-device-flow-auth` spec を GitHub App device flow 前提に更新する
- `cli-commands` spec の `specrunner login` / `specrunner doctor` 関連 requirement を GitHub App に整合させる
- scope 関連の不要アーティファクトを cleanup する（`GITHUB_SCOPE` 定数、`AccessTokenResponse.scope`、`runDeviceFlow` の `scopes` 返却）

**Non-Goals**:

- token 解決順（`GH_TOKEN` / env 優先 / gh 委譲）の変更 — 別 request `github-token-gh-contract`
- host の config 化 — 別 request `github-host-config`
- device flow 本体コード — main 適用済み
- `verifyTokenScopes()` メソッド名の変更 — scope を返さなくなるが、port interface のメソッド名リネームは本 request の scope 外。実装内容の変更のみ

## Decisions

### D1. doctor check は `GET /user` の HTTP status のみで判定する（scope 検査を完全除去）

`github-token-valid` check から `result.scopes.includes("repo")` の分岐を削除し、`verifyTokenScopes()` が `status: 200` を返せば pass とする。

**Rationale:** GitHub App user token は `X-OAuth-Scopes` を返さない。scope 検査を残すと全 `ghu_` token が FAIL する。token のアクセス権は GitHub App の install permissions で決まるため、CLI 側で scope を検証する意味がない。`GET /user` 200 = 有効な認証情報、で十分。

**Alternative considered:** `ghu_` prefix 検出で分岐し、classic token には scope 検査を残す案 → token 種別ごとの分岐が増え保守コストが上がる。GitHub App 一本化が方針なので classic token のサポートを積極的に維持する理由がない。

### D2. `runDeviceFlow` の返り値から `scopes` を除去し、`accessToken` のみ返す

`runDeviceFlow()` の返り値を `{ accessToken: string }` に変更する。`AccessTokenResponse` の `scope` フィールド、`GITHUB_SCOPE` 定数、`data.scope ?? GITHUB_SCOPE` フォールバックを削除する。

**Rationale:** GitHub App device flow は scope を使わない。token response に scope が含まれないため、フォールバックで `"repo"` を埋める現行コードは嘘のデータを生成している。呼び出し元（`login.ts`）の scope 検査も削除するため、返り値に scope を含める必要がなくなる。

**Alternative considered:** `scopes: []` を返す案 → 呼び出し元が空配列を受け取って何もしないだけで無意味。型から除去する方が明確。

### D3. `DoctorGitHubClient` port の `verifyTokenScopes()` シグネチャは変更しない

port interface の `verifyTokenScopes(): Promise<{ status: number; scopes: string[] }>` は維持する。adapter 実装は引き続き `X-OAuth-Scopes` を parse して `scopes` を返す（GitHub App token では空配列）。doctor check 側が scopes を無視するだけ。

**Rationale:** port interface の breaking change は adapter / テスト全体に波及する。doctor check が scopes を見ないようにするだけで目的は達成できる。メソッド名のリネーム（`verifyToken` 等）も scope 外。

### D4. login の scope 警告ブロックを丸ごと削除する

`login.ts` の `if (!result.scopes.includes("repo"))` ブロックを削除する。`runDeviceFlow` が scopes を返さなくなるため、warning ロジック自体が不要。

**Rationale:** GitHub App token に classic scope は存在しない。scope 不在の warning は誤情報。

## Risks / Trade-offs

[Risk] classic PAT (`ghp_`) ユーザーが `specrunner login` を介さず `GITHUB_TOKEN` env var で token を渡した場合、scope 不足でも doctor が検出しない → **Mitigation:** classic PAT は `specrunner login` のフローを通らない（env var 直接設定）。GitHub App への移行が完了しているため、classic PAT のサポートは積極的に行わない方針。scope ではなく実際の API 呼び出し結果（401 等）でランタイム時に検出される。

[Risk] `verifyTokenScopes()` が port に残る名前の不一致 → **Mitigation:** scope 外として今回は触れない。将来のリネーム request で対応可能。

## Open Questions

なし。
