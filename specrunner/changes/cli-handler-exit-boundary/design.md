# Design: CommandHandler を exit code 返却契約へ変更し process.exit を dispatch 境界へ集約する

## Context

### R3a（#1108 / PR #1109, `main@de88d1b5`）到達点

`CommandSpec` tree（`src/cli/command-registry.ts`）が command path / flags / args / help / guards / handler reference の正本であり、inline handler は 21 module へ named export として抽出済みである。R3a では「挙動を変えない」ことを優先し、`process.exit` は handler 側へそのまま移設された。

### 現状の実測（本 worktree, `main@de88d1b5` 基準）

| 項目 | 値 | 取得方法 |
|---|---|---|
| `CommandHandler` return type | `Promise<void>` | `src/cli/command-handler.ts:11` |
| `CommandSpec.handler` エントリ数 | 30 | `command-registry.ts` |
| handler 所有 module 数 | 21 | `command-registry.ts` の handler import |
| `src/cli/**/*.ts`（`__tests__` 除外）の `process.exit(` **text 一致** | **74 件 / 24 ファイル** | `grep -rn "process\.exit(" src/cli --include="*.ts" \| grep -v "/__tests__/"` |
| 同 **AST call expression** | **70 件 / 23 ファイル** | 上記のうち 4 件は JSDoc 内の文字列（下記） |
| `bin/specrunner.ts` の `process.exit(` | 15 件 | `grep -c` |

**text 一致と AST 一致が食い違う 4 件**（すべて「呼び出し責務は caller にある」と説明する JSDoc 行）:

- `src/cli/cancel.ts:68`
- `src/cli/prune.ts:30`
- `src/cli/archive.ts:87`（**このファイルは実 call が 0 件**。よって AST ベースのファイル数は 23）
- `src/cli/doctor.ts:103`

request.md の「74 件 / 24 ファイル」は text 一致（grep）の値であり、request 記載どおり正しい。本 design は両方の計測系を明示して扱い、**AST 0 件**を機械検査の正本、**grep 0 件**を副次目標（上記 4 コメントを新しい契約に合わせて書き換えることで同時に達成）とする。

### handler / primitive の現在の形

`src/cli` の下位 primitive（`runArchive` / `runAttach` / `runCancel` / `runConfigEffective` / `runCredentialsSet` / `runDoctor` / `runFromIssue` / `runInboxRun` / `runInit` / `runJobShow` / `runJobWait` / `runLogin` / `runManagedSetup` / `runManagedStatus` / `runManagedReset` / `runPrune` / `runPs` / `runReopenCore` / `runResumeCore` / `runResumeFromIssue` / `runRunCore` / `runArchiveFromIssue` / `runJobStats`）は **すでにすべて `Promise<number>` を返している**。`src/core/command/*`（`executeNew` / `executeValidate` / `executeList` / `executeTemplate` / `executePrompt` / `executeRulesNew` / `executeReviewersNew` / `showUsage` / `showUsageSummary` / `runGuide`）も同様に number を返す。

したがって handler の大半は `process.exit(await primitive(...))` という 1 行の薄い adapter であり、移行は「`process.exit(` → `return `」の置換で足りる。

例外は 3 つの void wrapper で、これは `process.exit` を呼ぶためだけに存在する:

- `src/cli/run.ts` `runRun(...): Promise<void>` = `process.exit(await runRunCore(...))`
- `src/cli/resume.ts` `runResume(...): Promise<void>` = `process.exit(await runResumeCore(...))`
- `src/cli/reopen.ts` `runReopen(...): Promise<void>` = `process.exit(await runReopenCore(...))`

いずれも production 呼び出し元は対応する handler 1 箇所のみである。

### handler 内 catch の分類（実測）

`bin/specrunner.ts` の dispatch error boundary と**表示・exit code が完全に一致する** catch は次の 5 件:

