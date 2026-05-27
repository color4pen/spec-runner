# Test Cases: symlink-dereference-guard

## TC-SYM-001: rejectSymlink — 通常ファイルはエラーなし

- **Category**: Unit / rejectSymlink
- **Priority**: must
- **Source**: T2.1, 受け入れ基準「通常ファイルのコピーが従来通り動作すること」

### GIVEN
一時ディレクトリに通常ファイル（symlink でない `request.md`）が存在する

### WHEN
`rejectSymlink(filePath)` を呼び出す

### THEN
- Promise が resolve する（エラーを throw しない）

---

## TC-SYM-002: rejectSymlink — symlink なら SpecRunnerError を throw

- **Category**: Unit / rejectSymlink
- **Priority**: must
- **Source**: T2.1, 受け入れ基準「symlink が検出された場合 SpecRunnerError が throw されること」

### GIVEN
一時ディレクトリに symlink（別ファイルを指す）が存在し、そのパスを `filePath` とする

### WHEN
`rejectSymlink(filePath)` を呼び出す

### THEN
- `SpecRunnerError` が throw される
- `error.code === "SYMLINK_REJECTED"`
- エラーメッセージに `filePath` が含まれる
- ヒントに「Remove the symlink」が含まれる

---

## TC-SYM-003: rejectSymlink — ファイルが存在しない（ENOENT）は素通り

- **Category**: Unit / rejectSymlink
- **Priority**: must
- **Source**: T2.1, design D2「ENOENT の場合は何もしない」

### GIVEN
存在しないファイルパスを `filePath` とする

### WHEN
`rejectSymlink(filePath)` を呼び出す

### THEN
- Promise が resolve する（ENOENT を throw しない）

---

## TC-SYM-004: rejectSymlink — ENOENT 以外の fs エラーは re-throw

- **Category**: Unit / rejectSymlink
- **Priority**: should
- **Source**: T2.1, design D2「それ以外のエラーは re-throw」

### GIVEN
`fs.lstat` が ENOENT 以外のエラー（例: EACCES）を throw するようにモックされている

### WHEN
`rejectSymlink(filePath)` を呼び出す

### THEN
- 元のエラーがそのまま re-throw される（`SpecRunnerError` でラップされない）

---

## TC-SYM-005: rejectSymlink — 壊れた symlink（dangling symlink）も reject

- **Category**: Unit / rejectSymlink
- **Priority**: should
- **Source**: T2.1, design D1「symlink の存在自体が異常」

### GIVEN
一時ディレクトリに存在しないターゲットを指す dangling symlink が存在する

### WHEN
`rejectSymlink(filePath)` を呼び出す

### THEN
- `SpecRunnerError` が throw される（`code === "SYMLINK_REJECTED"`）

---

## TC-SYM-006: SYMLINK_REJECTED のエラーコードと終了コード

- **Category**: Unit / ErrorCode
- **Priority**: must
- **Source**: T1.1, T1.2

### GIVEN
`ERROR_CODES` オブジェクトと `EXIT_CODE_MAP` が定義されている

### WHEN
`ERROR_CODES.SYMLINK_REJECTED` および `new SpecRunnerError(ERROR_CODES.SYMLINK_REJECTED, ..., ...)` を参照する

### THEN
- `ERROR_CODES.SYMLINK_REJECTED === "SYMLINK_REJECTED"` である
- `SpecRunnerError.exitCode === 2`（`EXIT_CODE.ARG_ERROR`）である

---

## TC-SYM-007: LocalRuntime — symlink な request.md は setupWorkspace で SpecRunnerError

- **Category**: Unit / LocalRuntime
- **Priority**: must
- **Source**: T3.1, 受け入れ基準「request.md のコピー時に symlink が検出された場合 SpecRunnerError が throw されること」

### GIVEN
- LocalRuntime の `setupWorkspace` が呼び出される
- `opts.requestFilePath` が symlink（別ファイルを指す）である

### WHEN
`setupWorkspace(slug, jobId, opts)` を実行する

### THEN
- `SpecRunnerError`（`code === "SYMLINK_REJECTED"`）が throw される
- `fs.cp` は呼ばれない（symlink チェックが先に失敗する）

---

## TC-SYM-008: LocalRuntime — 通常ファイルの request.md は setupWorkspace で正常コピー

- **Category**: Unit / LocalRuntime
- **Priority**: must
- **Source**: T3.1, 受け入れ基準「通常ファイルのコピーが従来通り動作すること」

### GIVEN
- LocalRuntime の `setupWorkspace` が呼び出される
- `opts.requestFilePath` が通常ファイルである

### WHEN
`setupWorkspace(slug, jobId, opts)` を実行する

### THEN
- `SpecRunnerError` は throw されない
- change folder に `request.md` がコピーされる

---

## TC-SYM-009: ManagedRuntime — symlink な request.md は setupWorkspace で SpecRunnerError

