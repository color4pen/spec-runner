# Design: github-token-gh-contract

## Context

`resolveGitHubToken`（`src/core/credentials/github.ts`）の現行解決順は credentials.json → `GITHUB_TOKEN` env。gh CLI の env 契約（`GH_TOKEN` > `GITHUB_TOKEN`、env > stored）と乖離しており、CI/ephemeral 環境で env が stored を上書きできない。`GH_TOKEN` も非対応。

ADR `2026-06-02-github-auth-host-decoupling` の D3 で credential 解決 seam に subprocess 委譲と host 引数を許容する構造判断が accepted 済み。

### 現行の解決順

1. `credentials.json` → 2. `GITHUB_TOKEN` env → 3. error

### 変更後の解決順

1. `GH_TOKEN` env → 2. `GITHUB_TOKEN` env → 3. `gh auth token` subprocess → 4. `credentials.json` → 5. guidance 付き error

### 影響箇所

| ファイル | 変更内容 |
|----------|----------|
| `src/core/credentials/github.ts` | resolver 本体の書き換え |
| `src/util/env-filter.ts` | `SECRET_DENYLIST` に `GH_TOKEN` 追加 |
| `src/core/preflight.ts` | `githubTokenSource` 型に `"gh"` 追加 |
| `src/cli/doctor.ts` | `githubTokenSource` 型に `"gh"` 追加 |
| `src/core/doctor/types.ts` | `DoctorContext.githubTokenSource` 型に `"gh"` 追加 |
| `src/core/doctor/checks/config/github-token-present.ts` | hint メッセージ更新 |
| `src/core/doctor/checks/auth/github-token-valid.ts` | hint メッセージ更新 |
| `src/core/credentials/requirements.ts` | `envVar` を `GH_TOKEN` に更新（PRIMARY） |

## Goals / Non-Goals

**Goals**:

- gh CLI の env 契約（`GH_TOKEN` > `GITHUB_TOKEN`、env > stored）に解決順を合わせる
- `gh auth token` subprocess 委譲で gh 認証済み環境からの token 解決を追加する
- `source` 型に `"gh"` を追加して解決元を明示する
- `GH_TOKEN` を `SECRET_DENYLIST` に追加して子プロセスへの漏洩を防ぐ
- `resolveGitHubToken` に `host` 引数の口を用意する（enforce は別 request）

**Non-Goals**:

- host↔token 束縛の enforce（`github-host-config` request）
- GitHub App device flow 整合（`github-app-auth-align` request）
- `gh auth token --hostname` の host 引数渡し（口だけ用意、束縛は次 request）

## Decisions

### D1: env を stored（credentials.json）より優先する

**決定**: 解決順を env → `gh auth token` → credentials.json に反転する。

**根拠**: gh CLI の契約では env が stored credential より優先される。CI/ephemeral 環境で env override が効かない現行動作は ecosystem 標準から逸脱。env 優先は 12-factor app のプラクティスとも整合。

**代替案**: 現行順（stored → env）を維持し CI 専用フラグを追加 → 却下（フラグ追加は複雑性増加、gh 契約の不整合が残る）。

### D2: `gh auth token` の subprocess 委譲を spawnCommand 経由で行う

**決定**: `spawnCommand`（`src/util/spawn.ts`）で `gh auth token` を実行する。timeout 5 秒、gh 不在（ENOENT）/ 非ゼロ終了 / timeout は null 返却で次 source にフォールスルー。

**根拠**: D3 ADR で subprocess 委譲を許容済み。`spawnCommand` は既に `stripSecrets` 経由で env を浄化しており B-6 seam を通る。新たな spawn ユーティリティは不要。

**代替案**: `node:child_process.execFile` を直接使う → 却下（`spawnCommand` と重複、`stripSecrets` を通らないリスク）。

### D3: source 型を union literal で拡張

**決定**: `"env" | "gh" | "credentials"` の 3 値 union にする。callsite の型を一括追従。

**根拠**: source は診断（doctor / preflight ログ）に使われる。`"gh"` を区別しないと `gh auth token` 由来の token がどの source か不明になる。

### D4: SpawnFn を DI パラメータとして resolver に注入

**決定**: `resolveGitHubToken` に optional な `spawn` パラメータ（型: `SpawnFn`）を追加する。デフォルトは `spawnCommand`。テストでは mock を注入する。

**根拠**: `gh auth token` subprocess を呼ぶ resolver のテストで実際の `gh` CLI に依存しない。既存の `SpawnFn` 型（`src/util/spawn.ts`）をそのまま使える。

### D5: host 引数は optional パラメータとして用意のみ

**決定**: `resolveGitHubToken` の第 2 引数に `opts?: { host?: string; spawn?: SpawnFn }` を追加。`host` が渡されても本 request では `gh auth token` に `--hostname` を渡さず、credentials.json の lookup にも使わない（口だけ）。

**根拠**: D3 ADR で host 引数を持てる構造を許容済み。enforce は `github-host-config` request で行う。

## Risks / Trade-offs

**[Risk]** env 優先への反転で既存ユーザーの credentials.json が意図せず env に上書きされる → **Mitigation**: env が設定されていない限り動作不変。env 設定は明示的行為。doctor の source 表示で解決元が可視。

**[Risk]** `gh auth token` の subprocess が遅い / hang → **Mitigation**: timeout 5 秒。timeout 時は null で次 source にフォールスルー。

**[Risk]** `gh` が PATH にあるが未認証 → **Mitigation**: 非ゼロ終了 = null で credentials.json にフォールスルー。throw しない。

## Open Questions

なし。