| # | 場所 | 変換内容 |
|---|---|---|
| 1 | `job-resume-handler.ts` `runResume` 呼び出し周り | `SpecRunnerError` → `Error:`/`Hint:`/`err.exitCode`、他 → `Fatal:`/1 |
| 2 | `job-archive-handler.ts` | 同上 |
| 3 | `reopen.ts` `handleJobReopen` | 同上 |
| 4 | `prune.ts` `handleJobPrune` | 同上（fatal は `EXIT_CODE.GENERAL_ERROR` = 1） |
| 5 | `attach.ts` `handleJobAttach` | 同上 |

**一致しない（＝機械的に削除してはならない）catch**:

- `doctor.ts` `handleDoctor`: `SpecRunnerError` 分岐を持たず、**すべて** `Fatal:` + exit 1 に落とす。上位へ委譲すると `SpecRunnerError` が `Error:`/`Hint:`/`exitCode` 表示に変わり observable behavior が変化する。
- `doctor.ts` `handleDoctorRepair`: `Error: <msg>\n`（`stderrWrite` により実出力は末尾 2 改行）という独自の表示で、境界の `Error:`/`Hint:` 2 行形式と異なる。
- `job-start-handler.ts` の config / GitHub token / git origin の 3 catch: `Failed to load config: …` などの domain 固有メッセージ。
- `job-resume-handler.ts` の `--prompt-file` 読み取り catch: `Cannot read prompt file '…': …` + exit 1。
- `ps.ts` `handleJobLs` の GitHub client 構築 2 重 catch: token 不在時に PR merge check を skip する **fallback**。
- `from-issue.ts` / `resume-from-issue.ts` / `archive-from-issue.ts` / `run.ts` / `resume.ts` / `reopen.ts` の primitive 内 catch: すでに exit code を返す形になっており、error code 別分岐を持つ。

### 出力 seam に関する既存 architecture 制約

`tests/unit/architecture/core-invariants.test.ts` の **B-7**（`architecture/model.md §4`）は「`src/core/` と `src/cli/` は `process.stdout/stderr.write` を直接呼ばない。`maskSensitive` seam（`src/logger/stdout.ts`）を経由すること」を allowlist 0 件で強制している。理由は「error 文字列経由の secret 漏洩防止」。

一方 `bin/specrunner.ts` は `src/` 外なので B-7 の対象外であり、現在 `process.stderr.write` を直に使う（= 非マスク）。結果として **同じ `SpecRunnerError` でも、handler が catch する command（archive / attach / prune / reopen / resume）はマスクされ、handler が catch しない command（cancel など）はマスクされない**という不整合が既にある。本変更で catch を境界へ集約すると、この不整合をどちらかに寄せる判断が必須になる（D5 参照）。

### 既存の検証資産（R3a 由来、継続利用する）

- `src/cli/__tests__/cli-contract-snapshot.test.ts` + `cli-contract-normalize.ts` + `fixtures/cli-contract.base.json`
  → `COMMANDS` tree を base fixture と全項目比較。`hasHandler` は presence のみを見るため、handler の返却型変更では壊れない（＝ CommandSpec 構造不変の証拠として本 request でもそのまま使える）。
- `src/cli/__tests__/architecture-ratchet.test.ts`（Check 1〜6）
  → AST（`@typescript-eslint/parser`）ベースの inline handler 検出 / registry の `process.exit` 禁止 / import cycle / 単一 `COMMANDS` / src/cli SCC / `./` dynamic import 禁止。本 request の ratchet はこのファイルを拡張する。
- `tests/unit/architecture/value-import-scc.test.ts`（`src/` 全体の value-import SCC = 0）。

### 制約

- production 変更は `src/cli/**`、`bin/specrunner.ts`、および上記に伴うテストのみ。`src/core` / `src/adapter` の返却型は変更しない。
- `src/core/runtime/local.ts:1566` と `src/core/runtime/managed.ts:755` の `process.exit(130)`（signal handler）は `src/cli` 外の process lifecycle であり **本 request の対象外**。
- テスト側は `process.exit` を throw する spy で駆動する既存 idiom が広く使われており（24 ファイル）、この idiom を壊さない移行順序が必要。

---

## Goals / Non-Goals

**Goals**:

