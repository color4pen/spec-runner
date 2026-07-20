# Tasks: エラー処方の整合

> 実装は既存 hint 文字列・パス解決・出力整形・1 箇所の runtime エラー変換・doctor context への 1 フィールド追加・
> テスト追加/期待更新・README 追記に限る。verdict / routing / FSM / `--json` スキーマは触らない。

## T-01: origin 不在の停止処方を `git remote add` に修正（D1）

- [ ] `src/errors.ts` に factory `originNotConfiguredError()` を追加する。code は `NOT_GIT_REPO`（exit code 不変）、
      message は `"Origin remote not configured."`、hint は `git remote add origin <url>` を含む処方
      （doctor `github-origin` check `src/core/doctor/checks/repo/github-origin.ts:35` と同趣旨）とし、
      `"cd into a git repository"` を含めない。
- [ ] `src/git/remote.ts:34-38` と `:48-54` の 2 つの同一 inline `SpecRunnerError` を
      `throw originNotConfiguredError()` に置換する。
- [ ] `src/errors.ts:145-151` `notGitRepoError()`（真の非 git repo 用、`remote.ts:40,45` から使用）は**変更しない**。
- [ ] T1 テストを追加/更新する（origin 不在で `getOriginInfo` が投げる hint が `"git remote add"` を含み
      `"cd into a git repository"` を含まないことを固定。既存の origin テストは `tests/git-remote.test.ts` を参照）。

**Acceptance Criteria**:
- origin 不在（git repo 内）の hint が `"git remote add"` を含み `"cd into a git repository"` を含まない。
- error code / exit code は現行（`NOT_GIT_REPO` / 2）のまま。
- 破壊確認: 修正を戻す（旧 hint に戻す）と T1 テストが落ちる。
- 非 git repo 経路（`notGitRepoError()`）の挙動は不変。

## T-02: 廃止/改名コマンドを案内する全 hint を現行コマンドへ置換（D3）

`hint:` プロパティ / `SpecRunnerError` 第2引数（= hint）中の廃止/改名コマンド参照を、実在コマンドへ 1:1 置換する。

- [ ] `specrunner ps` の除去:
  - `src/core/doctor/checks/storage/local-state-writable.ts:42` — hint を「local 状態ディレクトリは初回 run 時に
    自動作成される」旨の説明に置換（コマンド処方を外す。実在コマンドを書くなら `specrunner job start`）。
  - `src/core/job-access/load-by-job-id.ts:82` — `'specrunner ps'` → `'specrunner job ls'`。
  - `src/store/job-catalog.ts:287` — `'specrunner ps'` → `'specrunner job ls'`。
- [ ] `specrunner managed setup` → `specrunner runtime setup`（14 箇所。`runtime` の `setup` サブコマンドは
      旧 `managed setup` の後継）:
  - `src/errors.ts:220`（`environmentNotSetError`）
  - `src/config/store.ts:268`
  - `src/config/getAgentId.ts:20`
  - `src/adapter/managed-agent/agent-runner.ts:585`
  - `src/core/runtime/prereqs.ts:35`, `:53`, `:59`（`:35` の `login --provider anthropic` 部分は本 change 対象外・据え置き）
  - `src/core/doctor/checks/agents/agents-registered.ts:43`
  - `src/core/doctor/checks/agents/environment-registered.ts:25`
  - `src/core/doctor/checks/agents/definition-drift.ts:75`
  - `src/core/doctor/checks/agents/agent-provider-alive.ts:106`, `:114`
  - `src/core/doctor/checks/agents/environment-provider-alive.ts:31`, `:71`
- [ ] `specrunner job list` → `specrunner job ls`:
  - `src/errors.ts:362`（`duplicateLiveJobError`）
