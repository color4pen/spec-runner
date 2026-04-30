# Test Cases: cli-doctor-command

## Summary

- **Total**: 80 cases
- **Automated** (unit/integration/e2e): 76
- **Manual**: 4
- **Priority**: must: 58, should: 17, could: 5

## Test Cases

---

### TC-001: node version check が >= 18 で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.1, spec.md runtime category

**GIVEN** `DoctorContext` の `env.process_version` が `v20.0.0` を返す mock
**WHEN** `nodeVersionCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass", message: ... }` を返す

---

### TC-002: node version check が < 18 で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.1, spec.md runtime category

**GIVEN** `DoctorContext` の `process.version` 相当が `v16.0.0` を返す mock
**WHEN** `nodeVersionCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail", message: ... }` を返し、hint に upgrade 手順を含む

---

### TC-003: bun version check が execFile 成功で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.2, spec.md runtime category

**GIVEN** `DoctorContext` の `execFile("bun", ["--version"])` が `"1.1.0\n"` で resolve する mock
**WHEN** `bunVersionCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-004: bun version check が execFile 失敗で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.2, spec.md runtime category

**GIVEN** `DoctorContext` の `execFile("bun", ["--version"])` が Error で reject する mock
**WHEN** `bunVersionCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返し、hint に bun install 手順を含む

---

### TC-005: git version check が execFile 成功で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.3, spec.md runtime category

**GIVEN** `DoctorContext` の `execFile("git", ["--version"])` が `"git version 2.44.0\n"` で resolve する mock
**WHEN** `gitVersionCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-006: git version check が execFile 失敗で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.3, spec.md runtime category

**GIVEN** `DoctorContext` の `execFile("git", ["--version"])` が Error で reject する mock
**WHEN** `gitVersionCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返す

---

### TC-007: openspec check が npx 成功で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.4, spec.md runtime category

**GIVEN** `DoctorContext` の `execFile("npx", ["openspec", "--version"])` が `"0.5.0\n"` で resolve する mock
**WHEN** `openspecCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-008: openspec check が 30s timeout 内に応答しない場合 warn を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.4, design.md D7, spec.md runtime category

**GIVEN** `DoctorContext` の `execFile` が 30s を超えて応答しない（または AbortError を throw する）mock
**WHEN** `openspecCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "warn" }` を返し、message に timeout を示す文字列を含む

---

### TC-009: config file-exists check が存在 + permission 0600 で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.1, spec.md config category

**GIVEN** `DoctorContext` の `fs.statSync("~/.config/specrunner/config.json")` が `{ mode: 0o100600 }` を返す mock
**WHEN** `configFileExistsCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-010: config file-exists check がファイル不在で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.1, spec.md config category

**GIVEN** `DoctorContext` の `fs.statSync` が ENOENT を throw する mock
**WHEN** `configFileExistsCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返し、hint に `Run 'specrunner init' first.` を含む

---

### TC-011: config file-exists check が permission 0644（0600 外）で warn を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.1, design.md D6, spec.md config category

**GIVEN** `DoctorContext` の `fs.statSync` が `{ mode: 0o100644 }` を返す mock
**WHEN** `configFileExistsCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "warn" }` を返し、message に permission 不一致を示す文字列を含む

---

### TC-012: anthropic-key-present check が apiKey フィールド存在で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.2, spec.md config category

**GIVEN** `DoctorContext` の `config.get("anthropic.apiKey")` が非空文字列を返す mock
**WHEN** `anthropicKeyPresentCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-013: anthropic-key-present check が apiKey 未設定で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.2, spec.md config category

**GIVEN** `DoctorContext` の `config.get("anthropic.apiKey")` が undefined または空文字列を返す mock
**WHEN** `anthropicKeyPresentCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返す

---

### TC-014: github-token-present check が accessToken 存在で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.3, spec.md config category

**GIVEN** `DoctorContext` の `config.get("github.accessToken")` が非空文字列を返す mock
**WHEN** `githubTokenPresentCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-015: github-token-present check が accessToken 未設定で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.3, spec.md config category

