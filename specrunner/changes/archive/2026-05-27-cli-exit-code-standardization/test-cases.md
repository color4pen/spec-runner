# Test Cases: CLI exit code standardization

## Scenarios

---

### TC-01: EXIT_CODE 定数の定義

- **Category**: Unit / errors.ts
- **Priority**: must
- **Source**: Task 1 / D1

**GIVEN** `src/errors.ts` に `EXIT_CODE` 定数が定義されている  
**WHEN** `EXIT_CODE.SUCCESS` / `EXIT_CODE.GENERAL_ERROR` / `EXIT_CODE.ARG_ERROR` を参照する  
**THEN** それぞれ `0` / `1` / `2` が返り、`ExitCode` 型は `0 | 1 | 2` に絞られる

---

### TC-02: SpecRunnerError に exitCode プロパティが存在する

- **Category**: Unit / errors.ts
- **Priority**: must
- **Source**: Task 1 / D2

**GIVEN** `SpecRunnerError` クラスが `exitCode: ExitCode` プロパティを持つ  
**WHEN** `new SpecRunnerError("SOME_CODE", "hint", "message")` を生成する  
**THEN** `err.exitCode` が `ExitCode` 型（0 | 1 | 2）であることが TypeScript 型チェックで保証される

---

### TC-03: EXIT_CODE_MAP — CONFIG_MISSING は exit 2 にマッピングされる

- **Category**: Unit / errors.ts
- **Priority**: must
- **Source**: Task 1 / D3

**GIVEN** `EXIT_CODE_MAP` に `CONFIG_MISSING: EXIT_CODE.ARG_ERROR` が宣言されている  
**WHEN** `new SpecRunnerError("CONFIG_MISSING", "hint", "message")` を生成する  
**THEN** `err.exitCode === 2`

---

### TC-04: EXIT_CODE_MAP — CONFIG_INCOMPLETE は exit 2 にマッピングされる

- **Category**: Unit / errors.ts
- **Priority**: must
- **Source**: Task 1 / D3

**GIVEN** `EXIT_CODE_MAP` に `CONFIG_INCOMPLETE: EXIT_CODE.ARG_ERROR` が宣言されている  
**WHEN** `new SpecRunnerError("CONFIG_INCOMPLETE", "hint", "message")` を生成する  
**THEN** `err.exitCode === 2`

---

### TC-05: EXIT_CODE_MAP — CONFIG_INVALID は exit 2 にマッピングされる

- **Category**: Unit / errors.ts
- **Priority**: must
- **Source**: Task 1 / D3

**GIVEN** `EXIT_CODE_MAP` に `CONFIG_INVALID: EXIT_CODE.ARG_ERROR` が宣言されている  
**WHEN** `new SpecRunnerError("CONFIG_INVALID", "hint", "message")` を生成する  
**THEN** `err.exitCode === 2`

---

### TC-06: EXIT_CODE_MAP — REQUEST_MD_INVALID は exit 2 にマッピングされる

- **Category**: Unit / errors.ts
- **Priority**: must
- **Source**: Task 1 / D3

**GIVEN** `EXIT_CODE_MAP` に `REQUEST_MD_INVALID: EXIT_CODE.ARG_ERROR` が宣言されている  
**WHEN** `new SpecRunnerError("REQUEST_MD_INVALID", "hint", "message")` を生成する  
**THEN** `err.exitCode === 2`

---

### TC-07: EXIT_CODE_MAP — NOT_GIT_REPO は exit 2 にマッピングされる

- **Category**: Unit / errors.ts
- **Priority**: must
- **Source**: Task 1 / D3

**GIVEN** `EXIT_CODE_MAP` に `NOT_GIT_REPO: EXIT_CODE.ARG_ERROR` が宣言されている  
**WHEN** `new SpecRunnerError("NOT_GIT_REPO", "hint", "message")` を生成する  
**THEN** `err.exitCode === 2`

---

### TC-08: EXIT_CODE_MAP — REMOTE_NOT_GITHUB は exit 2 にマッピングされる

- **Category**: Unit / errors.ts
- **Priority**: must
- **Source**: Task 1 / D3

