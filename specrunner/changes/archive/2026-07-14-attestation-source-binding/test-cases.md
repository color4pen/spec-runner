# Test Cases: fact-check attestation を source revision に束縛する

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

- **Total**: 22 cases
- **Automated** (unit/integration): 22
- **Manual**: 0
- **Priority**: must: 17, should: 4, could: 1

---

## Spec Scenario 由来

### TC-001: source 未変化なら valid を維持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attestation は source revision に束縛される > Scenario: source 未変化なら valid を維持する

### TC-002: request.md 不変でも source 変化で stale にする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attestation は source revision に束縛される > Scenario: request.md 不変でも source 変化で stale にする

### TC-003: source 信号を持たない旧 attestation は stale になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: source 信号は fail-safe に stale へ倒す > Scenario: source 信号を持たない旧 attestation は stale になる

### TC-004: current source revision が取得不能なら stale になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: source 信号は fail-safe に stale へ倒す > Scenario: current source revision が取得不能なら stale になる

### TC-005: 既存の stale 条件が保存される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: source 信号は fail-safe に stale へ倒す > Scenario: 既存の stale 条件が保存される

---

## 非 Scenario 由来

### TC-006: readSourceRevision が change folder commit を無視して source commit sha を返す

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** git 履歴を持つ一時リポジトリで、source ファイルを 1 commit した後に `specrunner/changes/` 配下のファイルを 2 commit 目としてコミットしてある
**WHEN** `readSourceRevision(cwd)` を呼ぶ
**THEN** 1 commit 目（source commit）の sha を返す。2 commit 目（change folder commit）の sha は返らない

### TC-007: 非 git ディレクトリで readSourceRevision が null を返す

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** git 管理外の一時ディレクトリ、または git 実行不能な環境
**WHEN** `readSourceRevision(cwd)` を呼ぶ
**THEN** `null` を返し、例外を投げない

### TC-008: sourceRevision フィールドを持つ JSON を parse すると値が取り込まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `sourceRevision: "abc123"` を含む valid な attestation JSON 文字列
**WHEN** `parseFactCheckAttestation` で parse する
**THEN** parse に成功し、返却オブジェクトの `sourceRevision` が `"abc123"` である

### TC-009: sourceRevision を持たない旧 attestation JSON が parse に成功する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `sourceRevision` フィールドを含まない旧形式の attestation JSON 文字列
**WHEN** `parseFactCheckAttestation` で parse する
**THEN** parse に成功し、返却オブジェクトの `sourceRevision` が `undefined` である（parse 自体は失敗しない）

### TC-010: sourceRevision が非 string の場合 undefined として扱う

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `sourceRevision` フィールドが数値・null・boolean など非 string 型の attestation JSON
**WHEN** `parseFactCheckAttestation` で parse する
**THEN** parse に成功し、返却オブジェクトの `sourceRevision` が `undefined` である

### TC-011: buildFactCheckAttestation の第 3 引数省略時に sourceRevision を出力しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `requestContent` と `verifiedAssertions` のみを引数として `buildFactCheckAttestation` を呼ぶ（第 3 引数省略）
**WHEN** 返却 JSON 文字列を確認する
**THEN** `sourceRevision` キーが JSON に含まれない

### TC-012: null または非 JSON の attestationRaw は absent を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `attestationRaw` が `null`、または JSON として parse 不能な文字列
**WHEN** `evaluateFactCheckAttestation(attestationRaw, requestContent, sourceRevision)` を呼ぶ
**THEN** 評価は `absent` となる（`stale` でも `valid` でもない）

### TC-013: request-review enrichContext が readSourceRevision の値を sourceRevision に設定する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** git 履歴を持つ一時リポジトリに request.md が存在し、source commit が積まれている
**WHEN** `RequestReviewStep.enrichContext` を実行する
**THEN** 返却コンテキストの `sourceRevision` が `readSourceRevision(cwd)` の返す sha と一致する

### TC-014: buildRequestReviewInitialMessage に sourceRevision を渡すと attestation JSON に含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `sourceRevision: "sha-abc"` を含む入力で `buildRequestReviewInitialMessage` を呼ぶ
**WHEN** 生成メッセージの attestation JSON テンプレート部分を確認する
**THEN** `"sourceRevision": "sha-abc"` が含まれる

### TC-015: buildRequestReviewInitialMessage に sourceRevision を渡さないと attestation JSON に含まれない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `sourceRevision` を含まない入力で `buildRequestReviewInitialMessage` を呼ぶ
**WHEN** 生成メッセージの attestation JSON テンプレート部分を確認する
**THEN** `sourceRevision` キーが含まれない

### TC-016: request.md 不在時は request-review enrichContext が縮退し sourceRevision を付与しない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** request.md が存在しないディレクトリで `RequestReviewStep.enrichContext` を実行する
**WHEN** 返却コンテキストを確認する
**THEN** `sourceRevision` も `requestContentHash` も付与されず、コンテキストは無改変で縮退する

### TC-017: design enrichContext が source 一致・hash 一致・verified true のとき valid を返す

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** git 履歴を持つ一時リポジトリに request.md と attestation ファイルが存在し、attestation の `sourceRevision` が `readSourceRevision` と一致し、`requestHash` も一致し、`codeAssertionsVerified` が `true`
**WHEN** `DesignStep.enrichContext` を実行する
**THEN** `factCheckAttestation.status === "valid"` かつ `verifiedAssertions` に記録済みアサーションが含まれる

### TC-018: design enrichContext が source 不一致のとき stale を返す

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** attestation の `sourceRevision` が current `readSourceRevision` と異なる値（`requestHash` は一致・`codeAssertionsVerified` は true）
**WHEN** `DesignStep.enrichContext` を実行する
**THEN** `factCheckAttestation.status === "stale"`

### TC-019: 旧 attestation（sourceRevision なし）で design enrichContext が stale を返す

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `sourceRevision` フィールドを持たない旧形式の attestation ファイルが存在する（`requestHash` は一致・`codeAssertionsVerified` は true）
**WHEN** `DesignStep.enrichContext` を実行する
**THEN** `factCheckAttestation.status === "stale"`

### TC-020: request.md 不在時は design enrichContext が factCheckAttestation を設定しない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** request.md が存在しないディレクトリで `DesignStep.enrichContext` を実行する
**WHEN** 返却コンテキストを確認する
**THEN** `factCheckAttestation` が設定されない（既存の縮退挙動を保存）

### TC-021: stale directive が source revision への言及を含む

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-06

**GIVEN** `evaluateFactCheckAttestation` が `stale` を返す状況（source 変化・requestHash 不一致・codeAssertionsVerified false のいずれか）
**WHEN** `buildFactCheckDirective` で directive 文を生成する
**THEN** 出力文が `"stale"` と `"ALL"` を含み、かつ source revision 変化への言及も含む

### TC-022: typecheck と全テストが green になる

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** T-01 から T-07 の実装がすべて完了している
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーが 0 件でありテストがすべて pass する

## Result

```yaml
result: completed
total: 22
automated: 22
manual: 0
must: 17
should: 4
could: 1
blocked_reasons: []
```