1. `CommandHandler` を `(parsed, ctx?) => Promise<number>` の単一契約にし、30 handler すべてを同一 request 内で移行する。
2. production `src/cli` 内の `process.exit` 呼び出しを AST 基準で 0 件（text 基準でも 0 件）にする。
3. process termination の所有を `bin/specrunner.ts` の dispatch 境界へ集約する。
4. `FlagParseError` / `SpecRunnerError` / 予期しない error の共通変換を dispatch error boundary 1 箇所にする。domain 上意味のある catch は残す。
5. stdout / stderr / exit code / validation 順序 / guard 順序を base と candidate で同一条件比較して固定する。
6. `process.exit` の再分散と handler 契約の逸脱を AST で機械検出する ratchet を追加する。

**Non-Goals**:

- command 名 / flag / help / usage / 出力文言 / exit code の変更。
- parser → worktree guard → context / repo guard → handler の順序の再設計。
- 下位 primitive・core use case の返却型再設計（すでに `Promise<number>` のため変更不要）。
- stdout / stderr の buffered output object 化、`CommandResult` 抽象の導入、command bus / DI framework の導入。
- `process.exitCode` への全面移行。
- `src/cli` 外の process lifecycle（signal handler の `process.exit(130)`、`beforeExit` exit guard、`KeepAlive`）の変更。
- R4 の provider / session lifecycle 分割。
- unrelated な CLI cleanup / dead code 削除 / format 変更。

---

## Decisions

### D1: `CommandHandler` を `Promise<number>` へ変更し、移行 shim を一切置かない

`src/cli/command-handler.ts` の型を `(parsed: ParsedArgs, ctx?: CommandContext) => Promise<number>` に変更する。`Promise<void | number>`、`Promise<number | undefined>`、旧 handler の adapter、並行 result contract のいずれも作らない。

**Rationale**: 30 handler すべてが `process.exit(await primitive(...))` か `process.exit(EXIT_CODE.*)` の形をしており、返却型を変えるのは機械的である。中間契約を置くと「どちらの契約か」を dispatch 側で分岐する必要が生じ、集約という目的そのものを損なう。また `tsconfig` は `strict: true` なので、宣言戻り値が `Promise<number>` の関数で return を落とすと TS2366（Function lacks ending return statement）でコンパイルエラーになり、移行漏れが型検査で捕捉される。

**Alternatives considered**:
- `Promise<void | number>` の段階移行 — 全 handler を同一 request で移行する要件があり、段階の利益がない。dispatch 側に `?? 0` の暗黙既定が残り「明示的に 0 を返す」要件に反する。
- `ExitCode`（`0 | 1 | 2`）を返す — `runJobWait` / `detachSelf` / `runArchive` など既存 primitive は 0/1/2 以外を返しうる number 型であり、絞ると `as` cast が必要になって型安全性が下がる。`number` を採用する。
- `CommandResult { exitCode }` object — 「exit code 以外の情報を運ばない」という非対象事項に抵触する。

### D2: `process.exit` を持つ 3 つの void wrapper を削除し、handler は `*Core` を直接呼ぶ

`runRun`（run.ts）/ `runResume`（resume.ts）/ `runReopen`（reopen.ts）を削除し、`handleJobStart` / `handleJobResume` / `handleJobReopen` はそれぞれ `runRunCore` / `runResumeCore` / `runReopenCore` を呼んで返り値を返す。

**Rationale**: この 3 関数は `process.exit(await *Core(...))` という本体しか持たず、存在理由が「exit の呼び出し」だけである。名前を残して `*Core` の別名にすると、同一機能の 2 つの export（＝並行 contract）が残り「migration shim を残さない」要件に反する。production 呼び出し元はそれぞれ 1 箇所のみで、削除の影響は閉じている。

**Alternatives considered**:
- `runRun` を `Promise<number>` に変更して残す — `runRunCore` と完全に同義の重複 export になり、どちらを呼ぶべきかの規律が失われる。
- `*Core` を `runRun` にリネームして統合 — 影響範囲（`from-issue.ts` / `resume-from-issue.ts` / core issue-target の `startPrimitive` 注入）が広がり、本 request の目的外の diff を生む。