**GIVEN** `EXIT_CODE_MAP` に `REMOTE_NOT_GITHUB: EXIT_CODE.ARG_ERROR` が宣言されている  
**WHEN** `new SpecRunnerError("REMOTE_NOT_GITHUB", "hint", "message")` を生成する  
**THEN** `err.exitCode === 2`

---

### TC-09: EXIT_CODE_MAP — WORKTREE_GUARD は exit 2 にマッピングされる

- **Category**: Unit / errors.ts
- **Priority**: must
- **Source**: Task 1 / D3

**GIVEN** `EXIT_CODE_MAP` に `WORKTREE_GUARD: EXIT_CODE.ARG_ERROR` が宣言されている  
**WHEN** `new SpecRunnerError("WORKTREE_GUARD", "hint", "message")` を生成する  
**THEN** `err.exitCode === 2`

---

### TC-10: EXIT_CODE_MAP — 未登録エラーコードはデフォルト exit 1

- **Category**: Unit / errors.ts
- **Priority**: must
- **Source**: Task 1 / D3

**GIVEN** `EXIT_CODE_MAP` に登録されていないエラーコード `"UNKNOWN_CODE"` を使用する  
**WHEN** `new SpecRunnerError("UNKNOWN_CODE", "hint", "message")` を生成する  
**THEN** `err.exitCode === 1`（`GENERAL_ERROR` フォールバック）

---

### TC-11: SpecRunnerError — exitCode 引数で上書き可能

- **Category**: Unit / errors.ts
- **Priority**: should
- **Source**: Task 1 / D2

**GIVEN** `EXIT_CODE_MAP` で `CONFIG_MISSING` → `2` にマッピングされている  
**WHEN** `new SpecRunnerError("CONFIG_MISSING", "hint", "message", EXIT_CODE.GENERAL_ERROR)` のように第 4 引数で明示指定する  
**THEN** `err.exitCode === 1`（明示指定が MAP より優先される）

---

### TC-12: bin/specrunner.ts — SpecRunnerError catch 時に e.exitCode を使用

- **Category**: Unit / bin/specrunner.ts
- **Priority**: must
- **Source**: Task 2 / D6

**GIVEN** `bin/specrunner.ts` のトップレベル catch ハンドラが `SpecRunnerError` を捕捉する  
**WHEN** `exitCode === 2` を持つ `SpecRunnerError` が throw される  
**THEN** `process.exit(2)` が呼ばれる（ハードコードの `process.exit(1)` ではない）

---

### TC-13: init コマンド — 廃止オプション `--runtime managed` で exit 2

- **Category**: Integration / init
- **Priority**: must
- **Source**: Task 3 / D4

**GIVEN** `specrunner init` コマンドが設定済み環境で実行可能である  
**WHEN** `specrunner init --runtime managed` を実行する  
**THEN** exit code `2` が返る（廃止フラグは引数エラー）

---

### TC-14: init コマンド — 廃止オプション `--runtime local` で exit 2

- **Category**: Integration / init
- **Priority**: must
- **Source**: Task 3 / D4

**GIVEN** `specrunner init` コマンドが設定済み環境で実行可能である  
**WHEN** `specrunner init --runtime local` を実行する  
**THEN** exit code `2` が返る（廃止フラグは引数エラー）

---

### TC-15: init コマンド — 正常完了で exit 0

- **Category**: Integration / init
- **Priority**: must
- **Source**: Task 3

**GIVEN** `specrunner init` コマンドが設定済み環境で実行可能である  
**WHEN** 有効な引数で `specrunner init` を実行する  
**THEN** exit code `0` が返る

---

### TC-16: init コマンド — runInit() が Promise<number> を返す

- **Category**: Unit / init.ts
- **Priority**: must
- **Source**: Task 3 / D4

**GIVEN** `runInit()` 関数のシグネチャが `Promise<number>` である  
**WHEN** TypeScript コンパイル (`bun run typecheck`) を実行する  
**THEN** 型エラーなしでコンパイルが成功する

---

### TC-17: login コマンド — github-device.ts 内で process.exit() を直接呼ばない

- **Category**: Unit / github-device.ts
- **Priority**: must
- **Source**: Task 4 / D4

**GIVEN** `github-device.ts` の `pollAccessToken()` が `expired_token` を受信する  
**WHEN** `pollAccessToken()` が呼ばれる  
**THEN** `process.exit(1)` を直接呼ぶのではなく、エラーを throw する

