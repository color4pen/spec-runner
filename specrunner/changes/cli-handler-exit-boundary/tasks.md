# Tasks: CommandHandler exit code 返却契約と process.exit の dispatch 境界集約

> 実行順序は T-01 → T-12 の番号順とする。特に **T-01 は production ファイル（`src/cli/**`, `bin/specrunner.ts`）を一切変更しない状態で完了し、単独 commit すること**（base fixture の証明力のため / design D6）。

## T-01: 終了契約の base fixture を production 変更前に採取する

- [ ] `src/cli/__tests__/exit-contract-cases.ts` を新規作成し、ケース定義のデータのみを export する。各ケースは `{ id, argv, setup }` を持つ（`setup` は mock の振る舞い指定を表す純データ。例: `{ kind: "archive-resolve", value: 7 }` / `{ kind: "archive-reject-specrunner-error", code, hint, message, exitCode }` / `{ kind: "archive-reject-plain", message }` / `{ kind: "worktree", isWorktree: true, mainWorktreePath }` / `{ kind: "no-repo" }` / `{ kind: "none" }`）
- [ ] 次の 23 ケースを定義する（ID は固定文字列。要件 5 の 11 分類をすべて覆う）
  - `EC-01-success-zero`: `["job","archive","my-slug"]` + `runArchive` → `0`
  - `EC-02-primitive-nonzero`: `["job","archive","my-slug"]` + `runArchive` → `7`
  - `EC-03-handler-usage-error`: `["job","archive"]`（slug も `--from-issue` も無し）
  - `EC-04-handler-semantic-error`: `["request","validate","BAD_SLUG"]`
  - `EC-05-flag-parse-error`: `["run","--issue","abc","my-slug"]`
  - `EC-06-specrunner-error-exit2`: `["job","archive","my-slug"]` + `runArchive` が `exitCode` 2 の `SpecRunnerError` を reject
  - `EC-07-specrunner-error-exit1`: 同上で `exitCode` 1
  - `EC-08-unexpected-error`: `["job","archive","my-slug"]` + `runArchive` が plain `Error("boom")` を reject
  - `EC-09-top-level-help`: `["--help"]`
  - `EC-10-command-help`: `["job","archive","--help"]`
  - `EC-11-version`: `["--version"]`
  - `EC-12-no-args`: `[]`
  - `EC-13-unknown-command`: `["nope"]`
  - `EC-14-unknown-subcommand`: `["job","nope"]`
  - `EC-15-needs-subcommand`: `["request"]`
  - `EC-16-worktree-guard`: `["job","archive","my-slug"]` + `detectWorktree` → `{ isWorktree: true, mainWorktreePath: "/main/repo" }`
  - `EC-17-repo-guard`: `["job","stats"]` + `buildCommandContext` → `{ repoRoot: null, invokerCwd: "/tmp/not-a-repo" }`
  - `EC-18-start-from-issue-positional-exclusive`: `["job","start","--from-issue","5","my-slug"]`
  - `EC-19-start-from-issue-issue-exclusive`: `["job","start","--from-issue","5","--issue","3"]`
  - `EC-20-start-detach-json-exclusive`: `["job","start","--detach","--json","my-slug"]`
  - `EC-21-resume-from-issue-positional-exclusive`: `["job","resume","--from-issue","5","my-slug"]`
  - `EC-22-archive-slug-from-issue-exclusive`: `["job","archive","my-slug","--from-issue","5"]`
  - `EC-23-resume-missing-slug`: `["job","resume"]`
- [ ] `src/cli/__tests__/exit-contract-harness.ts` を新規作成する。`runCase(caseDef)` は次を行う
  - `process.argv` を `["node","specrunner", ...argv]` に設定する
  - `process.stdout.write` / `process.stderr.write` を spy し、書き込み文字列を配列へ蓄積する
  - `process.exit` を spy し、**最初の呼び出し時に** `{ exitCode, stdout: [...], stderr: [...] }` をスナップショットしてから一意の sentinel を throw する。2 回目以降の呼び出しはスナップショットを更新しない
  - `await import("../../../bin/specrunner.js")` して `main()` を呼び、sentinel でも通常 return でも最初のスナップショットを返す（`main()` が exit せず正常 return した場合は `exitCode: null` を返す）
  - 出力文字列中の絶対パス（`process.cwd()`）を `<CWD>` に、`mainWorktreePath` 等の環境依存値を固定文字列に正規化する
