# Test Cases: github-token-gh-contract

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration): 25
- **Manual**: 0
- **Priority**: must: 23, should: 2, could: 0

---

### TC-001: GH_TOKEN が stripSecrets によって除去される

**Category**: unit  
**Priority**: must  
**Source**: T-01

**GIVEN** `GH_TOKEN=ghp_secret` を含む env で `stripSecrets` が呼ばれる  
**WHEN** フィルタ済み env が返される  
**THEN** 返値に `GH_TOKEN` キーが存在しない

---

### TC-002: GH_TOKEN と GITHUB_TOKEN の両方が stripSecrets で除去される

**Category**: unit  
**Priority**: must  
**Source**: T-01

**GIVEN** `GH_TOKEN=ghp_a` と `GITHUB_TOKEN=ghp_b` を含む env で `stripSecrets` が呼ばれる  
**WHEN** フィルタ済み env が返される  
**THEN** `GH_TOKEN` と `GITHUB_TOKEN` のどちらも返値に存在しない

---

### TC-003: GH_TOKEN が最優先で解決される

**Category**: unit  
**Priority**: must  
**Source**: T-02

**GIVEN** `GH_TOKEN=token_gh` が env にセットされ、`GITHUB_TOKEN` と `credentials.json` は不在  
**WHEN** `resolveGitHubToken()` が呼ばれる  
**THEN** `{ token: "token_gh", source: "env" }` が返される

---

### TC-004: GH_TOKEN 不在時に GITHUB_TOKEN が解決される

**Category**: unit  
**Priority**: must  
**Source**: T-02

**GIVEN** `GH_TOKEN` は未セット、`GITHUB_TOKEN=token_github` が env にセット  
**WHEN** `resolveGitHubToken()` が呼ばれる  
**THEN** `{ token: "token_github", source: "env" }` が返される

---

### TC-005: GH_TOKEN と GITHUB_TOKEN が両方ある場合 GH_TOKEN が優先される

**Category**: unit  
**Priority**: must  
**Source**: T-02, T-06

**GIVEN** `GH_TOKEN=token_gh` と `GITHUB_TOKEN=token_github` の両方が env にセット  
**WHEN** `resolveGitHubToken()` が呼ばれる  
**THEN** `{ token: "token_gh", source: "env" }` が返される（GITHUB_TOKEN は使われない）

---

### TC-006: env が credentials.json より優先される

**Category**: unit  
**Priority**: must  
**Source**: T-02

**GIVEN** `credentials.json` に `github.token = "stored_token"` があり、`GH_TOKEN=env_token` が env にセット  
**WHEN** `resolveGitHubToken()` が呼ばれる  
**THEN** `{ token: "env_token", source: "env" }` が返される（stored_token は使われない）

---

### TC-007: env 不在・gh 認証済みなら gh auth token から source:"gh" で解決される

**Category**: unit  
**Priority**: must  
**Source**: T-02, T-06

**GIVEN** `GH_TOKEN` と `GITHUB_TOKEN` は未セット、spawn mock が exit 0 と stdout `"gh_token\n"` を返す  
**WHEN** `resolveGitHubToken({ spawn: mockSpawn })` が呼ばれる  
**THEN** `{ token: "gh_token", source: "gh" }` が返される

---

### TC-008: gh auth token が exit 1 なら credentials.json にフォールスルーする

**Category**: unit  
**Priority**: must  
**Source**: T-02, T-06

**GIVEN** env vars 不在、spawn mock が exit 1 を返す、`credentials.json` に `github.token = "stored_token"`  
**WHEN** `resolveGitHubToken({ spawn: mockSpawn })` が呼ばれる  
**THEN** `{ token: "stored_token", source: "credentials" }` が返される（throw しない）

---

### TC-009: gh が PATH にない（ENOENT）なら credentials.json にフォールスルーする

**Category**: unit  
**Priority**: must  
**Source**: T-02, T-06

**GIVEN** env vars 不在、spawn mock が ENOENT 相当（exitCode: null）を返す、`credentials.json` に `github.token = "stored_token"`  
**WHEN** `resolveGitHubToken({ spawn: mockSpawn })` が呼ばれる  
**THEN** `{ token: "stored_token", source: "credentials" }` が返される（throw しない）

---

### TC-010: gh auth token timeout なら credentials.json にフォールスルーする

**Category**: unit  
**Priority**: must  
**Source**: T-02, design.md D2

**GIVEN** env vars 不在、spawn mock が 5 秒超過（timeout）を示す、`credentials.json` に `github.token = "stored_token"`  
**WHEN** `resolveGitHubToken({ spawn: mockSpawn })` が呼ばれる  
**THEN** `{ token: "stored_token", source: "credentials" }` が返される（throw しない）

---

### TC-011: 全 source 不在なら SpecRunnerError がスローされる

**Category**: unit  
**Priority**: must  
**Source**: T-02, T-06

**GIVEN** env vars 不在、spawn mock が失敗、`credentials.json` に `github.token` なし  
**WHEN** `resolveGitHubToken({ spawn: mockSpawn })` が呼ばれる  
**THEN** `SpecRunnerError` がスローされる

