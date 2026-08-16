# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### テスト実行結果

- `typecheck`: clean (tsc --noEmit、エラー 0)
- `test`: 780 test files 通過、11540 tests 通過（1 skipped、2 todo）、0 failures

### spec.md Requirement × Scenario

**R1: 全 public command path が単一 registry から列挙でき canonical と alias を区別する**

- `listCommandPaths()` / `resolveCommand()` が command-registry.ts からエクスポートされていることを確認。
- `collectPaths()` の実装: `aliasOf` を持つ spec は `includeAliases: true` の場合のみ結果に追加し、canonical では除外。
- `resolveCommand(["run","my-slug"])` が `canonicalPath=["job","start"]`, `invokedAs=["run"]` を返すことを実装で確認。
- TC-001/002/003/004 (command-spec-api.test.ts): canonical 除外 / alias 包含 / alias→canonical+invokedAs / 全 public command 列挙をテストで固定。

**R2: `run` は `job start` の alias として解決され契約を target から継承する**

- `COMMANDS.run` が `aliasOf: ["job","start"]` のみを持ち、flags / args / worktreeGuard / requiresRepo を再宣言しないことをコードで確認。
- `resolveSpec()` の aliasOf 分岐でターゲット spec に解決する実装を確認。
- TC-005 (command-spec-api.test.ts): --detach / --issue flags / worktreeGuard: true / spec 同一性を検証。
- `detach-flag-cli.test.ts` が `COMMANDS["job"].children["start"].flags` を参照しており、run 独立 flags が廃止されていることを前提とした構造。

**R3: `doctor` は default action、`doctor repair <slug>` は child command として表現される**

- `COMMANDS.doctor` に `handler`（diagnose）と `children.repair` が共存していることをコードで確認。
- `doctor.requiresRepo` は未設定（falsy）、`doctor.children.repair.requiresRepo` は `true`（override）をコードで確認。
- `resolveSpec()` のデフォルトアクションロジック: 次トークンが known child 以外の場合は doctor 自身を解決する（inline 分岐廃止）。
- TC-007/008/009 (command-spec-api.test.ts): requiresRepo / canonical listing を検証。
- TC-DR-001/002/003 (doctor-repair.test.ts): slug 欠落→exit 2、成功→exit 0、例外→exit 1 を検証。

**R4: requiresRepo は parent から継承し child で override できる**

- `resolveEffectiveRequiresRepo()` が root から leaf まで辿り、最深の明示値を採用する実装を確認。
- TC-010 (command-spec-api.test.ts): fixture spec で parent true → child 継承を固定。
- TC-011 (command-spec-api.test.ts): fixture spec で parent true → child false override を固定。
- TC-012 / TC-036: job start/ls/show/wait が false、job cancel/attach/prune/stats/inbox run が true を検証。

**R5: worktree guard は spec 宣言から導出される**

- `job start/resume/attach/archive/prune/reopen` と `inbox run` に `worktreeGuard: true` が宣言されていることをコードで確認。
- `bin/specrunner.ts` で `spec.worktreeGuard` を参照する単一 guard 実装を確認。
- grep で `WORKTREE_GUARDED_COMMANDS` が bin/specrunner.ts に 0 件、`guardedSubcommands` が command-registry.ts に 0 件であることを確認。
- TC-035 (command-spec-api.test.ts): ファイル内容検索で両 Set の不在をテストで固定。
- TC-WG-001/002/003/006 (specrunner-worktree-guard.test.ts): guarded コマンドが exit 2 になることを検証。
- TC-WG-004/007/008: 非 guarded コマンドが通常フローに進むことを検証。

**R6: deprecated flag は通常 help に出ず移行エラー挙動を保つ**

- `login` spec の `provider` フラグが `deprecated: { message: (value?) => ... }` として宣言されていることをコードで確認。
- `LOGIN_USAGE` に `--provider` が含まれないことをコードで確認。
- `parseFlags()` が deprecated フラグ検出時に即 `FlagParseError` を投げ、値に応じたメッセージを返す実装を確認。
- TC-001 (login.test.ts): LOGIN_USAGE に `--provider` が含まれないことを検証。
- TC-002 (login.test.ts): `--provider claude` で FlagParseError + `credentials set claude-code` を含むメッセージを検証。

**R7: help (top-level / parent / leaf) は CommandSpec から生成され pin 文言を保持する**

