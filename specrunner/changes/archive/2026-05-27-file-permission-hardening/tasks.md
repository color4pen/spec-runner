# Tasks: file-permission-hardening

## T-01: atomicWriteJson にデフォルト mode 0o600 と O_EXCL を適用

**File**: `src/util/atomic-write.ts`

以下の 2 点を変更する:

1. **デフォルト mode**: `options?.mode ?? 0o600` で mode を常に確定させる
2. **O_EXCL**: `writeFile` の flag を `"wx"` に変更する
3. **分岐統合**: mode の有無による if/else を削除し、単一の writeFile 呼び出しにする

変更後の try ブロック内:

```typescript
const json = JSON.stringify(data, null, 2) + "\n";
const mode = options?.mode ?? 0o600;
await fs.writeFile(tmpPath, json, { flag: "wx", mode });
await fs.rename(tmpPath, filePath);
await fs.chmod(filePath, mode);
```

**注意**: `chmod` は mode 条件分岐を削除して常に実行する（mode は常に確定するため）。

**Acceptance**:
- [x] mode 未指定時に 0o600 が適用される
- [x] mode 明示指定時にその値が使われる
- [x] writeFile の flag が `"wx"` である
- [x] if/else 分岐が削除されている
- [x] chmod が常に実行される
- [x] `bun run typecheck` が green

---

## T-02: verbose log の openSync に 0o600 を追加

**File**: `src/logger/stdout.ts`

L92 の `openSync(currentLogPath, "a")` を `openSync(currentLogPath, "a", 0o600)` に変更する。

```typescript
// Before
logFd = openSync(currentLogPath, "a");

// After
logFd = openSync(currentLogPath, "a", 0o600);
```

**Acceptance**:
- [x] `openSync` の第 3 引数に `0o600` が指定されている
- [x] `bun run typecheck` が green

---

## T-03: 全体検証

**Command**: `bun run typecheck && bun run test`

T-01, T-02 完了後に実行。

**Acceptance**:
- [x] typecheck green
- [x] test green
- [x] `credentials-io.ts` の `{ mode: CREDENTIALS_MODE }` 指定が残っていること
- [x] `config/store.ts` の `{ mode: CONFIG_MODE }` 指定が残っていること

---

## Task Dependencies

```
T-01 ─┐
T-02 ─┴→ T-03
```

T-01 と T-02 は並列可能。T-03 は両方に依存。
