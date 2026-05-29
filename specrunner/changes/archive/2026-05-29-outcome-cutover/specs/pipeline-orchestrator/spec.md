## Requirements

### Requirement: Pipeline is Driven by a Declarative Transition Table

The standard transition table SHALL NOT include `escalation` transitions for judge steps (spec-review, code-review). Judge steps produce only `"approved"` or `"needs-fix"` verdicts. Halt for judge steps occurs exclusively through loop exhaustion (grounded).

Grounded steps (delta-spec-validation, verification) SHALL maintain their `escalation → escalate` transitions because their escalation is computation-derived, not agent self-report.

The code-review `approved → code-fixer` conditional transition's `when` predicate SHALL evaluate `toolResult.fixableCount` from the latest code-review step result instead of `parseFixableFindings(fileContent)`. When `toolResult` is null or `fixableCount` is undefined, the value SHALL default to 0 (no fixable findings).

The full table SHALL be:

- `design --success→ delta-spec-validation`
- `design --error→ escalate`
- `delta-spec-validation --approved→ adr-gen` (when: code-review 実行済み)
- `delta-spec-validation --approved→ spec-review` (fallback)
- `delta-spec-validation --needs-fix→ delta-spec-fixer`
- `delta-spec-validation --escalation→ escalate`
- `delta-spec-fixer --approved→ delta-spec-validation`
- `delta-spec-fixer --error→ escalate`
- `spec-review --approved→ test-case-gen`
- `spec-review --needs-fix→ spec-fixer`
- `spec-fixer --approved→ delta-spec-validation`
- `spec-fixer --error→ escalate`
- `test-case-gen --success→ implementer`
- `test-case-gen --error→ escalate`
- `implementer --success→ verification`
- `implementer --error→ escalate`
- `verification --passed→ code-review`
- `verification --failed→ build-fixer`
- `verification --escalation→ escalate`
- `build-fixer --success→ verification`
- `build-fixer --error→ escalate`
- `code-review --approved→ code-fixer` (when: toolResult.fixableCount > 0)
- `code-review --approved→ delta-spec-validation`
- `code-review --needs-fix→ code-fixer`
- `code-fixer --approved→ delta-spec-validation` (when: 直前 code-review が approved)
- `code-fixer --approved→ code-review` (fallback)
- `code-fixer --error→ escalate`
- `adr-gen --success→ pr-create`
- `adr-gen --error→ escalate`
- `pr-create --success→ end`
- `pr-create --error→ escalate`

#### Scenario: spec-review escalation 遷移が存在しない

**Given** the standard transition table
**When** spec-review step が何らかの verdict を返す
**Then** `on: "escalation"` にマッチする遷移行は存在しない（approved / needs-fix のみ）

#### Scenario: code-review escalation 遷移が存在しない

**Given** the standard transition table
**When** code-review step が何らかの verdict を返す
**Then** `on: "escalation"` にマッチする遷移行は存在しない（approved / needs-fix のみ）

#### Scenario: grounded step の escalation 遷移は維持

**Given** the standard transition table
**When** delta-spec-validation step が `"escalation"` verdict を返す
**Then** `escalate` に遷移する（計算由来の escalation は維持）

#### Scenario: fixable routing が toolResult.fixableCount を使用

**Given** code-review step が `toolResult: { ok: true, approved: true, fixableCount: 2 }` で完了する
**When** the transition table の `when` predicate が評価される
**Then** `fixableCount > 0` が true となり code-fixer に遷移する

#### Scenario: fixableCount が未設定の場合はデフォルト path

**Given** code-review step が `toolResult: { ok: true, approved: true }` で完了する（fixableCount 未設定）
**When** the transition table の `when` predicate が評価される
**Then** `fixableCount ?? 0` で 0 扱いとなり delta-spec-validation に遷移する（通常 approved path）