**影響**: `runRun` / `runResume` を `vi.mock` している既存テスト（`tests/unit/cli/*` 中心に十数ファイル）は mock 対象を `runRunCore` / `runResumeCore` へ差し替える必要がある。これは argument-forwarding を検証するテストであり、検証対象（どの options が primitive へ渡るか）は変えない。

### D3: dispatch 境界の `process.exit` は try/catch の**外側**に置く

`bin/specrunner.ts` の dispatch は「try 内で handler を呼んで exit code を変数に受ける → catch で共通変換して exit → try/catch を抜けた後に `process.exit(code)`」という構造にする。`try { process.exit(await spec.handler!(...)) }` のように try の内側で exit を呼んではならない。

**Rationale**: production では `process.exit` が never を返すので差はないが、テストは `process.exit` を throw する spy で駆動するのが本 repo の既存 idiom である。try の内側で呼ぶと、正常終了時に sentinel が自分の catch に捕まって `Fatal: process.exit(0)` という偽の出力と二重 exit を生み、契約比較テスト（D6）そのものが壊れる。catch 節は全経路が `process.exit`（`never`）で終わるため、TS の definite assignment 解析は try/catch 後の変数を確定済みとみなす。

**Alternatives considered**:
- `main()` を `Promise<number>` にして module 末尾で 1 回だけ exit する — help / version / unknown command / guard の 6 経路も return 化が必要で、`emitHelp(): never` の制御フローを崩す。既存の 24 テストファイルが `expect(result).toBe("process.exit(0)")` で main 内 exit を前提にしており、外部契約と無関係な大量差分を生む。request も「既に entrypoint が所有している終了処理は同じ境界内に維持してよい」と明示している。

### D4: entrypoint が既に所有している終了処理（help / version / no-args / unknown command / parse failure / guard）は現状のまま維持する

`bin/specrunner.ts` の 15 箇所の `process.exit` は「dispatch 境界の内側」であり、本 request では handler dispatch の 1 箇所を追加するだけにする。文言・出力先・順序・exit code は変更しない。

**Rationale**: これらは既に単一境界に集約済みであり、触ると observable behavior 変更のリスクだけが増える。要件 2 の目的は「`src/cli` からの排除」であって「bin 内の再構成」ではない。

**Alternatives considered**: bin 内でも `return` へ統一 — D3 の Alternatives と同じ理由で却下。

### D5: 共通変換を境界へ集約する際、境界側の stderr 書き込みを `maskSensitive` seam へ通す

`bin/specrunner.ts` の dispatch error boundary が出力する `FlagParseError` message / usage、`Error:` / `Hint:`、`Fatal:` の各行を、`src/logger/stdout.ts` の書き込み関数（`logError` / `stderrWrite` 相当、内部で `maskSensitive` を適用）経由にする。文言・改行・出力先・順序は 1 バイトも変えない。

**Rationale**: 集約対象の 5 catch はいずれも `stderrWrite`（マスクあり）で出力しており、境界の生 `process.stderr.write`（マスクなし）へ委譲するとマスクが外れる。これは secret を含む error message に限って観測可能な**後退**であり、B-7 invariant（「error 文字列経由の secret 漏洩防止のため cli/core は mask seam を経由する」）が明示的に守ろうとしている性質そのものである。マスクは `sk-ant-` / `gh[oprsu]_` / `github_pat_` / `sk-proj-` / `sk-svcacct-` / `sk-` + 20 文字以上という token 形状にのみ作用するため、それ以外のすべてのメッセージで出力はバイト一致する。

**Alternatives considered**:
- 境界を生 `process.stderr.write` のまま維持する — archive / attach / prune / reopen / resume の 5 command で secret マスクが失われる。security ratchet の後退であり、採らない。
- 5 つの catch を残してマスクを維持する — 要件 3（共通変換の一本化）と受け入れ条件「共通の変換が dispatch error boundary に一本化される」を満たせない。
- `bin/specrunner.ts` の全 write（help / usage / unknown command 等）を seam 経由にする — 集約と無関係な差分であり、非対象の「unrelated cleanup」に当たる。error boundary の 3 変換に限定する。

