# Test Cases: finish を分解し archive を client-closed な最終片づけコマンドにする

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 17
- **Manual**: 3
- **Priority**: must: 13, should: 6, could: 1

---

### TC-001: archive 単体実行時に GitHub API 呼び出しが発生しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: archive orchestrator は GitHubClient port に依存しない > Scenario: archive 単体実行時に GitHub API 呼び出しが発生しない

---

### TC-002: ArchiveOrchestrator モジュールが GitHubClient を import しない

**Category**: unit
**Priority**: must
**Source**: design.md > D1, tasks.md > T-02

**GIVEN** `src/core/archive/orchestrator.ts` が存在する  
**WHEN** モジュールの import 文を静的に検査する  
**THEN** `src/core/port/github-client.ts` および `src/kernel/github-client.ts` への import が存在しない

---

### TC-003: change folder が存在する場合のアーカイブ

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job archive は change folder を main に commit + push する > Scenario: change folder が存在する場合

---

### TC-004: change folder が存在しない場合のアーカイブ

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: job archive は change folder を main に commit + push する > Scenario: change folder が存在しない場合

---

### TC-005: worktree が存在する job を archive する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job archive は worktree を撤去する > Scenario: worktree が存在する job を archive する

---

### TC-006: awaiting-archive の job を archive する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job archive は status を archived に遷移する > Scenario: awaiting-archive の job を archive する

---

### TC-007: job finish を実行する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job finish コマンドは削除され、deprecation メッセージを返す > Scenario: job finish を実行する

---

### TC-008: PR が CLEAN で merge 成功 → archive 実行

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --with-merge オプションで merge → archive を一気通貫で実行する > Scenario: PR が CLEAN で merge 成功 → archive 実行

---

### TC-009: PR が BLOCKED で merge 停止

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --with-merge オプションで merge → archive を一気通貫で実行する > Scenario: PR が BLOCKED で merge 停止

---

### TC-010: pipeline 完了時に awaiting-archive に遷移する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: awaiting-merge は awaiting-archive に rename される > Scenario: pipeline 完了時に awaiting-archive に遷移する

---

### TC-011: legacy success status を load する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 旧 status は load 時に awaiting-archive へ remap される > Scenario: legacy success status を load する

---

### TC-012: legacy awaiting-merge status を load する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 旧 status は load 時に awaiting-archive へ remap される > Scenario: legacy awaiting-merge status を load する

---

### TC-013: terminal status の job は archive で no-op exit 0

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** job status が `archived` または `failed` などの terminal status である  
**WHEN** `job archive <slug>` を実行する  
**THEN** 処理はスキップされ exit code 0 で終了する

---

### TC-014: PR が既に MERGED の場合は merge をスキップして archive を実行

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** PR の status が `MERGED` である  
**WHEN** `job archive --with-merge <slug>` を実行する  
**THEN** merge はスキップされ archive のみが実行され status が `archived` になる

---

### TC-015: GitHub token 解決失敗時は exit 2

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** GitHub token が環境変数に設定されていない  
**WHEN** `job archive --with-merge <slug>` を実行する  
**THEN** stderr にエラーメッセージが出力され exit code 2 で終了する

---

### TC-016: worktree 内から archive を実行した場合にブロックされる

**Category**: integration
**Priority**: should
**Source**: design.md > D6, tasks.md > T-05

**GIVEN** ユーザーが specrunner の worktree ディレクトリ内から実行している  
**WHEN** `job archive <slug>` を実行する  
**THEN** main worktree 外からの実行である旨のエラーが出力され、処理は実行されない

---

### TC-017: specrunner --help に job archive が表示される

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** specrunner CLI が利用可能  
**WHEN** `specrunner --help` または `specrunner job --help` を実行する  
**THEN** `job archive` コマンドが help 出力に表示され、`job finish` は表示されない

---

### TC-018: VALID_TRANSITIONS に awaiting-archive が含まれ awaiting-merge が含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/state/lifecycle.ts` の `VALID_TRANSITIONS` を検査する  
**WHEN** `awaiting-merge` / `awaiting-archive` の存在を確認する  
**THEN** `awaiting-archive` が key として存在し、`awaiting-merge` が key として存在しない

---

### TC-019: skill ファイルに job finish / awaiting-merge の残存参照がない

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** `.claude/skills/rebase-finish/SKILL.md` および `acceptance-and-issue-audit/SKILL.md` が更新済み  
**WHEN** ファイル内容を検査する  
**THEN** deprecation 説明以外に `job finish` および `awaiting-merge` の参照が存在しない

---

### TC-020: bun run typecheck && bun run test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** 全ての実装変更が完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 型エラー・テスト失敗なく green で完了する

---

## Result

```yaml
result: completed
total: 20
automated: 17
manual: 3
must: 13
should: 6
could: 1
blocked_reasons: []
```
