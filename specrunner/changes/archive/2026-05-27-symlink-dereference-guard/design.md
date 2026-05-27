# Design: symlink-dereference-guard

## Overview

`fs.cp` のデフォルト動作は symlink を follow（dereference）するため、draft ディレクトリに symlink を配置すると任意ファイルが change folder にコピーされ PR で push される。request.md と usage.json の 2 つのコピー操作に `fs.lstat` ベースの symlink 検出ガードを追加し、symlink なら `SpecRunnerError` で reject する。

## Design Decisions

### D1: `fs.lstat` + reject 方式（`dereference: false` ではなく）

**Decision**: コピー前に `fs.lstat` で symlink を検出し、symlink なら即座に `SpecRunnerError` を throw する。

**Rationale**:
- symlink をそのままコピーしても意味がない（コピー先で壊れた symlink になる）
- symlink の存在自体が異常であり、silent に処理するより明示的に reject すべき
- `dereference: false` だと symlink が change folder に混入し、後続の git add / push で問題を引き起こす

**Trade-offs**:
- **Pro**: 異常を早期検出し、明確なエラーメッセージで報告できる
- **Pro**: 任意ファイルが PR に混入するセキュリティリスクを排除
- **Con**: 正当な symlink ユースケースがあれば壊れる（現在そのようなユースケースは存在しない）

### D2: 共通ユーティリティ関数への切り出し

**Decision**: symlink チェックロジックを `src/util/copy-artifacts.ts` に共通関数として定義する。

**関数シグネチャ**:
```typescript
async function rejectSymlink(filePath: string): Promise<void>
```

- `fs.lstat(filePath)` で stat を取得
- `stat.isSymbolicLink()` が `true` なら `SpecRunnerError` を throw
- `ENOENT`（ファイルが存在しない）の場合は何もしない（後続の `fs.cp` が適切にハンドルする）

**配置場所**: `src/util/copy-artifacts.ts`
- 3 箇所の呼び出し元のうち 1 箇所（`copyDraftUsageToChangeFolder`）が既にこのファイルにある
- 残り 2 箇所（`local.ts`, `managed.ts`）も `copyDraftUsageToChangeFolder` を import しているファイルなので、同じモジュールから export するのが自然

**Rationale**:
- 3 箇所で同じチェックを行うため DRY
- copy-artifacts は既にコピー前処理のヘルパーを集約するモジュールであり、責務が一致

### D3: エラーコード `SYMLINK_REJECTED`

**Decision**: `src/errors.ts` に新しいエラーコード `SYMLINK_REJECTED` を追加する。

```typescript
// ERROR_CODES に追加
SYMLINK_REJECTED: "SYMLINK_REJECTED",

// EXIT_CODE_MAP に追加（ARG_ERROR: ユーザーが symlink を修正する必要がある）
SYMLINK_REJECTED: EXIT_CODE.ARG_ERROR,
```

**エラーメッセージ例**:
```
SpecRunnerError [SYMLINK_REJECTED]: <filePath> is a symbolic link.
Hint: Remove the symlink and use a regular file.
```

### D4: `copyDraftUsageToChangeFolder` での配置位置

**Decision**: `rejectSymlink` を try/catch ブロックの**外側**に配置する。

**現在のコード構造**:
```typescript
export async function copyDraftUsageToChangeFolder(...): Promise<void> {
  const draftUsageSrc = ...;
  const changeUsageDst = ...;
  try {
    await fs.cp(draftUsageSrc, changeUsageDst);
  } catch {
    // usage.json absent — normal case
    return;
  }
  await spawnFn("git", ["add", ...]);
}
```

**変更後**:
```typescript
export async function copyDraftUsageToChangeFolder(...): Promise<void> {
  const draftUsageSrc = ...;
  const changeUsageDst = ...;
  await rejectSymlink(draftUsageSrc);  // try の外側
  try {
    await fs.cp(draftUsageSrc, changeUsageDst);
  } catch {
    return;
  }
  await spawnFn("git", ["add", ...]);
}
```

**Rationale**:
- try 内に配置すると `SpecRunnerError` が catch で swallow される
- `rejectSymlink` は ENOENT を無視するので、usage.json が存在しない場合は素通りし、後続の `fs.cp` の catch で正しくハンドルされる

## Scope

### In scope
- `src/core/runtime/local.ts:221` — request.md コピー前の symlink チェック
- `src/core/runtime/managed.ts:109` — request.md コピー前の symlink チェック
- `src/util/copy-artifacts.ts:55` — usage.json コピー前の symlink チェック
- `src/util/copy-artifacts.ts` — `rejectSymlink` 共通関数の追加
- `src/errors.ts` — `SYMLINK_REJECTED` エラーコードの追加

### Out of scope
- test ファイル内の `fs.cp`（`tests/unit/core/runtime/draft-move.test.ts:42`）
- ディレクトリ単位の再帰コピー（現在使われていない）
