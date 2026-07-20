# Design: エラー処方の整合 — 誤診 hint の修正・廃止コマンド処方の除去・状態駆動 next steps・doctor の XDG 認識

## Context

spec-runner が出す「処方」（`SpecRunnerError.hint` と `DoctorResult.hint`）に、
状態と食い違う誤診・廃止コマンド・実際の読み込み規則と異なるパス検査が複数混在している。
いずれも実測で確認済み。本 change はエラー処方の**出力契約**と doctor の**config 解決規則**を
整合させる。port/adapter の追加や FSM 変更は無く、既存の hint 文字列・パス解決・出力整形・
1 箇所の runtime エラー変換にとどまる。

### 検証済みの現状（in-scope の事実）

- `src/git/remote.ts:34-38` / `:48-54` — origin 不在（かつ git repo 内）の停止で hint が
  `"cd into a git repository before running specrunner."`。停止した述語（origin 不在）と処方が矛盾。
  2 箇所は完全に同一の inline `SpecRunnerError`（code `NOT_GIT_REPO` / message `"Origin remote not configured."`）。
- `src/errors.ts:145-151` `notGitRepoError()` — 同文言だが**真の非 git repo** 用（`remote.ts:40,45` から使用）。
  この経路の「cd into...」は妥当なので触らない（下記 D1 の境界）。
- `src/core/doctor/checks/storage/local-state-writable.ts:42` — `hint: "Run 'specrunner ps' once..."`。
  `ps` は廃止コマンド（`COMMANDS` に無い。`bun bin/specrunner.ts ps` → `Unknown command: ps` を実測確認）。
- `src/core/doctor/checks/repo/workflow-structure.ts:59` — `"Create the missing directories manually."`。
- `src/core/doctor/checks/config/github-token-present.ts:35` / `auth/github-token-valid.ts:19` —
  三択 hint `"Set GH_TOKEN env var, run 'gh auth login', or run 'specrunner login'."`。
- `src/core/doctor/checks/config/file-exists.ts:15` — `path.join(ctx.homeDir, ".config", "specrunner", "config.json")` 固定。
  `XDG_CONFIG_HOME` を無視。読み込み側の正は `src/util/xdg.ts:18` `getConfigPath()`。
- `src/core/doctor/formatter.ts:28-82` `formatHuman` — category 群 + Summary のみ。next steps 相当は無い。
  `formatJson`（:102-137）は独立で、hint/details のみを構造化。
- `src/cli/command-registry.ts:817-834` — `doctor` エントリに `usage` フィールドが無い。
  `bin/specrunner.ts:134` `emitHelp(entry.usage)` は `undefined` 時に `NO_DETAILED_HELP_USAGE` を出す。
  `--json` フラグは実装済み。
- `src/core/runtime/local.ts:462-465` — 新規 run の `git fetch origin` 失敗時に
  `throw new Error(\`git fetch origin failed (exit N): <stderr>\`)`。`src/core/command/runner.ts:139` が
  `Failed to set up workspace: ${err.message}` としてそのまま表示。認証不良でも git の生 stderr
  （`could not read Username ... No such device or address`）が表面化する。

### 設計中に発見した波及（廃止/改名コマンド処方の広がり）

要件 2 の「歯」（実在コマンド機械検査）を**全 hint** に掛けると、名指しの `ps`（local-state-writable）
以外にも、noun-verb 再構成で改名済みの `specrunner managed setup`（→ `specrunner runtime setup`）と
`specrunner job list`（→ `specrunner job ls`）が hint 内に残存していることが露見する。
`bun bin/specrunner.ts managed setup` → `Unknown command: managed` を実測確認済み（`tests/unit/cli/removed-commands.test.ts` TC-40 も `managed` 廃止を固定）。
`runtime` コマンドは `setup|status|reset` サブコマンドを持ち、`runManagedSetup` を実行する（= 旧 `managed setup` の後継）。

これは架空 command ではなく**実在した command の廃止と hint の同期漏れ**であり、architect が
歯を要求した理由「コマンド廃止と hint の同期は規模で必ず漏れる」の実例そのものである。
歯を honest に置く以上、これらの hint も現行コマンドへ揃える必要がある（下記 D3・スコープ表を参照）。
message / recommendedAction / `logInfo` / 装飾バナー（例: `src/core/finish/escalation.ts:20` の
`"=== specrunner finish: escalation ==="`）は**処方（hint）ではない**ため歯の対象外とし、本 change では
変更しない（誤検出回避 + スコープ規律）。

## Goals / Non-Goals

**Goals**:

