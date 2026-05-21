# Tasks: credentials-provider-parity

**Status**: completed (14/14)

## Task 1: CredentialsFile 型拡張 + error code 追加 [x]

**Files**: `src/core/credentials/types.ts`, `src/errors.ts`

1. `src/core/credentials/types.ts` の `CredentialsFile` interface に `anthropic?: { apiKey?: string }` を追加する
2. `src/errors.ts` の `ERROR_CODES` object に `ANTHROPIC_KEY_MISSING: "ANTHROPIC_KEY_MISSING"` を追加する

**Verification**: `bun run typecheck`

---

## Task 2: saveCredentials を deep merge に変更 [x]

**Files**: `src/core/credentials/github.ts`

1. `saveCredentials` の merge ロジックを top-level spread から provider 単位の deep merge に変更する:
   ```ts
   const merged: CredentialsFile = {
     ...existing,
     ...creds,
     github: creds.github ? { ...existing.github, ...creds.github } : existing.github,
     anthropic: creds.anthropic ? { ...existing.anthropic, ...creds.anthropic } : existing.anthropic,
   };
   ```
2. 既存テスト `tests/core/credentials/github.test.ts` の TC-CRED-005 が引き続き pass することを確認する

**Verification**: `bun run typecheck && bun vitest run tests/core/credentials/github.test.ts`

---

## Task 3: `core/credentials/anthropic.ts` を新設 [x]

**Files**: `src/core/credentials/anthropic.ts` (create)

1. `github.ts` を模倣して `resolveSpecRunnerApiKey` を実装する:
   - signature: overload で optional semantics を型安全にする
     ```ts
     export async function resolveSpecRunnerApiKey(
       env: Record<string, string | undefined>,
       opts: { optional: true },
     ): Promise<{ apiKey: string; source: "credentials" | "env" } | undefined>;
     export async function resolveSpecRunnerApiKey(
       env: Record<string, string | undefined>,
       opts?: { optional?: false },
     ): Promise<{ apiKey: string; source: "credentials" | "env" }>;
     ```
   - Priority: `loadCredentials()` → `anthropic.apiKey` → `env["SPECRUNNER_API_KEY"]` → throw/undefined
   - error: `new SpecRunnerError(ERROR_CODES.ANTHROPIC_KEY_MISSING, hint, message)`
   - hint: `"Save an API key to credentials with a future 'specrunner login --provider anthropic', or set SPECRUNNER_API_KEY env var."`
2. `saveSpecRunnerApiKey(value: string)` を実装する:
   - `saveCredentials({ anthropic: { apiKey: value } })` を呼ぶだけ
3. `loadCredentials` / `saveCredentials` は `github.ts` から import して共用する

**Verification**: `bun run typecheck`

---

## Task 4: anthropic resolver のテスト [x]

**Files**: `tests/core/credentials/anthropic.test.ts` (create)

1. `github.test.ts` と同じテストパターンで以下をカバーする:
   - resolver が credentials.json の `anthropic.apiKey` を返す（priority 1）
   - credentials.json に無い場合 `SPECRUNNER_API_KEY` env を返す（priority 2）
   - 両方無い場合 `ANTHROPIC_KEY_MISSING` error を throw する
   - `{ optional: true }` で両方無い場合 undefined を返す
   - `saveSpecRunnerApiKey` が credentials.json に書き込み、既存 github key を保持する

**Verification**: `bun vitest run tests/core/credentials/anthropic.test.ts`

---

## Task 5: `core/credentials/requirements.ts` を新設 + テスト [x]

**Files**: `src/core/credentials/requirements.ts` (create), `tests/core/credentials/requirements.test.ts` (create)

1. 型定義:
   ```ts
   export type CredentialKey = "github.token" | "anthropic.apiKey";
   export interface RequiredCredential {
     key: CredentialKey;
     envVar: string;
   }
   ```
2. `requirementsFor(runtime: "local" | "managed"): RequiredCredential[]` を実装:
   - `local`: `[{ key: "github.token", envVar: "GITHUB_TOKEN" }]`
   - `managed`: `[{ key: "github.token", envVar: "GITHUB_TOKEN" }, { key: "anthropic.apiKey", envVar: "SPECRUNNER_API_KEY" }]`
3. テスト:
   - `requirementsFor("local")` が `["github.token"]` key のみ含む
   - `requirementsFor("managed")` が `["github.token", "anthropic.apiKey"]` の 2 key を含む