- [ ] 非 hint の stale 参照（message / recommendedAction / `logInfo` / バナー）は**変更しない**
      （例: `src/core/archive/orchestrator.ts`, `src/core/finish/resolve-target.ts`, `src/core/command/runner.ts:326`,
      `src/cli/managed.ts:57`, `src/core/finish/escalation.ts:20`）。本 change のスコープ外。

**Acceptance Criteria**:
- 上記 hint 群に `specrunner ps` / `specrunner managed setup` / `specrunner job list` が残らない。
- 置換後の参照はすべて実在コマンド（`job ls`, `runtime setup`, `job start` 等）。
- T-03 の歯が green になる。

## T-03: hint の実在コマンド機械検査（歯）を追加（D3）→ 受け入れ T2

- [ ] テスト（例 `tests/unit/cli/hint-command-references.test.ts`）を追加する。
- [ ] 真実源: `src/cli/command-registry.ts` の `COMMANDS` を import し、`validTopLevel = new Set(Object.keys(COMMANDS))`
      と parent → subcommand 名の Map を構築する。
- [ ] hint 収集: `src/**/*.ts`（`*.test.ts` / `__tests__` を除外、コメント除去後）から
      (a) `hint:` プロパティのリテラル、(b) `new SpecRunnerError(code, hint, message)` の第2引数リテラル、を抽出する。
      message / recommendedAction / `logInfo` / バナーは対象に含めない。
- [ ] 判定: 各 hint 内の `specrunner\s+<token1>[ <token2>]` について、`token1` がフラグ（`-` 始まり）なら skip、
      そうでなければ `validTopLevel.has(token1)` を要求。`COMMANDS[token1]` が parent かつ `token2` が存在しフラグでない
      なら `token2 ∈ subcommands` を要求する。
- [ ] template literal（`` `...${x}...` ``）と単一/二重引用の hint を扱えること（`${...}` があっても command
      トークンは静的抽出できる）。

**Acceptance Criteria**:
- 現行 `src` の全 hint がテストを pass する（T-02 完了後）。
- 破壊確認: いずれかの hint に `COMMANDS` に無い `specrunner <架空>` を足すとテストが落ちる。
- 破壊確認: `specrunner runtime setup` を `specrunner managed setup` に戻すとテストが落ちる。

## T-04: workflow-structure の hint を `specrunner init` 第一処方にする（要件 3）

- [ ] `src/core/doctor/checks/repo/workflow-structure.ts:59` — missing dirs の hint を、`specrunner init` の実行を
      第一処方とする文言に置換する（`"Create the missing directories manually."` を第一処方にしない）。
      deprecation 側 hint（`:53-55`）は挙動を保つ。

**Acceptance Criteria**:
- 必要ディレクトリ欠損時の hint が `specrunner init` を含む。
- `"Create the missing directories manually."` が第一処方でない。
- T-03 の歯を pass（`specrunner init` は実在コマンド）。

## T-05: token 系 hint を `specrunner login` に一本化する（要件 4）

- [ ] `src/core/doctor/checks/config/github-token-present.ts:35` — 三択 hint を `specrunner login` 第一処方 +
      `GH_TOKEN` / `gh` を従属的代替とする文言に置換する。
- [ ] `src/core/doctor/checks/auth/github-token-valid.ts:19` — token 不在分岐の hint を同様に置換する
      （`:31` の 401 分岐 hint は既に `specrunner login` なので据え置き可）。

**Acceptance Criteria**:
- token 不在 hint の第一処方が `specrunner login`。
- `GH_TOKEN` / `gh` は代替として残るが第一処方ではない。
- pass 分岐（token 検出時の details 等）の挙動は不変。

## T-06: fail 集合駆動の next steps を doctor human 出力に追加（D2）→ 受け入れ T3/T4/T5

- [ ] `src/core/doctor/next-steps.ts` を新設し、純関数 `deriveNextSteps(results: DoctorResult[]): string[]` を export する。
      規則表（依存順）: `git-repository`→`git init` / `github-origin`→`git remote add origin <url>` /
      `config-file-exists`→`specrunner init` / (`github-token-present` または `github-token-valid`)→`specrunner login`。
      `status === "fail"` の check のみを起点に、順序保持・重複除去で処方列を返す。
