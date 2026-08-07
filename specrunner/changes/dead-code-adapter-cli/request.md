# adapter / cli / config / logger の検証済み死コードを削除する

## Meta

- **type**: refactoring
- **slug**: dead-code-adapter-cli
- **base-branch**: main
- **adr**: false

## 背景

コードベース監査で、adapter・cli・config・logger 領域に本番参照ゼロ（または専用 test のみが参照）と裏取りされた死コード・no-op・「将来用」placeholder が蓄積していることが判明した。本 request はそのうち削除安全性が検証済みの項目だけを削除する。本番で生きていると判明した紛らわしい類似候補はスコープ外に明記する。

## 現状コードの前提

- `src/adapter/managed-agent/session-runner.ts`（107 行）は本番呼び出しゼロ。`ManagedAgentRunner` の createOrResumePollingSession + pollUntilComplete が同じ create→send→poll フローを担っている。参照は barrel `src/adapter/managed-agent/index.ts:2-3` の re-export、専用 test `tests/core/session-runner.test.ts`、`tests/unit/remove-session-timeout.test.ts:93-104`（source text 読み取り + 動的 import）のみ
- `src/adapter/claude-code/message-types.ts` の `isResultMessage`(:12) と `isTextDelta`(:67) は本番使用ゼロ（本番は `isToolUse`(:45) と isStreamEvent のみ消費）。ヘッダは「future dialog layer」用と自己文書化
- `src/adapter/managed-agent/completion.ts:179` の `assertBreakAfterCompletion` は両分岐とも return void の literal no-op。呼び出しは `src/adapter/managed-agent/sse-stream.ts:131` の 1 箇所 + import(:18)。`tests/completion.test.ts` に「does not throw」assertion がある
- `src/adapter/managed-agent/sdk/sessions.ts:87` の `deleteSession` は参照ゼロ
- `src/adapter/claude-code/query-one-shot.ts:78` の `QueryOneShotResult.turnCount` は @deprecated で set 箇所ゼロ。`tests/unit/adapter/claude-code/query-one-shot.test.ts:90-99` が `result.turnCount` の undefined を assert している
- `src/adapter/claude-code/agent-runner.ts` の `_spawnFn`(:396) / `spawnFn`(:418,:427) は代入されるが呼び出しゼロ（commit 処理は StepExecutor へ移設済み）。これが消えると `src/adapter/claude-code/git-exec.ts`（11 行 re-export shim）の src 消費者がゼロになる。test の SpawnFn 型 import は `src/util/git-exec.ts` へ repoint 可能
- `src/adapter/claude-code/transient-error.ts`（5 行）と `session-log-writer.ts`（5 行）は shared/ への re-export shim で、importer は agent-runner.ts と test 2 件のみ
- `src/core/step/report-tool.ts:36` の `REPORT_TOOL_CUSTOM_TOOL_SPEC` は参照ゼロ（「compat のため残す」と自己文書化。ヘッダ:9）。同ファイルの `REPORT_TOOL` は src 参照ゼロだが `tests/adapter/codex/agent-runner.test.ts:15` と `tests/adapter/codex/agent-runner-transient-retry.test.ts:14` が live fixture として import している
- `src/cli/ps.ts` の `formatAge`(:23) と `truncate`(:41) は呼び出しゼロ（`src/core/job-list/operations-view.ts:341` は自前コピー formatAgeInternal を持ち、コメントでのみ参照）
- `src/cli/command-registry.ts:197` の `MANAGED_RESET_USAGE` は @deprecated alias で参照ゼロ。`bin/specrunner.ts:14` の `export { USAGE, RUNTIME_RESET_USAGE }` は importer ゼロ
- `job archive` の `--dry-run` flag は help が「Reserved for future use」（`src/cli/command-registry.ts:281`）、parse（:969,:990）から `src/cli/archive.ts:80` の `dryRun` に渡るが読み手ゼロ。**inbox の --dry-run（:208,:867,:888）と prune の dry-run 概念（:259,:265）は生きているため対象外**
- `src/cli/config-effective.ts` の `RunConfigEffectiveOptions.cwd` は @deprecated で本番は repoRoot を渡す（`src/cli/command-registry.ts:956`）。`tests/unit/cli/config-effective.test.ts:79,103` が `{ cwd: repoRoot }` で呼んでいる
- `src/config/store.ts:237-293` の `FileConfigStore` class は instantiate 箇所ゼロ（`implements ConfigStore` 宣言もなし）。同ファイル `saveProjectConfig`(:225-231) は docstring 自ら「No CLI command calls it yet」で、参照は `tests/config/store.test.ts:312-335` のみ
- `src/config/schema/validation.ts:722-728` の `checkConfigComplete` は無条件で null を返す no-op。呼び出しは `src/core/preflight.ts:52` の 1 箇所で、test は null が返ることを assert している
- `src/logger/stdout.ts` の `logDebug` は本番呼び出しゼロ（`tests/unit/logger/log-level.test.ts:261-286` が挙動 test）。`getLogLevel` の参照は 3 test の vi.mock factory キーのみ。`LEVEL_ORDER` は同ファイル内 `isLevelEnabled`(:51,:55) だけが使う（export 不要）
- `src/util/xdg.ts:29-38` の `resolveXdgStateDir` は参照ゼロ（専用 test のみ）。`src/util/paths.ts` の `draftPathLegacy`(:178-184) と `draftUsageJsonPath`(:256-262) は本番参照ゼロ（test のみ: `tests/unit/util/paths.test.ts:5,8,22-28`、`tests/util/paths.test.ts:12,151-157`）

