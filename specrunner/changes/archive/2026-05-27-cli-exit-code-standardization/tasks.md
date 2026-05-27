# Tasks: CLI exit code standardization

## Task 1: `ExitCode` 型・定数・宣言的マッピングを `src/errors.ts` に追加 [x]

**Design ref**: D1, D2, D3

1. `EXIT_CODE` 定数と `ExitCode` 型を定義
2. `EXIT_CODE_MAP` を定義（エラーコード → exit code の宣言的マッピング）
3. `SpecRunnerError` に `exitCode: ExitCode` プロパティを追加
   - constructor の第 4 引数 `exitCode?: ExitCode` を追加（省略時は `EXIT_CODE_MAP` からルックアップ、未登録なら `GENERAL_ERROR`）
4. 既存の factory ヘルパー（`configMissingError()` 等）は変更不要（`EXIT_CODE_MAP` からの自動導出で正しい exit code が設定される）

**検証**: `bun run typecheck` が通ること（既存コードとの互換性）

## Task 2: `bin/specrunner.ts` の catch ハンドラで `exitCode` を使用 [x]

**Design ref**: D6

1. `SpecRunnerError` catch 時に `process.exit(e.exitCode)` を使用
2. `command-registry.ts` の `job cancel` / `job resume` / `job finish` handler 内の catch で `SpecRunnerError` を捕捉し `err.exitCode` を返すように変更

**検証**: `bun run typecheck`

## Task 3: `init.ts` — exit code 修正 + `process.exit()` 排除 [x]

**Design ref**: D4

1. `runInit()` の戻り値を `Promise<number>` に変更
2. `--runtime managed` / `--runtime local` エラーを exit 2 に変更（引数エラー）
3. `command-registry.ts` の init handler で `process.exit(await runInit(...))` に変更

**検証**: `bun run typecheck`

## Task 4: `login.ts` + `github-device.ts` — `process.exit()` 排除 [x]

**Design ref**: D4

1. `github-device.ts` の `pollAccessToken()` 内の `process.exit(1)` をエラー throw に変更（`expired_token` / `access_denied`）
2. `runLogin()` の戻り値を `Promise<number>` に変更。try-catch で上記エラーを捕捉し exit 1 を返す
3. `command-registry.ts` の login handler で `process.exit(await runLogin())` に変更

**検証**: `bun run typecheck`

## Task 5: `job-show.ts` — `process.exit()` 排除 [x]

**Design ref**: D4

1. `runJobShow()` の戻り値を `Promise<number>` に変更
2. 内部の `process.exit(1)` を `return 1` に変更
3. 正常終了パスで `return 0` を追加
4. `command-registry.ts` の job show handler で `process.exit(await runJobShow(...))` に変更

**検証**: `bun run typecheck`

## Task 6: `ps.ts` — exit code を明示化 [x]

**Design ref**: D4

1. `runPs()` の戻り値を `Promise<number>` に変更（常に 0 を返す、read-only コマンドのため）
2. `command-registry.ts` の job ls handler で `process.exit(await runPs(...))` に変更

**検証**: `bun run typecheck`

## Task 7: `managed.ts` — `process.exit()` 排除 [x]

**Design ref**: D4

1. `runManagedSetup()` / `runManagedStatus()` / `runManagedReset()` の戻り値を `Promise<number>` に変更
2. 内部の `process.exit(1)` を `return 1` に変更
3. 正常終了パスで `return 0` を追加
4. `command-registry.ts` の runtime handler で `process.exit(await runManaged*(...))` に変更

**検証**: `bun run typecheck`

## Task 8: `run.ts` — preflight の exit code 修正 [x]

**Design ref**: D5

1. `runPreflight()` の `SpecRunnerError` catch で `err.exitCode` を使用（`EXIT_CODE_MAP` により `CONFIG_MISSING` / `NOT_GIT_REPO` / `REMOTE_NOT_GITHUB` 等は自動的に exit 2 になる）

注: `runRunCore()` でファイルが見つからない場合（slug としても解決できない場合）は exit 1 のまま維持する（D5 参照）。

**検証**: `bun run typecheck`

## Task 9: `command-registry.ts` 引数バリデーションの整理 [x]

**Design ref**: D5

`validate` / `review` handler 内の slug バリデーション分岐を確認:
- slug regex 不一致 → exit 2（既に正しい）
- slug 解決失敗（ファイルも slug も存在しない）→ exit 1（現状維持、存在しないリソースは「一般エラー」に分類。引数フォーマット自体は正しいため）

`job cancel` handler 内の `invalid jobId format` → exit 2 に変更（現状 exit 1 だが、フォーマット不正は引数エラー）

`job finish --job <uuid>` の不正 UUID チェック（`command-registry.ts` 449–451 行目）→ exit 2 に変更（フォーマット不正は引数エラー。`job cancel` の同様チェックと整合させる）

`bin/specrunner.ts` 62 行目の subcommand worktree guard `process.exit(1)` → `process.exit(EXIT_CODE.ARG_ERROR)` に変更（`job start` / `job resume` / `job finish` の subcommand dispatch path で `WORKTREE_GUARD` → exit 2 と整合させる）

**検証**: `bun run typecheck`

## Task 10: テスト修正 + 全体検証 [x]

1. `bun run typecheck` が green
2. `bun run test` が green
3. exit code の変更（1→2 等）に伴うテストの期待値更新
4. `process.exit()` mock を使っているテストがある場合、戻り値ベースのテストに移行

**検証**: `bun run typecheck && bun run test`

## Task 11: delta spec 更新 [x]

`specrunner/changes/cli-exit-code-standardization/specs/cli-commands/spec.md` に exit code 統一に関する requirement を追加:

1. 全コマンド共通の exit code 定義 (0/1/2) を requirement として記述
2. `SpecRunnerError.exitCode` の宣言的マッピング requirement を記述
3. 既存 scenario で exit code が変わるもの（`init --runtime managed` が exit 1 → exit 2 等）を更新