- `generateTopLevelUsage()` が COMMANDS を反復してグループ別に USAGE を生成していることをコードで確認。
- `USAGE: string = generateTopLevelUsage()` として top-level USAGE が spec 反復で生成されていることを確認。
- 各 `*_USAGE` 定数が spec の `help.detail` に逐語移送されていることをコードで確認（JOB_RESUME_USAGE、ARCHIVE_USAGE、PRUNE_USAGE 等）。
- detach-output-contract.test.ts: USAGE に "job wait" / "--detach" が含まれることを検証 (PASS)。
- login.test.ts TC-001: LOGIN_USAGE に "--provider" が含まれないことを検証 (PASS)。
- resume-help.test.ts TC-007/016: "--from" / "--apply-canon" / "--adopt-commits" / "Mutually exclusive" / "Valid steps:" / "composite step" を検証 (PASS)。
- help-output-tc.test.ts TC-41: "Request commands" / "Job commands" / "request new" / "request ls" / Aliases に run のみを検証 (PASS)。
- prune-usage.test.ts TC-023: job prune 行に worktree / sidecar が含まれることを検証 (PASS)。

**R8: hint / guide の実在検査は spec 由来の列挙 API を使う**

- `hint-command-existence.test.ts`: `listCommandPaths({ includeAliases: true })` から `registeredCommands` を構築し、STATUS_HINTS / pollTimeoutError / PROVIDER_READINESS_HINTS の top-level 検証に使用していることを確認。
- `hint-command-references.test.ts` TC-003: `listCommandPaths` から `buildSubcommandMap()` を構築し、src/**/*.ts の hint 文字列を top-level / subcommand の両レベルで検証していることを確認。
- `run` が `listCommandPaths({ includeAliases: true })` に含まれるため、run を参照する hint は実在扱いされる。

**R9: dispatch は単一 flow に統一され SpecRunnerError を両経路で正規化する**

- `bin/specrunner.ts` が `resolveCommand → help pre-scan → worktreeGuard → parseFlags → buildCommandContext → requiresRepo → handler → unified catch` の単一パイプラインを実装していることを確認（旧 subcommand / normal 二重 dispatch が廃止）。
- 統一 catch が FlagParseError（exit 2）/ SpecRunnerError（Error:/Hint:/exitCode）/ その他（Fatal: + exit 1）を共通で処理していることを確認。
- 未知コマンド文言（`Unknown command:` / `Unknown ${parent} subcommand:`）が保存されていることを確認。
- TC-023 (command-spec-api.test.ts): job cancel handler から投げた SpecRunnerError が "Error:" / "Hint:" 表示になることを検証。

### request.md 受け入れ基準チェック

全 10 項目を確認:

| Criterion | Status |
|-----------|--------|
| 全 public command path が列挙 API から取得でき canonical / alias 区別をテストで固定 | PASS |
| `run` が `job start` alias として解決され flags / guard / requiresRepo が target と同一に働くことをテストで固定 | PASS |
| doctor default action と doctor repair が command path として表現され repo 要件をテストで固定 | PASS |
| requiresRepo 継承・override 機構をテスト用 spec で固定、全 public command の repo requirement が移行前と同一 | PASS |
| worktree guard が spec 宣言から導出され手書き Set が存在しないこと | PASS |
| deprecated flag (login --provider) が通常 help に出ず移行エラー挙動が保たれることをテストで固定 | PASS |
| top-level / parent / leaf help が CommandSpec から生成され pin テストが全て green | PASS |
| dispatch が単一 flow に統一され SpecRunnerError が両経路で Error/Hint/exitCode 表示になることをテストで固定 | PASS |
| 挙動保存: 既存 behavioral / output contract テストが無改変で green | PASS |
| typecheck && test が green | PASS |

## 検証できなかった項目

None。全 Scenario を実装コードおよびテスト通過で確認した。

## Findings 詳細

指摘なし。全 normative 要件を充足している。

### 計画との相違（非 finding）

- **handler-local SpecRunnerError catch の残存**: resume / reopen / attach / archive / prune の handler が独自の try/catch で SpecRunnerError を捕捉している。format は統一 catch と同一（Error:/Hint:/exitCode）であり、exit code も不変。tasks.md T-04 の「集約できるものは集約する」の方針に従った選択であり spec 違反ではない。
- **hint-command-existence.test.ts の PROVIDER_READINESS_HINTS サブコマンド二次検証**: top-level は `listCommandPaths` を使用するが、subcommand の二次検証で `COMMANDS[verb]` を直接参照している。`hint-command-references.test.ts` TC-003 が `listCommandPaths` で src 全体の包括的検証を行っているため、実質的な網羅性は担保されている。
