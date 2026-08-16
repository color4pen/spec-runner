# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証（src/cli/command-registry.ts）

| アサーション | 検証結果 |
|---|---|
| `CommandDef / ParentCommandDef / CommandEntry` at lines 52–72 | ✓ 一致 |
| `USAGE` 手書き一覧 at lines 74–122 | ✓ 一致 |
| `run` 独立 top-level エントリ at lines 522–527（コメント "Alias: job start" のみ） | ✓ 一致 |
| `requiresRepo: true` at lines 472, 536, 672, 855, 932, 957, 998 | ✓ 全件一致（init / request new / cancel / attach / prune / stats / inbox run） |
| `job start / ls / show / wait` に `requiresRepo` 不在 | ✓ 一致 |
| `guardedSubcommands` at line 595（job）/ line 987（inbox） | ✓ 一致 |
| `doctor repair` inline 分岐 at lines 1087–1100（`positionals[0] === "repair"`） | ✓ 一致 |
| `FlagDef` at lines 6–12（`flag-parser.ts`） | ✓ 一致 |
| `--issue` 数値検証 at line 456（`Number() + isInteger` チェック） | ✓ 一致 |
| `--merge-wait-ms` 数値検証 at line 901（`parseInt`） | ✓ 一致 |
| `--limit` 数値検証 at line 1003（`Number() + isInteger`） | ✓ 一致 |
| `SLUG_REGEX.test` at line 576（request validate handler） | ✓ 一致 |

### コードアサーション検証（bin/specrunner.ts）

| アサーション | 検証結果 |
|---|---|
| `WORKTREE_GUARDED_COMMANDS = new Set(["run"])` at line 124 | ✓ 一致 |
| subcommand 経路（lines 47–119）と normal 経路（lines 122–188）の二重 dispatch | ✓ 一致 |
| subcommand 経路 catch（lines 109–118）に `SpecRunnerError` 分岐なし（Fatal のみ） | ✓ 一致。normal 経路（lines 181–185）は `SpecRunnerError` で Error/Hint/exitCode 表示 |
| line 123 コメントが廃止済み `job finish` に言及したまま残っている（drift の実例） | ✓ 確認。`job.guardedSubcommands`（line 595）に `finish` は存在せず、コメントのみに残存 |

### 既存テストの確認

- `src/cli/__tests__/detach-output-contract.test.ts` — `USAGE` に `"job wait"` / `"--detach"` が含まれることを `toContain` で pin している。生成後 USAGE がこれらを保持することを要求する正当な pin ✓
- `src/cli/__tests__/login.test.ts` — `LOGIN_USAGE` に `"--provider"` が含まれないことを `not.toContain` で pin している ✓
- `src/cli/__tests__/command-registry-reopen.test.ts:202` — `jobCmd.guardedSubcommands?.has("reopen")` を直接アクセス。旧実装構造に結合したテストで、request の受け入れ基準で移行を明示的に許容済み ✓
- `src/cli/__tests__/detach-flag-cli.test.ts` — `COMMANDS["run"] as CommandDef` / `COMMANDS["job"] as ParentCommandDef` を直接アクセス。同様に旧実装構造に結合したテストで移行許容済み ✓

### 要件・受け入れ基準の確認

- `run` の alias 機械表現（`aliasOf`）の欠如は現コードで実証済み
- `requiresRepo` の parent 継承機構が現 `CommandDef` 型にないことを確認（`job` 全体設定なし、leaf ごと手書き）
- `guardedSubcommands` と `WORKTREE_GUARDED_COMMANDS` の二重管理を確認
- `LOGIN_USAGE` が手書きで `--provider` を除外していることを確認（自動化されていない）
- `doctor repair` が CLI 経路として存在しない（top-level `doctor` の handler 内 inline 分岐）ことを確認

## 検証できなかった項目

None

## Findings 詳細

指摘がない場合は None と明記する。

None — 全コードアサーションが現コードベースと一致し、要件・受け入れ基準・スコープ境界・設計判断の記述に欠落・矛盾は見当たらない。
