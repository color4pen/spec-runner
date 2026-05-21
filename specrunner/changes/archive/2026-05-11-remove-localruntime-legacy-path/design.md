# Design: remove-localruntime-legacy-path

## Overview

`LocalRuntime` コンストラクタから positional legacy パス（`string | LocalRuntimeOptions` union）を削除し、`LocalRuntimeOptions` のみ受け付ける単一シグネチャに統一する。

## Current State

```typescript
constructor(
  cwdOrOpts: string | LocalRuntimeOptions,
  githubClient?: GitHubClient,
  manager?: ReturnType<typeof createWorktreeManager>,
  spawnFn?: SpawnFn,
  queryFn?: QueryFn,
)
```

- `typeof cwdOrOpts === "string"` 分岐で legacy positional パスを処理
- legacy パス内で `githubClient!` の non-null assertion が発生
- production コード（`src/core/runtime/factory.ts:35`）は既に named options を使用
- テスト（`tests/unit/core/runtime/local.test.ts`）に positional 呼び出しが 19 箇所残存

## Target State

```typescript
constructor(opts: LocalRuntimeOptions)
```

- union 型と分岐を除去
- non-null assertion を除去
- 全呼び出し箇所が named options を使用

## Scope

### 変更対象ファイル

| File | 変更内容 |
|------|---------|
| `src/core/runtime/local.ts` | コンストラクタを `LocalRuntimeOptions` のみに変更。legacy 分岐と non-null assertion を削除 |
| `tests/unit/core/runtime/local.test.ts` | positional 呼び出し 19 箇所を named options に変更（うち lines 474-487 の比較テストは削除） |

### 変更対象外

- `src/core/runtime/factory.ts` — 既に named options を使用。変更不要
- `LocalRuntimeOptions` インターフェース — 変更なし
- クラスの public API（メソッド群）— 変更なし

## Design Decisions

### コンストラクタシグネチャ

パラメータ名を `opts` に変更する（`cwdOrOpts` は union 前提の命名のため）。

```typescript
constructor(opts: LocalRuntimeOptions) {
  this.cwd = opts.cwd;
  this.githubClient = opts.githubClient;
  this.manager = opts.manager ?? createWorktreeManager();
  this.spawnFn = opts.spawnFn ?? spawnCommand;
  this.queryFn = opts.queryFn ?? (sdkQuery as unknown as QueryFn);
}
```

### テスト変換パターン

2 種類の positional 呼び出しを機械的に変換する:

| Positional (before) | Named options (after) |
|---------------------|----------------------|
| `new LocalRuntime(tempDir, githubClient, manager, spawnFn)` | `new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn })` |
| `new LocalRuntime(tempDir, githubClient, manager)` | `new LocalRuntime({ cwd: tempDir, githubClient, manager })` |

## Risk Assessment

- **振る舞い変更**: なし。コンストラクタの入口のみ変更、内部ロジックは同一
- **外部影響**: なし。`LocalRuntime` は内部クラス、export はテストと factory のみが使用
- **回帰リスク**: 低。型チェック（`bun run typecheck`）が変換漏れを検出する
