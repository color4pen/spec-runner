# core/runtime の生 SDK import を adapter へ追い出す（B-2 封じ込め完成）

**Date**: 2026-06-01
**Status**: accepted

## Context

`architecture/model.md` §4 B-2 invariant「外部 SDK 型は adapters の外（domain / ports / comp-root）に漏らさない」に対し、`src/core/runtime/local.ts:17` が `@anthropic-ai/claude-agent-sdk` の `query` を直 import していた。

```typescript
// B-2 violation（修正前）
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
```

`core/runtime/` は composition-root（structure-rulings D2）として adapter import は許可されるが、「生 SDK 型を持たない」ことが D2 で明示的に維持されている。

前 change（arch-test-core-wide-ratchet, PR #483）が `tests/unit/architecture/arch-allowlist.ts` の R2 (B-2) エントリで当該違反を凍結済みであり、本 change でこれを解消して ratchet を完成させる。

なお `adapter/claude-code/agent-runner.ts` は既に同じ SDK `query` を import し `QueryFn` 型を内部で使用しており、「SDK query を QueryFn として提供する」責務が既存 seam に存在していた。

## Decision

### D1: `adapter/claude-code/agent-runner.ts` に `defaultQueryFn` を export する（新規ファイルは切らない）

`sdkQuery` を `QueryFn` 型にキャストした `defaultQueryFn` を既存の `agent-runner.ts` から export する。

```typescript
// adapter/claude-code/agent-runner.ts に追加
export const defaultQueryFn: QueryFn = sdkQuery as unknown as QueryFn;
```

**採用理由**: `agent-runner.ts` は既に `sdkQuery` を import し `QueryFn` 型を export しており、「SDK query を QueryFn として提供する」責務を事実上持つ。同一ファイルへの統合は cohesion を高める。新規ファイル（例: `adapter/claude-code/query-fn.ts`）を切っても `QueryFn` 型定義と default 値が別ファイルに分散するだけでメリットがない。

### D2: `local.ts` は `defaultQueryFn` を adapter 経由で取得する

`local.ts` の SDK 直 import を除去し、adapter から `defaultQueryFn` を import する。

```typescript
// Before（B-2 violation）:
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
this.queryFn = opts.queryFn ?? (sdkQuery as unknown as QueryFn);

// After:
import { defaultQueryFn } from "../../adapter/claude-code/agent-runner.js";
this.queryFn = opts.queryFn ?? defaultQueryFn;
```

`local.ts` → `adapter/claude-code/agent-runner.js` の import は `model.md` §3 closure table の「composition-root → adapter: 許可」に該当し、新たな境界違反を生じさせない。`queryFn` 注入インターフェース（`LocalRuntimeOptions.queryFn?: QueryFn`）はテスト用 seam として不変に維持する。

### D3: `arch-allowlist.ts` の R2 (B-2) エントリを削除する

D2 の変更により `@anthropic-ai/claude-agent-sdk` が `core/` 内に存在しなくなるため、以下のエントリを削除して ratchet を完成させる。

```typescript
// 削除
{
  file: "src/core/runtime/local.ts",
  pattern: "@anthropic-ai/claude-agent-sdk",
  invariant: "B-2",
  tracking: "R2",
}
```

エントリ削除後に `core/` に SDK import が残れば B-2 test が red になる（ratchet の機械的完全性保証）。

## Alternatives Considered

### Alternative 1: 新規 `adapter/claude-code/query-fn.ts` を切る

- **Pros**: 責務が明示的に独立したファイルに分離される
- **Cons**: `QueryFn` 型定義（`agent-runner.ts`）と default 値（`query-fn.ts`）が別ファイルに分散し cohesion が下がる。import path が 1 つ増えるだけ
- **Why not**: 既存 `agent-runner.ts` が「SDK query を QueryFn として提供する」責務を既に持つため、同一ファイルへの統合が自然

### Alternative 2: `factory.ts` で SDK 依存を注入する

`createRuntime()` が `defaultQueryFn` を adapter から取得し `LocalRuntime` コンストラクタに渡す案。

- **Pros**: `local.ts` が adapter を import せず、composition-root 内での adapter 依存が factory に集中する
- **Cons**: factory の責務が「runtime 選択」から「SDK 依存注入」に拡大し SRP に反する。`factory.ts` も `core/runtime/` 内であり adapter import は許可されるが、責務配分として不自然
- **Why not**: D2 の `local.ts` → adapter 直接 import は closure 上許可済みであり、factory 経由の間接注入は複雑さを増すだけ

### Alternative 3: `queryFn` 注入口を必須引数にする（default fallback を廃止）

`LocalRuntimeOptions.queryFn` を必須にし、composition point で `defaultQueryFn` を常に注入する。

- **Pros**: `core/runtime/` が SDK 型に一切依存しない（import すら不要）。`one-shot-query-client-port` ADR（2026-05-22）で採用した「leaky default 廃止」パターンと一致する
- **Cons**: 注入を受ける呼び出しサイト（`factory.ts` / integration test 等）すべてでの変更が必要。本 change は「振る舞い変更なし」のスコープで、interface 変更はスコープ外
- **Why not**: 今次は最小変更（default 値の置換のみ）を選択し、leaky default 廃止は後続 change（runtime composition-point 整理）に委ねる

## Consequences

### Positive

- `src/core/` に `@anthropic-ai/*` の直 import が存在しなくなり、B-2 invariant が完全に満たされる
- `arch-allowlist.ts` R2 エントリが削除され、以降 `core/` に SDK import が入れば即座に CI が red になる（regression zero day 保証）
- SDK breaking change の影響が `adapter/` に閉じる。`local.ts` / `factory.ts` / domain はキャスト詳細を知る必要がなくなる
- 変更量が最小（`src/` 実質 +3 / -5 行）でリスクが低い

### Negative

- `adapter/claude-code/agent-runner.ts` の public surface に `defaultQueryFn` が追加される。composition-root 以外からの不正 import は B-1 test が防止するが、表面上は export が 1 つ増える
- `sdkQuery as unknown as QueryFn` キャストが `agent-runner.ts` 内に 2 箇所残る（`ClaudeCodeRunner` constructor の既存キャスト + `defaultQueryFn` の新キャスト）。SDK の型定義が改善されれば `defaultQueryFn` 1 箇所に集約できるが、現時点では adapter 内に閉じている

### Known Debt

- `ClaudeCodeRunner` constructor が `defaultQueryFn` を使わず `sdkQuery` を直参照している点は maintainability 観点の非ブロッキング観察（review-feedback-001 finding #1）。`this.queryFn = deps._queryFn ?? defaultQueryFn` への統一は後続 change に委ねる
- `queryFn` の leaky default 廃止（Alternative 3）は runtime composition-point 整理の後続 change で検討する

## References

- Request: `specrunner/changes/runtime-sdk-to-adapter/request.md`
- Design: `specrunner/changes/runtime-sdk-to-adapter/design.md`
- Related: `specrunner/adr/2026-06-01-arch-invariant-enforcement-vitest-ratchet.md`（ratchet 機構・R2 allowlist の起点）
- Related: `specrunner/adr/2026-05-22-one-shot-query-client-port.md`（B-2 封じ込めの先行事例：core/request 側）
- Related: `specrunner/adr/2026-05-05-agent-runner-port-and-local-runtime.md`（LocalRuntime の queryFn seam 原型）
- `architecture/model.md` — §3 closure model・§4 B-2 invariant・§5 R2 divergence 台帳
- Implementation: `src/adapter/claude-code/agent-runner.ts`・`src/core/runtime/local.ts`・`tests/unit/architecture/arch-allowlist.ts`
