# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1 — コードアサーション事実確認

以下の各 symbol について、実際のファイルを Read/Grep で確認した。

**session-runner.ts（managed-agent）**
- `src/adapter/managed-agent/session-runner.ts` を Read: 105 行、`runManagedAgentSession` を export。
- src/ 内の Grep: `session-runner` へのインポートは barrel `index.ts` の 2 行のみ。barrel 経由の本番消費者は Grep でゼロ確認。
- tests/ 内: `tests/core/session-runner.test.ts` と `tests/unit/remove-session-timeout.test.ts:93-104`（source-text 読み取り + 動的 import）が使用。

**message-types.ts の isResultMessage / isTextDelta**
- `isResultMessage`（行 12）・`isTextDelta`（行 67）を Read で確認。
- src/ 内 Grep: 定義行のみ、本番呼び出しゼロ。

**assertBreakAfterCompletion**
- `src/adapter/managed-agent/completion.ts:179`：両分岐とも void を return する literal no-op を Read で確認。
- `src/adapter/managed-agent/sse-stream.ts:131` の 1 箇所呼び出しを確認。呼び出し行の前後は `isStatusIdleEvent` / `isEndTurnIdle` で既に分岐済みで、`break`（:134）が実際の制御を担う。削除しても挙動不変。
- `tests/completion.test.ts:82-84` が「does not throw」assertion を持つことを確認。

**deleteSession**
- `src/adapter/managed-agent/sdk/sessions.ts:87` を Read で確認。src/ 内 Grep: 定義行のみ。

**QueryOneShotResult.turnCount**
- `src/adapter/claude-code/query-one-shot.ts:78` を Read で確認、`@deprecated` かつ set 箇所ゼロ。
- src/ 内 Grep: 定義行と説明コメント行のみ。
- tests/ 内: `query-one-shot.test.ts:90-99` に `result.turnCount` の undefined assertion あり。

**_spawnFn / spawnFn in agent-runner.ts**
- `agent-runner.ts:396,418,427` を Read: `ClaudeCodeRunnerDeps._spawnFn`（interface フィールド）、private クラスフィールド、constructor 代入を確認。`this.spawnFn` の呼び出しは Grep でゼロ。
- `git-exec.ts` shim（11 行）の消費者: src/ 内 Grep「from.*git-exec」で agent-runner.ts の 2 行のみ（import :33 / re-export :57）。他の src ファイルはすべて `util/git-exec.js` を直接インポート済み。
- tests/ 内: `agent-runner.test.ts:20` が `SpawnFn` を `agent-runner.js` 経由でインポート。

**transient-error.ts / session-log-writer.ts shim**
- 両ファイルを Read で 5 行の re-export shim と確認。
- インポーター: src 内は `agent-runner.ts:49,54` の 2 行。tests 内は `__tests__/session-log-writer.test.ts:14` と `__tests__/transient-error.test.ts:11`。合計 importer は agent-runner.ts + test 2 件で一致。

**REPORT_TOOL_CUSTOM_TOOL_SPEC**
- `src/core/step/report-tool.ts:36` を Read: export 定義を確認。src/ 内 Grep: 定義行とコメント行のみ。本番参照ゼロ確認。

**REPORT_TOOL（src 参照ゼロ）**
- `src/core/step/report-tool.ts:21` を確認。src/ 内 Grep: 定義行と同ファイル内コメントのみ。
- tests/ 内: `tests/adapter/codex/agent-runner.test.ts:15` と `tests/adapter/codex/agent-runner-transient-retry.test.ts:14` が import（live fixture として利用）。request 記載の「codex の test 2 件」と一致。

**formatAge / truncate in ps.ts**
- `src/cli/ps.ts:23,41` を Read で確認。src/ 内 Grep: 定義行のみ。
- `src/core/job-list/operations-view.ts:341` が `formatAgeInternal`（自前コピー）を持ち、コメントでのみ ps.ts を言及。

**MANAGED_RESET_USAGE / bin/specrunner.ts export**
- `command-registry.ts:197`: `@deprecated` alias を Read で確認。src/・bin/ 内 Grep: 定義行のみ。
- `bin/specrunner.ts:14`: `export { USAGE, RUNTIME_RESET_USAGE }` を Read で確認。インポーター Grep: ゼロ。

