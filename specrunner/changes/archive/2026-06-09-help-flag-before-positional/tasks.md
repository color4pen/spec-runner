# Tasks: --help を positional 必須チェックより先に評価する

## T-01: parser に `--help` 予約と help 時 positional スキップを実装

- [x] `src/cli/flag-parser.ts` の `--` 解析ブランチ（L73-）で、`flagName` 算出後・`flagDefs[flagName]` の unknown 判定（L86-88）より前に、`flagName === "help"` なら `flags["help"] = true` を設定して次トークンへ進む予約処理を追加する（`--help` および `--help=...` の両方で help を立て、unknown flag にしない）。
- [x] `-h` の既存マッピング（L52-56）はそのまま維持する。
- [x] required positional チェック（L127-136）の条件を `positionalDef?.required && !flags["help"]` に変更し、`flags["help"]` が true のときは positional 不足で throw しないようにする。
- [x] 関数 doc コメントの Rules（L24-37）に予約フラグと help-skip の挙動を追記する（`3.` `-h`/`--help` → `help: true`、`7.` の required positional は help 未指定時のみ、の主旨）。
- [x] `tests/unit/cli/flag-parser.test.ts` にケースを追加する:
  - `parseFlags(["--help"], {})` → `flags["help"] === true`、throw しない
  - `parseFlags(["--help=anything"], {})` → `flags["help"] === true`、throw しない
  - `parseFlags(["--help"], {}, { name: "slug", required: true })` → throw しない・`flags["help"] === true`
  - `parseFlags(["-h"], {}, { name: "slug", required: true })` → throw しない・`flags["help"] === true`
  - `parseFlags([], {}, { name: "slug", required: true })` → `FlagParseError`（`slug` を含む）を throw（regression guard）

**Acceptance Criteria**:
- `--help` / `-h` が `flagDefs` に `help` 未定義でも unknown flag にならず `flags["help"] = true` を返す
- `flags["help"]` true 時に required positional 不足で throw しない
- `--help` なし・positional 不足は従来どおり `FlagParseError` を throw する
- 追加した flag-parser テストが green

## T-02: dispatch 層に共通 help 処理を実装（worktree guard より前）

- [x] `command-registry.ts` に usage 未定義コマンド用の汎用 fallback 文字列定数（例 `NO_DETAILED_HELP_USAGE`）を追加し export する。内容は「詳細 help なし」＋「`Run 'specrunner --help' for the command list.`」程度の簡潔なメッセージとする。
- [x] `bin/specrunner.ts` で fallback 定数を import し、`usage: string | undefined` を受け取り `process.stdout.write(usage ?? NO_DETAILED_HELP_USAGE)` して `process.exit(0)` する小さなヘルパ（例 `emitHelp`）を定義する。
- [x] **subcommand dispatch**: raw args を pre-scan して `--help`/`-h` を検出し、`emitHelp(subDef.usage)` を worktree guard より前に評価する。worktree guard は parseFlags より前の位置（元の優先度）に維持する。
- [x] **normal command dispatch**: raw args を pre-scan して `--help`/`-h` を検出し、`emitHelp(entry.usage)` を parseFlags より前に評価する。
- [x] 既存の top-level `specrunner --help` / `-h` 処理（L18-21）と、親コマンド subcommand 欠落時の `--help` 処理（L40-43）は変更しない。

**Acceptance Criteria**:
- subcommand / normal の両経路で `flags["help"]` true 時に usage（または fallback）を stdout に出して exit 0 する
- help 判定が worktree guard より前に評価され、guarded subcommand（start/resume/archive）でも `--help` が usage を返す
- usage フィールドを持つコマンドはその usage、持たないコマンドは fallback を出力する
- `typecheck` が green

## T-03: archive / runtime reset の個別 help を共通処理へ統合

- [x] `command-registry.ts` の `job archive` subDef から `help: { type: "boolean" }`（L488）を削除する。`usage: ARCHIVE_USAGE`（L491）は維持する。
- [x] `job archive` handler 先頭の `if (parsed.flags["help"]) { stdoutWrite(ARCHIVE_USAGE); process.exit(0); }`（L493-496）を削除する。
- [x] `runtime reset` subDef に `usage: RUNTIME_RESET_USAGE` を追加する（共通処理が正しい usage を取得できるようにするため）。
- [x] `runtime reset` subDef から `help: { type: "boolean" }`（L564）を削除する。
- [x] `runtime reset` handler 先頭の `if (parsed.flags["help"]) { stdoutWrite(RUNTIME_RESET_USAGE); process.exit(0); }`（L567-570）を削除する。
- [x] 削除により未使用となる import（`stdoutWrite` 等）が出たら整理する。`stdoutWrite` が他で使われていれば残す。
- [x] 到達不能・未使用コードを残さない（lint / unused チェックで検出されないこと）。

**Acceptance Criteria**:
- `job archive` / `runtime reset` の handler 内に `if (parsed.flags["help"])` 分岐が存在しない
- 両 subDef の `flags` に `help` 定義が存在しない
- `runtime reset` subDef が `usage: RUNTIME_RESET_USAGE` を持つ
- `lint` が green（未使用 import / 到達不能コードなし）

## T-04: dispatch レベルの help テストと後方互換テストを追加

- [x] dispatch を経由する help テスト（既存 `tests/unit/cli/specrunner-resume-dispatch.test.ts` / `runtime-tc.test.ts` と同じ `runMain` パターン: `detectWorktree` を `{ isWorktree: false }` に mock、`process.exit` を throw に置換、stdout/stderr を spy）を追加する。新規ファイル（例 `tests/unit/cli/help-flag-dispatch.test.ts`）でよい。
- [x] 以下のケースを検証する:
  - `specrunner job archive --help` → exit 0、stdout に `ARCHIVE_USAGE` 由来の文字列（例 `Archive the completed change folder`）を含む
  - `specrunner runtime reset --help` → exit 0、stdout に `RUNTIME_RESET_USAGE` 由来の文字列（例 `Delete the Anthropic Environment`）を含む
  - `specrunner job resume --help` → exit 0（usage なしのため fallback メッセージ）。`runResume` は呼ばれない
  - `specrunner request review --help` → exit 0、slug なしでも `requires a <file-or-slug>` エラーにならない
  - `specrunner run --help` → exit 0（normal 経路）、`runRun` は呼ばれない
  - `specrunner job resume`（slug なし・help なし）→ exit 2、stderr に `requires a <slug>` を含む（regression guard）
- [x] `-h` 短縮形でも同等に動作することを少なくとも 1 ケースで検証する（例 `specrunner job archive -h` → exit 0 + ARCHIVE_USAGE）。
- [x] 既存 `runtime-tc.test.ts` の TC-39（`runtime reset --force` → `runManagedReset({ force: true })`）が引き続き green であることを確認する。

**Acceptance Criteria**:
- 上記 dispatch テストがすべて green
- `--help` あり時に対象 handler（runResume / runRun 等）が呼ばれないことを assert している
- 既存の dispatch テスト（resume-dispatch / runtime-tc）が regression していない

## T-05: 全体検証

- [x] `typecheck` を実行し green であることを確認する。
- [x] `test` を実行し全テスト green であることを確認する。
- [x] `lint` を実行し green であることを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green
- `lint` が green
- request の受け入れ基準（全サブコマンドで `--help`/`-h` が slug なしで usage 表示、archive 後方互換、help なし・slug なしは従来どおりエラー）をすべて満たす