- **Category**: Unit / ManagedRuntime
- **Priority**: must
- **Source**: T3.2, 受け入れ基準「request.md のコピー時に symlink が検出された場合 SpecRunnerError が throw されること」

### GIVEN
- ManagedRuntime の `setupWorkspace` が呼び出される
- `opts.requestFilePath` が symlink（別ファイルを指す）である

### WHEN
`setupWorkspace(slug, jobId, opts)` を実行する

### THEN
- `SpecRunnerError`（`code === "SYMLINK_REJECTED"`）が throw される
- `fs.cp` は呼ばれない

---

## TC-SYM-010: ManagedRuntime — 通常ファイルの request.md は setupWorkspace で正常コピー

- **Category**: Unit / ManagedRuntime
- **Priority**: must
- **Source**: T3.2, 受け入れ基準「通常ファイルのコピーが従来通り動作すること」

### GIVEN
- ManagedRuntime の `setupWorkspace` が呼び出される
- `opts.requestFilePath` が通常ファイルである

### WHEN
`setupWorkspace(slug, jobId, opts)` を実行する

### THEN
- `SpecRunnerError` は throw されない
- change folder に `request.md` がコピーされる

---

## TC-SYM-011: copyDraftUsageToChangeFolder — symlink な usage.json は SpecRunnerError

- **Category**: Unit / copyDraftUsageToChangeFolder
- **Priority**: must
- **Source**: T3.3, 受け入れ基準「usage.json のコピー時に symlink が検出された場合 SpecRunnerError が throw されること」

### GIVEN
- draft ディレクトリに `usage.json` の symlink（別ファイルを指す）が存在する

### WHEN
`copyDraftUsageToChangeFolder(draftRequestFilePath, targetCwd, slug, spawnFn)` を実行する

### THEN
- `SpecRunnerError`（`code === "SYMLINK_REJECTED"`）が throw される
- `fs.cp` は呼ばれない

---

## TC-SYM-012: copyDraftUsageToChangeFolder — SpecRunnerError が try/catch で swallow されない

- **Category**: Unit / copyDraftUsageToChangeFolder
- **Priority**: must
- **Source**: T3.3, design D4「try の外側に配置」

### GIVEN
- draft ディレクトリに `usage.json` の symlink が存在する

### WHEN
`copyDraftUsageToChangeFolder(...)` を実行する

### THEN
- `SpecRunnerError` が関数の外に伝播する（内部 catch に握り潰されない）

---

## TC-SYM-013: copyDraftUsageToChangeFolder — usage.json が存在しない場合は正常終了

- **Category**: Unit / copyDraftUsageToChangeFolder
- **Priority**: must
- **Source**: T3.3, design D4「usage.json が存在しない場合は素通り」

### GIVEN
- draft ディレクトリに `usage.json` が存在しない

### WHEN
`copyDraftUsageToChangeFolder(draftRequestFilePath, targetCwd, slug, spawnFn)` を実行する

### THEN
- エラーなしで正常終了する（`rejectSymlink` が ENOENT を無視し、後続 catch で return する）

---

## TC-SYM-014: copyDraftUsageToChangeFolder — 通常ファイルの usage.json は正常コピー

- **Category**: Unit / copyDraftUsageToChangeFolder
- **Priority**: must
- **Source**: T3.3, 受け入れ基準「通常ファイルのコピーが従来通り動作すること」

### GIVEN
- draft ディレクトリに通常ファイルとして `usage.json` が存在する

### WHEN
`copyDraftUsageToChangeFolder(draftRequestFilePath, targetCwd, slug, spawnFn)` を実行する

### THEN
- change folder に `usage.json` がコピーされる
- `spawnFn` に `git add` コマンドが渡される

---

## TC-SYM-015: rejectSymlink — 共通ユーティリティとして export されている

- **Category**: Unit / rejectSymlink
- **Priority**: must
- **Source**: T2.1, 受け入れ基準「symlink チェック関数が共通化されていること」

### GIVEN
`src/util/copy-artifacts.ts` のモジュールが存在する

### WHEN
`import { rejectSymlink } from "./copy-artifacts.js"` で import する

### THEN
- `rejectSymlink` が `function` として import できる（named export されている）

---

## TC-SYM-016: セキュリティ — /etc/passwd を指す symlink は reject される

- **Category**: Security
- **Priority**: should
- **Source**: 背景「任意ファイルが change folder にコピーされ PR で push されうる」

### GIVEN
- draft ディレクトリに `/etc/passwd`（または任意の機密ファイル）を指す symlink が `request.md` として存在する

### WHEN
`rejectSymlink(symlinkPath)` を呼び出す

### THEN
- `SpecRunnerError`（`code === "SYMLINK_REJECTED"`）が throw される
- symlink のターゲットファイルの内容は読み込まれない（`fs.lstat` は symlink 自体を参照し follow しない）
