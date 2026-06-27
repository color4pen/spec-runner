# Test Cases: cancel-canceled-dir

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
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

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

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

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 26 cases
- **Automated** (unit/integration): 20
- **Manual**: 6
- **Priority**: must: 22, should: 4, could: 0

---

### TC-001: ワークツリー専用ジョブが canceled/ に退避される

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: Cancel SHALL evacuate the change folder to `canceled/<slug>-<jobId8>/` before cleanup > Scenario: Worktree-only local job is evacuated to canceled/

---

### TC-002: request.md が canceled/ に保全される

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: Cancel SHALL evacuate the change folder to `canceled/<slug>-<jobId8>/` before cleanup > Scenario: request.md is preserved in canceled/

---

### TC-003: ワークツリー専用ジョブのキャンセル記録が worktree 撤去後も残る

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: The evacuated state SHALL retain the cancellation record after cleanup > Scenario: Cancellation record survives for a worktree-only job

---

### TC-004: 同名 slug を同日に 2 回 cancel しても canceled/ で衝突しない

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: Same-slug cancels SHALL NOT collide in canceled/ > Scenario: Two same-slug jobs canceled the same day

---

### TC-005: cancel 後に worktree と local/remote branch が削除される

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: Cancel SHALL maintain cleanup of worktree and branches > Scenario: Worktree and branches are removed after cancel

---

### TC-006: --purge 指定時は canceled/ に墓標が作られない

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: `--purge` SHALL skip evacuation > Scenario: Purge leaves no gravestone

---

### TC-007: 既に canceled のジョブを再 cancel しても state は不変

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: Cancel of an already-canceled job SHALL remain idempotent > Scenario: Re-canceling a canceled job does not mutate state

---

### TC-008: canceledChangesDirRel() が正しいパスを返す

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01

**GIVEN** `canceledChangesDirRel()` を引数なしで呼び出す  
**WHEN** 戻り値を確認する  
**THEN** `"specrunner/changes/canceled"` が返る

---

### TC-009: canceledChangeFolderPath() が dirName を結合したパスを返す

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01

**GIVEN** `canceledChangeFolderPath("foo-1234abcd")` を呼び出す  
**WHEN** 戻り値を確認する  
**THEN** `"specrunner/changes/canceled/foo-1234abcd"` が返る

---

### TC-010: canceledDirName() が slug と jobId 先頭 8 桁を結合する

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01

**GIVEN** `canceledDirName("foo", "1234abcd-aaaa-bbbb-cccc-ddddeeeeffff")` を呼び出す  
**WHEN** 戻り値を確認する  
**THEN** `"foo-1234abcd"` が返る（UUID 全体でなく先頭 8 桁のみを使用する）

---

### TC-011: paths.ts が他の src/ モジュールを import していない

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md > T-01（既存制約 TC-034）

**GIVEN** `src/util/paths.ts` に canceled 系ヘルパーを追加した後  
**WHEN** import 文を静的に確認する  
**THEN** `src/` 配下の他モジュールへの import が一切存在しない

---

### TC-012: canceled/ が存在しても JobStateStore.list が canceled を slug と誤認しない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-02 / design.md > D7

**GIVEN** `specrunner/changes/canceled/<slug>-<jobId8>/` ディレクトリが存在するリポジトリ  
**WHEN** `JobStateStore.list` が `specrunner/changes/*` を走査する  
**THEN** `canceled` という名の slug は走査対象に含まれず、例外なく完了する

---

### TC-013: archive の skip 挙動が回帰していない

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-02

**GIVEN** `specrunner/changes/archive/` ディレクトリが存在するリポジトリ  
**WHEN** `JobStateStore.list` が `specrunner/changes/*` を走査する  
**THEN** `archive` という名の slug は走査対象に含まれず、既存の skip 挙動が維持される

---

### TC-014: evacuateChangeFolder が退避元を解決できない場合は警告を積んで空ディレクトリを用意する

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-03

**GIVEN** worktree slug dir / canonical / managed sidecar のいずれも存在しないジョブの state  
**WHEN** `evacuateChangeFolder(state, deps, warnings)` を呼び出す  
**THEN** warnings に警告が追加され、`canceled/<slug>-<jobId8>/` 空ディレクトリが作成され、例外は投げられない

---

### TC-015: evacuateChangeFolder が slug 空の state を安全に処理する

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-03