- [ ] `src/cli/__tests__/cli-exit-contract.test.ts` を新規作成する
  - `vi.mock` で `../archive.js`（`importOriginal` を spread し `runArchive` のみ差し替え）、`../../core/worktree/detection.js`（`detectWorktree` 既定 `{ isWorktree: false }`）、`../command-context.js`（`buildCommandContext` 既定 `{ repoRoot: <cwd>, invokerCwd: <cwd> }`）を用意する
  - `afterEach` で `vi.restoreAllMocks()` / `vi.resetModules()` を行い、ケース間の module state を分離する
  - 期待 case ID 一覧をテスト内にハードコードし、fixture の key 集合と完全一致することを assert する
  - 各ケースについて fixture の `{ exitCode, stdout, stderr }` と `runCase` の結果を `toEqual` で比較する
- [ ] `src/cli/__tests__/dump-exit-contract.ts`（fixture 生成スクリプト）を追加し、ファイル冒頭に再生成手順を JSDoc で記載する。生成物を `src/cli/__tests__/fixtures/cli-exit-contract.base.json` として出力する
- [ ] production を一切変更していない状態で fixture を生成し、`bun run test` で `cli-exit-contract.test.ts` が green であることを確認する
- [ ] このタスクの成果物のみを 1 commit にまとめる（`src/cli/*.ts` の production ファイルと `bin/specrunner.ts` を含めない）

**Acceptance Criteria**:
- `src/cli/__tests__/fixtures/cli-exit-contract.base.json` が存在し、23 件の case ID をすべて含む
- 各 fixture エントリが `exitCode`（number）と `stdout` / `stderr`（string 配列）を持ち、`EC-01` の `stderr` は空である
- fixture を生成した commit の diff に `src/cli/*.ts`（`__tests__` 配下を除く）および `bin/specrunner.ts` が含まれない
- `bun run typecheck` と `bun run test` が green

---

## T-02: CommandHandler 型を `Promise<number>` に変更する

- [ ] `src/cli/command-handler.ts` の `CommandHandler` を `(parsed: ParsedArgs, ctx?: CommandContext) => Promise<number>` に変更する
- [ ] JSDoc に「handler は process を終了させず exit code を返す。termination は `bin/specrunner.ts` の dispatch 境界が所有する」旨を記載する
- [ ] `Promise<void | number>` / optional result / 旧契約用 type alias を導入しない
- [ ] `bun run typecheck` を実行し、型エラーになった handler 一覧を移行対象リストとして控える（T-03 〜 T-07 の網羅チェックに使う）

**Acceptance Criteria**:
- `src/cli/command-handler.ts` に `Promise<number>` を返す `CommandHandler` の定義が 1 つだけ存在する
- `Promise<void>` を返す handler 型・adapter 型が `src/cli` に存在しない
- この時点で `bun run typecheck` は handler 未移行によるエラーのみを報告する（型契約以外の新規エラーが出ない）

---

## T-03: 単純な 1 行 adapter handler を返却型へ移行する

対象（`process.exit(await primitive(...))` を `return await primitive(...)` へ 1:1 置換。分岐・出力・順序は変えない）:

- [ ] `src/cli/init.ts` `handleInit`
- [ ] `src/cli/login.ts` `handleLogin`
- [ ] `src/cli/credentials.ts` `handleCredentialsSet`
- [ ] `src/cli/config-effective.ts` `handleConfigEffective`
- [ ] `src/cli/inbox.ts` `handleInboxRun`
- [ ] `src/cli/managed.ts` `handleRuntimeSetup` / `handleRuntimeStatus` / `handleRuntimeReset`
- [ ] `src/cli/job-show.ts` `handleJobShow`
- [ ] `src/cli/guide-handler.ts` `handleGuide`（`runGuide` は同期。`return runGuide(parsed.positional)`）
- [ ] `src/cli/usage-handler.ts` `handleUsage`（slug 有無の 2 分岐をそのまま return 化）
- [ ] `src/cli/scaffold-handlers.ts` `handleRulesNew` / `handleReviewersNew`
- [ ] `src/cli/ps.ts` `handleJobLs` / `handleJobStats`（`handleJobLs` の GitHub client 構築 try/catch fallback は**削除せず維持**する）
- [ ] 各関数の戻り型注釈を `Promise<number>` に更新する
- [ ] `/* c8 ignore next N */` の N が実際の行数とずれた場合のみ調整する（それ以外の format 変更をしない）

**Acceptance Criteria**:
- 上記 13 module の handler がすべて `Promise<number>` を宣言し、`process.exit` を呼ばない
- `ps.ts` `handleJobLs` の 2 重 catch（config fallback / token fallback）が変更前と同一の構造で残っている
- `src/cli/ps.ts`, `src/cli/init.ts`, `src/cli/login.ts`, `src/cli/credentials.ts`, `src/cli/config-effective.ts`, `src/cli/inbox.ts`, `src/cli/managed.ts`, `src/cli/job-show.ts`, `src/cli/guide-handler.ts`, `src/cli/usage-handler.ts`, `src/cli/scaffold-handlers.ts` の `process.exit` 呼び出しが 0 件

---

## T-04: 検証分岐を持つ handler を返却型へ移行する

- [ ] `src/cli/request-handlers.ts`: `handleRequestNew` / `handleRequestPrompt` / `handleRequestLs` / `handleRequestTemplate` / `handleRequestValidate` の 7 箇所を移行する。`handleRequestValidate` の 2 つの早期終了（invalid slug → 2、slug 解決失敗 → 1）は `return 2` / `return 1` にし、`logError` / `stderrWrite` の呼び出しと順序を変えない
- [ ] `src/cli/job-wait.ts` `handleJobWait`: slug 欠落時の `stderrWrite` + `return EXIT_CODE.ARG_ERROR`、正常時の `return await runJobWait(...)`
- [ ] `src/cli/cancel.ts` `handleJobCancel`: jobId 形式不正時の `logError` + `return EXIT_CODE.ARG_ERROR`、正常時の `return await runCancel(...)`。`SpecRunnerError` は現行どおり上位へ伝播させる（catch を追加しない）
- [ ] 早期 return 後の変数 narrowing が `process.exit`（never）時と同じであることを確認し、`!` の追加・削除を行わない

**Acceptance Criteria**:
- `request-handlers.ts` / `job-wait.ts` / `cancel.ts` の `process.exit` 呼び出しが 0 件
- 3 module の handler がすべて `Promise<number>` を宣言する
- 検証条件式・エラー文言・出力関数（`logError` / `stderrWrite`）・出力順序が変更前と一致する

---

## T-05: `process.exit` 専用の void wrapper を削除し、start / resume / reopen handler を移行する

- [ ] `src/cli/run.ts` から `runRun`（`Promise<void>`）を削除する。`runRunCore` は変更しない
- [ ] `src/cli/resume.ts` から `runResume`（`Promise<void>`）を削除する。`runResumeCore` は変更しない
- [ ] `src/cli/reopen.ts` から `runReopen`（`Promise<void>`）を削除する。`runReopenCore` は変更しない
- [ ] `src/cli/job-start-handler.ts` `handleJobStart` を移行する
  - 4 つの排他 / 必須チェックを `return EXIT_CODE.ARG_ERROR` に置換（順序・文言不変）
  - `--from-issue` 経路: `return await runFromIssue(...)`
  - `--detach` 経路: slug 解決失敗は `return EXIT_CODE.GENERAL_ERROR`、`return await detachSelf(...)`
  - `--issue` 経路: config / token / origin の 3 catch は**維持**し、`process.exit(EXIT_CODE.GENERAL_ERROR)` を `return EXIT_CODE.GENERAL_ERROR` に置換。`startWithIssueLink` の結果は `return code`
  - 末尾の `await runRun(...)` を `return await runRunCore(requestMdPath, { logLevel, json, noWorktree })` に置換する（options の内容を変えない）
