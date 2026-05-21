# Tasks: github-token-source-visibility

## [x] T-01: `PreflightResult` に `githubTokenSource` を追加し `runPreflight` を更新

**変更ファイル**: `src/core/preflight.ts`

### 1-a: 型変更

`PreflightResult` interface に field を追加：

```typescript
/** Source of the resolved GitHub token. */
githubTokenSource: "credentials" | "env";
```

### 1-b: `runPreflight` で source を保持

Step 2.5 の `resolveGitHubToken` 呼び出し後、`source` を保持する。

変更前:
```typescript
const resolved = await resolveGitHubToken(process.env as Record<string, string | undefined>);
githubToken = resolved.token;
```

変更後:
```typescript
const resolved = await resolveGitHubToken(process.env as Record<string, string | undefined>);
githubToken = resolved.token;
githubTokenSource = resolved.source;
```

`let githubTokenSource: "credentials" | "env"` を `githubToken` と同様に宣言する。

### 1-c: info ログ出力

`import { logInfo } from "../logger/stdout.js"` を追加し、`resolveGitHubToken` 呼び出し直後に：

```typescript
logInfo(`GitHub token source: ${resolved.source}`);
```

### 1-d: return に追加

```typescript
return { config, repo, request, githubToken, githubTokenSource };
```

---

## [x] T-02: `DoctorContext` に `githubTokenSource` を追加

**変更ファイル**: `src/core/doctor/types.ts`

`DoctorContext` interface の `resolvedGitHubToken` の直後に追加：

```typescript
/**
 * Source of the resolved GitHub token ("credentials" or "env").
 * null when no token is available (resolvedGitHubToken is null).
 */
githubTokenSource: "credentials" | "env" | null;
```

---

## [x] T-03: `doctor.ts` で `githubTokenSource` を注入

**変更ファイル**: `src/cli/doctor.ts`

### 3-a: source の取得

L91-97 の `resolveGitHubToken` 呼び出しブロックで `source` も保持する。

変更前:
```typescript
let resolvedGitHubToken: string | null = null;
try {
  const resolved = await resolveGitHubToken(process.env as Record<string, string | undefined>);
  resolvedGitHubToken = resolved.token;
} catch {
  // Token not found — checks will report failure
}
```

変更後:
```typescript
let resolvedGitHubToken: string | null = null;
let githubTokenSource: "credentials" | "env" | null = null;
try {
  const resolved = await resolveGitHubToken(process.env as Record<string, string | undefined>);
  resolvedGitHubToken = resolved.token;
  githubTokenSource = resolved.source;
} catch {
  // Token not found — checks will report failure
}
```

### 3-b: DoctorContext 組み立て

L106-119 の `ctx` オブジェクトに `githubTokenSource` を追加：

```typescript
const ctx: DoctorContext = {
  // ... existing fields ...
  resolvedGitHubToken,
  githubTokenSource,
};
```

---

## [x] T-04: `github-token-present` check の pass message に source を含める

**変更ファイル**: `src/core/doctor/checks/config/github-token-present.ts`

pass 時の message を変更。`ctx.githubTokenSource` を使う。

変更前:
```typescript
return {
  status: "pass",
  message: "GitHub token is available",
};
```

変更後:
```typescript
const sourceLabel = ctx.githubTokenSource ? ` (source: ${ctx.githubTokenSource})` : "";
return {
  status: "pass",
  message: `GitHub token is available${sourceLabel}`,
};
```

`githubTokenSource` が null の場合（理論上 token があるなら null にならないが、防御的に処理）は
source ラベルなしで従来と同じメッセージになる。

---

## [x] T-05: テスト更新・追加

### 5-a: mock-context 更新

**変更ファイル**: `tests/core/doctor/mock-context.ts`

`buildMockContext` の default に `githubTokenSource: "credentials"` を追加（`resolvedGitHubToken: "ghp_test123"` と整合）。

### 5-b: github-token-present テスト追加

**変更ファイル**: `tests/core/doctor/checks/config/github-token-present.test.ts`

以下のテストケースを追加：

- `(source: credentials)` — `githubTokenSource: "credentials"` のとき pass message に `(source: credentials)` を含む
- `(source: env)` — `githubTokenSource: "env"` のとき pass message に `(source: env)` を含む

