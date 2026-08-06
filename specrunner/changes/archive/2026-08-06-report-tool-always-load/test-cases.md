# Test Cases: report tool を alwaysLoad にして ToolSearch 経由の cache 全破棄を止める

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
-->

## Summary

- **Total**: 6 cases
- **Automated** (unit/integration): 4
- **Manual**: 0
- **Priority**: must: 5, should: 1, could: 0

---

### TC-001: reportTool が設定されている場合に alwaysLoad: true が渡る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: report MCP server は alwaysLoad: true で生成されなければならない > Scenario: reportTool が設定されている場合に alwaysLoad: true が渡る

---

### TC-002: report server が外部プロセス形式でない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: report MCP server は in-process の SDK MCP server でなければならない > Scenario: report server が外部プロセス形式でない

---

### TC-003: reportTool が undefined の場合に MCP server が生成されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reportTool が未設定の場合は MCP server を生成してはならない > Scenario: reportTool が undefined の場合に MCP server が生成されない

---

### TC-004: alwaysLoad: true を削除すると TC-001 が fail する（回帰検証）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `agent-runner.ts` の `createMcpServerFn` 呼び出しから `alwaysLoad: true` を削除した状態
**WHEN** TC-001 に対応するユニットテストを実行する
**THEN** テストが fail する（`alwaysLoad` の欠落を検出できる）

---

### TC-005: typecheck が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

`typecheck` verification phase を実行する（`bun run typecheck`）。`CreateSdkMcpServerOptions.alwaysLoad?: boolean` に適合していることを確認する。

---

### TC-006: 既存テスト（TC-FW-06/TC-FW-07 を含む）が無変更で green

**Category**: gate
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria

`test` verification phase を実行する（`bun run test`）。`src/adapter/claude-code/__tests__/` の既存テスト群が report tool 登録経路の変更後も全件 pass することを確認する。

---

## Result

```yaml
result: completed
total: 6
automated: 4
manual: 0
must: 5
should: 1
could: 0
blocked_reasons: []
```