---

### TC-18: login コマンド — token expired で exit 1

- **Category**: Integration / login
- **Priority**: must
- **Source**: Task 4 / D4

**GIVEN** GitHub device flow で `expired_token` レスポンスが返る状態をモックする  
**WHEN** `specrunner login` を実行する  
**THEN** exit code `1` が返る（一般エラー）

---

### TC-19: login コマンド — access denied で exit 1

- **Category**: Integration / login
- **Priority**: must
- **Source**: Task 4 / D4

**GIVEN** GitHub device flow で `access_denied` レスポンスが返る状態をモックする  
**WHEN** `specrunner login` を実行する  
**THEN** exit code `1` が返る（一般エラー）

---

### TC-20: login コマンド — runLogin() が Promise<number> を返す

- **Category**: Unit / login.ts
- **Priority**: must
- **Source**: Task 4 / D4

**GIVEN** `runLogin()` 関数のシグネチャが `Promise<number>` である  
**WHEN** TypeScript コンパイル (`bun run typecheck`) を実行する  
**THEN** 型エラーなしでコンパイルが成功する

---

### TC-21: job show コマンド — 正常完了で exit 0

- **Category**: Integration / job-show
- **Priority**: must
- **Source**: Task 5 / D4

**GIVEN** 有効な job ID が存在する環境をモックする  
**WHEN** `specrunner job show <valid-job-id>` を実行する  
**THEN** exit code `0` が返る

---

### TC-22: job show コマンド — エラー時に exit 1

- **Category**: Integration / job-show
- **Priority**: must
- **Source**: Task 5 / D4

**GIVEN** 存在しない job ID を指定する  
**WHEN** `specrunner job show <nonexistent-job-id>` を実行する  
**THEN** exit code `1` が返る

---

### TC-23: job show コマンド — runJobShow() が Promise<number> を返す

- **Category**: Unit / job-show.ts
- **Priority**: must
- **Source**: Task 5 / D4

**GIVEN** `runJobShow()` 関数のシグネチャが `Promise<number>` である  
**WHEN** TypeScript コンパイル (`bun run typecheck`) を実行する  
**THEN** 型エラーなしでコンパイルが成功する

---

### TC-24: job show コマンド — handler 内で process.exit() を直接呼ばない

- **Category**: Unit / job-show.ts
- **Priority**: must
- **Source**: Task 5 / D4

**GIVEN** `job-show.ts` のソースコードを確認する  
**WHEN** `runJobShow()` の実装を検査する  
**THEN** `process.exit()` の直接呼び出しが存在しない（`return 0` / `return 1` を使用）

---

### TC-25: job ls コマンド — 正常完了で exit 0

- **Category**: Integration / ps
- **Priority**: must
- **Source**: Task 6 / D4

**GIVEN** ジョブ一覧を取得できる環境をモックする  
**WHEN** `specrunner job ls` を実行する  
**THEN** exit code `0` が返る（常に成功、read-only コマンド）

---

### TC-26: job ls コマンド — runPs() が Promise<number> を返す

- **Category**: Unit / ps.ts
- **Priority**: must
- **Source**: Task 6 / D4

**GIVEN** `runPs()` 関数のシグネチャが `Promise<number>` である  
**WHEN** TypeScript コンパイル (`bun run typecheck`) を実行する  
**THEN** 型エラーなしでコンパイルが成功する

---

### TC-27: managed setup コマンド — 正常完了で exit 0

- **Category**: Integration / managed
- **Priority**: should
- **Source**: Task 7 / D4

**GIVEN** managed ランタイムのセットアップが成功する環境をモックする  
**WHEN** `specrunner runtime setup` (managed setup) を実行する  
**THEN** exit code `0` が返る

---

### TC-28: managed setup コマンド — エラー時に exit 1

- **Category**: Integration / managed
- **Priority**: should
- **Source**: Task 7 / D4

**GIVEN** managed ランタイムのセットアップが失敗する環境をモックする  
**WHEN** `specrunner runtime setup` を実行する  
**THEN** exit code `1` が返る

---

### TC-29: managed コマンド — runManagedSetup/Status/Reset() が Promise<number> を返す

- **Category**: Unit / managed.ts
- **Priority**: must
- **Source**: Task 7 / D4

