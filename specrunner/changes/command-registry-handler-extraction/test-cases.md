# Test Cases: CommandSpec registry から inline handler を command module へ抽出する

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration): 23
- **Manual**: 0
- **Priority**: must: 13, should: 11, could: 1

---

## Spec Scenario 由来テストケース

### TC-001: 全 CommandSpec の handler が named function reference である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CommandSpec ツリーは handler の named function reference のみを保持する > Scenario: 全 CommandSpec の handler が named reference である

---

### TC-002: architecture ratchet が inline handler の再導入を検出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CommandSpec ツリーは handler の named function reference のみを保持する > Scenario: architecture ratchet が inline handler の再導入を検出する

---

### TC-003: registry ソースから process.exit が消えている

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: command-registry.ts は process.exit を呼び出さない > Scenario: registry ソースから process.exit が消えている

---

### TC-004: job.resume で --detach --json 同時指定時の exit code が抽出前後で変わらない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: command-registry.ts は process.exit を呼び出さない > Scenario: exit code が変更されていない

---

### TC-005: handler モジュールの import が command-registry を value 参照しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: handler モジュールから command-registry.ts への value import が存在しない > Scenario: handler モジュールの import が command-registry を参照しない

---

### TC-006: architecture ratchet が循環 import を検出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: handler モジュールから command-registry.ts への value import が存在しない > Scenario: architecture ratchet が循環 import を検出する

---

### TC-007: 並行 CLI 契約正本が command-registry.ts 以外に存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CommandSpec ツリーが CLI 契約の唯一の正本であり続ける > Scenario: 並行 CLI 契約正本が存在しない

---

### TC-008: CLI contract snapshot が変更前後で完全に一致する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CLI 契約（command path・flags・aliases・guards）が変更前後で同一である > Scenario: CLI contract snapshot が変更前後で一致する

---

### TC-009: 既存 CLI テスト群がすべてグリーンのまま

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: 既存の CLI contract テストが green を維持する > Scenario: 既存テスト群が全てグリーンのまま

verification phase: `bun run test`（`command-registry-resume.test.ts`・`command-registry-reopen.test.ts`・`archive-from-issue.test.ts`・`resume-from-issue.test.ts`・`view-commands-worktree-guard.test.ts`・`login.test.ts`・`from-flag-no-enum.test.ts` を含む全 CLI テスト）

---

### TC-010: ARCHIVE_USAGE が command-registry.ts から import 可能である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: USAGE 定数が引き続き command-registry から import 可能である > Scenario: ARCHIVE_USAGE が command-registry から import 可能である

---

### TC-011: repository 全体の process.exit 件数が変化しない

**Category**: gate
**Priority**: must
**Source**: spec.md > Requirement: repository 全体の process.exit 件数が変化しない > Scenario: process.exit 件数が変化しない

verification: T-18 メトリクス比較（`grep -r "process.exit" src/ --include="*.ts" | wc -l` を抽出前後で同一コマンドで計測し件数が一致することを確認）

---

## 非 Scenario 由来テストケース

### TC-012: command-handler.ts が CommandHandler 型を export し command-registry.ts が re-export する

**Category**: unit
**Priority**: must
**Source**: design.md > D2, tasks.md > T-02

**GIVEN** `src/cli/command-handler.ts` が新規作成されている
**WHEN** `import type { CommandHandler } from "./command-handler.js"` を実行し、さらに `import type { CommandHandler } from "./command-registry.js"` も実行する
**THEN** 両パスで `CommandHandler` 型が解決される
AND `command-registry.ts` は `CommandHandler` の型定義本体を持たず `export type { CommandHandler } from "./command-handler.js"` のみを行う
AND `bun run typecheck` がエラーなく通る

---

### TC-013: init / login / credentials.set の各 handler が process.exit 含む実装を handler module に保持する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `src/cli/init.ts`・`src/cli/login.ts`・`src/cli/credentials.ts` に各 handler 関数が追加されている
**WHEN** `COMMANDS` ツリー内の `init.handler`・`login.handler`・`credentials.children.set.handler` を確認する
**THEN** すべてが named function reference であり、それぞれ `handleInit`・`handleLogin`・`handleCredentialsSet` を参照する
AND `handleInit` は `runtimeRaw`・`providerRaw` の型キャストと `process.exit(await runInit(...))` を含む
AND `handleLogin` は `process.exit(await runLogin({ force: !!parsed.flags["force"] }))` を含む
AND `handleCredentialsSet` は `process.exit(await runCredentialsSet(parsed.positional!))` を含む

