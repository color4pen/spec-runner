# Code Review Feedback — dead-code-adapter-cli — iter 1

## 検証した項目

- `git diff main...HEAD --stat` で全変更ファイル（59 ファイル）を把握
- 各タスク（T-01〜T-17）の実装 diff を読んで受け入れ基準と照合
- 削除 symbol の grep 確認（`session-runner`・`assertBreakAfterCompletion`・`isResultMessage`・`isTextDelta`・`turnCount`・`deleteSession`・`_spawnFn`・`git-exec`・`REPORT_TOOL_CUSTOM_TOOL_SPEC`・`MANAGED_RESET_USAGE`・`FileConfigStore`・`saveProjectConfig`・`checkConfigComplete`・`logDebug`・`getLogLevel`・`resolveXdgStateDir`・`draftPathLegacy`・`draftUsageJsonPath`・`LEVEL_ORDER` の export 有無）
- sse-stream.ts の break 文が assertBreakAfterCompletion 削除後も存在することを diff で確認
- archive --dry-run のみ削除、inbox --dry-run（command-registry.ts:964,985）が無変更であることを確認
- REPORT_TOOL_FIXTURE の parseInput 型を確認
- verification-result.md で typecheck・test（10699 テスト）・lint がすべて green であることを確認

## 検証できなかった項目

None（全 T-01〜T-17 を static analysis で検証済み）

## Findings 詳細

### Finding 1 — MEDIUM · fixable
`\bREPORT_TOOL\b` が `tests/unit/contract/agent-runner-contracts.test.ts:73` に残存している。
`const REPORT_TOOL: ReportToolSpec = { ... }` という pre-existing のローカル const で、production code からは import していない。
ただし acceptance criteria は「`grep -r '\bREPORT_TOOL\b' tests/` が 0 件」と明示しており、literal には違反する。
修正: 変数名を `REPORT_TOOL_SPEC` 等に rename する（同ファイル内の使用箇所 1 行も合わせて変更）。

### Finding 2 — LOW · fixable
`turnCount` がコメントおよびテスト記述に残存。
- `src/adapter/claude-code/query-one-shot.ts:81` — `numTurns` JSDoc に `"Replaces the former turnCount placeholder field."` の言及
- `tests/unit/adapter/claude-code/query-one-shot-metrics.test.ts` — describe 文・コメント・`hasOwnProperty.call(result, "turnCount")` 文字列引数に複数残存（property の不在を検証するコードで機能への影響なし）

両ファイルとも pre-existing、このブランチでは未変更。acceptance criteria「コメント内の言及含む」を literal に解釈すると違反。
修正: `query-one-shot.ts:81` のコメントから turnCount への言及を除去。`query-one-shot-metrics.test.ts` の describe/コメント/文字列リテラルを `numTurns` ベースの記述に書き換える。

### Finding 3 — LOW · fixable
`formatAge` がコメントに残存。
- `src/core/job-list/operations-view.ts:341` — `// Re-uses the formatAge logic from ps.ts (copied here to stay import-clean).` という pre-existing コメント
修正: コメントを `formatAgeInternal` の説明文に書き換えるか、参照を除去する。

## 確認済み（acceptance criteria クリア）

| タスク | 結果 |
|--------|------|
| T-01: session-runner.ts・barrel 行・session-runner.test.ts・TC-010 ブロック削除 | ✓ |
| T-02: assertBreakAfterCompletion 削除、sse-stream.ts の break 文が直後に残存 | ✓ |
| T-03: deleteSession 削除 | ✓ |
| T-04: isResultMessage・isTextDelta 削除、isToolUse・isStreamEvent 保存 | ✓ |
| T-05: turnCount フィールド削除（コメント取り残しは Finding 2） | △ |
| T-06: _spawnFn/spawnFn/defaultSpawnFn・git-exec.ts 削除 | ✓ |
| T-07: transient-error.ts・session-log-writer.ts shim 削除、importer が shared/ へ repoint 済み | ✓ |
| T-08: REPORT_TOOL・REPORT_TOOL_CUSTOM_TOOL_SPEC 削除、codex 2 テストに REPORT_TOOL_FIXTURE 追加（contracts test の残存は Finding 1） | △ |
| T-09: formatAge・truncate 削除（operations-view.ts コメント取り残しは Finding 3） | △ |
| T-10: MANAGED_RESET_USAGE 削除、bin/specrunner.ts export 削除 | ✓ |
| T-11: archive --dry-run フラグ・help・parse・field すべて削除、inbox --dry-run 無変更 | ✓ |
| T-12: RunConfigEffectiveOptions.cwd 削除 | ✓ |
| T-13: FileConfigStore・saveProjectConfig 削除 | ✓ |
| T-14: checkConfigComplete 削除、preflight 挙動不変 | ✓ |
| T-15: LEVEL_ORDER un-export（export キーワード除去）、logDebug・getLogLevel 削除 | ✓ |
| T-16: resolveXdgStateDir 削除 | ✓ |
| T-17: draftPathLegacy・draftUsageJsonPath 削除 | ✓ |