```typescript
it("includes source: credentials in pass message", async () => {
  const ctx = buildMockContext({
    resolvedGitHubToken: "ghp_test",
    githubTokenSource: "credentials",
  });
  const result = await githubTokenPresentCheck.check(ctx);
  expect(result.status).toBe("pass");
  expect(result.message).toContain("(source: credentials)");
});

it("includes source: env in pass message", async () => {
  const ctx = buildMockContext({
    resolvedGitHubToken: "ghp_test",
    githubTokenSource: "env",
  });
  const result = await githubTokenPresentCheck.check(ctx);
  expect(result.status).toBe("pass");
  expect(result.message).toContain("(source: env)");
});
```

### 5-c: preflight テスト（新規）

**新規ファイル**: `tests/core/preflight.test.ts`

`runPreflight` の `githubTokenSource` 伝搬と info ログ出力をテストする。
`resolveGitHubToken` / `loadConfig` / `getOriginInfo` / `parseRequestMd` を vi.mock でモック化。

テストケース：
- credentials 経由のとき `PreflightResult.githubTokenSource === "credentials"`
- env 経由のとき `PreflightResult.githubTokenSource === "env"`
- info ログに `GitHub token source: credentials` / `GitHub token source: env` が出力される

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ runtime: "local" }),
}));
vi.mock("../../src/config/schema.js", () => ({
  checkConfigComplete: vi.fn().mockReturnValue(null),
}));
vi.mock("../../src/git/remote.js", () => ({
  getOriginInfo: vi.fn().mockResolvedValue({ owner: "test", repo: "test" }),
}));
vi.mock("../../src/parser/request-md.js", () => ({
  parseRequestMd: vi.fn().mockResolvedValue({ type: "spec-change", title: "test", baseBranch: "main" }),
}));
vi.mock("../../src/logger/stdout.js", () => ({
  logInfo: vi.fn(),
}));

// resolveGitHubToken mock is set per-test

describe("runPreflight", () => {
  it("returns githubTokenSource: credentials", async () => { /* ... */ });
  it("returns githubTokenSource: env", async () => { /* ... */ });
  it("logs GitHub token source", async () => { /* ... */ });
});
```

---

## [x] T-06: delta spec 作成

### 6-a: github-device-flow-auth delta spec

**新規ファイル**: `specrunner/changes/github-token-source-visibility/delta-spec/github-device-flow-auth.md`

```markdown
# Delta Spec: github-device-flow-auth

Baseline: `specrunner/specs/github-device-flow-auth/spec.md`

## MODIFIED

### R-token-source-visibility (追記)

「取得した access_token は config に保存される」Requirement の末尾に以下を追加：

token 取得元（credentials file / GITHUB_TOKEN env var）は `specrunner doctor` の `github-token-present` check 出力および `specrunner run` の preflight info ログで可視化される。
```

### 6-b: cli-commands delta spec

**新規ファイル**: `specrunner/changes/github-token-source-visibility/delta-spec/cli-commands.md`

```markdown
# Delta Spec: cli-commands

Baseline: `specrunner/specs/cli-commands/spec.md`

## MODIFIED

### R-doctor-github-token-source: `specrunner doctor` が GitHub token 取得元を表示する

`github-token-present` check の pass message に token 取得元を含める。
- token が credentials file 由来の場合: `GitHub token is available (source: credentials)`
- token が GITHUB_TOKEN env var 由来の場合: `GitHub token is available (source: env)`

### R-run-preflight-token-source-log: `specrunner run` の preflight が token 取得元をログ出力する

`runPreflight` 実行時、`resolveGitHubToken` 成功直後に info ログを 1 行出力する。
- 形式: `GitHub token source: credentials` / `GitHub token source: env`
```

---

## 受け入れ基準（チェックリスト）

- [ ] `PreflightResult` / `DoctorContext` に `githubTokenSource` field が存在する
- [ ] `runPreflight` が `resolveGitHubToken` の `source` を propagate している
- [ ] `github-token-present` check の pass message に `(source: credentials)` / `(source: env)` が含まれる
- [ ] credentials.json 経由と env 経由の両ケースで test が source を verify している
- [ ] 関連 spec が新挙動を反映している
- [ ] `bun run typecheck && bun run test` が green