- [ ] `src/core/doctor/index.ts` から `deriveNextSteps` を re-export する（テスト用）。
- [ ] `src/core/doctor/formatter.ts` `formatHuman` を、Summary 出力の後に `deriveNextSteps(results)` が非空のときだけ
      `Next steps:` 節（番号付き）を追記するよう変更する。空なら何も足さない。signature は変更しない。
- [ ] `formatJson`（`:102-137`）は**変更しない**。
- [ ] T3/T4/T5 テストを追加する（作成者集合・参加者集合・fail ゼロ + JSON 不変）。

**Acceptance Criteria**:
- fail = {git-repository, github-origin, github-token-present} → next steps が `git init`→`git remote add`→`specrunner login` 順。
- repo 系 pass・fail = {config-file-exists, github-token-present} → next steps が `specrunner init`→`specrunner login` 順。
- fail ゼロ → next steps 節を出さない。
- 同一 results の `formatJson` 出力構造が従来と bit 単位で同一（next steps を含まない）。
- token が present/valid 両方 fail でも `specrunner login` は 1 回だけ。

## T-07: config-file-exists の XDG 認識（D4）→ 受け入れ T6

- [ ] `src/core/doctor/types.ts` の `DoctorContext` に `configPath: string` を追加する（doc コメント付き）。
- [ ] `src/cli/doctor.ts` の ctx 組み立て（`:190-209`）で `configPath: getConfigPath()` を注入する
      （`getConfigPath` は既に import 済み `:18`）。
- [ ] `src/core/doctor/checks/config/file-exists.ts:15` の `path.join(ctx.homeDir, ".config", ...)` を
      `ctx.configPath` に置換する（ENOENT / malformed / permission 各分岐で `configPath` を使用）。
- [ ] `tests/core/doctor/mock-context.ts` の `buildMockContext` に既定 `configPath:
      "/fake/home/.config/specrunner/config.json"` を追加する（TC-072 を無改変で通すため）。
- [ ] T6 テストを追加する:
  - unit: `ctx.configPath` を XDG 隔離パスに override し、そこに config がある想定で check が pass することを固定。
  - integration: `XDG_CONFIG_HOME` を隔離ディレクトリに設定 → そこに config を作成 → `src/cli/doctor.ts` の組み立てを
    通して `config-file-exists` が pass することを固定（end-to-end で `getConfigPath()` 尊重を検証）。

**Acceptance Criteria**:
- `XDG_CONFIG_HOME` 隔離下で config 作成後、`config-file-exists` が pass。
- 破壊確認: check を `homeDir/.config/...` 固定へ戻すと T6 テストが落ちる。
- 既存 file-exists テスト（TC-009〜011/071〜073）が green（TC-072 は mock 既定 `configPath` で不変）。

## T-08: doctor --help の usage を追加（D6）→ 受け入れ T7

- [ ] `src/cli/command-registry.ts` に `DOCTOR_USAGE` 定数を定義する（`--json` を明記、既存 `*_USAGE` と同型）。
- [ ] `doctor` エントリ（`:817-834`）に `usage: DOCTOR_USAGE` を付与する。
- [ ] T7 テストを追加する（`specrunner doctor --help` が usage を表示し `--json` を含むこと。
      `tests/core/doctor/doctor-cli.test.ts` を参照）。

**Acceptance Criteria**:
- `doctor --help` が usage を表示し、その中に `--json` の記載がある。
- `"No detailed help available."` を表示しない。

## T-09: git fetch 認証失敗の wrap（D5）→ 受け入れ T8