**archive --dry-run**
- `ARCHIVE_USAGE`（:281 相当）に「Reserved for future use」を確認。
- archive subcommand の flag 定義（`"dry-run": { type: "boolean" }`）と handler（`dryRun: !!parsed.flags["dry-run"]`）を確認。
- `src/cli/archive.ts:80` の `RunArchiveOptions.dryRun?` を Read で確認。`runArchive` 関数内で `opts.dryRun` を読む箇所は Grep でゼロ（読み手ゼロ）。
- inbox --dry-run はハンドラで実際に使用されていることを確認（`runInboxRun({ dryRun: ... })`）。prune は `--force` トグルで dry-run 概念を実装。

**RunConfigEffectiveOptions.cwd**
- `src/cli/config-effective.ts:31` を Read: `@deprecated` を確認。production 呼び出し `command-registry.ts:956` は `repoRoot:` のみ渡している（`cwd:` 渡し箇所なし）。

**FileConfigStore / saveProjectConfig**
- `src/config/store.ts:237-293` を Read: `FileConfigStore` クラスを確認。`implements ConfigStore` 宣言なし。src/ 内 Grep: 定義行のみ（インスタンス化ゼロ）。
- `saveProjectConfig`（:225-231）: src/ 内 Grep: 定義行のみ。tests/ 内: `tests/config/store.test.ts:312-335` が参照。

**checkConfigComplete**
- `src/config/schema/validation.ts:722-728` を Read: 無条件 `return null`（no-op）を確認。
- `src/core/preflight.ts:52` の 1 箇所呼び出しを確認。

**logDebug / getLogLevel / LEVEL_ORDER**
- `src/logger/stdout.ts` を Read 全体: `logDebug`（:215）・`getLogLevel`（:46）・`LEVEL_ORDER`（:14）を確認。
- src/ 内 Grep: `logDebug` は定義行のみ。`getLogLevel` は定義行のみ。`LEVEL_ORDER` は同ファイル内 `isLevelEnabled`（:55）でのみ使用。
- tests/ 内: `getLogLevel` は `vi.mock` factory キー（3 ファイル）のみ参照。

**resolveXdgStateDir / draftPathLegacy / draftUsageJsonPath**
- `src/util/xdg.ts:32` を Read: 定義を確認。src/ 内 Grep: 定義行のみ。tests/ 内: `tests/unit/util/xdg.test.ts` に専用 test。
- `src/util/paths.ts:182,260` を Grep で確認。src/ 内: 定義行のみ。tests/ 内: 専用 test のみ。

---

### Step 2 — スコープ外整合性確認

- `wireProgressDisplay`（`src/cli/run.ts`, `resume.ts`, `reopen.ts`）: スコープ外として正しく明記。
- `VerificationCommand` 型: スコープ外として正しく明記。
- `REPORT_TOOL` の隣接 export（`PRODUCER_REPORT_TOOL`, `JUDGE_REPORT_TOOL` 等）は本番使用中であり、削除対象外となっていることを確認。
- inbox の `--dry-run` および prune の dry-run 概念が alive であり対象外との記述を確認、コードで裏付け済み。

---

### Step 3 — 要件・受け入れ基準の確認

- 要件 3: `assertBreakAfterCompletion` 削除後、sse-stream.ts の `break`（実際の制御フロー）は残るため呼び出し側挙動は不変。
- 要件 4: `REPORT_TOOL` を削除し codex test 2 件（`agent-runner.test.ts`・`agent-runner-transient-retry.test.ts`）にローカル fixture を追加する方針は適切。
- 要件 5: shim 3 件（`transient-error.ts`・`session-log-writer.ts`・`git-exec.ts`）削除 + importer の repoint は一貫している。agent-runner.test.ts:20 の `SpawnFn` インポートは `util/git-exec.js` 経由で解決可能。
- 要件 6: archive の `--dry-run`（flag 定義・parse・受け渡し・help 行）と inbox/prune の干渉が起きない構造を確認。
- 要件 7: `LEVEL_ORDER` は `isLevelEnabled` 内部でのみ使用されるため un-export（internal const 化）が適切。

---

## 検証できなかった項目

None — request 記載のすべてのアサーションについて、実際のファイルを参照して確認した。

## Findings 詳細

None — blocking finding はなし。すべてのコードアサーションが正確であり、要件・受け入れ基準は明確で実装可能と判断した。