**停止条件との関係**: 本判断は「stdout / stderr の文言変更」には当たらない（非 secret 入力に対して出力は同一）。ただし secret 混入時のみ出力が変わるため、design 上の明示判断として記録し、PR 本文にも記載する。

### D6: 終了契約の base / candidate 比較は「in-process dispatch harness ＋ 先に採取した base fixture」で行う

`src/cli/__tests__/` に次を追加する。

- **case table**（データのみ）: command line 引数、必要な mock 設定、case ID を持つ 20 件以上のケース定義。要件 5 が列挙する 11 分類をすべて覆う。
- **harness**: `process.stdout.write` / `process.stderr.write` を配列へ捕捉し、`process.exit` spy が**最初に**呼ばれた時点の (exit code, stdout, stderr) をスナップショットする。以降の出力と 2 度目以降の exit は捨てる。
- **base fixture** `fixtures/cli-exit-contract.base.json`: 上記 harness を **production を一切変更していない tree（= base）** で実行して生成し、単独 commit で確定させる。
- **contract test**: candidate 実装に対して同じ case table を実行し、fixture と全件一致することを検証する。加えて case ID 集合をテスト内にハードコードして fixture と突き合わせ、ケースの黙示的な欠落を検出する。

**Rationale**: base では handler 内で、candidate では bin で exit が呼ばれるため、素朴に「throw する exit spy」で全出力を集めると base 側だけが unwind による偽の `Fatal: process.exit(0)` を上乗せしてしまい比較不能になる。**最初の exit 呼び出しでスナップショットを打ち切る**ことで、base / candidate 双方から「ユーザーが実際に観測する出力と終了コード」だけを取り出せる。

base fixture を「production 変更前に、最終形の harness で採取して単独 commit する」ことで、base worktree の再現（`git worktree add` + `node_modules` 準備）を不要にしつつ、fixture が candidate 実装から逆算されていないことを `git log`（fixture commit が `src/cli` production 変更を一切含まない）で査読者が検証できる。

**Alternatives considered**:
- subprocess で実 CLI を起動して base / candidate を比較 — 忠実だが、`SpecRunnerError` / 予期しない error / primitive の non-zero 透過を注入する手段がなく（fault injection 用の production コードを足すことになる）、base 用に worktree + 依存解決が必要で、実行時間も増える。
- base commit の worktree で vitest を実行して fixture を生成 — 実現可能だが、node_modules の共有・vitest root 制約という再現手順の脆さを持ち込む。D6 の採用案は同じ証明力をより低いリスクで得る。
- 既存テストの `process.exit` mock を単に return expectation に置換する — request が明示的に禁止している（外部契約の同一性を示せないため）。

**mock 対象の選定**: fault injection が必要なケースは、**base と candidate で呼び出し関係が変わらない cross-module primitive** だけを mock する。具体的には `src/cli/archive.ts` の `runArchive`（`job-archive-handler.ts` が別 module から import、base / candidate 同一）を用いて「0 返却」「7 返却（non-zero 透過）」「`SpecRunnerError` throw」「plain `Error` throw」を注入する。`runRun` / `runResume` は D2 で削除されるため mock 対象にしない。guard 系は `core/worktree/detection.js` の `detectWorktree` と `cli/command-context.js` の `buildCommandContext` を mock する（いずれも bin が import しており base / candidate 同一）。

### D7: 早期終了は `return EXIT_CODE.*` / primitive の返り値で表現し、制御フローの形は変えない

`if (bad) { logError(...); process.exit(EXIT_CODE.ARG_ERROR); }` は `if (bad) { logError(...); return EXIT_CODE.ARG_ERROR; }` へ、`process.exit(await f())` は `return await f()` へ 1:1 で置換する。条件式・出力・順序・分岐構造は変えない。

