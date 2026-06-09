# Spec: --help を positional 必須チェックより先に評価する

## Requirements

### Requirement: parser SHALL reserve --help / -h as a common flag

`parseFlags` は `--help` および `-h` を予約フラグとして扱い、コマンドの `flagDefs` に `help` が定義されていなくても unknown flag として throw せず、`flags["help"]` を `true` に設定 SHALL する。

#### Scenario: --help is accepted without a help flag definition

**Given** `flagDefs` に `help` が定義されていない
**When** `parseFlags(["--help"], {})` を呼ぶ
**Then** throw されず、戻り値の `flags["help"]` が `true` になる

#### Scenario: -h maps to help (existing behavior preserved)

**Given** `flagDefs` に `help` が定義されていない
**When** `parseFlags(["-h"], {})` を呼ぶ
**Then** throw されず、戻り値の `flags["help"]` が `true` になる

#### Scenario: --help with a value part still sets help

**Given** `flagDefs` に `help` が定義されていない
**When** `parseFlags(["--help=anything"], {})` を呼ぶ
**Then** throw されず、戻り値の `flags["help"]` が `true` になる

### Requirement: parser SHALL skip the required positional check when help is requested

`parseFlags` は `flags["help"]` が `true` の場合、`positionalDef.required` が true であっても required positional 不足の `FlagParseError` を throw SHALL しない。

#### Scenario: required positional missing but --help given

**Given** `positionalDef` が `{ name: "slug", required: true }`
**When** `parseFlags(["--help"], {}, { name: "slug", required: true })` を呼ぶ
**Then** throw されず、`flags["help"]` が `true` になる

#### Scenario: required positional missing and no help (regression guard)

**Given** `positionalDef` が `{ name: "slug", required: true }`
**When** `parseFlags([], {}, { name: "slug", required: true })` を呼ぶ
**Then** `FlagParseError`（メッセージに `slug` を含む）が throw される

### Requirement: dispatch SHALL emit usage and exit 0 when help is requested

`bin/specrunner.ts` の subcommand dispatch と normal command dispatch の両方で、`parseFlags` の結果 `flags["help"]` が `true` の場合、handler を実行せず usage を stdout に書いて exit 0 SHALL する。usage はコマンド定義の `usage` フィールドから取得し、未定義の場合は汎用 fallback メッセージを出力する。help 判定は worktree guard より前に評価 SHALL する。

#### Scenario: subcommand with usage field shows its usage

**Given** `specrunner job archive --help` を実行する
**When** dispatch が `flags["help"]` を検出する
**Then** `ARCHIVE_USAGE` が stdout に出力され、exit code 0 で終了する

#### Scenario: subcommand without usage field shows generic fallback

**Given** `specrunner job resume --help` を実行する（resume subDef は usage を持たない）
**When** dispatch が `flags["help"]` を検出する
**Then** 汎用 fallback メッセージが stdout に出力され、exit code 0 で終了する

#### Scenario: required-positional subcommand shows help without a slug

**Given** `specrunner request review --help` を slug なしで実行する
**When** dispatch が `flags["help"]` を検出する
**Then** usage（または fallback）が出力され、exit code 0 で終了する（`requires a <file-or-slug>` エラーにならない）

#### Scenario: no help and no slug still errors

**Given** `specrunner job resume` を slug なし・`--help` なしで実行する
**When** parser が required positional 不足を検出する
**Then** stderr に `requires a <slug>` を含むメッセージが出力され、exit code 2 で終了する

### Requirement: individual --help handling in archive / runtime reset SHALL be removed and remain backward compatible

`job archive` と `runtime reset` の handler 内の個別 `--help` 分岐、および両 subDef の `help` flag 定義を除去 SHALL する。除去後も両コマンドの `--help` 出力は従来と同一 usage（`ARCHIVE_USAGE` / `RUNTIME_RESET_USAGE`）でなければ MUST ならない。到達不能コードを残しては MUST ならない。

#### Scenario: runtime reset --help still shows RUNTIME_RESET_USAGE

**Given** `runtime reset` の handler 内 help 分岐を除去し、reset subDef に `usage: RUNTIME_RESET_USAGE` を付与した
**When** `specrunner runtime reset --help` を実行する
**Then** `RUNTIME_RESET_USAGE` が stdout に出力され、exit code 0 で終了する

#### Scenario: runtime reset --force still resets (no regression)

**Given** `runtime reset` から個別 help 分岐を除去した
**When** `specrunner runtime reset --force` を実行する
**Then** `runManagedReset({ force: true })` が呼び出される

#### Scenario: archive subDef no longer declares a help flag

**Given** parser が `--help` を予約フラグとして扱う
**When** `job archive` の subDef を確認する
**Then** `flags` に `help` 定義が存在せず、handler 内に `if (parsed.flags["help"])` 分岐が存在しない