---

### TC-014: request-handlers.ts が 5 つの handler を named export する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04, design.md > D1

**GIVEN** `src/cli/request-handlers.ts` が新規作成されている
**WHEN** `src/cli/request-handlers.ts` の export 一覧を確認する
**THEN** `handleRequestNew`・`handleRequestPrompt`・`handleRequestLs`・`handleRequestTemplate`・`handleRequestValidate` の 5 関数がすべて named export されている
AND `COMMANDS.request.children` の全 5 handler が各 named reference を指している
AND `command-registry.ts` から `executeTemplate`・`executeValidate`・`executePrompt`・`executeList`・`executeNew` の import が削除されている

---

### TC-015: handleJobStart が run.ts に export され resolveSlugForDetach が command-registry から消えている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** T-05 の抽出が完了している
**WHEN** `src/cli/run.ts` の export 一覧と `src/cli/command-registry.ts` のソースを確認する
**THEN** `run.ts` に `handleJobStart` が named export されている
AND `command-registry.ts` に `resolveSlugForDetach` の定義が存在しない
AND `COMMANDS.job.children.start.handler` が `handleJobStart` を参照している（`handler.name === "handleJobStart"`）
AND `handleJobStart` は `--from-issue` 経由の `runFromIssue` 呼び出しと dynamic import `startWithIssueLink` を含む全分岐を維持している

---

### TC-016: handleJobLs が loadConfigWithOverlay / createGitHubClient を含む try-catch フローを維持する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** `src/cli/ps.ts` に `handleJobLs` と `handleJobStats` が追加されている
**WHEN** `handleJobLs` の実装を確認する
**THEN** `loadConfigWithOverlay` → `resolveGitHubToken` → `createGitHubClient` の呼び出し順が try ブロック内に維持されている
AND 例外発生時は catch ブロックで適切に終了する
AND `handleJobStats` は `process.exit(await runJobStats({ cwd: ctx!.repoRoot!, json: !!parsed.flags["json"] }))` を含む
AND `COMMANDS.job.children.ls.handler` と `COMMANDS.job.children.stats.handler` がそれぞれ named reference になっている

---

### TC-017: handleJobResume が --prompt-file 読み込みと --prompt との排他チェックを維持する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** `src/cli/resume.ts` に `handleJobResume` が実装されている
**WHEN** `--prompt-file <path>` フラグと `--prompt` フラグの両方を同時に指定して handleJobResume を呼び出す
**THEN** `--prompt` と `--prompt-file` の排他チェックが先行し、両指定時はエラーとして終了する
AND `--prompt-file` のみ指定した場合は `fs.readFileSync` でファイルを読み込み prompt として使用する

---

### TC-018: handleJobResume の --from-issue パスが runResumeFromIssue 呼び出しを維持する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** `src/cli/resume.ts` に `handleJobResume` が実装されている
**WHEN** `--from-issue` フラグを指定して handleJobResume を呼び出す
**THEN** positional 引数との排他チェックが先行する
AND `runResumeFromIssue` が呼ばれ、戻り値が `process.exit(code)` に渡される
AND `--detach` / `--json` の排他チェックも維持されている

---

### TC-019: handleDoctorRepair が dynamic import を静的 import に変換せずに維持する

**Category**: unit
**Priority**: should
**Source**: design.md > Risks/Trade-offs（dynamic import の扱い）, tasks.md > T-13

**GIVEN** `src/cli/doctor.ts` に `handleDoctorRepair` が実装されている
**WHEN** `doctor.ts` のソーステキストを確認する
**THEN** `import("../core/occupancy/repair.js")` の形式で dynamic import が維持されている
AND static import（`import { repairSlugOccupancySidecar } from ...`）に変換されていない
AND slug の null チェックと `stderrWrite` ガードが dynamic import の前に存在する

---

### TC-020: VALID_JOB_ID_CHARS が cancel.ts に移動し command-registry.ts から削除されている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** T-07 の抽出が完了している
**WHEN** `src/cli/cancel.ts` と `src/cli/command-registry.ts` のソースを確認する
**THEN** `VALID_JOB_ID_CHARS` 定数が `cancel.ts` に定義されている
AND `command-registry.ts` に `VALID_JOB_ID_CHARS` の定義が存在しない
AND `handleJobCancel` が `cancel.ts` に named export されている