**Rationale**: `process.exit` は `never` を返すため TypeScript の narrowing に使われている箇所がある（例: `attach.ts` の `if (!branch) { … process.exit(2) }` 以降で `branch` が `string` に絞られる）。early `return` も同じ narrowing を与えるため、後続コードの `!` 付与や再構成は不要である。差分を 1:1 に保つことが observable behavior 不変の最良の担保になる。

**Alternatives considered**: 早期終了を例外へ寄せて境界で拾う — 出力タイミングと exit code の対応が間接化し、`SpecRunnerError` に載せ替えると文言（`Error:` / `Hint:` 付与）が変わる。却下。

### D8: 「同一変換だけを行う catch」5 件のみを削除し、判定基準を design に固定する

削除するのは、**catch 本体が `SpecRunnerError` → `Error:`/`Hint:`/`err.exitCode` と 非 `SpecRunnerError` → `Fatal:`/1 の 2 分岐だけで構成され、それ以外の副作用（retry / fallback / error code 別分岐 / domain メッセージ）を持たない** catch に限る。該当は Context に列挙した 5 件。`doctor.ts` の 2 catch を含むそれ以外は維持する。

**Rationale**: `handleDoctor` の catch は `SpecRunnerError` 分岐を持たず全部 `Fatal:`/1 に落とす。上位へ委譲すると `SpecRunnerError` の表示が `Error:`/`Hint:` に変わり exit code も `err.exitCode` になるため、observable behavior が変わる。`handleDoctorRepair` の catch は `Error: <msg>\n` という独自形式（`stderrWrite` の改行付与により実出力は空行付き）で境界の 2 行形式と異なる。機械的な削除は禁止し、判定基準を明文化する。

**Alternatives considered**: `doctor` の catch も削除して境界に寄せる — 出力と exit code が変わるため停止条件（stdout / stderr / exit code の変更）に抵触する。却下。

### D9: ratchet は既存 `architecture-ratchet.test.ts` を Check 7〜10 で拡張する（AST 検査）

`src/cli/__tests__/architecture-ratchet.test.ts` に次を追加する。いずれも `@typescript-eslint/parser` の AST 走査で、コメント文字列ではなく call expression / 型注釈ノードを判定する。

- **Check 7 — `src/cli` の `process.exit` call expression = 0**
  `src/cli/**/*.ts`（`__tests__` 除外）を走査し、`CallExpression` の callee が `process.exit` の member expression であるものを 0 件と判定する。「コメント内の `process.exit()` は検出されない」ことを合成ソースで確認する regression guard を併設する。
- **Check 8 — 全 `CommandSpec.handler` が number 返却契約に適合する**
  (a) `command-handler.ts` の `CommandHandler` 型 alias の戻り型ノードが `Promise<number>` であること。(b) `command-registry.ts` の AST から handler 識別子とその import 元 module を収集し、各 module の該当 export 関数宣言の戻り型注釈が `Promise<number>` であること（30/30）。(c) 収集した handler 数が `COMMANDS` tree 上の handler 数と一致すること。加えて `Promise<void>` 注釈の handler が 0 件であること（migration shim / 旧 adapter 残存の検出）。
- **Check 9 — `process.exit` の所有先が再分散していない**
  `src/**` と `bin/**`（`__tests__` / `*.test.ts` 除外）を AST 走査し、`process.exit` call を含むファイル集合が固定 allowlist `{ bin/specrunner.ts, src/core/runtime/local.ts, src/core/runtime/managed.ts }` と厳密一致することを検証する。後者 2 件は signal handler（本 request 非対象）であることを allowlist コメントに明記する。
- **Check 10 — CommandSpec が CLI 契約の唯一の正本であり続ける**
  `bin/specrunner.ts` の AST に `SwitchStatement` が存在せず、`spec.handler` 呼び出しが 1 箇所のみであること（command 名による分岐が entrypoint に再出現していないこと）。既存 Check 1（inline handler 0）/ Check 4（単一 `COMMANDS` export）/ `cli-contract-snapshot.test.ts`（構造の base 一致）と合わせて正本性を担保する。