- 失敗した述語と処方の一致（origin 不在 → `git remote add`）。
- CLI が処方する**全 hint** から廃止/改名コマンド参照を除去し、再発を機械検査（歯）で固定。
- doctor human 出力末尾に、fail 集合から導出した順序付き next steps を出す（`--json` 構造は不変）。
- doctor の config パス検査を `getConfigPath()` と同一の解決規則に揃える（XDG 認識）。
- `doctor --help` に usage（`--json` 記載）を追加。
- README に既存プロジェクト参加者手順を追記。
- workspace 準備の `git fetch` 認証失敗を、元 stderr を保持したまま `specrunner login` 処方に変換。

**Non-Goals**:

- verdict / blocking rules・pipeline routing の変更。
- doctor の check 追加・削除（既存 check の hint / パス解決の修正のみ）。
- provider readiness の検査（別 request）。
- `--json` 出力スキーマの変更。
- 処方（hint）以外の stale 参照（message / recommendedAction / `logInfo` / バナー / prose）の一掃。
  発見したものは「観測」として本 design に記録するが、修正しない。
- hint 内の**フラグ値**の妥当性（例: `login --provider anthropic` は現行 `--provider` の許容値 `github|claude`
  と不整合だが、コマンド存在の歯の対象外。別件）。

## Decisions

### D1: origin 不在の停止を専用 factory `originNotConfiguredError()` に集約し、`git remote add` を処方する

`src/errors.ts` に factory `originNotConfiguredError()` を追加し、`src/git/remote.ts` の 2 つの同一 inline
`SpecRunnerError` をこれに置換する。hint は doctor `github-origin` check（`src/core/doctor/checks/repo/github-origin.ts:35`）
と同趣旨の `git remote add origin <url>` 系にし、`"cd into a git repository"` を含めない。
error code は既存の `NOT_GIT_REPO` を維持し exit code（`ARG_ERROR` = 2）を不変に保つ。

- **Rationale**: 2 箇所が完全同一なので factory 集約で DRY かつ T1 の単一テスト対象になる。code を維持することで
  EXIT_CODE_MAP や既存の exit-code 期待を壊さない。`notGitRepoError()`（真の非 git repo 用）は挙動が正しいので
  触らず、境界を「origin 不在」と「非 git repo」で明確に分ける。
- **Alternatives considered**:
  - 新 error code `ORIGIN_NOT_CONFIGURED` を導入 → 却下: EXIT_CODE_MAP 追加・既存 code 期待の波及が増える割に利得が薄い。
  - inline hint 文字列だけ書き換え → 却下: 2 箇所の重複が残り、テスト対象が散る。
  - `notGitRepoError()` の hint も併せて書き換え → 却下: 真の非 git repo では「cd into...」は妥当。名指しスコープ外。

### D2: doctor next steps は fail 集合から純関数で導出する（ペルソナ非依存）

`src/core/doctor/next-steps.ts` に純関数 `deriveNextSteps(results: DoctorResult[]): string[]` を新設。
check 名 → 処方文字列の**依存順**規則表を持ち、`status === "fail"` の check だけを起点に、順序を保ったまま
（重複除去して）処方列を生成する。`formatHuman` は末尾（Summary の後）に、非空のときだけ `Next steps:` 節を出す。
`formatJson` は一切呼ばず、`--json` 構造を不変に保つ。

規則表（依存順・上から評価）:

| fail した check | 処方（"Next steps" 行） | 判定文字列 |
|---|---|---|
| `git-repository` | `git init` … | "git init" |
| `github-origin` | `git remote add origin <url>` … | "git remote add" |
| `config-file-exists` | `specrunner init` … | "specrunner init" |
| `github-token-present` **または** `github-token-valid` | `specrunner login` … | "specrunner login" |

- 作成者相当（fail = git-repository / github-origin / github-token-present）→ `git init` → `git remote add` → `specrunner login`（config-file-exists が fail 集合に無ければ `specrunner init` は出ない）。
- 参加者相当（repo 系 pass、fail = config-file-exists / github-token-present）→ `specrunner init` → `specrunner login`。
- fail ゼロ → 空配列 → 節を出さない。
- **Rationale**: 固定のペルソナ手順表は実状態と食い違う（例: origin だけ欠けている参加者に `git init` を出す）。
  fail 集合からの導出なら両ペルソナに自然に一致し、機械が作成者/参加者を判別する必要も無い。token は
  present/valid のどちらの fail でも同一処方に集約（重複除去）。
- **Alternatives considered**:
  - ペルソナ別固定手順表 → 却下（architect 評価済み: 実状態と乖離、判別が不要）。
  - `formatHuman` の signature 変更で外部から手順を渡す → 却下: 呼び出し側（`src/cli/doctor.ts:220`）を巻き込むだけで、
    導出は results から自足する。
  - JSON にも next steps を足す → 却下: `--json` 構造不変（既存機械消費者保護）が要件・スコープ外。

