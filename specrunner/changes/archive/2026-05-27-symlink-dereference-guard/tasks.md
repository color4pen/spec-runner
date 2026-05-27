# Implementation Tasks: symlink-dereference-guard

## Phase 1: エラーコード追加

- [x] **T1.1**: `src/errors.ts` の `ERROR_CODES` に `SYMLINK_REJECTED: "SYMLINK_REJECTED"` を追加する

- [x] **T1.2**: `src/errors.ts` の `EXIT_CODE_MAP` に `SYMLINK_REJECTED: EXIT_CODE.ARG_ERROR` を追加する

## Phase 2: 共通ユーティリティ関数

- [x] **T2.1**: `src/util/copy-artifacts.ts` に `rejectSymlink` 関数を追加する
  - シグネチャ: `export async function rejectSymlink(filePath: string): Promise<void>`
  - `import { SpecRunnerError, ERROR_CODES } from "../errors.js"` を追加
  - `import * as fs from "node:fs/promises"` は既に存在
  - 実装:
    1. `const stat = await fs.lstat(filePath)`（try-catch で囲む）
    2. `stat.isSymbolicLink()` が `true` なら `new SpecRunnerError(ERROR_CODES.SYMLINK_REJECTED, "Remove the symlink and use a regular file.", \`${filePath} is a symbolic link.\`)` を throw
    3. catch で `(err as NodeJS.ErrnoException).code === "ENOENT"` の場合は return（ファイルが存在しない場合は後続処理に委ねる）
    4. それ以外のエラーは re-throw

## Phase 3: 呼び出し箇所への挿入

- [x] **T3.1**: `src/core/runtime/local.ts` — `fs.cp(opts.requestFilePath, changeFolderRequestPath)` の直前（L221）に `await rejectSymlink(opts.requestFilePath)` を挿入する
  - import 追加: `import { rejectSymlink } from "../../util/copy-artifacts.js"`（既存の `copyDraftUsageToChangeFolder` import に追加）

- [x] **T3.2**: `src/core/runtime/managed.ts` — `fs.cp(opts.requestFilePath, changeFolderRequestPath)` の直前（L109）に `await rejectSymlink(opts.requestFilePath)` を挿入する
  - import 追加: `import { rejectSymlink } from "../../util/copy-artifacts.js"`（既存の `copyDraftUsageToChangeFolder` import に追加）

- [x] **T3.3**: `src/util/copy-artifacts.ts` — `copyDraftUsageToChangeFolder` 内の `try` ブロックの**外側（直前）**に `await rejectSymlink(draftUsageSrc)` を挿入する（L54 と L55 の間）

## Phase 4: 検証

- [x] **T4.1**: `bun run typecheck` — 型エラーなし
- [x] **T4.2**: `bun run lint` — lint エラーなし
- [x] **T4.3**: `bun test` — 全テスト通過（既存の失敗は本変更と無関係）

## Notes for Implementer

- `rejectSymlink` の ENOENT ハンドリングは必須。usage.json が存在しないケースは正常パスであり、`rejectSymlink` がそこで throw してはならない
- `copyDraftUsageToChangeFolder` では `rejectSymlink` を try の外側に配置すること。try 内だと `SpecRunnerError` が catch で握り潰される
- local.ts / managed.ts には現在 `SpecRunnerError` の import がないが、`rejectSymlink` が内部で throw するだけなので呼び出し元に import は不要