---

### TC-021: GUIDE_TOPICS が command-registry.ts に残り guide-handler.ts に複製されない

**Category**: unit
**Priority**: could
**Source**: design.md > D3, tasks.md > T-15

**GIVEN** T-15 の抽出が完了している
**WHEN** `src/cli/guide-handler.ts` と `src/cli/command-registry.ts` のソースを確認する
**THEN** `GUIDE_TOPICS` は `command-registry.ts` にのみ定義されている（`help.summary` の文字列テンプレートで使用するため）
AND `guide-handler.ts` は `GUIDE_TOPICS` を定義せず import もしていない
AND `handleGuide` は `runGuide(parsed.positional)` と `process.exit` を維持している

---

### TC-022: command-registry.ts に fs / path / credential 関連の value import が存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-16

**GIVEN** T-16 のクリーンアップが完了している
**WHEN** `src/cli/command-registry.ts` の import 宣言一覧を確認する
**THEN** 以下の value import が一切存在しない:
`import * as fs`・`import * as path`・`resolveGitHubToken`・`createGitHubClient`・`loadConfigWithOverlay`・`resolveGitHubApiBaseUrl`・`resolveGitHubHost`・`storeResolve`（`resolveWithFallback`）・`parseRequestMdRaw`・`getOriginInfo`・`isDetachedChild`・`detachSelf`・`logError`・`stderrWrite`・`resolveLogLevel`・`SpecRunnerError`・`EXIT_CODE`
AND `COMMANDS` ツリー内の `handler: async` が 0 件である
AND `bun run typecheck` がエラーなく通る

---

### TC-023: scaffold-handlers.ts が handleRulesNew / handleReviewersNew を named export する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-14, design.md > D1

**GIVEN** `src/cli/scaffold-handlers.ts` が新規作成されている
**WHEN** `src/cli/scaffold-handlers.ts` の export と実装を確認する
**THEN** `handleRulesNew` と `handleReviewersNew` が named export されている
AND `handleRulesNew` は `executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, process.cwd())` を呼び出し結果を `process.exit` に渡す
AND `handleReviewersNew` は `executeReviewersNew(parsed.positional!, process.cwd())` を呼び出し結果を `process.exit` に渡す
AND `command-registry.ts` から `executeRulesNew`・`executeReviewersNew` の import が削除されている

---

### TC-024: managed.ts が 3 つの runtime handler を named export する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-12, design.md > D1

**GIVEN** T-12 の抽出が完了している
**WHEN** `src/cli/managed.ts` の export 一覧と実装を確認する
**THEN** `handleRuntimeSetup`・`handleRuntimeStatus`・`handleRuntimeReset` が named export されている
AND `handleRuntimeSetup` は `process.exit(await runManagedSetup())` を含む
AND `handleRuntimeStatus` は `process.exit(await runManagedStatus())` を含む
AND `handleRuntimeReset` は `process.exit(await runManagedReset({ force: !!parsed.flags["force"] }))` を含む
AND `COMMANDS.runtime.children` の各 handler が named reference になっている

---

### TC-025: architecture-ratchet.test.ts が 4 チェックを実装しすべてグリーンである

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-17, design.md > D4

**GIVEN** `src/cli/__tests__/architecture-ratchet.test.ts` が新規作成されている
**WHEN** `bun run test` を実行する
**THEN** 以下の 4 チェックがすべてグリーンである:
1. **handler.name チェック**: `COMMANDS` ツリーを再帰的に走査し、全 handler の `.name` が `"handler"` でないことを確認する（inline handler が存在する場合はどの command path で違反したかのメッセージとともに失敗する）
2. **process.exit ゼロ検証**: `command-registry.ts` のソースからコメントを除去した後 `process.exit` が 0 件であることを確認する
3. **import cycle ゼロ検証**: `@typescript-eslint/parser` で handler モジュールの import 宣言を解析し `command-registry` への type-only でない ImportDeclaration が 0 件であることを確認する
4. **並行 CLI 契約正本ゼロ検証**: `src/cli/` 配下のファイルで `export const COMMANDS` を定義するファイルが `command-registry.ts` のみであることを確認する

---

## Result

```yaml
result: completed
total: 25
automated: 23
manual: 0
must: 13
should: 11
could: 1
blocked_reasons: []
```