- [ ] `src/cli/job-resume-handler.ts` `handleJobResume` を移行する
  - `--detach`/`--json` 排他、`--from-issue`/positional 排他を `return EXIT_CODE.ARG_ERROR` に置換
  - `--prompt-file` 読み取り catch は**維持**し、`process.exit(1)` を `return 1` に置換
  - `--prompt` / `--prompt-file` 排他の `FlagParseError` throw、slug 欠落時の `FlagParseError` throw は現行どおり throw のまま残す
  - `--from-issue` 経路: `return await runResumeFromIssue(...)`
  - `--detach` 経路: slug 不正は `return EXIT_CODE.GENERAL_ERROR`、`return await detachSelf(...)`
  - 末尾の `try { await runResume(...) } catch { SpecRunnerError → Error/Hint/exitCode; else Fatal/1 }` を、catch ごと削除して `return await runResumeCore(parsed.positional, { ...現行と同一の options })` にする（error は境界へ伝播）
- [ ] `src/cli/reopen.ts` `handleJobReopen` を移行する
  - `--reason` 欠落を `return EXIT_CODE.ARG_ERROR` に置換
  - `try { await runReopen(...) } catch { ... }` を、catch ごと削除して `return await runReopenCore(parsed.positional!, { ...現行と同一の options })` にする

**Acceptance Criteria**:
- `runRun` / `runResume` / `runReopen` の識別子が production コード（`src/`, `bin/`）に存在しない
- `run.ts` / `resume.ts` / `reopen.ts` / `job-start-handler.ts` / `job-resume-handler.ts` の `process.exit` 呼び出しが 0 件
- `runRunCore` / `runResumeCore` / `runReopenCore` の signature と本体が変更されていない
- `handleJobStart` の 3 つの domain catch（config / GitHub token / git origin）と `handleJobResume` の `--prompt-file` catch が維持されている

---

## T-06: 共通変換だけを行う catch を削除して archive / prune / attach を移行する

- [ ] `src/cli/job-archive-handler.ts` `handleJobArchive`
  - XOR チェック 2 件を `return EXIT_CODE.ARG_ERROR` に置換（`logError` / `stderrWrite(ARCHIVE_USAGE)` の順序不変）
  - `try { process.exit(await runArchiveFromIssue(...)) } else { process.exit(await runArchive(...)) } catch { ... }` を、catch ごと削除して `return await runArchiveFromIssue(...)` / `return await runArchive(...)` にする
  - `--merge-wait-ms` の lenient parse ロジックを変更しない
- [ ] `src/cli/prune.ts` `handleJobPrune`: catch を削除し `return await runPrune({ force, repoRoot: ctx!.repoRoot! })` にする
- [ ] `src/cli/attach.ts` `handleJobAttach`: `--branch` 欠落を `return EXIT_CODE.ARG_ERROR` に置換し、catch を削除して `return await runAttach({...})` にする
- [ ] 削除した catch は design D8 の判定基準（`SpecRunnerError` → `Error:`/`Hint:`/`err.exitCode` と 非 `SpecRunnerError` → `Fatal:`/1 の 2 分岐のみで構成される）に合致するものだけであることを確認する

**Acceptance Criteria**:
- `job-archive-handler.ts` / `prune.ts` / `attach.ts` の `process.exit` 呼び出しが 0 件
- 3 module に `SpecRunnerError` を `Error:` / `Hint:` 形式で表示する catch が残っていない
- `T-05` と合わせて削除した「共通変換のみの catch」が合計 5 件である（job-resume-handler / job-archive-handler / reopen / prune / attach 各 1 件）

---

## T-07: doctor handler を移行し、既存の catch 挙動を維持する

