# Design: runtime-sdk-to-adapter

## Context

`src/core/runtime/local.ts:17` が `@anthropic-ai/claude-agent-sdk` の `query` を直 import している。`core/runtime/` は composition-root（structure-rulings D2）として adapter import は許可されるが、**生 SDK 型を持たない**ことが B-2 invariant として定められている。

現状:
- `local.ts` は `import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk"` で生 SDK `query` を取得
- `sdkQuery` は `LocalRuntimeOptions.queryFn` のデフォルト値としてのみ使用（constructor line 80）
- `adapter/claude-code/agent-runner.ts` は既に同じ SDK `query` を import し、`ClaudeCodeRunner` 内部で同様の `QueryFn` デフォルト値として使用
- `arch-allowlist.ts` に R2 (B-2) tracking エントリが存在し ratchet で凍結中

## Goals / Non-Goals

**Goals**:
- `local.ts` から `@anthropic-ai/claude-agent-sdk` の直 import を除去し、B-2 invariant を満たす
- SDK 依存を adapter 層（`adapter/claude-code/`）に閉じ込める
- `arch-allowlist.ts` の R2 (B-2) エントリを削除し、enforcement suite を green にする
- `queryFn` 注入インターフェースを維持する（テスト用 seam）

**Non-Goals**:
- 他の burn-down（R1 / R3 / R4）対応
- managed runtime 側の変更
- 振る舞い変更（local runtime の agent 実行挙動は不変）
- `LocalRuntime.query()` メソッドの廃止や `RuntimeStrategy` interface の変更

## Decisions

### D1: `adapter/claude-code/agent-runner.ts` に `defaultQueryFn` を export する（新規 seam を切らない）

`sdkQuery` を `QueryFn` 型にキャストした `defaultQueryFn` を `adapter/claude-code/agent-runner.ts` から export する。新規ファイル（例: `adapter/claude-code/query-fn.ts`）は作らない。

```typescript
// adapter/claude-code/agent-runner.ts に追加
export const defaultQueryFn: QueryFn = sdkQuery as unknown as QueryFn;
```

**Rationale**: 既存の `agent-runner.ts` は既に `sdkQuery` を import し `QueryFn` 型を export している。この seam は「SDK query を QueryFn として提供する」責務を既に持つため、同一ファイルに置くのが cohesion 的に正しい。新規ファイルを切ると import path が増えるだけでメリットがない。

**Alternatives considered**:
- **新規 `adapter/claude-code/query-fn.ts`**: ファイル分離は可能だが、`QueryFn` 型定義と default 値が別ファイルに分散し cohesion が下がる。
- **`factory.ts` で注入**: `createRuntime()` が `sdkQuery` を adapter から取得し `LocalRuntime` に渡す案。factory も `core/runtime/` 内なので adapter import は許可されるが、factory の責務が「runtime 選択」から「SDK 依存注入」に広がり SRP に反する。

### D2: `local.ts` は `defaultQueryFn` を adapter 経由で取得する

`local.ts` の SDK 直 import を削除し、代わりに adapter から `defaultQueryFn` を import する:

```typescript
// Before (B-2 violation):
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
this.queryFn = opts.queryFn ?? (sdkQuery as unknown as QueryFn);

// After:
import { defaultQueryFn } from "../../adapter/claude-code/agent-runner.js";
this.queryFn = opts.queryFn ?? defaultQueryFn;
```

`local.ts` → `adapter/claude-code/agent-runner.js` の import path は既に B-1 allowlist に「composition-root → adapter: 許可」として documented（tracking: R2-local-adapter）。新たな違反は発生しない。

**Rationale**: composition-root が adapter を import するのは §3 closure table で許可済み。SDK 型が composition-root に漏れなくなるため B-2 が解消される。

### D3: `arch-allowlist.ts` の R2 (B-2) エントリを削除する

D2 の変更により `@anthropic-ai/claude-agent-sdk` が `core/` 内に存在しなくなるため、以下のエントリを削除:

```typescript
{
  file: "src/core/runtime/local.ts",
  pattern: "@anthropic-ai/claude-agent-sdk",
  invariant: "B-2",
  tracking: "R2",
}
```

ratchet mechanism により、エントリ削除後に core に SDK import が残れば B-2 test が red になるため、機械的に完全性が保証される。

## Risks / Trade-offs

- [Risk] `defaultQueryFn` を export することで adapter の public surface が 1 つ増える → **Mitigation**: `QueryFn` 型は既に export 済みで、`defaultQueryFn` はその concrete instance に過ぎない。composition-root 以外からの import は B-1 test が防止する。
- [Risk] `as unknown as QueryFn` キャストが 2 箇所（adapter 内 constructor + defaultQueryFn）に残る → **Mitigation**: SDK の型定義が改善されれば 1 箇所（defaultQueryFn）に集約でき、キャスト除去が容易になる。現時点でも adapter 内に閉じている。

## Open Questions

なし。設計は既存パターンの延長で、新たな判断ポイントはない。