---

### TC-012: エラー hint に 3 つのガイダンスが含まれる

**Category**: unit  
**Priority**: must  
**Source**: T-02, T-04

**GIVEN** 全 token source 不在で `resolveGitHubToken` がスローする  
**WHEN** エラーの hint を検査する  
**THEN** hint に `GH_TOKEN`、`gh auth login`、`specrunner login` の 3 つが含まれる

---

### TC-013: host 引数を渡してもエラーにならない

**Category**: unit  
**Priority**: must  
**Source**: T-02, design.md D5

**GIVEN** `GH_TOKEN=token_gh` が env にセット  
**WHEN** `resolveGitHubToken({ host: "github.example.com" })` が呼ばれる  
**THEN** エラーなく `{ token: "token_gh", source: "env" }` が返される

---

### TC-014: gh subprocess は spawnCommand（B-6 seam）経由で実行される

**Category**: unit  
**Priority**: must  
**Source**: T-02, design.md D2

**GIVEN** `opts.spawn` が渡されていない（デフォルト）で resolver が gh subprocess に到達する  
**WHEN** `resolveGitHubToken()` 内部で subprocess が実行される  
**THEN** `spawnCommand`（`src/util/spawn.ts`）が使われ、`node:child_process` の API が直接呼ばれない

---

### TC-015: gh 由来の token が logger.maskSensitive 経由でのみ出力される

**Category**: integration  
**Priority**: must  
**Source**: T-02, request.md 外部制約

**GIVEN** `source: "gh"` で token が解決された  
**WHEN** preflight または doctor がトークン情報をログ出力する  
**THEN** token の値は `logger.maskSensitive` を通じてのみ現れ、raw 文字列として直接ログされない

---

### TC-016: preflight.ts が "gh" source で型エラーなくコンパイルされる

**Category**: unit  
**Priority**: must  
**Source**: T-03

**GIVEN** `resolveGitHubToken` が `source: "gh"` を返す型変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** `src/core/preflight.ts` に型エラーが出ない

---

### TC-017: doctor/types.ts と cli/doctor.ts が "gh" source で型エラーなくコンパイルされる

**Category**: unit  
**Priority**: must  
**Source**: T-03

**GIVEN** `DoctorContext.githubTokenSource` が `"gh"` を含む union 型に変更されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** `src/core/doctor/types.ts` および `src/cli/doctor.ts` に型エラーが出ない

---

### TC-018: github-token-present check の hint が更新される

**Category**: unit  
**Priority**: must  
**Source**: T-04

**GIVEN** GitHub token が見つからない  
**WHEN** `github-token-present` doctor check が実行される  
**THEN** fail メッセージの hint に `GH_TOKEN`、`gh auth login`、`specrunner login` が含まれる

---

### TC-019: github-token-valid check の hint が更新される

**Category**: unit  
**Priority**: must  
**Source**: T-04

**GIVEN** GitHub token が validation 時に不在  
**WHEN** `github-token-valid` doctor check が実行される  
**THEN** hint に `GH_TOKEN`、`gh auth login`、`specrunner login` が含まれる

---

### TC-020: requirementsFor が GH_TOKEN を primary envVar として返す

**Category**: unit  
**Priority**: must  
**Source**: T-05

**GIVEN** `requirementsFor("local")` が呼ばれる  
**WHEN** 返値の `github.token` を検査する  
**THEN** `envVar` が `"GH_TOKEN"` である

---

### TC-021: bun run test が green

**Category**: integration  
**Priority**: must  
**Source**: T-06

**GIVEN** 全実装変更が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** テストスイートが全件 pass する

---

### TC-022: bun run typecheck が green

**Category**: unit  
**Priority**: must  
**Source**: T-03, T-06

**GIVEN** 全型変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件

---

### TC-023: gh subprocess のテストが実際の gh CLI に依存しない

**Category**: unit  
**Priority**: must  
**Source**: T-06

**GIVEN** `github.test.ts` が `opts.spawn` mock を注入してテストする  
**WHEN** gh が PATH に存在しない環境でテストを実行する  
**THEN** gh subprocess 関連テストが全件 pass する

---

### TC-024: GH_TOKEN が空文字列の場合は次の source に進む

**Category**: unit  
**Priority**: should  
**Source**: T-02

**GIVEN** `GH_TOKEN=""` （空文字列）が env にセット、`GITHUB_TOKEN=token_github` が有効  
**WHEN** `resolveGitHubToken()` が呼ばれる  
**THEN** 空の `GH_TOKEN` はスキップされ `{ token: "token_github", source: "env" }` が返される

---

### TC-025: gh auth token の stdout に trailing newline があっても trim される

**Category**: unit  
**Priority**: should  
**Source**: T-02

**GIVEN** spawn mock が exit 0 と stdout `"gh_token\n"` を返す  
**WHEN** `resolveGitHubToken({ spawn: mockSpawn })` が呼ばれる  
**THEN** `token` が `"gh_token"`（trim 済み）で返される

---

## Result

```yaml
result: completed
total: 25
automated: 25
manual: 0
must: 23
should: 2
could: 0
blocked_reasons: []
```