- [ ] `src/cli/doctor.ts` `handleDoctor`: `try { process.exit(await runDoctor({...})) } catch { stderrWrite("Fatal: ...") ; process.exit(EXIT_CODE.GENERAL_ERROR) }` を `try { return await runDoctor({...}) } catch { stderrWrite("Fatal: ..."); return EXIT_CODE.GENERAL_ERROR }` にする。**catch を削除しない**（`SpecRunnerError` 分岐が無い既存挙動を維持するため）
- [ ] `src/cli/doctor.ts` `handleDoctorRepair`: slug 欠落を `return 2`、成功を `return 0`、catch 内を `return EXIT_CODE.GENERAL_ERROR` にする。`stderrWrite` の文言（末尾 `\n` を含む）を変更しない。既存の到達不能な `return;` を削除する
- [ ] 両関数の戻り型注釈を `Promise<number>` にする

**Acceptance Criteria**:
- `doctor.ts` の `process.exit` 呼び出しが 0 件
- `handleDoctor` の catch が残り、`SpecRunnerError` を `Error:` / `Hint:` に変換していない
- `handleDoctorRepair` の 3 つの出力（usage 2 行 / 成功 message / error message）の文言と改行が変更前と同一

---

## T-08: dispatch 境界に process termination と共通 error 変換を集約する

- [ ] `bin/specrunner.ts` の dispatch を次の構造にする（design D3）
  - `let code: number;` を宣言し、`try { code = await spec.handler!(parsed, ctx); } catch (e) { ...共通変換して process.exit... }` とする
  - **`process.exit(code)` を try/catch の外側**に置く。try block の内側で `process.exit` を呼ばない
- [ ] dispatch の catch は現行の 3 分岐（`FlagParseError` → message + `spec.help?.detail ?? USAGE` + exit 2 / `SpecRunnerError` → `Error:` + `Hint:` + `e.exitCode` / その他 → `Fatal:` + exit 1）を文言・改行・出力先・順序ともに維持する
- [ ] error boundary の stderr 書き込みを `src/logger/stdout.js` の mask seam 経由に変更する（design D5）。対象は次の 3 変換のみ
  - `parseFlags` の catch 内 `FlagParseError` message / `Fatal:` 行
  - dispatch catch 内の `Error:` / `Hint:` / `Fatal:` 行
  - usage 本文（`spec.help?.detail ?? USAGE`）の書き込みも同じ seam を通す
  - help / version / no-args / unknown command / unknown subcommand / needs-subcommand / guard の各出力は**変更しない**
- [ ] `emitHelp` / 各 guard / `resolveCommand` 分岐の `process.exit` はそのまま維持する（design D4）
- [ ] `main()` の signature（`Promise<void>`）と末尾の `main().catch(...)` を変更しない

**Acceptance Criteria**:
- `bin/specrunner.ts` に `process.exit(await spec.handler` の形の呼び出しが存在しない（exit は try/catch の外の 1 箇所）
- handler が `0` を返したとき、stderr へ何も追加出力されずに `process.exit(0)` が 1 回だけ呼ばれる
- handler が `7` を返したとき `process.exit(7)` が呼ばれる
- `bun run typecheck` が green（catch 節が `never` で終わるため `code` の definite assignment が成立する）
- `cli-exit-contract.test.ts` の 23 ケースすべてが base fixture と一致する

---

## T-09: 契約変更に伴う stale な JSDoc を更新する

- [ ] `src/cli/cancel.ts` の `runCancel` JSDoc: 「Caller (bin/specrunner.ts) is responsible for process.exit().」を「Caller returns this exit code to the dispatch boundary.」相当に書き換える
- [ ] `src/cli/prune.ts` の `runPrune` JSDoc: 同様（`command-registry.ts` という古い caller 記述も現状に合わせる）
- [ ] `src/cli/archive.ts` の `runArchive` JSDoc: 同様
- [ ] `src/cli/doctor.ts` の `runDoctor` JSDoc: 同様。「Exit code 2 (crash) is handled by the outer try/catch in bin/specrunner.ts」という記述は `handleDoctor` の実挙動（`Fatal:` + exit 1）と食い違うため、実挙動を記述するよう修正する
- [ ] 上記 4 ファイル以外の comment / format を変更しない

