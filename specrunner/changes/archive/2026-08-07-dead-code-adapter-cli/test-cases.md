# Test Cases:

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration/gate): 22
- **Manual**: 0
- **Priority**: must: 14, should: 8, could: 0

---

### TC-001: typecheck && test suite pass

**Category**: gate
**Priority**: must
**Source**: tasks.md — 全 T-01〜T-17 の Acceptance Criteria 共通条件 / request.md 受け入れ基準

`typecheck && test` の両フェーズが green で終了すること。

---

### TC-002: 削除対象 symbol の grep 件数がゼロ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Dead symbols MUST be absent from the codebase after deletion > Scenario: Deleted symbol has no remaining references

---

### TC-003: shim 削除前に importer が正典パスへ repoint されている

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Shim importers MUST be repointed before shim deletion > Scenario: agent-runner.ts imports repointed before shim removed

---

### TC-004: 共有 test ファイルが非削除 assertion を無改変で保持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Shared tests MUST preserve all non-deleted assertions > Scenario: Shared test file trimmed without collateral damage

---

### TC-005: session-runner.ts 削除と参照一掃

**Category**: unit
**Priority**: must
**Source**: tasks.md — T-01

**GIVEN** `src/adapter/managed-agent/session-runner.ts`、barrel `index.ts:2-3`、`tests/core/session-runner.test.ts`、`tests/unit/remove-session-timeout.test.ts` の TC-010 ブロックが存在する

**WHEN** T-01 の削除と cleanup を適用する

**THEN**
- `grep -r "session-runner\|runManagedAgentSession\|ManagedAgentSessionInput\|ManagedAgentSessionResult" src/ bin/ tests/` が 0 件
- `tests/unit/remove-session-timeout.test.ts` が存在し TC-011 以降が pass

---

### TC-006: sse-stream.ts の break 制御フローが assertBreakAfterCompletion 削除後も維持される

**Category**: unit
**Priority**: must
**Source**: tasks.md — T-02

**GIVEN** `sse-stream.ts` の `assertBreakAfterCompletion(event)` 呼び出しの直後に `break` 文が存在する

**WHEN** `assertBreakAfterCompletion` の呼び出しと import を削除する

**THEN** `break` 文がその位置に残存し、switch/loop の終端として機能する（コンパイルエラーなし、挙動不変）

---

### TC-007: deleteSession が sessions.ts から削除される

**Category**: unit
**Priority**: should
**Source**: tasks.md — T-03

**GIVEN** `src/adapter/managed-agent/sdk/sessions.ts:84-92` に `deleteSession` 関数と JSDoc が存在する

**WHEN** T-03 の削除を適用する

**THEN** `grep -r "deleteSession" src/ bin/ tests/` が 0 件、かつ `sessions.ts` がコンパイルエラーなし

---

### TC-008: isToolUse と isStreamEvent が message-types.ts に残存する

**Category**: unit
**Priority**: must
**Source**: tasks.md — T-04

**GIVEN** `src/adapter/claude-code/message-types.ts` に `isResultMessage`・`isTextDelta`・`isStreamEvent`・`isToolUse` が存在する

**WHEN** `isResultMessage` と `isTextDelta` を削除し、関連 test ブロックを除去する

**THEN**
- `grep -r "isResultMessage\|isTextDelta" src/ bin/ tests/` が 0 件
- `isToolUse` と `isStreamEvent` が `message-types.ts` に残存する
- `message-types.test.ts` の TC-MT-003 と TC-MT-005 が pass

---

### TC-009: QueryOneShotResult.turnCount フィールドが削除される

**Category**: unit
**Priority**: should
**Source**: tasks.md — T-05

**GIVEN** `src/adapter/claude-code/query-one-shot.ts:78` に `@deprecated turnCount` フィールドが存在し、専用 test がある

**WHEN** T-05 の削除を適用する

**THEN** `grep -r "turnCount" src/ bin/ tests/` が 0 件、かつ `query-one-shot.test.ts` の残存 test が pass

---

### TC-010: _spawnFn・spawnFn・git-exec.ts shim が完全消去される

**Category**: unit
**Priority**: must
**Source**: tasks.md — T-06

**GIVEN** `src/adapter/claude-code/agent-runner.ts` に `_spawnFn`・`spawnFn`・`defaultSpawnFn` の参照があり、`git-exec.ts` が存在する

