# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | testing | tests/git-remote.test.ts | TC-013 の `vi.mock("node:child_process")` がテスト body 内に配置されており Vitest のホイスト警告が出る。さらにテスト body にアサーションがなく dead test になっている。将来の Vitest バージョンでエラーになる。 | `vi.mock(...)` をファイルトップレベルに移すか TC-013 テスト自体を削除する | no |
| 2 | LOW | maintainability | src/errors.ts | `remoteNotGitHubError()` のメッセージが `"'origin' must point to github.com."` とハードコードされており、GHES host 設定時に混乱を招く。doctor check の hint は正しく host-aware。 | `remoteNotGitHubError(host: string)` でメッセージを host 依存にする | no |
| 3 | LOW | security | src/core/credentials/github.ts | Enterprise host の token 解決 priority 4（`credentials.json github.token`）は host に依存しない。config を github.com → GHES に切り替えて credentials を更新しない場合、github.com token が GHES へ送られる経路が残る。設計 D5 が env-var 段の B-10 enforcement に限定しており設計上の known limitation。 | GHES ユーザー向けドキュメントに「host 変更後は `specrunner login` または `gh auth login --hostname {host}` を実行すること」を追記する | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 8 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.80

## Summary

全受け入れ基準を満たし、`bun run typecheck && bun run test` が green（289 files / 3317 tests）。

**設計適合**:
- D1/D2: `GitHubClient` port 不変、baseUrl は `createGitHubClient(fetch, token, baseUrl)` で adapter に DI ✅
- D3: `GITHUB_DEVICE_CODE_URL` / `GITHUB_TOKEN_URL` 定数削除、`getDeviceCodeUrl(host)` / `getTokenUrl(host)` 関数化 ✅
- D4: GHES → `GH_ENTERPRISE_TOKEN` / `GITHUB_ENTERPRISE_TOKEN`、github.com → `GH_TOKEN` / `GITHUB_TOKEN` ✅
- D5/B-10: composition-root の全 `resolveGitHubToken` 呼び出しに `host:` 引数、全 `createGitHubClient` 呼び出しに baseUrl 引数。歯（`core-invariants.test.ts`）+ regression guard 追加済み ✅
- D6: `parseRemoteUrl` が host パラメータを受け取り、SSH/HTTPS 両パターンで GHES URL を解析可能 ✅
- D7: doctor `github-origin` check が `ctx.config.get("github.host")` 経由で configured host を取得して検証 ✅

**非ブロッキング指摘のみ**: F-01（vi.mock 配置警告 / dead test）・F-02（エラーメッセージ UX）・F-03（credentials.json B-10 設計限界）はいずれも correctness に影響しない。