**Acceptance Criteria**:
- `grep -rn "process\.exit(" src/cli --include="*.ts" | grep -v "/__tests__/" | wc -l` が **0**
- 4 ファイルの JSDoc が「handler は exit code を返し、termination は dispatch 境界が行う」ことを記述している

---

## T-10: 既存テストを新契約へ追随させる（assertion 値は変更しない）

- [ ] `runRun` / `runResume` を `vi.mock` している全テストの mock 対象を `runRunCore` / `runResumeCore` に差し替える。対象: `tests/unit/cli/run-json-flag.test.ts`, `tests/unit/cli/help-flag-dispatch.test.ts`, `tests/unit/cli/resume-help.test.ts`, `tests/unit/cli/doctor-help.test.ts`, `tests/unit/cli/doctor-repair.test.ts`, `tests/unit/cli/removed-commands.test.ts`, `tests/unit/cli/job-stats-repo-root.test.ts`, `tests/unit/cli/command-spec-api.test.ts`, `tests/unit/cli/runtime-tc.test.ts`, `tests/unit/cli/version-flag.test.ts`, `tests/unit/cli/specrunner-worktree-guard.test.ts`, `tests/unit/cli/request-new-repo-root.test.ts`, `tests/unit/cli/specrunner-resume-dispatch.test.ts`, `tests/unit/inbox/run-inbox-inbox-origin.test.ts`, `src/cli/__tests__/detach-flag-cli.test.ts`, `src/cli/__tests__/from-issue.test.ts`, `src/cli/__tests__/resume-from-issue.test.ts`, `src/cli/__tests__/command-registry-*.test.ts`（実際の対象は `runRun|runResume` の grep で確定する）
  - mock が `mockResolvedValue(undefined)` の場合は `mockResolvedValue(0)` にする（primitive の契約が number であるため）
  - **assert している options / slug / 呼び出し回数は変更しない**
- [ ] handler を直接呼ぶテスト（例: `tests/unit/cli/doctor-repair.test.ts` の `repairSpec.handler!(parsed, undefined)`）を、throw ではなく返却値を受け取る形に変える。**期待する exit code の値は変更しない**（`expect(result).toBe("process.exit(2)")` → `expect(await handler(...)).toBe(2)` のように、値 2 を保つ）
- [ ] `tests/cli.test.ts` の `runRun` 参照（`rejects.toThrow("process.exit called")`）を `runRunCore` の返却値検証に置き換える。期待する exit code の値は変更しない
- [ ] `bin/specrunner.ts` 経由（`main()`）で駆動しているテストは、mock が exit を throw する既存 idiom のまま動作することを確認する。動作が変わる場合のみ最小限修正し、変更理由をコメントに残す
- [ ] テスト内の期待文言（stdout / stderr の文字列）を一切変更しない

**Acceptance Criteria**:
- `grep -rn "runRun\b\|runResume\b\|runReopen\b" src tests bin --include="*.ts"` が `runRunCore` / `runResumeCore` / `runReopenCore` 以外にヒットしない
- `bun run test` が green
- テスト差分に、stdout / stderr の期待文言および期待 exit code の**値**の変更が含まれない（mock 対象名・受け取り方の変更のみ）

---

## T-11: architecture ratchet に Check 7〜10 を追加する

`src/cli/__tests__/architecture-ratchet.test.ts` を拡張する。すべて `@typescript-eslint/parser` の AST 走査で実装し、各 Check に合成ソースによる regression guard を付ける。

- [ ] **Check 7**: `src/cli/**/*.ts`（`__tests__` と `*.test.ts` を除く）に `process.exit` の `CallExpression` が 0 件であること
  - regression guard 1: `process.exit(1)` を含む合成ソースで 1 件検出される
  - regression guard 2: `/** … process.exit() … */` のみを含む合成ソースで 0 件になる
- [ ] **Check 8**: handler 契約の適合
  - `command-handler.ts` の `CommandHandler` 型 alias の戻り型が `Promise<number>` である
  - `command-registry.ts` の AST から handler 識別子と import 元 module を収集し、各 module の同名 export 関数宣言の戻り型注釈が `Promise<number>` である（30/30）
  - 収集した handler 識別子数が `COMMANDS` tree を走査した handler 数と一致する
  - 戻り型注釈が `Promise<void>` の handler が 0 件である
  - regression guard: `Promise<void>` を宣言する合成 handler module を与えると違反として報告される