**GIVEN** `runManagedSetup()` / `runManagedStatus()` / `runManagedReset()` のシグネチャが `Promise<number>` である  
**WHEN** TypeScript コンパイル (`bun run typecheck`) を実行する  
**THEN** 型エラーなしでコンパイルが成功する

---

### TC-30: managed コマンド — handler 内で process.exit() を直接呼ばない

- **Category**: Unit / managed.ts
- **Priority**: must
- **Source**: Task 7 / D4

**GIVEN** `managed.ts` のソースコードを確認する  
**WHEN** `runManagedSetup()` / `runManagedStatus()` / `runManagedReset()` の実装を検査する  
**THEN** `process.exit()` の直接呼び出しが存在しない（`return 0` / `return 1` を使用）

---

### TC-31: run コマンド — CONFIG_MISSING preflight エラーで exit 2

- **Category**: Integration / run
- **Priority**: must
- **Source**: Task 8 / D5

**GIVEN** `specrunner` の設定ファイルが存在しない環境  
**WHEN** `specrunner run <slug>` を実行する  
**THEN** exit code `2` が返る（`CONFIG_MISSING` → exit 2 の宣言的マッピング）

---

### TC-32: run コマンド — NOT_GIT_REPO preflight エラーで exit 2

- **Category**: Integration / run
- **Priority**: must
- **Source**: Task 8 / D5

**GIVEN** git リポジトリでないディレクトリで実行する  
**WHEN** `specrunner run <slug>` を実行する  
**THEN** exit code `2` が返る（`NOT_GIT_REPO` → exit 2 の宣言的マッピング）

---

### TC-33: run コマンド — REMOTE_NOT_GITHUB preflight エラーで exit 2

- **Category**: Integration / run
- **Priority**: must
- **Source**: Task 8 / D5

**GIVEN** git remote が GitHub 以外のリポジトリで実行する  
**WHEN** `specrunner run <slug>` を実行する  
**THEN** exit code `2` が返る（`REMOTE_NOT_GITHUB` → exit 2 の宣言的マッピング）

---

### TC-34: run コマンド — pipeline halt で exit 1

- **Category**: Integration / run
- **Priority**: must
- **Source**: request.md 要件

**GIVEN** pipeline が正常に開始できる環境  
**WHEN** pipeline が途中で halt（一般エラー）する  
**THEN** exit code `1` が返る

---

### TC-35: run コマンド — slug/ファイルが見つからない場合は exit 1

- **Category**: Integration / run
- **Priority**: must
- **Source**: Task 8 / D5

**GIVEN** 存在しない slug を指定する（フォーマット自体は正しい）  
**WHEN** `specrunner run nonexistent-slug` を実行する  
**THEN** exit code `1` が返る（引数フォーマットは正しいため runtime error = exit 1）

---

### TC-36: job cancel コマンド — 不正な jobId フォーマットで exit 2

- **Category**: Integration / command-registry
- **Priority**: must
- **Source**: Task 9 / D5

**GIVEN** `job cancel` handler が jobId のフォーマットバリデーションを行う  
**WHEN** `specrunner job cancel not-a-valid-uuid` を実行する  
**THEN** exit code `2` が返る（フォーマット不正 = 引数エラー）

---

### TC-37: job finish コマンド — 不正な UUID フォーマットで exit 2

- **Category**: Integration / command-registry
- **Priority**: must
- **Source**: Task 9 / D5

**GIVEN** `job finish --job <uuid>` handler が UUID フォーマットバリデーションを行う  
**WHEN** `specrunner job finish --job not-a-valid-uuid` を実行する  
**THEN** exit code `2` が返る（フォーマット不正 = 引数エラー、`job cancel` と整合）

---

### TC-38: subcommand worktree guard で exit 2

- **Category**: Integration / bin/specrunner.ts
- **Priority**: must
- **Source**: Task 9 / D5

**GIVEN** worktree 外から `job start` / `job resume` / `job finish` の subcommand を実行しようとする  
**WHEN** worktree guard チェックが発動する  
**THEN** exit code `2` が返る（`WORKTREE_GUARD` → exit 2、実行コンテキスト不正 = 引数エラー）

---

### TC-39: request review コマンド — slug regex 不一致で exit 2

- **Category**: Integration / command-registry
- **Priority**: must
- **Source**: Task 9 / D5