- [ ] `src/core/runtime/git-fetch-error.ts` を新設し、純関数
      `describeGitFetchFailure(exitCode: number, stderr: string): string` を export する。
  - 認証系パターン（`could not read Username` / `Authentication failed` / `terminal prompts disabled` /
    `Invalid username or password`、大小文字無視）合致時: 第一文が `specrunner login` を処方するメッセージを返し、
    続けて元の `git fetch origin failed (exit N): <stderr>` を詳細として保持する。
  - 非合致時: 現行と**完全に同一**の `git fetch origin failed (exit ${exitCode}): ${stderr.trim()}` を返す。
- [ ] `src/core/runtime/local.ts:464` を `throw new Error(describeGitFetchFailure(fetchResult.exitCode, fetchResult.stderr))`
      に置換する。
- [ ] T8 テストを追加する（認証系 stderr → 第一文が `specrunner login` 処方 + 元 stderr 保持 / 非認証系 → 現行文字列と同一）。

**Acceptance Criteria**:
- 認証系 stderr のとき、表示第一文が `specrunner login` を処方し、git の元メッセージが詳細として含まれる。
- 非認証系 fetch 失敗のメッセージは現行と同一（回帰なし）。

## T-10: README に既存プロジェクト参加者手順を追記（要件 8）

- [ ] `README.md` の Quick Start 近傍に、spec-runner 導入済み repo を clone した参加者向け手順
      （clone → install → `specrunner init` → `specrunner login`）を追記する。scaffold と project config は
      commit 済みである旨を含めてよい。既存の新規作成者手順（`mkdir`→`git init`→install→init→login）は残す。

**Acceptance Criteria**:
- README に参加者向け手順（install → `specrunner init` → `specrunner login`）が存在する。

## T-11: 変更 hint に伴う既存テスト期待の更新（受け入れ T9 の green 化）

hint 文言変更に伴い、**hint テキストを assert している**既存テストの期待値のみを更新する。
コマンド廃止の**挙動**テスト（`tests/unit/cli/removed-commands.test.ts` の Unknown command 系）は**変更しない**。

- [ ] `tests/core/doctor/checks/storage/jobs-writable.test.ts` TC-040 / TC-040b — `toContain("specrunner ps")` を
      新 hint（自動作成説明）に合わせて更新。
- [ ] `tests/core/doctor/checks/config/github-token-present.test.ts` / `.../auth/github-token-valid.test.ts` —
      三択 hint の assert を `specrunner login` 第一処方へ更新。
- [ ] `tests/core/doctor/checks/repo/workflow-structure.test.ts` / `tests/unit/cli/doctor-repo-root.test.ts` —
      `"Create the missing directories manually."` の assert を `specrunner init` へ更新。
- [ ] `specrunner managed setup` を hint テキストとして assert しているテストを `runtime setup` に更新
      （候補: `tests/core/doctor/checks/agents/definition-drift.test.ts`, `tests/unit/config/runtime-config.test.ts`,
      `tests/unit/adapter/managed-agent/agent-runner.test.ts`, `tests/state-store.test.ts`,
      `tests/adapter/managed-agent/error-helpers.test.ts` — 各ファイルで hint 文字列を assert している箇所のみ）。
- [ ] `tests/unit/core/runtime/duplicate-slug-guard.test.ts` — `"specrunner job list"` の assert を `"specrunner job ls"` へ更新。
- [ ] 上記以外にも旧 hint 文字列を assert しているテストがあれば、旧文字列で grep して同様に更新する。

**Acceptance Criteria**:
- 変更した hint に対応する既存テストが新文言で green。
- コマンド廃止挙動テスト（Unknown command 系）は無改変で green のまま。

## T-12: 検証

- [ ] `typecheck && test`（プロジェクトの verification）が green。
- [ ] `--json` 出力スキーマ・verdict / routing に変化が無いことを確認する。

**Acceptance Criteria**:
- 型チェック・全テストが green（hint 文言変更に伴う T-11 の期待更新を含む）。
- T1〜T9 の受け入れ基準（request.md）をすべて満たす。
