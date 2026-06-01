# Tasks: runtime-sdk-to-adapter

## T-01: adapter/claude-code/agent-runner.ts に defaultQueryFn を export する

- [x] `src/adapter/claude-code/agent-runner.ts` に `export const defaultQueryFn: QueryFn = sdkQuery as unknown as QueryFn;` を追加する（既存の `QueryFn` type export の近く）

**Acceptance Criteria**:
- `defaultQueryFn` が `adapter/claude-code/agent-runner.ts` から named export されている
- 型は `QueryFn` である
- 既存の `ClaudeCodeRunner` constructor 内の `sdkQuery` 使用は変更しない（adapter 内部での直接利用は B-2 違反ではない）

## T-02: local.ts の SDK 直 import を adapter 経由に置換する

- [x] `src/core/runtime/local.ts` から `import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";` 行を削除する
- [x] `src/core/runtime/local.ts` の既存 import `import { createClaudeCodeRunner, type QueryFn } from "../../adapter/claude-code/agent-runner.js";` に `defaultQueryFn` を追加する
- [x] constructor 内の `this.queryFn = opts.queryFn ?? (sdkQuery as unknown as QueryFn);` を `this.queryFn = opts.queryFn ?? defaultQueryFn;` に変更する

**Acceptance Criteria**:
- `src/core/runtime/local.ts` に `@anthropic-ai/claude-agent-sdk` の import が存在しない
- `grep -r "@anthropic-ai/" src/core/` の結果が 0 件（B-2 invariant 充足）
- `LocalRuntime` の constructor シグネチャ（`queryFn?: QueryFn`）は不変
- テスト用の `queryFn` 注入は引き続き動作する

## T-03: arch-allowlist.ts の R2 (B-2) エントリを削除する

- [x] `tests/unit/architecture/arch-allowlist.ts` から以下のエントリを削除する:
  ```typescript
  {
    file: "src/core/runtime/local.ts",
    pattern: "@anthropic-ai/claude-agent-sdk",
    invariant: "B-2",
    tracking: "R2",
    comment: "local.ts imports @anthropic-ai/claude-agent-sdk `query` directly (line 17). " +
      "Must be moved to adapter/ once the SDK seam is extracted (R2 burn-down).",
  },
  ```
- [x] 削除後のエントリ周辺のコメント（`// ── B-2:` セクション内の説明文）を更新する。B-2 エントリが 0 件になる場合はセクションコメントごと削除する

**Acceptance Criteria**:
- `arch-allowlist.ts` に `tracking: "R2"` かつ `invariant: "B-2"` のエントリが存在しない
- `bun run test` で architecture enforcement suite（`core-invariants.test.ts`）が green
- 他の allowlist エントリ（B-1, B-3, B-4, B-6, B-8）は変更されていない

## T-04: verification

- [x] `bun run build` が green
- [x] `bun run typecheck` が green
- [x] `bun run lint` が green
- [x] `bun run test` が green（特に architecture enforcement テスト）

**Acceptance Criteria**:
- 4 コマンド全て exit code 0
- `src/core/` 内に `@anthropic-ai/*` の直 import が存在しない（B-2 arch test green で機械検証済み）