**GIVEN** slug が空文字列の state  
**WHEN** `evacuateChangeFolder(state, deps, warnings)` を呼び出す  
**THEN** warnings に警告が追加され、コピーや `canceled/` ディレクトリ作成は実行されず、例外は投げられない

---

### TC-016: evacuateChangeFolder がコピー失敗時に警告のみ積んで処理を続行する

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-03 / design.md > D4（best-effort）

**GIVEN** 退避元ディレクトリが解決でき、`fs.cp` がエラーを投げる状況  
**WHEN** `evacuateChangeFolder(state, deps, warnings)` を呼び出す  
**THEN** warnings に警告が追加され、例外は投げられず、`canceled/<slug>-<jobId8>/` ディレクトリが存在する

---

### TC-017: --purge 時は canceled/ ディレクトリも persist も生成されない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-04 / design.md > D6

**GIVEN** `--purge` フラグを指定してジョブを cancel する  
**WHEN** `cancelSingleJob` が実行される  
**THEN** `canceled/<slug>-<jobId8>/` ディレクトリが作成されず、`.specrunner/local/<slug>/` が削除される

---

### TC-018: status=canceled 再 cancel で退避・persist が skip される

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-04 / design.md > D6

**GIVEN** すでに `status=canceled` のジョブ  
**WHEN** `cancelSingleJob` を再度呼び出す  
**THEN** `evacuateChangeFolder` は呼ばれず、新たな `canceled/` ディレクトリエントリは作成されず、cleanup と marker unlink のみ実行される

---

### TC-019: resolveStateStoreByJobId の import が runner.ts から削除されている

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md > T-04

**GIVEN** `src/core/cancel/runner.ts` を T-04 の再配線後に確認する  
**WHEN** import 文を静的に確認する  
**THEN** `resolveStateStoreByJobId` の import が存在しない

---

### TC-020: .gitignore に specrunner/changes/canceled/ が追加されている

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md > T-05 / design.md > D5

**GIVEN** `.gitignore` ファイル  
**WHEN** 内容を確認する  
**THEN** `specrunner/changes/canceled/` を ignore する行が存在する

---

### TC-021: .gitignore の既存 .specrunner ブロックが壊れていない

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md > T-05

**GIVEN** `.gitignore` ファイル  
**WHEN** `.specrunner/*` と `!.specrunner/config.json` の 2 行構成を確認する  
**THEN** 両行がそれぞれ独立して存在し、順序と形式が変更前と同一である

---

### TC-022: makeJob が worktree-only レイアウトで state を生成する（canonical 直書きなし）

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-06

**GIVEN** テスト用 `makeJob` を呼び出してジョブのファイル構造を生成する  
**WHEN** main checkout（`tempDir/specrunner/changes/<slug>/state.json`）の存在を確認する  
**THEN** main checkout に `state.json` が存在せず、state は worktree 内（`<worktreeDir>/specrunner/changes/<slug>/state.json`）にのみ存在する

---

### TC-023: typecheck が error ゼロで完了する

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md > T-07

**GIVEN** 全変更が適用されたコードベース  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーが 0 件で完了する

---

### TC-024: test suite が全 pass で完了する

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md > T-07

**GIVEN** 全変更が適用されたコードベース  
**WHEN** `bun run test` を実行する  
**THEN** failed テストが 0 件で完了する

---

### TC-025: 各種ステータスの worktree-only ジョブが cancel で canceled/ に state を残す

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-06（既存ステータス遷移テストの置き換え）

**GIVEN** `awaiting-merge（--force）` / `running` / `awaiting-resume` / `failed` / `terminated` いずれかの status を持つ worktree-only ジョブ  
**WHEN** `cancelSingleJob` を実行する  
**THEN** `canceled/<slug>-<jobId8>/state.json` に `status=canceled` / `error.code=USER_CANCELED` / `canceledAt` が記録される

---

### TC-026: cancelAllTerminated が worktree-only レイアウトでジョブを検出できる

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-06（cancelAllTerminated テスト群）

**GIVEN** sidecar が存在し worktree-only state を持つ terminated ジョブが複数ある  
**WHEN** `cancelAllTerminated` を実行する  
**THEN** 対象ジョブが検出されてキャンセルが実行され、各ジョブの `canceled/<slug>-<jobId8>/` に state が残る

---

## Result

```yaml
result: completed
total: 26
automated: 20
manual: 6
must: 22
should: 4
could: 0
blocked_reasons: []
```