**Rationale**: 既存 Check 2 は `stripComments` + 文字列一致という text ベースで、request が「AST 検査を優先」と指定している。新規 Check はすべて AST にし、各 Check に「検出できることを示す合成ソースの regression guard」を付ける（既存 Check 1/3/5/6 と同じ様式）。ファイル集合の厳密一致（Check 9）は「件数 pin」より安定で、bin 内の行数変更に追随不要である。

**Alternatives considered**:
- ESLint rule（`no-restricted-syntax`）で禁止する — lint 設定は `src` / `tests` 全体に効き、`src/core/runtime` の signal handler 用に例外コメントを production コードへ埋め込む必要が生じる。テスト内 ratchet の方が例外の所在を 1 箇所に集約できる。
- 件数を数値で pin する — bin の行数・記述変更で頻繁に更新が必要になり、ratchet が形骸化する。

### D10: `process.exit` を説明する 4 つの stale な JSDoc を新契約に合わせて更新する

`cancel.ts:68` / `prune.ts:30` / `archive.ts:87` / `doctor.ts:103` の「Caller … is responsible for `process.exit()`」という記述は、変更後は事実に反する（caller は exit せず code を返す）。これらを「Caller returns this exit code to the dispatch boundary」相当へ書き換える。

**Rationale**: 契約変更に伴う doc の整合であり unrelated cleanup ではない。副次的に grep ベースの計測でも `src/cli` の `process.exit` が 74 → 0 になり、受け入れ条件の文言（74 件 → 0 件）と計測系が一致する。

**Alternatives considered**: コメントを残す — AST ratchet は通るが、grep 計測が 4 件残り「74 → 0」の受け入れ条件を素直に示せない。かつ記述が誤りのまま残る。

---

## Risks / Trade-offs

- **[既存テストの大量修正が実装差分を覆い隠す]** → `runRun` / `runResume` の mock 差し替えと、handler を直接呼ぶテストの return 期待化で 20 前後のテストファイルに触れる。**Mitigation**: (1) テスト修正を production 移行とは別タスク（T-11）に分離し、production 側の diff を読みやすく保つ。(2) 外部契約の同一性は D6 の base fixture 比較が独立に担保するため、個々のテスト修正が期待値の書き換えでないことを review で判定できる。(3) 既存テストの assertion 値（stdout / stderr 文言、exit code）は変更しない。変更してよいのは mock 対象の symbol 名と「handler が throw する」前提の受け取り方のみ、と task に明記する。

- **[base fixture が candidate 実装から逆算される]** → fixture を後から再生成すれば、どんな挙動変化も「一致」になってしまう。**Mitigation**: fixture は production 変更前に単独 commit で確定させ、以降再生成しない。contract test に期待 case ID 一覧をハードコードし、ケース欠落を検出する。fixture commit が `src/cli` / `bin` の production ファイルを含まないことを review 観点として design に明記する。

- **[dispatch 境界の exit を try 内に置いてしまう]** → 正常終了で `Fatal: process.exit(0)` の偽出力と二重 exit が発生し、テストと fixture 比較が崩れる。**Mitigation**: D3 として設計判断に固定し、tasks の acceptance criteria に「exit 呼び出しが try block の外にあること」を明示。contract test の EC-01（正常終了 0）が stderr 空であることを検証するため回帰は必ず検出される。

- **[「同じ変換だけの catch」の判定を誤り doctor の catch を削除する]** → `SpecRunnerError` の表示と exit code が変わる。**Mitigation**: D8 で判定基準と削除対象 5 件を列挙。tasks で削除対象をファイル名付きで固定し、それ以外の catch に触れないことを acceptance criteria に置く。

- **[マスク seam 導入で bin の出力が変わる]** → secret 形状の文字列を含む error message でのみ出力が変わる。**Mitigation**: D5 に判断と根拠（B-7）を記録。非 secret 入力での出力バイト一致は D6 の contract test 全ケースが担保する。PR 本文で明示的に申告する。

