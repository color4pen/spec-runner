# Design: GitHub host を config 駆動にし port を host 非依存に保つ（+ host↔token 束縛 B-10）

## Context

`api.github.com` が adapter 内 9 箇所にハードコードされ、auth の device/token URL（`src/auth/constants.ts`）も `github.com` 固定。GHES 等の別ホストに向けられない。`git/remote.ts` の `parseRemoteUrl` も `github.com` 以外を `REMOTE_NOT_GITHUB` で拒否する。

ADR `2026-06-02-github-auth-host-decoupling.md` で D1（host を adapter-contained・port 不変）と D2（host↔token 束縛 = B-10）が accepted。`resolveGitHubToken` は `github-token-gh-contract` request で host 引数を受け取れるようになっている（precondition）。

## Goals / Non-Goals

**Goals**:

- config schema に `github.host` / `github.apiBaseUrl` を追加し、composition-root から adapter に baseURL を注入する
- adapter 内の `api.github.com` 直書き 9 箇所を baseURL 経由に置換する
- auth device/token URL を host 駆動にする（GHES `/login` パス対応）
- enterprise token 解決: host ≠ github.com のとき `GH_ENTERPRISE_TOKEN` / `GITHUB_ENTERPRISE_TOKEN` を優先する
- host↔token 束縛 B-10 を `resolveGitHubToken` の host 引数で enforce し、`core-invariants.test.ts` に歯を追加する
- `doctor` の `github-origin` check を設定 host との一致検証に緩和する
- `git/remote.ts` の `parseRemoteUrl` を設定 host に対応させる

**Non-Goals**:

- multi-provider（GitLab 等）対応
- `architecture/model.md` §4 への B-10 昇格（architecture 側の管轄）
- token 解決順（gh 契約）の変更（別 request `github-token-gh-contract`）

## Decisions

### D1: config に `github` セクションを追加（host + apiBaseUrl）

`SpecRunnerConfig` に `github?: { host?: string; apiBaseUrl?: string }` を追加する。

- `host` 既定値: `"github.com"`
- `apiBaseUrl` 既定値: host から導出
  - host = `github.com` → `https://api.github.com`
  - host ≠ `github.com`（GHES）→ `https://{host}/api/v3`
- 両方設定時は `apiBaseUrl` を優先する

導出ロジックは shared-kernel（`src/config/` 内のヘルパー関数 `resolveGitHubApiBaseUrl`）に置く。composition-root と doctor の両方から呼べるようにするため。

**Rationale**: host だけで 99% のケースはカバーできるが、reverse proxy 構成等で API path が標準と異なるケースに `apiBaseUrl` 直指定で対応する。

**Alternatives considered**: host のみ（apiBaseUrl なし）→ 非標準 API path に対応できない。adapter に host を持たせて自分で導出 → composition-root の責務を adapter が持つことになり D1（ADR）に反する。

### D2: baseURL を `createGitHubClient` の引数で注入

`GitHubApiClient` の constructor と `createGitHubClient` factory に `baseUrl: string` パラメータを追加する。adapter 内の `https://api.github.com` 直書き 9 箇所を `this.baseUrl` 経由に置換する。

`GitHubClient` port interface は不変（host を露出しない）。B-2 の延長として、外部 endpoint host も adapter に封じ込める。

**Rationale**: port 不変により、domain 層は GitHub host の概念を知らない。adapter と composition-root の配線変更のみで GHES 対応が完了する。

**Alternatives considered**: port に baseUrl を露出 → B-2 が緩む。各メソッドに baseUrl を引数で渡す → 全呼び出し元が変更になり blast radius が大きい。

### D3: auth URL を host 駆動の関数にする

`src/auth/constants.ts` の `GITHUB_DEVICE_CODE_URL` / `GITHUB_TOKEN_URL` 定数を、host を引数に取る関数に変更する:

- `getDeviceCodeUrl(host)`: `https://{host}/login/device/code`
- `getTokenUrl(host)`: `https://{host}/login/oauth/access_token`

github.com の場合も同じパス構成（`/login/device/code`, `/login/oauth/access_token`）。

**Rationale**: GHES は github.com と同一のパス構成を使う。host を注入するだけで対応可能。

**Alternatives considered**: URL 全体を config にする → 過剰な自由度。定数を残して GHES 用に別定数を追加 → 分岐が増える。

### D4: enterprise token 解決を host 駆動にする

`resolveGitHubToken` の host 引数を活用し、env var の選択を host で分岐する:

| host | env var 優先順 |
|------|---------------|
| `github.com`（既定） | `GH_TOKEN` → `GITHUB_TOKEN` |
| それ以外（GHES） | `GH_ENTERPRISE_TOKEN` → `GITHUB_ENTERPRISE_TOKEN` |

env 段階の後は共通フロー（`gh auth token` → credentials.json → error）。`gh auth token` には `--hostname {host}` を渡して host 別 token を取得する。

**Rationale**: gh CLI の env var 契約（`gh help environment`）に整合。enterprise 用 token を分離することで B-10（host↔token 束縛）を env 段階から enforce する。

**Alternatives considered**: host に関係なく同じ env var → github.com 用 token を GHES に送るリスク（B-10 違反）。

### D5: host↔token 束縛 B-10 の enforce ポイント

B-10 は `resolveGitHubToken` の host 引数で enforce する。host が渡されると、その host に対応する env var のみを検索する（D4）。composition-root が config の host を `resolveGitHubToken` に渡すことで、token は常に target host に紐づく。

歯（test）は `core-invariants.test.ts` に追加。grep パターンで composition-root の `resolveGitHubToken` 呼び出しが host 引数を渡していることを検証する。

**Rationale**: token 漏洩は silent failure であり、テストなしでは検出不能。歯を追加して regression を機械検査する。

### D6: `parseRemoteUrl` を設定 host に対応させる

`git/remote.ts` の `parseRemoteUrl` は現在 `github.com` 固定で、それ以外は `REMOTE_NOT_GITHUB` エラー。これを host パラメータ（既定 `github.com`）を受け取り、設定 host と一致する URL を受け入れるように変更する。

**Rationale**: GHES の remote URL を解析できないと、CLI の全経路が GHES で動作しない。

### D7: doctor `github-origin` check の緩和

設定 host が `github.com` 以外のとき、`url.includes("github.com")` では常に fail する。config から host を読み、origin URL が設定 host を含むことを検証するように変更する。`DoctorContext` に host 情報を追加（config 経由で注入）。

**Rationale**: doctor check が GHES 環境で false negative を出さないようにする。

## Risks / Trade-offs

[Risk] `apiBaseUrl` の trailing slash 不統一 → **Mitigation**: `resolveGitHubApiBaseUrl` で normalize（trailing slash 除去）。

[Risk] GHES のパス構成が github.com と異なるケースがある可能性 → **Mitigation**: `apiBaseUrl` 直指定で override 可能（D1）。

[Risk] `GH_ENTERPRISE_TOKEN` が未設定で GHES を使おうとした場合のエラーメッセージが不明瞭 → **Mitigation**: `resolveGitHubToken` のエラーメッセージに host 情報を含め、どの env var を設定すべきか明示する。

[Risk] precondition 未充足（`github-token-gh-contract` 未マージ）で run した場合 → **Mitigation**: T-01 で precondition check を最初に実行。`resolveGitHubToken` に host 引数がなければ TypeScript の型エラーで検出される。

## Open Questions

なし（ADR D1/D2 で構造判断は決定済み）。