**GIVEN** `DoctorContext` の `config.get("github.accessToken")` が undefined を返す mock
**WHEN** `githubTokenPresentCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返す

---

### TC-016: github-client-id env check が未設定で warn を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-4.1, spec.md env category

**GIVEN** `DoctorContext` の `env.SPECRUNNER_GITHUB_CLIENT_ID` が undefined の mock
**WHEN** `githubClientIdCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "warn" }` を返し、hint に login 時のみ必須であることを含む

---

### TC-017: github-client-id env check が設定済みで pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-4.1, spec.md env category

**GIVEN** `DoctorContext` の `env.SPECRUNNER_GITHUB_CLIENT_ID` が非空文字列の mock
**WHEN** `githubClientIdCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-018: anthropic-key-valid check が GET /v1/models で 200 を受け取り pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-5.1, design.md D6, spec.md auth category

**GIVEN** `DoctorContext` の `fetch("https://api.anthropic.com/v1/models")` が `{ status: 200 }` で resolve する mock
**WHEN** `anthropicKeyValidCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-019: anthropic-key-valid check が 401 で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-5.1, design.md D6, spec.md auth category

**GIVEN** `DoctorContext` の `fetch` が `{ status: 401 }` で resolve する mock
**WHEN** `anthropicKeyValidCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返し、message に key invalid を示す文字列を含む

---

### TC-020: anthropic-key-valid check が 5s timeout で warn を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-5.3, design.md D7, spec.md DoctorCheck scenarios

**GIVEN** `DoctorContext` の `fetch` が AbortError を throw する mock（timeout シミュレーション）
**WHEN** `anthropicKeyValidCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "warn" }` を返し、message に `network timeout` を含み、hint に `Check connectivity and retry.` を含む

---

### TC-021: anthropic-key-valid check が 5xx で warn を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-5.1, design.md D6

**GIVEN** `DoctorContext` の `fetch` が `{ status: 503 }` で resolve する mock
**WHEN** `anthropicKeyValidCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "warn" }` を返す

---

### TC-022: github-token-valid check が 200 かつ repo scope で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-5.2, design.md D6, spec.md auth category

**GIVEN** `DoctorContext` の `githubClient.verifyTokenScopes()` が `{ status: 200, scopes: ["repo", "read:org"] }` で resolve する mock
**WHEN** `githubTokenValidCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-023: github-token-valid check が repo scope 欠如で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-5.2, design.md D6, spec.md auth category

**GIVEN** `DoctorContext` の `githubClient.verifyTokenScopes()` が `{ status: 200, scopes: ["read:user"] }` で resolve する mock（`repo` 不在）
**WHEN** `githubTokenValidCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返し、message に scope 不足を示す文字列を含む

---

### TC-024: github-token-valid check が timeout で warn を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-5.3, design.md D7

**GIVEN** `DoctorContext` の `githubClient.verifyTokenScopes()` が AbortError を throw する mock
**WHEN** `githubTokenValidCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "warn" }` を返し、message に `network timeout` を含む

---

### TC-025: git-repository check が .git dir 存在で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-6.1, spec.md repo category

**GIVEN** `DoctorContext` の `fs.existsSync(cwd + "/.git")` が `true` を返す mock
**WHEN** `gitRepositoryCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-026: git-repository check が .git dir 不在で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-6.1, spec.md repo category

**GIVEN** `DoctorContext` の `fs.existsSync(cwd + "/.git")` が `false` を返す mock
**WHEN** `gitRepositoryCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返す

---

### TC-027: github-origin check が github.com を指す remote で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-6.2, spec.md repo category

**GIVEN** `DoctorContext` の `execFile("git", ["remote", "get-url", "origin"])` が `"https://github.com/owner/repo.git\n"` で resolve する mock
**WHEN** `githubOriginCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-028: github-origin check が github.com 以外の remote で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-6.2, spec.md repo category

**GIVEN** `DoctorContext` の `execFile("git", ["remote", "get-url", "origin"])` が `"https://gitlab.com/owner/repo.git\n"` で resolve する mock
**WHEN** `githubOriginCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返す

---

### TC-029: openspec-project-md check が存在で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-6.3, spec.md repo category

