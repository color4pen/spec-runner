# Test Cases: 主役 E2E の Machine B を実 `job resume` 経路で通す

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 12
- **Manual**: 1
- **Priority**: must: 10, should: 1, could: 2

---

### TC-001: 実 attach 成果物から実 resume が開始する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 主役 E2E は Machine B を実 `ResumeCommand` 経由で resume 開始する > Scenario: 実 attach 成果物から実 resume が開始する

---

### TC-002: resume が sidecar/worktree 経由で attached state を解決する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 主役 E2E は Machine B を実 `ResumeCommand` 経由で resume 開始する > Scenario: resume が sidecar/worktree 経由で attached state を解決する

---

### TC-003: 解決された開始 step は resumePoint.step と一致する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 主役 E2E は Machine B を実 `ResumeCommand` 経由で resume 開始する > Scenario: 解決された開始 step は resumePoint.step と一致する

---

### TC-004: running 遷移が worktree の state.json へ永続化される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 主役 E2E は Machine B を実 `ResumeCommand` 経由で resume 開始する > Scenario: running 遷移が worktree の state.json へ永続化される

---

### TC-005: existing worktree を再利用し新規 worktree を作らない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 主役 E2E は Machine B を実 `ResumeCommand` 経由で resume 開始する > Scenario: existing worktree を再利用し新規 worktree を作らない

---

### TC-006: descriptor は buildPipelineForJob が実選択する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 主役 E2E は Machine B を実 `ResumeCommand` 経由で resume 開始する > Scenario: descriptor は buildPipelineForJob が実選択する

---

### TC-007: Machine A のアサーションは #838 と同一で green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Machine A（#838）の挙動は不変 > Scenario: Machine A のアサーションは #838 と同一で green

---

### TC-008: 主役 E2E 受け入れ基準が実体を表す

**Category**: manual
**Priority**: could
**Source**: spec.md > Requirement: 受け入れ基準の文言は実体に一致する > Scenario: 主役 E2E 受け入れ基準が実体を表す

---

### TC-009: createAgentRunner override のみが fake 化し、他 seam は実 LocalRuntime のまま

**Category**: integration
**Priority**: must
**Source**: design.md > D3: 唯一 fake にする seam は agent runner のみ

**GIVEN** `LocalRuntime` を薄く継承して `createAgentRunner()` だけを override した resumeRuntime を用意し、resolver / setupWorkspace / buildDeps / pipeline の各 seam は override しない

**WHEN** `new ResumeCommand(resumeRuntime, events, SLUG, { cwd: machineBDir }).execute()` を呼ぶ

**THEN** fake runner が agent runner として `buildDeps()` に注入される一方、`resolveJobStateBySlug`・`setupWorkspace`・`buildPipelineForJob`・`Pipeline.run` は実 LocalRuntime の実装で動作する（mock・spy が割り込まない）

---

### TC-010: resume 前提の config/XDG 隔離で loadConfig が CONFIG_MISSING を投げない

**Category**: integration
**Priority**: should
**Source**: design.md > D7: 実 resume が要求する前提の充足（config / XDG） / tasks.md > T-03

**GIVEN** `machineBDir/.specrunner/config.json` に最小 standalone config（`{ "version": 1, "runtime": "local", "agents": {} }`）を書き、`XDG_CONFIG_HOME` を空の一時ディレクトリへ隔離してある（host の user global config を排除）

**WHEN** `ResumeCommand.prepare()` が `loadConfig(repoRoot)` を呼ぶ

**THEN** `CONFIG_MISSING` を投げず prepare が正常に完了し、resume 経路が続行する

---

### TC-011: 既存テスト（attach / resume unit / guard-halt）が無変更で green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 / tasks.md > T-02 Acceptance Criteria

**GIVEN** 本 change が `tests/attach/attach-resume-e2e.test.ts` の Machine B 側のみを変更し、他テストファイルは無変更

**WHEN** `bun run test` を実行する

**THEN** `tests/attach/*`・`tests/unit/core/command/resume.test.ts`（`buildPipelineForJob` の vi.mock を含む既存ユニットテスト）・guard-halt 関連テスト・publisher テストがすべて green である

---

### TC-012: typecheck が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** Machine B 側の実装変更（T-01〜T-05）がすべて適用されている

**WHEN** `bun run typecheck` を実行する

**THEN** 型エラーが 0 件で完了する

---

### TC-013: execute() の exit code が awaiting-resume で 1

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-04（任意アサーション）

**GIVEN** Machine B で `ResumeCommand.execute()` が fake runner の `completionReason: "timeout"` を受けて STANDARD descriptor 上で implementer が guard-halt し、awaiting-resume 終端になる

**WHEN** `execute()` の Promise が resolve する

**THEN** 戻り値の exit code は 1（awaiting-resume で halted）である

---

## Result

```yaml
result: completed
total: 13
automated: 12
manual: 1
must: 10
should: 1
could: 2
blocked_reasons: []
```