**Verification**: `bun vitest run tests/core/credentials/requirements.test.ts`

---

## Task 6: DoctorContext 拡張 + cli/doctor.ts pre-resolve [x]

**Files**: `src/core/doctor/types.ts`, `src/cli/doctor.ts`, `tests/core/doctor/mock-context.ts`

1. `DoctorContext` interface に追加:
   ```ts
   resolvedSpecRunnerApiKey: string | null;
   specRunnerApiKeySource: "credentials" | "env" | null;
   ```
2. `cli/doctor.ts` の `runDoctor` 内で、GitHub token の pre-resolve ブロック (lines 91-99) の直後に同じパターンで Anthropic key を pre-resolve する:
   ```ts
   let resolvedSpecRunnerApiKey: string | null = null;
   let specRunnerApiKeySource: "credentials" | "env" | null = null;
   try {
     const resolved = await resolveSpecRunnerApiKey(process.env as ..., { optional: true });
     if (resolved) {
       resolvedSpecRunnerApiKey = resolved.apiKey;
       specRunnerApiKeySource = resolved.source;
     }
   } catch { /* resolver with optional:true doesn't throw, but safety */ }
   ```
3. DoctorContext assembly に新 field を追加する
4. `tests/core/doctor/mock-context.ts` の `buildMockContext` に `resolvedSpecRunnerApiKey: "sk-ant-test123"` と `specRunnerApiKeySource: "env"` を追加する

**Verification**: `bun run typecheck && bun vitest run tests/core/doctor/`

---

## Task 7: doctor check 4 つを ctx.resolvedSpecRunnerApiKey に移行 [x]

**Files**:
- `src/core/doctor/checks/config/managed-key-present.ts`
- `src/core/doctor/checks/auth/managed-key-valid.ts`
- `src/core/doctor/checks/agents/agent-provider-alive.ts`
- `src/core/doctor/checks/agents/environment-provider-alive.ts`

各 check の変更:

### 7a: managed-key-present
- `ctx.env["SPECRUNNER_API_KEY"]` → `ctx.resolvedSpecRunnerApiKey`
- pass 時のメッセージに source を含める: `"Anthropic API key found (source: ${ctx.specRunnerApiKeySource})"`
- hint を credentials.json にも言及する形に更新

### 7b: managed-key-valid
- 先頭の apiKey 不在ガード (lines 18-24) を削除
- `ctx.resolvedSpecRunnerApiKey` が null なら即 fail（ガードではなく正規結果）
- `ctx.fetch` の `x-api-key` header に `ctx.resolvedSpecRunnerApiKey` を使用

### 7c: agent-provider-alive
- 先頭の apiKey 不在ガード (lines 28-35) を削除
- `ctx.resolvedSpecRunnerApiKey` が null なら即 warn + skip
- fetch header に `ctx.resolvedSpecRunnerApiKey` を使用

### 7d: environment-provider-alive
- 先頭の apiKey 不在ガード (lines 17-23) を削除
- `ctx.resolvedSpecRunnerApiKey` が null なら即 warn + skip
- fetch header に `ctx.resolvedSpecRunnerApiKey` を使用

**Verification**: `bun run typecheck && bun vitest run tests/core/doctor/`

---

## Task 8: 既存 doctor check テストを新 API に追従 [x]

**Files**:
- `tests/core/doctor/checks/config/managed-key-present.test.ts`
- `tests/core/doctor/checks/auth/managed-key-valid.test.ts`

1. テストが `ctx.env` ではなく `ctx.resolvedSpecRunnerApiKey` を override するように変更する
2. `managed-key-present` テスト: `resolvedSpecRunnerApiKey: "sk-test"` → pass、`resolvedSpecRunnerApiKey: null` → fail
3. `managed-key-valid` テスト: `resolvedSpecRunnerApiKey: null` → fail（ガード不要）、`resolvedSpecRunnerApiKey: "sk-test"` → 既存の fetch mock

**Verification**: `bun vitest run tests/core/doctor/`

---

## Task 9: callsite 書き換え — bootstrap / run / rm [x]

**Files**: `src/cli/bootstrap.ts`, `src/cli/run.ts`, `src/cli/rm.ts`

**着手前に `grep -n 'process\.env\["SPECRUNNER_API_KEY"\]' src/` で全 callsite を再確認する。**