### D3: 全 hint に対する「実在コマンド機械検査」を歯として置き、露見する stale 処方をすべて現行コマンドへ揃える

新規テスト（例 `tests/unit/cli/hint-command-references.test.ts`）で、CLI が処方する**全 hint** 文字列中の
`specrunner <sub>` 参照が実在コマンドであることを機械検査する。真実源は `src/cli/command-registry.ts` の
`COMMANDS`（`Object.keys(COMMANDS)` = 最上位コマンド集合、parent エントリの `subcommands` = 2 階層目）。

- **hint の収集範囲（誤検出回避のための構造的定義）**: 「hint」= `DoctorResult` の `hint:` プロパティ
  リテラル **+** `new SpecRunnerError(code, hint, message)` の第 2 引数リテラル。両者を `src/**/*.ts`
  （`*.test.ts` / `__tests__` を除外、コメント除去後）から静的抽出する。message / recommendedAction /
  `logInfo` / バナーは対象外（`hint:` でも SpecRunnerError 引数でもないため自然に除外され、
  `escalation.ts` の `finish` バナー等の誤検出を避けられる）。
- **判定**: 各 hint 内の `specrunner\s+<token1>[ <token2>]` について、`token1` が `-` 始まり（フラグ）なら
  skip、そうでなければ `token1 ∈ Object.keys(COMMANDS)` を要求。`COMMANDS[token1]` が parent かつ `token2` が
  存在しフラグでないなら `token2 ∈ subcommands` を要求。
- **歯を green にするための stale 処方修正**（この歯の直接の帰結。詳細は下表）:
  - `specrunner ps` → `job` 一覧系は `specrunner job ls`。local-state-writable は「初回 run で自動作成」旨の
    説明に置換（コマンド処方を外す。要件 2 が明示的に許容）。
  - `specrunner managed setup` → `specrunner runtime setup`。
  - `specrunner job list` → `specrunner job ls`。
- **Rationale**: 文言レビューのみでは `ps` の再発を防げなかった（廃止時に検査が無かった）。真実源 `COMMANDS`
  への突き合わせを歯にすれば、コマンド廃止/改名時に hint がずれた瞬間に赤くなる。歯を honest に置く以上、
  現存の stale 処方（`managed`/`job list`）も同時に揃うのは設計意図どおり。
- **Alternatives considered**:
  - 歯を local-state-writable の `ps` だけに限定 → 却下: 「全 hint」の要件に反し、`managed`/`job list` を素通し
    する偽の歯になる。
  - 廃止コマンドの denylist（`ps`/`managed`/…）と突き合わせ → 却下: architect は真実源への positive 検査を要求。
    denylist は新規廃止で必ず陳腐化する。
  - 全 string literal を対象（message/バナー含む）→ 却下: `finish` バナー等の誤検出が出る。要件の語は「hint」。

### D4: `config-file-exists` の config パスは composition root で `getConfigPath()` により解決し ctx へ注入する

`DoctorContext` に `configPath: string` を追加し、`src/cli/doctor.ts` の組み立て時に `getConfigPath()`
（`src/util/xdg.ts`、`XDG_CONFIG_HOME` 尊重）で解決した値を注入する。`file-exists.ts` は
`ctx.configPath` を参照する（`homeDir` からの手組みパスを廃止）。

- **Rationale**: 読み込み規則の正は `xdg.ts` にあり、doctor.ts は既に `getConfigPath()` を import 済み
  （`:18`, `:136`）。同一関数で解決すれば「検査が独自パス実装を持って再乖離する」ことを防げる。かつ ctx 注入
  なので doctor の port/injection パターン（`types.ts` D1: 全 check は ctx を通じ mock 可能）を保てる。
- **Alternatives considered**:
  - check 内で直接 `getConfigPath()` を呼ぶ → 却下: `getConfigPath()` は `process.env` / `os.homedir()` を
    直読みするため check が ctx で mock 不能になり、注入パターンを壊す（conformance で指摘され得る）。
  - check 側で `ctx.env` + `ctx.homeDir` から XDG ロジックを再実装 → 却下（architect 評価済み: 独自パス探索の再乖離）。
  - `ctx.homeDir` を残しつつ XDG のときだけ分岐 → 却下: 二重ロジックで乖離源が残る。
- **テスト影響**: `tests/core/doctor/checks/config/file-exists.test.ts` TC-072 は fallback パスに
  `/fake/home/.config/...` を期待する。mock-context の `configPath` 既定値をこの値にすれば TC-072 は無改変で通る
  （下記 D5 の「観測挙動保持」方針）。T6 は `configPath` を XDG 隔離パスに override して pass を固定し、
  さらに `src/cli/doctor.ts` 組み立てを通す統合テストで `XDG_CONFIG_HOME` 尊重を end-to-end に固定する。