**WHEN** T-06 の削除を適用する

**THEN**
- `src/adapter/claude-code/git-exec.ts` が存在しない
- `grep -r "_spawnFn\|spawnFn\|defaultSpawnFn\|git-exec" src/adapter/claude-code/ tests/unit/adapter/claude-code/` が 0 件
- `agent-runner.test.ts` がコンパイルエラーなしで pass

---

### TC-011: transient-error・session-log-writer の shim 削除と importer repoint

**Category**: unit
**Priority**: must
**Source**: tasks.md — T-07

**GIVEN** `agent-runner.ts` が `./transient-error.js` と `./session-log-writer.js` の shim を import している

**WHEN** T-07 の repoint と shim 削除を適用する

**THEN**
- `src/adapter/claude-code/transient-error.ts` と `session-log-writer.ts` が存在しない
- `grep -r "claude-code/transient-error\|claude-code/session-log-writer" src/ tests/` が 0 件
- `__tests__/transient-error.test.ts` と `__tests__/session-log-writer.test.ts` が pass

---

### TC-012: REPORT_TOOL・REPORT_TOOL_CUSTOM_TOOL_SPEC が本番コードから消え、codex test に local fixture が追加される

**Category**: unit
**Priority**: must
**Source**: tasks.md — T-08

**GIVEN** `src/core/step/report-tool.ts` に `REPORT_TOOL`・`REPORT_TOOL_CUSTOM_TOOL_SPEC` があり、codex 2 test が import している

**WHEN** T-08 の削除と fixture 追加を適用する

**THEN**
- `grep -r "REPORT_TOOL_CUSTOM_TOOL_SPEC" src/ bin/ tests/` が 0 件
- `grep -r '\bREPORT_TOOL\b' src/ bin/` が 0 件
- `grep -r '\bREPORT_TOOL\b' tests/` が 0 件（`REPORT_TOOL_FIXTURE` は別名なので残存可）
- 両 codex agent-runner test が `REPORT_TOOL_FIXTURE` を持ち pass

---

### TC-013: formatAge・truncate が cli/ps.ts から削除される

**Category**: unit
**Priority**: should
**Source**: tasks.md — T-09

**GIVEN** `src/cli/ps.ts:23` と `src/cli/ps.ts:41` に `formatAge`・`truncate` 関数が存在する

**WHEN** T-09 の削除を適用する

**THEN**
- `grep -r "\bformatAge\b\|\btruncate\b" src/cli/ps.ts` が 0 件
- `grep -r "from.*cli/ps.*formatAge\|from.*cli/ps.*truncate" src/ tests/` が 0 件
- `src/cli/ps.ts` のコンパイルエラーなし

---

### TC-014: MANAGED_RESET_USAGE 削除と bin exports のクリーンアップ

**Category**: unit
**Priority**: should
**Source**: tasks.md — T-10

**GIVEN** `src/cli/command-registry.ts:197` に `MANAGED_RESET_USAGE` が、`bin/specrunner.ts:14` に `export { USAGE, RUNTIME_RESET_USAGE }` が存在する

**WHEN** T-10 の削除を適用する

**THEN**
- `grep -r "MANAGED_RESET_USAGE" src/ bin/ tests/` が 0 件
- `grep -r "^export.*RUNTIME_RESET_USAGE" bin/` が 0 件
- `RUNTIME_RESET_USAGE` は `src/cli/command-registry.ts` に残存し、help-flag-dispatch.test.ts が pass

---

### TC-015: archive --dry-run が完全削除され inbox --dry-run が無変更

**Category**: unit
**Priority**: must
**Source**: tasks.md — T-11

**GIVEN** `src/cli/command-registry.ts` に archive 用 `--dry-run` の flag 定義・parse・help 行があり、`src/cli/archive.ts` に `dryRun` フィールドが存在する。inbox の `--dry-run` は別途生きている

**WHEN** T-11 の削除を適用する

**THEN**
- `grep -r "dry-run\|dryRun" src/cli/archive.ts` が 0 件
- `grep "dry-run" src/cli/command-registry.ts` が inbox 関連行（~208 / ~969）と prune 記述のみで archive 関連行ゼロ
- inbox `--dry-run` の挙動が不変（関連 test 無改変で green）

---

### TC-016: RunConfigEffectiveOptions.cwd フィールドが削除される