### 9a: bootstrap.ts
- import `resolveSpecRunnerApiKey` from `../core/credentials/anthropic.js`
- lines 36-39 を置き換え:
  ```ts
  const anthropicResult = await resolveSpecRunnerApiKey(
    process.env as Record<string, string | undefined>,
    { optional: config.runtime !== "managed" },
  );
  const sessionClient = anthropicResult
    ? createAnthropicSessionClient(createAnthropicClient(anthropicResult.apiKey))
    : undefined;
  ```

### 9b: run.ts
- import `resolveSpecRunnerApiKey`
- lines 46-49 を置き換え（bootstrap.ts と同じパターン）

### 9c: rm.ts
- import `resolveSpecRunnerApiKey`
- lines 56-59 を置き換え（bootstrap.ts と同じパターン）

**Verification**: `bun run typecheck`

---

## Task 10: callsite 書き換え — managed.ts [x]

**Files**: `src/cli/managed.ts`

### 10a: runManagedSetup (line 29)
- `resolveSpecRunnerApiKey(process.env as ..., { optional: false })` を try/catch して logError + exit(1)

### 10b: runManagedStatus (line 161)
- `resolveSpecRunnerApiKey(process.env as ..., { optional: true })` を呼び、`!!result` で `apiKeyPresent` を算出

### 10c: runManagedReset (line 178)
- `resolveSpecRunnerApiKey(process.env as ..., { optional: true })` を呼び、`result?.apiKey` を使用
- apiKey が必要な箇所（environment 削除の SDK 呼び出し）で `result?.apiKey` を参照

**Verification**: `bun run typecheck`

---

## Task 11: preflight の declarative 化 [x]

**Files**: `src/core/preflight.ts`

1. import `requirementsFor` from `./credentials/requirements.js` と `resolveSpecRunnerApiKey` from `./credentials/anthropic.js`
2. `checkRuntimePrereqs` を書き換え:
   - `requirementsFor(cfg.runtime ?? "local")` で credential key 一覧を取得
   - credential key が `"anthropic.apiKey"` の場合、`resolveSpecRunnerApiKey(env)` を呼んで存在を確認
   - credential check は既に `runPreflight` の Step 2.5 で GitHub token を resolver 経由で解決しているので、`checkRuntimePrereqs` からは SPECRUNNER_API_KEY の直読を消すだけでよい
   - agents / environment の check はそのまま残す
3. `PreflightResult` に `specRunnerApiKey?: string` と `specRunnerApiKeySource?: "credentials" | "env"` を追加し、managed runtime の場合に resolve 結果を格納する

**Verification**: `bun run typecheck && bun vitest run tests/core/preflight.test.ts`

---

## Task 12: preflight テスト追従 [x]

**Files**: `tests/core/preflight.test.ts`

1. 既存テストが `SPECRUNNER_API_KEY` env を直接設定している箇所を確認し、resolver が credentials.json を読むようになったことに追従する
2. managed runtime の preflight テストで credentials.json に apiKey を書くか、env を mock するかを確認

**Verification**: `bun vitest run tests/core/preflight.test.ts`

---

## Task 13: spec 新設・更新 [x]

**Files**:
- `specrunner/specs/credential-store/spec.md` (create)
- `specrunner/specs/github-device-flow-auth/spec.md` (modify)
- `specrunner/specs/managed-agent-runtime/spec.md` (modify)

### 13a: credential-store spec 新設
以下の Requirement を含む:
- Credential は `~/.config/specrunner/credentials.json` (0600) に provider-keyed で格納される
- Resolver の優先順位: credentials.json → env var → error (optional は undefined)
- 各 provider の credential key と env var 名の対応
- saveCredentials は既存 provider key を保持する (deep merge)

### 13b: github-device-flow-auth spec 更新
- Requirement 「取得した access_token は config に保存される」の記述を credential-store spec への参照に変更/補足

### 13c: managed-agent-runtime spec 更新
- secret 要求記述を credential-store spec への参照に変更

**Verification**: spec ファイルの存在確認

---

## Task 14: 最終検証 [x]

1. `grep -n 'process\.env\["SPECRUNNER_API_KEY"\]' src/` が resolver 内部の 1 箇所のみであることを確認
2. `grep -n 'config\.runtime === "managed" && process\.env\["SPECRUNNER_API_KEY"\]' src/` が 0 occurrence であることを確認
3. `bun run typecheck && bun run test` が green であることを確認

**Verification**: 上記 3 コマンドの成功
