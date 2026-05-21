# Design: github-token-source-visibility

## Overview

`resolveGitHubToken` が返す `source: "credentials" | "env"` を caller が捨てている問題を修正し、
preflight / doctor の出力で token 取得元を可視化する。型変更 + ログ追加 + check メッセージ変更の 3 層。

## 変更方針

`resolveGitHubToken` の返値 `{ token, source }` は既に存在する。
caller 側が `.token` だけ取り出して `source` を捨てている箇所を修正し、
下流（`PreflightResult` / `DoctorContext`）に伝搬させる。

## Component Structure

### Modified Files

| File | Change |
|------|--------|
| `src/core/preflight.ts` | `PreflightResult` に `githubTokenSource` field 追加。`runPreflight` で `resolved.source` を保持し、info ログを出力 |
| `src/core/doctor/types.ts` | `DoctorContext` に `githubTokenSource: "credentials" \| "env" \| null` 追加 |
| `src/cli/doctor.ts` | `resolveGitHubToken` の `source` を `DoctorContext.githubTokenSource` に注入 |
| `src/core/doctor/checks/config/github-token-present.ts` | pass message に `(source: credentials)` / `(source: env)` を含める |
| `tests/core/doctor/mock-context.ts` | `buildMockContext` に `githubTokenSource` default 追加 |
| `tests/core/doctor/checks/config/github-token-present.test.ts` | source 表示のテストケース追加 |
| `specrunner/specs/github-device-flow-auth/spec.md` | credentials 解決節に可視化の 1 行追加 |

### 変更しないファイル

| File | Reason |
|------|--------|
| `src/cli/bootstrap.ts` | `source` を使う下流がない。bootstrap は runtime 組み立てが責務であり、ログ出力は preflight / doctor の責務 |
| `src/cli/finish.ts` | 同上。finish は gh CLI fallback 用に token を取得するだけ |
| `src/core/doctor/checks/auth/github-token-valid.ts` | scope 検証が責務。source 表示は `github-token-present` に集約（request.md 要件通り） |

## Type Definitions

### PreflightResult（変更後）

```typescript
export interface PreflightResult {
  config: SpecRunnerConfig;
  repo: OriginInfo;
  request: ParsedRequest;
  githubToken: string;
  githubTokenSource: "credentials" | "env";  // NEW
}
```

`runPreflight` は token 解決に成功した場合のみ return するため、`githubTokenSource` は non-optional。

### DoctorContext（変更後、該当 field のみ）

```typescript
export interface DoctorContext {
  // ... existing fields ...
  resolvedGitHubToken: string | null;
  githubTokenSource: "credentials" | "env" | null;  // NEW
}
```

`null` は token 解決失敗時（`resolvedGitHubToken` が `null` のとき）に対応。

## Data Flow

### preflight 経路

```
resolveGitHubToken(env)
  → { token, source }
  → logInfo(`GitHub token source: ${source}`)   ← NEW
  → PreflightResult { githubToken: token, githubTokenSource: source }
```

### doctor 経路

```
resolveGitHubToken(env)
  → { token, source } (or catch → null, null)
  → DoctorContext { resolvedGitHubToken: token, githubTokenSource: source }
  → github-token-present check
     → pass message: "GitHub token is available (source: credentials)"
```

## ログ出力

`runPreflight` の `resolveGitHubToken` 呼び出し直後に `logInfo` で 1 行出す。
`logInfo` は `src/logger/stdout.ts` の既存関数で、stdout に書き出す。

```typescript
import { logInfo } from "../logger/stdout.js";
// ...
const resolved = await resolveGitHubToken(process.env as Record<string, string | undefined>);
logInfo(`GitHub token source: ${resolved.source}`);
```

## Error Handling

変更なし。`resolveGitHubToken` が throw した場合の既存エラーパスはそのまま維持。
doctor 側は既に try/catch で `resolvedGitHubToken = null` にしており、
`githubTokenSource = null` も同じパスで設定する。

## Non-Goals

- `bootstrap.ts` / `finish.ts` の `source` 伝搬（使う下流がない）
- `github-token-valid.ts` への source 表示追加（scope 検証が責務）
- Anthropic API key 側の同等可視化