**GIVEN** `DoctorContext` の `fs.existsSync(cwd + "/openspec/project.md")` が `true` を返す mock
**WHEN** `openspecProjectMdCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-030: openspec-project-md check が不在で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-6.3, spec.md repo category

**GIVEN** `DoctorContext` の `fs.existsSync(cwd + "/openspec/project.md")` が `false` を返す mock
**WHEN** `openspecProjectMdCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返す

---

### TC-031: workflow-structure check が 4 dir すべて存在で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-6.4, spec.md repo category

**GIVEN** `DoctorContext` の `fs.existsSync` が active / awaiting-merge / merged / canceled すべてに `true` を返す mock
**WHEN** `workflowStructureCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-032: workflow-structure check が 1 dir 以上欠如で warn を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-6.4, spec.md repo category

**GIVEN** `DoctorContext` の `fs.existsSync` が `canceled/` に対して `false` を返す mock
**WHEN** `workflowStructureCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "warn" }` を返し、不足 dir 名を message に含む

---

### TC-033: agents-registered check が 7 agents すべて登録済みで pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-7.1, spec.md agents category

**GIVEN** `DoctorContext` の `config` が propose / spec-review / spec-fixer / implementer / build-fixer / code-review / code-fixer の全 agent エントリを返す mock
**WHEN** `agentsRegisteredCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-034: agents-registered check が 1 agent 欠如で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-7.1, spec.md agents category

**GIVEN** `DoctorContext` の `config` が `implementer` を含まない 6 agent エントリを返す mock
**WHEN** `agentsRegisteredCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返し、欠如 agent 名を message に含む

---

### TC-035: environment-registered check が environment.id 存在で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-7.2, spec.md agents category

**GIVEN** `DoctorContext` の `config.get("environment.id")` が非空文字列を返す mock
**WHEN** `environmentRegisteredCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-036: environment-registered check が environment.id 未設定で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-7.2, spec.md agents category

**GIVEN** `DoctorContext` の `config.get("environment.id")` が undefined を返す mock
**WHEN** `environmentRegisteredCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返す

---

### TC-037: definition-drift check が hash 一致で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-7.3, design.md D6, spec.md agents category

**GIVEN** `DoctorContext` の `fs` が prompt ファイルを返し、`computeDefinitionHash` の計算結果が `config.agents[role].definitionHash` と一致する mock
**WHEN** `definitionDriftCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-038: definition-drift check が hash 不一致で warn を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-7.3, spec.md agents scenario "agent definition drift 検出"

**GIVEN** `DoctorContext` の config が古い `definitionHash` を持ち、prompt ファイルから計算した hash と一致しない mock
**WHEN** `definitionDriftCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "warn" }` を返し、message に `definition drifted` を含み、hint に `Run 'specrunner init --resync' to update agent definitions.` を含む

---

### TC-039: jobs-writable check が dir 存在 + 書き込み可で pass を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-8.1, design.md D8, spec.md storage category

**GIVEN** `DoctorContext` の `fs.access(jobsDir, W_OK)` が resolve する mock
**WHEN** `jobsWritableCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-040: jobs-writable check が dir 不在 + 親 dir 書き込み可で warn を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-8.1, design.md D8, spec.md DoctorCheck scenario "jobs ディレクトリが存在しない（親 dir は書き込み可）"

**GIVEN** `DoctorContext` の `fs.access(jobsDir, W_OK)` が ENOENT で reject し、親 dir の `fs.access(parentDir, W_OK)` が resolve する mock
**WHEN** `jobsWritableCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "warn" }` を返し、hint に `Run 'specrunner ps' once to initialize storage.` を含む

---

### TC-041: jobs-writable check が dir 不在 + 親 dir 書き込み不可で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-8.1, design.md D8, spec.md DoctorCheck scenario "jobs 親ディレクトリが書き込み不可"

**GIVEN** `DoctorContext` の `fs.access(jobsDir, W_OK)` と `fs.access(parentDir, W_OK)` の両方が Error で reject する mock
**WHEN** `jobsWritableCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返し、hint に `Parent directory is not writable. Check permissions.` を含む

