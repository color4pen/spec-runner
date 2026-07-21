# Test Cases: 承認の revision 束縛

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 11, should: 7, could: 1

---

### TC-001: 再走で revision が動いた stale conformance 承認は短絡しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification passed の adr-gen / pr-create 短絡は conformance 承認 revision と一致する場合に限る > Scenario: 再走で revision が動いた stale conformance 承認は短絡しない（criterion 1）

---

### TC-002: revision が動いていなければ現行どおり短絡する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification passed の adr-gen / pr-create 短絡は conformance 承認 revision と一致する場合に限る > Scenario: revision が動いていなければ現行どおり短絡する（criterion 2）

---

### TC-003: commitOid 欠落のレガシー承認は stale 扱い

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification passed の adr-gen / pr-create 短絡は conformance 承認 revision と一致する場合に限る > Scenario: commitOid 欠落のレガシー承認は stale 扱い（criterion 3 / 6）

---

### TC-004: conformance 未実行の初回 verification は短絡しない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: verification passed の adr-gen / pr-create 短絡は conformance 承認 revision と一致する場合に限る > Scenario: conformance 未実行の初回 verification は短絡しない

---

### TC-005: verification の commitOid は評価した revision（entry HEAD）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification（CLI step）の StepRun に評価 revision の commitOid を打刻する > Scenario: verification の commitOid は評価した revision（criterion 4）

---

### TC-006: runtimeStrategy 不在時は commitOid 未設定

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: verification（CLI step）の StepRun に評価 revision の commitOid を打刻する > Scenario: runtimeStrategy 不在時は commitOid 未設定

---

### TC-007: 基準 commitOid 不一致の approved member は pending に戻る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer の resume skip は承認 revision と基準 revision の一致を要求する > Scenario: 基準 commitOid 不一致の approved member は pending に戻る（criterion 5）

---

### TC-008: 基準 commitOid 一致の approved member は skip される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer の resume skip は承認 revision と基準 revision の一致を要求する > Scenario: 基準 commitOid 一致の approved member は skip される（criterion 5 / req 7）

---

### TC-009: approvedAtCommit 欠落の approved member は pending に戻る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: custom reviewer の resume skip は承認 revision と基準 revision の一致を要求する > Scenario: approvedAtCommit 欠落の approved member は pending に戻る（criterion 3 / 6）

---

### TC-010: approve で approvedAtCommit が実値を持つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: approved custom review 時に approvedAtCommit へ実値を設定する > Scenario: approve で approvedAtCommit が実値を持つ（criterion 5）

---

### TC-011: 無関係な source 変更でも path 未接触 member は skip 維持

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: source path 未接触の保留 approved member は基準 revision へ再アンカーされる > Scenario: 無関係な source 変更でも path 未接触 member は skip 維持（req 7 / source-scoped 保存）

---

### TC-012: evidence 不能時は再アンカーせず fail-closed

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: source path 未接触の保留 approved member は基準 revision へ再アンカーされる > Scenario: evidence 不能時は再アンカーせず fail-closed

---

### TC-013: build-fixer が conformance 承認後に走ると code-review へ再入する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: conformance 承認後に code mutator が走った経路は reviewer chain へ再入する > Scenario: build-fixer が conformance 承認後に走ると code-review へ再入する（D4）

---

### TC-014: code-fixer が conformance 承認前に走った経路は短絡を維持する

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: conformance 承認後に code mutator が走った経路は reviewer chain へ再入する > Scenario: code-fixer が conformance 承認前に走った経路は短絡を維持する

---

### TC-015: baselineCommit が null のときは status のみで skip 判定する（managed fail-safe）

**Category**: unit
**Priority**: should

**Source**: design.md > D5 — custom reviewer: `selectPendingMembers` に基準 commitOid 照合を追加

**GIVEN** `captureHeadSha` が null を返す managed runtime で `selectPendingMembers(statuses, members, null)` が呼ばれ、あるメンバーは `status === "approved"`, `approvedAtCommit = "sha-abc"` を持つ
**WHEN** `selectPendingMembers` が pending メンバーを決定する
**THEN** `baselineCommit == null` のため revision 照合を無効化し、当該メンバーは `status === "approved"` により pending から除外される（既存の status ベース挙動を保存）

---

### TC-016: STANDARD / FAST 両プロファイルの guard が新関数名 `conformanceApprovedForVerifiedRevision` を参照する

**Category**: unit
**Priority**: should

**Source**: design.md > D3 — `conformanceApprovedLatest` を revision 照合込みの guard に置換する / tasks.md > T-02

**GIVEN** `src/core/pipeline/types.ts` の STANDARD（:250）と FAST（:307）の transition 定義が読み込まれる
**WHEN** `verification passed → adr-gen` と `verification passed → pr-create` の `when` フィールドを検査する
**THEN** 両行の `when` が `conformanceApprovedForVerifiedRevision` 関数（state のみを引数とする純関数）を参照し、旧名 `conformanceApprovedLatest` への参照が存在しない

---

### TC-017: build-fixer 回復経路が awaiting-archive で収束しループしない

**Category**: integration
**Priority**: must

**Source**: design.md > D4 — build-fixer が conformance 承認の後に走った場合は reviewer chain へ再入する（意図した帰結）/ tasks.md > T-06

**GIVEN** `conformance(approved, commitOid = C_conf) → verification(fail) → build-fixer(commit → C_bf) → verification(pass, entry HEAD = C_bf)` の state sequence が構築されており、C_bf ≠ C_conf
**WHEN** final verification passed の transition が解決され、その後 code-review → conformance（C_bf で再承認）→ verification(pass, entry HEAD = C_bf) まで進む
**THEN** 2 周目の guard は conformance.commitOid = C_bf = verification.commitOid = C_bf で true となり adr-gen / pr-create へ進み `awaiting-archive` に収束する。maxIterations（budget）を超えて escalation にならない

---

### TC-018: agent step の commitOid 打刻ロジックは無改変

**Category**: unit
**Priority**: could

**Source**: tasks.md > T-01 Acceptance Criteria（agent step の commitOid 打刻（executor.ts:465-468）は無改変）

**GIVEN** sequential agent step（implementer / conformance 等）が `roundOwnsGitEffects === false` かつ `runtimeStrategy` present の条件で実行される
**WHEN** per-node commit 後に `captureHeadSha` が呼ばれ StepRun に commitOid が打刻される
**THEN** 既存の `executor-oid-capture.test.ts` がすべて green であり、agent step の打刻条件（`!deps.roundOwnsGitEffects && deps.runtimeStrategy`）と打刻位置（exit HEAD）は変更されていない

---

### TC-019: typecheck && test が green

**Category**: integration
**Priority**: must

**Source**: tasks.md > T-07 Acceptance Criteria / request.md 受け入れ基準

**GIVEN** 本変更（T-01〜T-07）がすべて適用されたコードベース
**WHEN** `typecheck && test` を実行する
**THEN** TypeScript の型エラーが 0 件であり、全 unit / integration テストが pass する

---

## Result

```yaml
result: completed
total: 19
automated: 19
manual: 0
must: 11
should: 7
could: 1
blocked_reasons: []
```
