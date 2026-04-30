## 1. Types and shared scaffolding

- [x] 1.1 `src/core/doctor/types.ts` に `DoctorCheck` / `DoctorContext` / `DoctorResult` / `DoctorCategory` 型を定義
- [x] 1.2 `DoctorContext` フィールド: `cwd` / `env` / `now` / `fetch` / `fs` / `execFile` / `config` / `githubClient` / `anthropicClient` / `homeDir` を網羅
- [x] 1.3 `src/core/doctor/index.ts` に re-export を集約（types / runner / formatter / checks）
- [x] 1.4 `src/core/doctor/checks/index.ts` に `export const allChecks: DoctorCheck[] = [...]` を作り、全 check を集約

## 2. Runtime category checks

- [x] 2.1 `src/core/doctor/checks/runtime/node.ts`: `process.version` から major を取り出し >= 18 を確認
- [x] 2.2 `src/core/doctor/checks/runtime/bun.ts`: `bun --version` を `execFile` で取得し pass / fail
- [x] 2.3 `src/core/doctor/checks/runtime/git.ts`: `git --version` を `execFile` で取得し pass / fail
- [x] 2.4 `src/core/doctor/checks/runtime/openspec.ts`: `npx openspec --version` を 30s timeout で実行し pass / fail
- [x] 2.5 各 runtime check の unit test を `tests/core/doctor/checks/runtime/` 配下に追加（`DoctorContext` mock 利用）

## 3. Configuration category checks

- [x] 3.1 `src/core/doctor/checks/config/file-exists.ts`: `~/.config/specrunner/config.json` 存在 + permission 0600 確認
- [x] 3.2 `src/core/doctor/checks/config/anthropic-key-present.ts`: 既存 ConfigStore から load、`anthropic.apiKey` フィールド存在確認
- [x] 3.3 `src/core/doctor/checks/config/github-token-present.ts`: `github.accessToken` フィールド存在確認
- [x] 3.4 各 config check の unit test を追加

## 4. Environment variables category checks

- [x] 4.1 `src/core/doctor/checks/env/github-client-id.ts`: `SPECRUNNER_GITHUB_CLIENT_ID` 設定状況。未設定なら warn
- [x] 4.2 env check の unit test を追加

## 5. Authentication category checks

- [x] 5.1 `src/core/doctor/checks/auth/anthropic-key-valid.ts`: `GET https://api.anthropic.com/v1/models` を 5s timeout で発行、200=pass / 401=fail / その他=warn
- [x] 5.2 `src/core/doctor/checks/auth/github-token-valid.ts`: `GET /user` を `fetch` で発行し 200 + `X-OAuth-Scopes` に `repo` 含むか確認
- [x] 5.3 各 auth check で `AbortController` による timeout を適切にハンドリング、timeout 時は warn を返す
- [x] 5.4 各 auth check の unit test を追加（fetch mock 利用）

## 6. Repository state category checks

- [x] 6.1 `src/core/doctor/checks/repo/git-repository.ts`: `cwd/.git` 存在確認
- [x] 6.2 `src/core/doctor/checks/repo/github-origin.ts`: `git remote get-url origin` を取得し `github.com` を指すか判定
- [x] 6.3 `src/core/doctor/checks/repo/openspec-project-md.ts`: `cwd/openspec/project.md` 存在確認
- [x] 6.4 `src/core/doctor/checks/repo/workflow-structure.ts`: `cwd/openspec-workflow/requests/{active,awaiting-merge,merged,canceled}/` 4 dir 存在確認、不足なら warn
- [x] 6.5 各 repo check の unit test を追加

## 7. Anthropic agents category checks

- [x] 7.1 `src/core/doctor/checks/agents/agents-registered.ts`: 7 agents（propose / spec-review / spec-fixer / implementer / build-fixer / code-review / code-fixer）が config に登録済みか確認
- [x] 7.2 `src/core/doctor/checks/agents/environment-registered.ts`: `environment.id` 存在確認
- [x] 7.3 `src/core/doctor/checks/agents/definition-drift.ts`: `src/prompts/*` から system prompt を読み hash 計算 → config の `definitionHash` と比較。mismatch なら warn + `specrunner init --resync` hint
- [x] 7.4 既存の `computeDefinitionHash` 関数を再利用、新規実装はしない
- [x] 7.5 各 agents check の unit test を追加