---

### TC-042: jobs-writable check が dir 存在 + 書き込み不可で fail を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-8.1, design.md D8

**GIVEN** `DoctorContext` の `fs.access(jobsDir, W_OK)` が EACCES で reject し、dir は存在する mock
**WHEN** `jobsWritableCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返し、hint に permission check を促す文字列を含む

---

### TC-043: exit code — 全 pass で 0 を返す

**Category**: unit
**Priority**: must
**Source**: spec.md Requirement "exit code は pass/warn=0、fail=1、crash=2", design.md D3

**GIVEN** `runChecks` が全て `status: "pass"` の `DoctorResult[]` を返す mock
**WHEN** `runDoctor({ json: false })` を実行する
**THEN** `process.exit(0)` が呼ばれる

---

### TC-044: exit code — warn のみで 0 を返す

**Category**: unit
**Priority**: must
**Source**: spec.md Requirement "exit code", spec.md scenario "warn のみで exit 0"

**GIVEN** `runChecks` が `status: "warn"` を含み `status: "fail"` を含まない `DoctorResult[]` を返す mock
**WHEN** `runDoctor({ json: false })` を実行する
**THEN** `process.exit(0)` が呼ばれる

---

### TC-045: exit code — 1 件でも fail で 1 を返す

**Category**: unit
**Priority**: must
**Source**: spec.md scenario "1 件でも fail で exit 1"

**GIVEN** `runChecks` が 1 件の `status: "fail"` を含む `DoctorResult[]` を返す mock
**WHEN** `runDoctor({ json: false })` を実行する
**THEN** `process.exit(1)` が呼ばれる

---

### TC-046: exit code — required=false の fail でも 1 を返す

**Category**: unit
**Priority**: must
**Source**: spec.md scenario "required=false の fail でも exit 1", design.md D3

**GIVEN** `runChecks` が `required: false` かつ `status: "fail"` の check 結果を返す mock
**WHEN** `runDoctor({ json: false })` を実行する
**THEN** `process.exit(1)` が呼ばれる（required 属性は exit code に影響しない）

---

### TC-047: exit code — runDoctor が throw した場合に 2 を返す

**Category**: unit
**Priority**: must
**Source**: spec.md scenario "doctor 自身が予期せぬ例外で crash する", design.md D3, D9

**GIVEN** `runDoctor` 内部で unhandled exception が throw される状態
**WHEN** `bin/specrunner.ts` の doctor case が `runDoctor` を呼ぶ
**THEN** catch 経路で `stderr` に `Fatal: <message>` を出力し `process.exit(2)` が呼ばれる

---

### TC-048: `--json` 出力が spec schema に準拠する（全 pass ケース）

**Category**: unit
**Priority**: must
**Source**: spec.md Requirement "`specrunner doctor --json` は機械可読 JSON を stdout に出力する", design.md D4

**GIVEN** `formatJson(results)` に全 pass の `DoctorResult[]` を渡す
**WHEN** 出力を `JSON.parse()` でパースする
**THEN** `summary.pass >= 1`、`summary.warn === 0`、`summary.fail === 0`、各 result が `name / category / required / status / message` を持つ

---

### TC-049: `--json` 出力が spec schema に準拠する（fail 含むケース）

**Category**: unit
**Priority**: must
**Source**: spec.md scenario "`--json` で fail を含む"

**GIVEN** `formatJson(results)` に `status: "fail"` を 1 件含む `DoctorResult[]` を渡す
**WHEN** 出力を `JSON.parse()` でパースする
**THEN** `summary.fail >= 1`、該当 result の `status === "fail"`

---

### TC-050: `--json` 出力が装飾文字を含まない

**Category**: unit
**Priority**: must
**Source**: spec.md scenario "`--json` 出力は装飾文字を含まない"

**GIVEN** `formatJson(results)` に任意の `DoctorResult[]` を渡す
**WHEN** 出力文字列を検査する
**THEN** `[✓]` / `[!]` / `[✗]` / ANSI カラーコードを含まず、`JSON.parse()` が例外なく完了する

---

### TC-051: `--json` 出力で hint / details が undefined の場合 JSON キーが省略される

**Category**: unit
**Priority**: must
**Source**: spec.md "`hint` と `details` は省略可能フィールド（`undefined` 時は JSON object に出さない）", design.md D4

**GIVEN** `hint` と `details` が undefined の `DoctorResult` を `formatJson` に渡す
**WHEN** 出力を `JSON.parse()` でパースする
**THEN** 該当 result object に `hint` キーおよび `details` キーが存在しない

---

### TC-052: `bin/specrunner.ts` — `doctor` case が `runDoctor({ json: false })` を呼ぶ

**Category**: unit
**Priority**: must
**Source**: tasks.md T-11.4, design.md D9, spec.md Requirement "bin/specrunner.ts の dispatch"

**GIVEN** `bin/specrunner.ts` の switch で `argv[2] === "doctor"` かつ `--json` フラグなし
**WHEN** `main()` を実行する
**THEN** `runDoctor` が `{ json: false }` で 1 回呼ばれる

---

### TC-053: `bin/specrunner.ts` — `doctor --json` が `runDoctor({ json: true })` を呼ぶ

**Category**: unit
**Priority**: must
**Source**: tasks.md T-11.4, design.md D9

**GIVEN** `bin/specrunner.ts` の switch で `argv[2] === "doctor"` かつ `argv` に `"--json"` を含む
**WHEN** `main()` を実行する
**THEN** `runDoctor` が `{ json: true }` で 1 回呼ばれる

---

### TC-054: `--help` / `-h` 出力に `doctor` の説明行が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-11.5, spec.md Requirement "引数なしで実行"

**GIVEN** `bin/specrunner.ts` の USAGE 文字列
**WHEN** `specrunner --help` または `specrunner` をサブコマンドなしで実行する
**THEN** usage 出力に `doctor` を含む 1 行説明（`Diagnose environment / config / auth prerequisites` 相当）が含まれる

---

### TC-055: runner が check の throw を catch して fail result として続行する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-9.2, design.md D2

**GIVEN** `runChecks` に呼ぶと Error を throw する mock check を渡す
**WHEN** `runChecks([throwingCheck], ctx)` を実行する
**THEN** 例外が外に漏れず、返された results に `{ status: "fail", message: <exception summary> }` が含まれる

---

### TC-056: runner が check を宣言順（逐次）で実行する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-9.1, design.md D2

**GIVEN** 実行順を記録する 3 つの mock check を渡す
**WHEN** `runChecks([checkA, checkB, checkC], ctx)` を実行する
**THEN** results が A → B → C の順で並ぶ

---

### TC-057: formatHuman がカテゴリ別にグルーピングして出力する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-10.1

**GIVEN** runtime / config / auth カテゴリが混在する `DoctorResult[]` を `formatHuman` に渡す
**WHEN** 出力文字列を確認する
**THEN** 同一カテゴリの check が隣接してグループ表示され、`[✓]` / `[!]` / `[✗]` 記号が正しく付与される

---

### TC-058: formatHuman が末尾に Summary 行を出力する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-10.1, spec.md scenario "全 check が成功する"

**GIVEN** pass / warn / fail が混在する `DoctorResult[]` を `formatHuman` に渡す
**WHEN** 出力末尾を確認する
**THEN** `Summary: <N> pass, <M> warn, <K> fail` 形式の行が最後に含まれる

---

### TC-059: old-state-files check が 100 件以下で pass を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md T-8.2, design.md D8

**GIVEN** `DoctorContext` の `fs.readdirSync(jobsDir)` が 50 件のファイルリストを返す mock
**WHEN** `oldStateFilesCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す