### D5: `git fetch` 認証失敗は純関数で分類し、元 stderr を保持したまま `specrunner login` 処方に変換する

`src/core/runtime/git-fetch-error.ts`（新規・純粋）に `describeGitFetchFailure(exitCode: number, stderr: string): string`
を置く。stderr が認証系パターン（`could not read Username` / `Authentication failed` / `terminal prompts disabled`
/ `Invalid username or password` を大小文字無視で判定）に合致する場合は、第一文が
`specrunner login` を処方するメッセージを返し、続けて元の `git fetch origin failed (exit N): <stderr>` を
詳細行として保持する。非合致時は現行と**完全に同一**の文字列を返す（回帰防止）。`src/core/runtime/local.ts:464`
はこの関数の戻り値で `throw new Error(...)` する。

- **Rationale**: 生 stderr は「device が無い」と誤診を誘う。純関数に分離すれば T8 が単体で固定でき、
  非認証系の分岐は現行文字列を bit-identical に返して回帰を防げる。SpecRunnerError にはしない
  （`runner.ts` が generic Error として捕捉し `WORKSPACE_SETUP_FAILED` に包む既存フローを保つ最小変更）。
- **Alternatives considered**:
  - 生エラーのまま → 却下（誤診を誘う）。
  - git stderr を完全置換 → 却下（非典型ケースのデバッグ情報を失う。要件は「詳細として保持」）。
  - `runner.ts:139` の表示側で分類 → 却下: throw 元に近い local.ts の方が exit code / stderr を素直に扱え、
    表示側の一般ラッパを汚さない。
  - パターンを広く取る（`403` 等）→ 却下: 非認証系 fetch 失敗の回帰リスク。名指しパターン + 数個の安全な追加に限定。

### D6: `doctor --help` は registry の `usage` フィールドで供給する

`src/cli/command-registry.ts` に `DOCTOR_USAGE` 定数を定義し、`doctor` エントリに `usage: DOCTOR_USAGE` を付与する。
`bin/specrunner.ts:134` の既存 `emitHelp(entry.usage)` 経路がそのまま usage を表示する（新経路不要）。usage には
`--json` を明記する。

- **Rationale**: help 供給は既存の registry `usage` パターンに完全一致（`LOGIN_USAGE` 等と同型）。実装は定数追加
  + 1 フィールドで済み、`--help` 解決ロジックを触らない。
- **Alternatives considered**: help 専用の分岐を追加 → 却下: 既存パターンで足りる。

## Risks / Trade-offs

- **[Risk] 歯（D3）のスコープが名指しの `ps` を超え、`managed setup`（14 hint 箇所）/ `job list`（1 箇所）へ波及する**
  → Mitigation: 波及は「実在した command の廃止/改名と hint の同期漏れ」であり request の主題「エラー処方の整合」
  そのもの。修正は現行コマンドへの 1:1 置換で低リスク・可逆。対象箇所を tasks.md に列挙し、歯が green を保証する。
  本 design の「発見した波及」節で明示し、レビュー/merge で人が確認できるようにする。
- **[Risk] next steps 追加で `formatHuman` の既存テストが破れる** → Mitigation: `deriveNextSteps` は check 名の
  完全一致で発火する。既存 formatter テストの fixture 名（`a`/`b`/`c`/`config-file` 等）は規則表に無く、fail でも
  next steps は出ない。実 check 名（`git-repository` 等）を使うテストのみ影響。
- **[Risk] D4 で `DoctorContext` に必須フィールドを足すと全 mock/組み立て箇所がコンパイルエラーになる**
  → Mitigation: `mock-context.ts` に既定値（`/fake/home/.config/specrunner/config.json`）を、`src/cli/doctor.ts`
  組み立てに `getConfigPath()` を追加。型追加は 1 箇所、供給は 2 箇所で閉じる。
- **[Risk] hint 文言変更で既存テストの期待値が古くなる（T9 が明示的に許容）** → Mitigation: 影響テストを
  tasks.md に列挙（token 三択 / workflow-structure / local-state `ps` / file-exists パス / origin / agent 系 managed）。
  観測挙動（status・分岐）は保ち、文字列期待のみ更新する。
- **[Trade-off] 歯の hint 収集を「`hint:` プロパティ + SpecRunnerError 第2引数」に構造限定する** → message 等の
  stale 参照は歯の外に残る。要件の語「hint」に忠実で誤検出ゼロを優先し、非 hint は「観測」記録に留める。

## Open Questions

- 無し。設計判断は request の「architect 評価済みの設計判断」で確定済み。実装詳細（正確な hint 文言・パターン
  文字列・README 文面）は tasks.md の受け入れ基準の範囲で implementer が確定する。