## 要件

1. 上記の死コード・no-op を削除する。専用 test は test ごと削除、共有 test は該当 assertion/block のみ削除または repoint し、他の期待値は変更しない
2. `session-runner.ts` 削除に伴い、barrel の 2 行と `tests/unit/remove-session-timeout.test.ts:93-104` の source-text/動的 import assertion を削除する
3. `assertBreakAfterCompletion` と `checkConfigComplete` は関数・呼び出し・import・関連 test assertion をセットで削除する（呼び出し側の挙動は不変であることを確認する）
4. `REPORT_TOOL` 削除時は codex の test 2 件にローカル fixture（同形の tool spec 定数）を持たせて置き換える
5. `transient-error.ts`・`session-log-writer.ts`・`git-exec.ts` の shim 削除に伴い、importer（agent-runner.ts と test）を shared/ ・util/ の実体へ repoint する
6. `--dry-run`（archive のみ）は flag 定義・parse・受け渡し・help 行をセットで削除する。inbox / prune の dry-run には触れない
7. `LEVEL_ORDER` は削除ではなく un-export（module 内 const 化）する

## スコープ外

- `wireProgressDisplay`（`src/cli/run.ts:16,94`・`resume.ts:7,74`・`reopen.ts:16,100` で本番使用中）
- `VerificationCommand` 型（`src/core/verification/commands.ts`・`runner.ts` で本番使用中）
- config の `specFixer` field と `src/config/migrate.ts` の legacy migration（npm 公開済みのため旧 config 互換の判断が必要）
- adapter の repair ループ統合等の重複統合（挙動差があるため対象外）
- core 領域の死コード（別 request）

## 受け入れ基準

- [ ] 削除した各 symbol 名が src/ bin/ tests/ で grep 0 件（コメント内の言及含む）
- [ ] inbox の `--dry-run` と prune の dry-run 挙動が無変更（該当 test 無改変で green）
- [ ] `isToolUse`・`REPORT_TOOL` 相当の codex test fixture・`isLevelEnabled` の挙動が維持されている
- [ ] 共有 test は該当 block の削除/repoint のみで、他の test 期待値に変更がない
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 削除のみで代替実装を作らない（復元は git 履歴で可能）
- `REPORT_TOOL` は「test が使うから残す」ではなく test 側に fixture を移す（本番コードを test の都合で維持しない）
- 却下した代替案: shim の残置（importer を実体へ repoint する方が import 経路が 1 段減る）、`LEVEL_ORDER` の削除（内部使用があるため un-export に留める）