---

### TC-060: old-state-files check が 101 件超で warn を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md T-8.2, design.md D8

**GIVEN** `DoctorContext` の `fs.readdirSync(jobsDir)` が 101 件のファイルリストを返す mock
**WHEN** `oldStateFilesCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "warn" }` を返し、hint に gc 推奨文字列を含む

---

### TC-061: bin/specrunner.ts — 不明なサブコマンドで exit 2

**Category**: unit
**Priority**: should
**Source**: spec.md scenario "不明なサブコマンドが渡された場合"

**GIVEN** `argv[2] === "foobar"`
**WHEN** `main()` を実行する
**THEN** stderr に `Unknown command: foobar` と usage を出力し、`process.exit(2)` が呼ばれる

---

### TC-062: bin/specrunner.ts — サブコマンドなしで usage を stderr に出力して exit 2

**Category**: unit
**Priority**: should
**Source**: spec.md scenario "引数なしで実行された場合"

**GIVEN** `argv` が空（`argv.length < 3`）
**WHEN** `main()` を実行する
**THEN** stderr に init / login / run / ps / doctor の説明行を含む usage を出力し、`process.exit(2)` が呼ばれる

---

### TC-063: github-origin check が origin remote 不在で fail を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md T-6.2

**GIVEN** `DoctorContext` の `execFile("git", ["remote", "get-url", "origin"])` が Error で reject する mock
**WHEN** `githubOriginCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返す

---

### TC-064: anthropic-key-valid check が fetch 直叩きせず DoctorContext.fetch 経由でのみ呼ぶ

**Category**: unit
**Priority**: should
**Source**: design.md D1（core から adapter を直接 import しない）

**GIVEN** `DoctorContext` の `fetch` をスパイした mock
**WHEN** `anthropicKeyValidCheck.check(mockCtx)` を呼ぶ
**THEN** グローバル `fetch` ではなく `mockCtx.fetch` が 1 回呼ばれる

---

### TC-065: github-token-valid check が fetch 直叩きせず githubClient.verifyTokenScopes 経由でのみ呼ぶ

**Category**: unit
**Priority**: should
**Source**: tasks.md T-12.1, design.md D6（port パターン遵守）

**GIVEN** `DoctorContext` の `githubClient.verifyTokenScopes` をスパイした mock
**WHEN** `githubTokenValidCheck.check(mockCtx)` を呼ぶ
**THEN** `fetch` 直叩きは行われず、`mockCtx.githubClient.verifyTokenScopes` が 1 回呼ばれる

---

### TC-066: ConfigStore adapter を実 temp dir で組み立てた DoctorContext で doctor.ts が動く

**Category**: integration
**Priority**: should
**Source**: tasks.md T-12.2, T-12.3

**GIVEN** temp dir に最小限の `config.json` を配置した実 file system 環境
**WHEN** `runDoctor({ json: true })` を呼ぶ
**THEN** 例外なく完了し、stdout に valid JSON が出力される

---

### TC-067: `--json` 出力の results 配列が実行順を維持する

**Category**: unit
**Priority**: should
**Source**: spec.md "`results` 配列は SHALL 実行順を維持する"

**GIVEN** 順序付きの mock checks （A, B, C）で `runChecks` を実行し `formatJson` に渡す
**WHEN** `JSON.parse()` した results 配列を確認する
**THEN** results の name 順が A → B → C と一致する

---

### TC-068: runner が全 allChecks（18 check）を漏れなく含む

**Category**: unit
**Priority**: should
**Source**: tasks.md T-1.4, proposal.md "18 種類の個別 check"

**GIVEN** `src/core/doctor/checks/index.ts` の `allChecks` を import する
**WHEN** 配列の長さと各 check の name を確認する
**THEN** 18 以上の check が存在し、全カテゴリ（runtime / config / env / auth / repo / agents / storage）が網羅される

---

### TC-069: node version check が v18.0.0 の境界値で pass を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md T-2.1（>= 18）

**GIVEN** `process.version` 相当が `v18.0.0` の mock
**WHEN** `nodeVersionCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "pass" }` を返す（境界 = pass）

---

### TC-070: node version check が v17.9.1 の境界値で fail を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md T-2.1（>= 18）

**GIVEN** `process.version` 相当が `v17.9.1` の mock
**WHEN** `nodeVersionCheck.check(mockCtx)` を呼ぶ
**THEN** `{ status: "fail" }` を返す（17 は範囲外）

---

### TC-071: Windows では permission 0600 check が warn または skip になる

**Category**: unit
**Priority**: should
**Source**: design.md Non-Goals "Windows でのフル動作サポート"

**GIVEN** `DoctorContext` の `env` に `platform === "win32"` を示す情報がある mock
**WHEN** `configFileExistsCheck.check(mockCtx)` を呼ぶ（permission 確認部分）
**THEN** permission 不一致があっても `status: "fail"` にならず `warn` または `pass` を返す

---

### TC-072: human 出力に `specrunner doctor` 実機 invoke で全 check が表示される

**Category**: manual
**Priority**: must
**Source**: tasks.md T-14.2, design.md Acceptance criteria

**GIVEN** dogfooding 環境（anthropic key / github token / openspec / agents 登録済み）
**WHEN** `bun bin/specrunner.ts doctor` を実行する
**THEN** 7 カテゴリ各 check の結果が `[✓]` / `[!]` / `[✗]` 付きで表示され、末尾に Summary 行が出る

---

### TC-073: `--json` 出力が `jq .` でパース可能

**Category**: manual
**Priority**: must
**Source**: tasks.md T-14.3

**GIVEN** dogfooding 環境
**WHEN** `bun bin/specrunner.ts doctor --json | jq .` を実行する
**THEN** jq がエラーなく整形 JSON を出力し、`summary` と `results` キーが確認できる

---

### TC-074: `--help` 出力に `doctor` の説明が含まれる（実機確認）

**Category**: manual
**Priority**: must
**Source**: tasks.md T-14.4, spec.md scenario "`--help` または `-h` が渡された場合"

**GIVEN** ビルド済みバイナリまたは `bun bin/specrunner.ts`
**WHEN** `bun bin/specrunner.ts --help` を実行する
**THEN** stdout に `doctor` を含む 1 行説明が表示される

---

### TC-075: 既存テスト 533 件が regression 0 で PASS する

**Category**: manual
**Priority**: must
**Source**: tasks.md T-14.1

**GIVEN** doctor 実装追加後のコードベース
**WHEN** `bun test` を実行する
**THEN** 既存 533 テストが全件 PASS し、新規テストも全件 PASS する

---

### TC-076: DoctorCheck interface が型レベルで一貫している

**Category**: unit
**Priority**: could
**Source**: spec.md Requirement "各 DoctorCheck は独立した object として export され、unit test 可能である"

**GIVEN** `src/core/doctor/checks/index.ts` の `allChecks` 配列
**WHEN** TypeScript コンパイラが型チェックを通す
**THEN** 各 check が `DoctorCheck` interface を満たし、型エラーが 0 件

---

### TC-077: formatHuman が空 results で空文字列または最小 summary を返す

**Category**: unit
**Priority**: could
**Source**: tasks.md T-10.1（edge case）

**GIVEN** 空の `DoctorResult[]` を `formatHuman` に渡す
**WHEN** 出力文字列を確認する
**THEN** 例外なく完了し、`Summary: 0 pass, 0 warn, 0 fail` 相当を含む

---

### TC-078: formatJson が空 results で valid JSON を返す

**Category**: unit
**Priority**: could
**Source**: tasks.md T-10.2（edge case）

**GIVEN** 空の `DoctorResult[]` を `formatJson` に渡す
**WHEN** 出力を `JSON.parse()` でパースする
**THEN** `{ summary: { pass: 0, warn: 0, fail: 0 }, results: [] }` と一致する

---

### TC-079: definition-drift check が computeDefinitionHash の既存実装を再利用している

**Category**: unit
**Priority**: could
**Source**: tasks.md T-7.4（新規実装はしない）

**GIVEN** `definition-drift.ts` のソースコード
**WHEN** import を確認する
**THEN** 独自 hash 実装ではなく既存の `computeDefinitionHash` 関数を import して使用している

---

### TC-080: runner が DoctorResult に check の name / category / required を保存する

**Category**: unit
**Priority**: could
**Source**: tasks.md T-9.1

**GIVEN** `{ name: "test-check", category: "runtime", required: true }` を持つ mock check を渡す
**WHEN** `runChecks([mockCheck], ctx)` を実行する
**THEN** 返された result に `name === "test-check"` / `category === "runtime"` / `required === true` が含まれる

---