## 8. Storage category checks

- [x] 8.1 `src/core/doctor/checks/storage/jobs-writable.ts`: `~/.local/share/specrunner/jobs/` への `fs.access(W_OK)` 確認、不在時は親 dir の write 権を確認
- [x] 8.2 `src/core/doctor/checks/storage/old-state-files.ts`: jobs dir 内の state file をカウント、100 超なら warn + gc 推奨 hint
- [x] 8.3 各 storage check の unit test を追加

## 9. Runner

- [x] 9.1 `src/core/doctor/runner.ts`: `runChecks(checks: DoctorCheck[], ctx: DoctorContext): Promise<DoctorResult[]>` を実装。逐次実行、各 check の `name` / `category` / `required` を結果に保存
- [x] 9.2 個別 check が throw した場合は `status: "fail"` + message に exception の summary を入れて続行
- [x] 9.3 `runner.ts` の unit test を追加（mock check で順序・例外ハンドリング検証）

## 10. Formatters

- [x] 10.1 `src/core/doctor/formatter.ts`: `formatHuman(results)` を実装。category 別 grouping、`[✓]` / `[!]` / `[✗]` 記号、最後に summary 行
- [x] 10.2 `formatJson(results)` を実装。design.md の JSON schema に厳密準拠（`undefined` フィールドは出さない）
- [x] 10.3 formatter の unit test を追加（snapshot）

## 11. CLI dispatch

- [x] 11.1 `src/cli/doctor.ts`: `runDoctor({ json: boolean })` entry を作成。`DoctorContext` を実装環境用に組み立て、`runChecks(allChecks, ctx)` を呼び、formatter で stdout に出力
- [x] 11.2 全 result の `status` から exit code を決定: 1 つでも `fail` → 1、それ以外（pass/warn のみ）→ 0
- [x] 11.3 unhandled exception 時は stderr に `Fatal: ...` を出し exit 2
- [x] 11.4 `bin/specrunner.ts` の switch case に `doctor` を追加。`--json` フラグをパースし `runDoctor({ json })` を呼ぶ
- [x] 11.5 `bin/specrunner.ts` の `USAGE` 文字列に `doctor` の 1 行説明を追加（`Diagnose environment / config / auth prerequisites`）
- [x] 11.6 `bin/specrunner.ts` doctor case の unit test を追加（既存 init / login / run / ps の dispatch test と同パターン）

## 12. Adapter integration

- [x] 12.1 既存 `GitHubClient` port に `verifyTokenScopes(): Promise<{ status: number; scopes: string[] }>` を追加する。`auth/github-token-valid.ts` はこの port method 経由でのみ呼び出し、fetch を直叩きしない（port パターン遵守）
- [x] 12.2 既存 ConfigStore を `DoctorContext` から呼べるよう、`load()` を起動時に 1 回叩く（doctor.ts 内）
- [x] 12.3 adapter 連携の integration test を追加（実 file system は temp dir 経由）

## 13. Documentation and ADR

- [x] 13.1 ADR の元になる decision rationale を整備する。**implementer は ADR ファイルを直接書かない**。`design.md` D5 の決定テーブルおよび `request.md` の「外部依存の方針」セクションが rationale として機能し、Step 7 の `adr-create` スキルが `openspec-workflow/adr/ADR-20260430-external-dependency-policy.md` を生成する（workflow option `adr: enabled` のため）。implementer のタスクは: (a) `design.md` D5 の内容が最新であることを確認する、(b) `decisions/` フォルダに補足コンテキストが必要であれば追記する、の 2 点のみ
- [ ] 13.2 README または `docs/` に `specrunner doctor` の使い方を追記（任意）

## 14. Acceptance and regression

- [x] 14.1 既存テスト 533 件が PASS することを確認（regression 0）
- [ ] 14.2 `bun bin/specrunner.ts doctor` を実機 1 回 invoke し、全 check が期待通り（pass/warn/fail）を返すことを確認
- [ ] 14.3 `bun bin/specrunner.ts doctor --json | jq .` で JSON が valid であることを確認
- [ ] 14.4 `bun bin/specrunner.ts --help` 出力に `doctor` が含まれることを確認
- [ ] 14.5 acceptance criteria のチェックボックスを request.md で全て埋める