**Category**: unit
**Priority**: should
**Source**: tasks.md — T-12

**GIVEN** `src/cli/config-effective.ts` の `RunConfigEffectiveOptions` に `cwd?: string` が存在し、test が `{ cwd: repoRoot }` で呼んでいる

**WHEN** T-12 の削除と test 更新を適用する

**THEN**
- `grep -r "\bcwd\b" src/cli/config-effective.ts` が 0 件
- `grep "cwd:" tests/unit/cli/config-effective.test.ts` が 0 件
- `config-effective.test.ts` が pass

---

### TC-017: FileConfigStore クラスと saveProjectConfig 関数が削除される

**Category**: unit
**Priority**: should
**Source**: tasks.md — T-13

**GIVEN** `src/config/store.ts:237-293` に `FileConfigStore`、`:225-231` に `saveProjectConfig` が存在する

**WHEN** T-13 の削除を適用する

**THEN**
- `grep -r "FileConfigStore\|saveProjectConfig" src/ bin/ tests/` が 0 件
- `store.test.ts` が存在し残存 test が pass

---

### TC-018: checkConfigComplete 削除後も preflight の挙動が不変

**Category**: unit
**Priority**: must
**Source**: tasks.md — T-14

**GIVEN** `src/config/schema/validation.ts:722-728` に `checkConfigComplete`（常に null を返す no-op）があり、`src/core/preflight.ts:52` が呼び出している

**WHEN** T-14 の削除（関数・import・呼び出し・test assertion）を適用する

**THEN**
- `grep -r "checkConfigComplete" src/ bin/ tests/` が 0 件
- `preflight.ts` がコンパイルエラーなし
- `preflight.test.ts` および `runtime-config.test.ts` が pass（preflight の挙動不変）

---

### TC-019: logDebug・getLogLevel が削除され LEVEL_ORDER が un-export される

**Category**: unit
**Priority**: must
**Source**: tasks.md — T-15

**GIVEN** `src/logger/stdout.ts` に `export const LEVEL_ORDER`、`getLogLevel`、`logDebug` が存在し、3 test が vi.mock factory で `getLogLevel` キーを持つ

**WHEN** T-15 の変更を適用する

**THEN**
- `grep -r "\blogDebug\b\|\bgetLogLevel\b" src/ bin/ tests/` が 0 件
- `src/logger/stdout.ts` の `LEVEL_ORDER` 宣言に `export` キーワードがない
- 3 つの CLI test ファイル（job-show-detach-log、view-commands-worktree-guard、detach-output-contract）が pass

---

### TC-020: isLevelEnabled の挙動が LEVEL_ORDER un-export 後も維持される

**Category**: unit
**Priority**: must
**Source**: tasks.md — T-15 / design.md — D4

**GIVEN** `isLevelEnabled` が `LEVEL_ORDER` を module 内部で参照している

**WHEN** `export` キーワードを除去して `LEVEL_ORDER` を module-private const にする

**THEN** `isLevelEnabled` の既存 test が無改変で pass（ log level 比較の挙動不変）

---

### TC-021: resolveXdgStateDir が xdg.ts から削除される

**Category**: unit
**Priority**: should
**Source**: tasks.md — T-16

**GIVEN** `src/util/xdg.ts:29-38` に `resolveXdgStateDir` と XDG_STATE_HOME の save/restore setup が存在する

**WHEN** T-16 の削除を適用する

**THEN**
- `grep -r "resolveXdgStateDir\|XDG_STATE_HOME" src/ bin/ tests/` が 0 件
- `xdg.test.ts` が存在し TC-XDG-03・TC-XDG-04 が pass

---

### TC-022: draftPathLegacy・draftUsageJsonPath が paths.ts から削除される

**Category**: unit
**Priority**: should
**Source**: tasks.md — T-17

**GIVEN** `src/util/paths.ts` に `draftPathLegacy`・`draftUsageJsonPath` が存在し、2 つの paths.test.ts がそれぞれ import している

**WHEN** T-17 の削除を適用する

**THEN**
- `grep -r "draftPathLegacy\|draftUsageJsonPath" src/ bin/ tests/` が 0 件
- 両 `paths.test.ts` が存在し残存 test が pass

---

## Result

```yaml
result: completed
total: 22
automated: 22
manual: 0
must: 14
should: 8
could: 0
blocked_reasons: []
```
