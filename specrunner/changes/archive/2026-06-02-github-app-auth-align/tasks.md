# Tasks:

## T-01: delta spec — `github-device-flow-auth` を GitHub App 前提に更新

- [x] `specrunner/changes/github-app-auth-align/specs/github-device-flow-auth/spec.md` を作成
- [x] Requirement「GitHub Device Flow OAuth でトークンを取得する」を MODIFIED: `scope=repo` 送信を削除、GitHub App device flow 前提に書き換え（client_id のみ送信、scope パラメータなし）、token は `ghu_` user access token
- [x] Scenario「device code 取得」の `scope=repo` を除去（`client_id` のみ送信）
- [x] Requirement「取得した access_token は config に保存される」の記述はそのまま維持（変更なし）

**Acceptance Criteria**:
- delta spec が `specrunner/changes/github-app-auth-align/specs/github-device-flow-auth/spec.md` に存在する
- scope 関連の記述が GitHub App 前提に更新されている

## T-02: delta spec — `cli-commands` の login / doctor requirement を更新

- [x] `specrunner/changes/github-app-auth-align/specs/cli-commands/spec.md` を作成
- [x] Requirement「`specrunner login` は GitHub Device Flow OAuth でトークンを取得する」を MODIFIED: scope 検査・scope 警告・scope fallback の記述を削除、GitHub App device flow 前提に書き換え
- [x] Scenario「通常成功フロー（repo scope あり）」→ scope 条件を除去し「通常成功フロー」に修正
- [x] Scenario「scope 不足（repo scope なし）」を削除
- [x] Scenario「scope fallback（GitHub が scope を返さない場合）」を削除
- [x] Requirement「`specrunner doctor` の `github-token-present` check は token 取得元を表示する」を MODIFIED: `github-token-valid` check の責務説明から「scope 検証が責務」を「token 有効性検証が責務」に変更

**Acceptance Criteria**:
- delta spec が `specrunner/changes/github-app-auth-align/specs/cli-commands/spec.md` に存在する
- login の scope 検査関連 scenario が除去されている
- doctor の `github-token-valid` 説明が scope 依存でない

## T-03: `src/auth/constants.ts` から `GITHUB_SCOPE` を削除

- [x] `export const GITHUB_SCOPE = "repo";` を削除

**Acceptance Criteria**:
- `GITHUB_SCOPE` が `src/auth/constants.ts` に存在しない
- `bun run typecheck` が green（T-04 と合わせて実行）

## T-04: `src/auth/github-device.ts` から scope 関連コードを除去

- [x] `GITHUB_SCOPE` の import を削除
- [x] `AccessTokenResponse` interface から `scope: string` フィールドを削除
- [x] `pollAccessToken` の return で `scope: data.scope ?? GITHUB_SCOPE` を削除
- [x] `runDeviceFlow` の返り値型を `Promise<{ accessToken: string }>` に変更（`scopes` を除去）
- [x] `token.scope.split(",").map(...)` の scopes 組み立てを削除

**Acceptance Criteria**:
- `GITHUB_SCOPE` の参照が `src/auth/github-device.ts` に存在しない
- `AccessTokenResponse` に `scope` フィールドがない
- `runDeviceFlow` が `{ accessToken: string }` を返す
- `bun run typecheck` が green

## T-05: `src/cli/login.ts` から scope 警告ロジックを削除

- [x] `if (!result.scopes.includes("repo"))` ブロック（logWarn 含む）を削除
- [x] `result.scopes` 参照がなくなるため、`result` の destructure を `result.accessToken` に変更

**Acceptance Criteria**:
- `login.ts` に `scopes` / `scope` / `repo` の参照がない
- `bun run typecheck` が green

## T-06: `src/core/doctor/checks/auth/github-token-valid.ts` から scope 検査を除去

- [x] `result.scopes.includes("repo")` の分岐（`hasRepoScope` check → fail）を削除
- [x] `status: 200` を返せば pass とする。pass message を `GitHub token is valid` に変更（`(repo ✓)` を除去）

**Acceptance Criteria**:
- `github-token-valid.ts` に `scopes` / `repo` の参照がない
- `status: 200` で pass、`status: 401` で fail、timeout で warn の 3 分岐のみ
- `bun run typecheck` が green

## T-07: テストを更新

- [x] `tests/core/doctor/checks/auth/github-token-valid.test.ts`:
  - TC-023（200 + no repo scope → fail）を修正: 200 + scopes なし → pass に変更
  - TC-022（200 + repo scope → pass）は pass のまま維持（scope があっても pass）
  - 他のテストケースは変更不要
- [x] `src/auth/github-device.ts` 関連テストがあれば scope 関連 assertion を修正

**Acceptance Criteria**:
- `bun run test` が green
- `bun run typecheck` が green

## T-08: 最終検証

- [x] `bun run typecheck && bun run test` が green
- [x] codebase に `GITHUB_SCOPE` の参照が残っていないことを確認

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- `GITHUB_SCOPE` が src/ 配下に存在しない