- [ ] **Check 9**: `process.exit` 所有先の非再分散
  - `src/**` と `bin/**`（`__tests__` / `*.test.ts` を除く）を AST 走査し、`process.exit` call を含むファイル集合が `{ "bin/specrunner.ts", "src/core/runtime/local.ts", "src/core/runtime/managed.ts" }` と厳密一致する
  - allowlist に「後者 2 件は signal handler であり本 request の対象外」と明記する
  - regression guard: 合成ソース集合に第 4 のファイルを混ぜると違反として報告される
- [ ] **Check 10**: entrypoint が CommandSpec 以外の分岐を持たない
  - `bin/specrunner.ts` の AST に `SwitchStatement` が存在しない
  - `spec.handler` の呼び出しが 1 箇所のみである
- [ ] ファイル冒頭の Check 一覧コメントを Check 1〜10 に更新し、before / after の実測値（design の計測方法に対応）を記載する

**Acceptance Criteria**:
- `architecture-ratchet.test.ts` に Check 7 / 8 / 9 / 10 の `describe` が存在し、すべて green
- 各 Check に少なくとも 1 つの regression guard（違反を検出できることを示す合成ソース test）がある
- Check 7 の検出関数がコメント内の `process.exit()` を違反として報告しない
- 既存 Check 1〜6 が変更なしで green

---

## T-12: 全体検証と PR 本文用の実測値採取

- [ ] `bun run build` / `bun run typecheck` / `bun run test` / `bun run lint` をすべて実行し green を確認する
- [ ] 次の before / after を同一コマンド・同一 AST 集計で採取し、`architecture-ratchet.test.ts` の header コメントに記録する（before は base commit `de88d1b5` に対して同じコマンドを実行して得る）
  - `CommandHandler` return type（before: `Promise<void>` / after: `Promise<number>`）
  - 移行済み handler 数 / 全 handler 数（before: 0/30 / after: 30/30）
  - production `src/cli` の `process.exit` **text 一致**件数とファイル数（before: 74 / 24、after: 0 / 0）— コマンド: `grep -rn "process\.exit(" src/cli --include="*.ts" | grep -v "/__tests__/"`
  - production `src/cli` の `process.exit` **AST call expression** 件数とファイル数（before: 70 / 23、after: 0 / 0）— ratchet Check 7 の集計関数を用いる
  - `bin/specrunner.ts` の `process.exit` 件数（before: 15 / after: 実測）
  - handler 内で共通 error-to-exit 変換だけを行う catch 数（before: 5 / after: 0）— design D8 の判定基準に基づく手作業計測であることを併記する
  - migration shim / adapter 数（before: 3 = `runRun`/`runResume`/`runReopen` / after: 0）
  - CLI 終了契約の base / candidate 比較ケース数（23）
  - value-import SCC 数（`src/` 全体 / `src/cli` 内。before / after ともに 0）
- [ ] いずれかの値が取得できない場合は推測で埋めず、取得不能理由を記録する
- [ ] `tasks.md` の全 checkbox を更新する
- [ ] 次のいずれかが必要になった場合はスコープを広げず停止して報告する: stdout / stderr / exit code の変更、parser / resolver / guard 順序の変更、下位 primitive または core domain result の再設計、command 出力の result object 化、public CLI interface の破壊、R4 provider lifecycle への変更、新しい architecture layer または ADR が必要な境界判断

**Acceptance Criteria**:
- `bun run build` / `bun run typecheck` / `bun run test` / `bun run lint` がすべて green
- 上記 9 項目の before / after が採取方法つきで記録されている
- `src/cli` の `process.exit` が text 集計・AST 集計ともに 0 件
- `cli-contract-snapshot.test.ts`（CommandSpec 構造）と `cli-exit-contract.test.ts`（終了契約 23 ケース）がともに green
- 停止条件に該当する変更が実装に含まれていない
