# Tasks: remove-localruntime-legacy-path

## Task 1: テストの positional 呼び出しを named options に変換 [x]

**File**: `tests/unit/core/runtime/local.test.ts`

19 箇所の positional 呼び出しを named options に変換する。

### 4-arg パターン (11 箇所)

Lines: 163, 183, 204, 216, 234, 251, 417, 453, 481, 560, 587

```typescript
// Before
new LocalRuntime(tempDir, githubClient, manager, spawnFn)
// After
new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn })
```

### 3-arg パターン (8 箇所)

Lines: 266, 290, 309, 327, 352, 371, 392, 433

```typescript
// Before
new LocalRuntime(tempDir, githubClient, manager)
// After
new LocalRuntime({ cwd: tempDir, githubClient, manager })
```

### 比較テストの削除

lines 474-487 の比較テスト「named options and positional constructor produce equivalent runtimes」は、positional パス削除後に存在意義がなくなる。テストケース自体（`it(...)` ブロック全体）を削除する。

**完了条件**: テストファイル内に `new LocalRuntime(tempDir,` のパターンが存在しない

---

## Task 2: LocalRuntime コンストラクタから legacy パスを削除 [x]

**File**: `src/core/runtime/local.ts`

### 2a: コンストラクタシグネチャを変更

```typescript
// Before (lines 61-66)
constructor(
  cwdOrOpts: string | LocalRuntimeOptions,
  githubClient?: GitHubClient,
  manager?: ReturnType<typeof createWorktreeManager>,
  spawnFn?: SpawnFn,
  queryFn?: QueryFn,
)

// After
constructor(opts: LocalRuntimeOptions)
```

### 2b: コンストラクタ本体から legacy 分岐を削除

```typescript
// Before (lines 68-83)
if (typeof cwdOrOpts === "string") {
  // Legacy positional constructor (backward compatibility)
  this.cwd = cwdOrOpts;
  this.githubClient = githubClient!;
  this.manager = manager ?? createWorktreeManager();
  this.spawnFn = spawnFn ?? spawnCommand;
  this.queryFn = queryFn ?? (sdkQuery as unknown as QueryFn);
} else {
  // Named options constructor
  const opts = cwdOrOpts;
  this.cwd = opts.cwd;
  this.githubClient = opts.githubClient;
  this.manager = opts.manager ?? createWorktreeManager();
  this.spawnFn = opts.spawnFn ?? spawnCommand;
  this.queryFn = opts.queryFn ?? (sdkQuery as unknown as QueryFn);
}

// After
this.cwd = opts.cwd;
this.githubClient = opts.githubClient;
this.manager = opts.manager ?? createWorktreeManager();
this.spawnFn = opts.spawnFn ?? spawnCommand;
this.queryFn = opts.queryFn ?? (sdkQuery as unknown as QueryFn);
```

**完了条件**:
- `githubClient!` の non-null assertion が存在しない
- `cwdOrOpts` が存在しない
- `typeof cwdOrOpts === "string"` 分岐が存在しない

---

## Task 3: 検証 [x]

```bash
bun run typecheck
bun run test
```

**完了条件**: 両方 pass