- **[TypeScript の narrowing 差異で暗黙の挙動変化が入る]** → `process.exit`（never）を early return に置換する際、後続コードの型が変わり `!` の付け外しなどの追加編集を誘発する。**Mitigation**: D7 の 1:1 置換規律。`strict: true` により return 漏れは TS2366 で検出される。追加の型 assertion が必要になった箇所は review で個別に説明することを task に明記。

- **[`process.exit` 即時終了に依存した event loop 終了挙動]** → 現在は handler 内 exit で即座にプロセスが落ちるため、`KeepAlive` sentinel や残留 handle があっても終了する。**Mitigation**: 境界でも必ず `process.exit(code)` を呼ぶ（`return` して自然終了に委ねない）。D3 の構造がこれを保証する。`process.exitCode` への移行は非対象と明記済み。

- **[`archive.ts` を mock する contract case が実装変更に脆い]** → `runArchive` の signature が変わると fixture が再生成不能になる。**Mitigation**: 本 request では `archive.ts` の primitive signature を変更しない（非対象）。harness は `importOriginal` で実 module を spread し、`runArchive` のみ差し替えることで `ARCHIVE_USAGE` など他 export への依存を保つ。

---

## Open Questions

1. **D5（境界の mask seam 化）を採るか否か**は operator 判断の余地がある。採らない場合、5 command で `SpecRunnerError` / 予期しない error の secret マスクが失われる。本 design は「採る」を既定とし、採らない選択をする場合は要件 3 の一本化を維持したまま security 後退を PR 本文で申告する必要がある。
2. **`handleDoctor` の catch が `SpecRunnerError` を `Fatal:`/1 に落としている**のは、`doctor.ts:104` の JSDoc（「exit code 2（crash）は bin の外側 try/catch が扱う」）と食い違う既存の不整合である。本 request では behavior 維持のため catch をそのまま残すが、どちらが意図された挙動かは未解決であり、修正するなら別 request にすべきである（本 request で直すと exit code が変わり停止条件に抵触する）。
3. **`tests/unit/architecture/arch-allowlist.ts` の `scaffold-handlers.ts` 向け 2 エントリ**（`executeRulesNew(..., process.cwd())` / `executeReviewersNew(..., process.cwd())`）は現行実装（`ctx!.invokerCwd`）と一致しない stale entry に見える。本 request は cwd 解決に触れないため放置するが、実装中に架空 entry を検出する仕組み（あれば）が失敗した場合は、スコープを広げず報告する。
4. 「handler 内で共通 error-to-exit 変換だけを行う catch 数」は本 design の実測で **5** としたが、PR 本文には実装後に同一基準で再計測した値を載せる。判定は D8 の基準に従う（自動計測ではなく基準に基づく手作業計測であることを PR 本文に明記する）。

---

## Migration Plan

段階順序（各段階で `bun run typecheck` / `bun run test` が green であること）:

1. **base 採取**: harness / case table / contract test を追加し、production 未変更の状態で base fixture を生成・commit する。この commit は `src/cli` / `bin` の production ファイルを一切含まない。
2. **契約変更**: `CommandHandler` を `Promise<number>` へ変更する。この時点で 30 handler すべてが型エラーになる（＝移行対象の網羅リストが型検査から得られる）。
3. **handler 移行**: 薄い adapter → guard/検証付き handler → void wrapper 削除（`runRun` / `runResume` / `runReopen`）→ 共通変換 catch の削除、の順に `src/cli` を 0 件化する。
4. **境界実装**: `bin/specrunner.ts` の dispatch を exit code 受け取り＋try 外 exit に変更し、error boundary を mask seam 経由にする。
5. **テスト追随**: mock 対象と handler 直呼びテストを新契約に合わせる。assertion 値は変えない。
6. **ratchet**: Check 7〜10 を追加し、regression guard（合成ソースで検出できることの確認）を併設する。
7. **計測**: before / after を同一コマンド・同一 AST 集計で採取し PR 本文用に記録する。

**Rollback**: 段階 2〜4 は単一の型契約変更に紐づくため部分 revert はできない。切り戻しは branch 全体の revert とする。段階 1 の成果物（harness / fixture / contract test）は production に依存しないため、revert 後も base の挙動を pin する資産として単独で有効である。