**GIVEN** `request review` handler が slug の regex バリデーションを行う  
**WHEN** `specrunner request review "invalid slug with spaces"` を実行する  
**THEN** exit code `2` が返る

---

### TC-40: request validate コマンド — slug regex 不一致で exit 2

- **Category**: Integration / command-registry
- **Priority**: must
- **Source**: Task 9 / D5

**GIVEN** `request validate` handler が slug の regex バリデーションを行う  
**WHEN** `specrunner request validate "invalid slug with spaces"` を実行する  
**THEN** exit code `2` が返る

---

### TC-41: request review コマンド — slug 解決失敗（ファイル不存在）で exit 1

- **Category**: Integration / command-registry
- **Priority**: must
- **Source**: Task 9 / D5

**GIVEN** 正しいフォーマットの slug を指定するが、対応ファイルが存在しない  
**WHEN** `specrunner request review valid-slug-but-not-exists` を実行する  
**THEN** exit code `1` が返る（フォーマットは正しいため runtime error = exit 1）

---

### TC-42: FlagParseError — exit 2 の既存挙動が維持される

- **Category**: Integration / bin/specrunner.ts
- **Priority**: must
- **Source**: design.md「変更しないもの」

**GIVEN** `bin/specrunner.ts` の `FlagParseError` catch ハンドラが存在する  
**WHEN** 無効なフラグ（例: `--unknown-flag`）を渡す  
**THEN** exit code `2` が返る（既存挙動を壊さない）

---

### TC-43: SIGINT による exit 130 — 変更されない

- **Category**: Integration / シグナル
- **Priority**: should
- **Source**: request.md スコープ外

**GIVEN** コマンド実行中に SIGINT シグナルが送信される  
**WHEN** プロセスが SIGINT を受信する  
**THEN** exit code `130` が返る（シグナル規約として対象外、変更なし）

---

### TC-44: finish コマンド — 既存の 0/1/2 挙動が維持される

- **Category**: Integration / finish
- **Priority**: must
- **Source**: design.md「変更しないもの」

**GIVEN** `FinishResult` 型の `exitCode: 0 | 1 | 2` が既に正しく設計されている  
**WHEN** finish コマンドを各結果パターンで実行する  
**THEN** 成功=0、一般エラー=1、引数エラー=2 の既存挙動が変わらない

---

### TC-45: cancel コマンド — 既存の 0/1/2 挙動が維持される

- **Category**: Integration / cancel
- **Priority**: must
- **Source**: design.md「変更しないもの」

**GIVEN** `cancel` コマンドの exit code が既に 0/1/2 で正しく実装されている  
**WHEN** cancel コマンドを各結果パターンで実行する  
**THEN** 既存挙動が変わらない

---

### TC-46: command-registry.ts — handler が process.exit() を直接呼ばない（統一検証）

- **Category**: Unit / command-registry.ts
- **Priority**: must
- **Source**: Task 9 / D5

**GIVEN** `command-registry.ts` の全 handler 実装を検査する  
**WHEN** ソースコードで `process.exit()` の直接呼び出しを検索する  
**THEN** handler 内の `process.exit()` はなく、handler の戻り値 (`Promise<number>`) に基づいて上位レイヤーが `process.exit()` を呼ぶパターンに統一されている

---

### TC-47: typecheck が green

- **Category**: Build
- **Priority**: must
- **Source**: Task 10 / 受け入れ基準

**GIVEN** 全変更が実装済みである  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーなしでコンパイルが成功する

---

### TC-48: テストスイートが green

- **Category**: Build
- **Priority**: must
- **Source**: Task 10 / 受け入れ基準

**GIVEN** 全変更が実装済みである  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する（exit code 変更 1→2 等に伴う期待値も更新済み）

---

### TC-49: 全コマンドで exit code が 0/1/2 のみ（回帰テスト）

- **Category**: Integration / 横断
- **Priority**: must
- **Source**: 受け入れ基準

**GIVEN** run / resume / finish / cancel / request review / request validate / job ls / job show / doctor / init / login の全コマンドが実装済みである  
**WHEN** 各コマンドを成功・一般エラー・引数エラーの各ケースで実行する  
**THEN** 返る exit code は必ず `0` / `1` / `2` のいずれかである（130 は SIGINT 規約として例外）
