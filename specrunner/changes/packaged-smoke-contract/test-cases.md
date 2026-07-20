# Test Cases: CI の package smoke を初回接触契約の assert に拡張する

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

- **Total**: 15 cases
- **Automated** (unit/integration): 10
- **Manual**: 5
- **Priority**: must: 13, should: 1, could: 1

---

### TC-001: init outside a git repository exits non-zero and writes nothing including under isolated XDG

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts using only the packed tarball run with node > Scenario: init outside a git repository writes nothing including under isolated XDG

---

### TC-002: init from a subdirectory lands scaffold at repo root without nesting and reports created

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts using only the packed tarball run with node > Scenario: init from a subdirectory lands scaffold at repo root without nesting and reports created

---

### TC-003: isolated XDG init then doctor reports config-file-exists pass judged per-check

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts using only the packed tarball run with node > Scenario: isolated XDG init then doctor reports config-file-exists pass judged per-check

---

### TC-004: request new from a subdirectory lands at repo root without nesting

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts using only the packed tarball run with node > Scenario: request new from a subdirectory lands at repo root without nesting

---

### TC-005: help startup check is retained on the packaged artifact

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts using only the packed tarball run with node > Scenario: help startup check is retained on the packaged artifact

---

### TC-006: the smoke does not reference bun or repository sources

**Category**: automated
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts using only the packed tarball run with node > Scenario: the smoke does not reference bun or repository sources

---

### TC-007: assertions hold regardless of ambient tokens

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Smoke SHALL run hermetically and token-free, isolated from developer and runner state > Scenario: assertions hold regardless of ambient tokens

---

### TC-008: fixtures and config are isolated from the host

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Smoke SHALL run hermetically and token-free, isolated from developer and runner state > Scenario: fixtures and config are isolated from the host

---

### TC-009: CI runs the smoke script and fails on a broken contract

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: CI SHALL run the smoke as a gate and the smoke SHALL be locally runnable > Scenario: CI runs the smoke script and fails on a broken contract

---

### TC-010: a developer runs the same smoke locally

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: CI SHALL run the smoke as a gate and the smoke SHALL be locally runnable > Scenario: a developer runs the same smoke locally

---

### TC-011: inverting one expectation fails exactly that assertion

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Each smoke assertion SHALL be independently falsifiable > Scenario: inverting one expectation fails exactly that assertion

---

### TC-012: smoke script exits with explicit error when dist/specrunner.js is absent

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01 / design.md > D2（前提チェック）

**GIVEN** `dist/specrunner.js` が存在しない状態（`bun run build` 未実行）
**WHEN** `bash scripts/smoke/package-smoke.sh` を実行する
**THEN** スクリプトが非ゼロ exit し、dist が無い旨と先に build するよう促す人間可読なエラーメッセージを出力し、`bun` は呼び出さない

---

### TC-013: package.json に smoke convenience script エントリが存在する

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-06 / design.md > D6（CI 配線とローカル起動口）

**GIVEN** 変更後の `package.json`
**WHEN** `scripts` フィールドを確認する
**THEN** `"smoke"` エントリ（または同等）が存在し、その値が `bash scripts/smoke/package-smoke.sh` を呼び出すものになっている。既存の build / test / lint スクリプトは変更されていない

---

### TC-014: スクリプト終了時に temp ディレクトリが後片付けされる

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-01 / design.md > D3（fixture 作成・隔離方針）

**GIVEN** `scripts/smoke/package-smoke.sh` が実行中であり、`mktemp -d` で作成した temp ディレクトリと pack で生成した tarball が存在する
**WHEN** スクリプトが（成功・失敗を問わず）終了する
**THEN** `trap` 等の仕組みにより、mktemp で作成した一時ディレクトリと tarball が削除されている

---

### TC-015: typecheck と vitest がリグレッションなしで green になる

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** smoke スクリプト・CI step・package.json の変更が適用されており、`src/` の製品コードに変更がない状態
**WHEN** `bun run typecheck` と `bun run test` を実行する
**THEN** 両者が exit 0 で完了し、型エラーもテスト失敗も発生しない

---

## Result

```yaml
result: completed
total: 15
automated: 9
manual: 6
must: 13
should: 1
could: 1
blocked_reasons: []
```
