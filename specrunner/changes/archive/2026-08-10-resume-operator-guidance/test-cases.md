# Test Cases: resume-operator-guidance

## Summary

- **Total**: 16 cases
- **Automated** (unit/integration): 16
- **Manual**: 0
- **Priority**: must: 12, should: 4, could: 0

---

### TC-001: dirty canon と未知 commit の併存で 1 回の統合 halt

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 採用系 preflight を統合した単一 halt > Scenario: dirty canon と未知 commit の併存で 1 回の統合 halt

---

### TC-002: dirty canon のみで --apply-canon 案内

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 採用系 preflight を統合した単一 halt > Scenario: dirty canon のみで --apply-canon 案内

---

### TC-003: 未知 commit のみで --adopt-commits 案内

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 採用系 preflight を統合した単一 halt > Scenario: 未知 commit のみで --adopt-commits 案内

---

### TC-004: 代替案の提示

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 統合 halt メッセージの形式 > Scenario: 代替案の提示

---

### TC-005: halt 前後で git 履歴と ledger が不変

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: preflight は副作用を持たず fail-closed を維持する > Scenario: halt 前後で git 履歴と ledger が不変

---

### TC-006: 未知 commit 検出失敗時の fail-closed

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: preflight は副作用を持たず fail-closed を維持する > Scenario: 未知 commit 検出失敗時の fail-closed

---

### TC-007: 詳細ヘルプの内容

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job resume の詳細ヘルプ > Scenario: 詳細ヘルプの内容

---

### TC-008: 存在しない slug の resume

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 未解決 slug の報告文言 > Scenario: 存在しない slug の resume

---

### TC-009: buildAdoptionHaltMessage の 3 分岐

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `buildAdoptionHaltMessage` が `src/core/resume/adopt-commits.ts` から import できる
**WHEN** (a) `dirtyCanonPaths` のみ非空（`unadoptedCommits` 空）、(b) `dirtyCanonPaths` と `unadoptedCommits` の両方が非空、(c) `commitDetectionFailed: true`（`unadoptedCommits` 空）の 3 通りで呼び出す
**THEN** (a) 完全コマンドに `--apply-canon` を含み `--adopt-commits` を含まない、(b) 完全コマンドに `--apply-canon --adopt-commits` を含み dirty canon paths と未知 commit（shortSha + subject）の両列挙を含む、(c) 完全コマンドに `--apply-canon` を含み `--adopt-commits` を含まず検出失敗の旨を含む

---

### TC-010: preflight exit 128 の adopt 検出は空扱い

**Category**: integration
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-02

**GIVEN** dirty な protected canon path が存在し、preflight の `detectUnadoptedCommits` が git exit 128 で失敗する awaiting-resume ジョブがある
**WHEN** operator が flag なしで resume する
**THEN** 検出失敗の旨が出力に含まれず（exit 128 は非 git 環境として空扱い）、`--apply-canon` のみの完全コマンドが提示され、pipeline は起動しない（exit 1）

---

### TC-011: --apply-canon / auto-quarantine 経路の回帰

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-02 / request.md > 受け入れ基準

verification phase にて `src/core/command/__tests__/resume-partial-canon.test.ts` および `src/core/resume/__tests__/apply-canon-provenance.test.ts` が無改変で green であることを確認する（`--apply-canon` 指定時の apply→adopt フローと auto-quarantine 経路が統合 preflight の影響を受けていないことの保証）。

---

### TC-012: resolveId メッセージ不変の回帰

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D5

verification phase にて `tests/resolve-job-id.test.ts` が無改変で green であることを確認する（`JobStateStore.resolveId` の "Job not found: no job ID starts with '...'" メッセージが job show / cancel と共用のため変更されていないことの保証）。

---

### TC-013: buildAdoptEscalationMessage 不変の回帰

**Category**: gate
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-01

verification phase にて `src/core/resume/__tests__/adopt-commits.test.ts` が無改変で green であることを確認する（`buildAdoptEscalationMessage` の signature と出力が変更されていないことの保証）。

---

### TC-014: "Job not found" 文言の保持（additive 要件）

**Category**: integration
**Priority**: should
**Source**: design.md > D5 / tasks.md > T-04

**GIVEN** slug でも Job ID prefix でも一致するアクティブジョブが存在しない
**WHEN** operator が `specrunner job resume <存在しない値>` を実行する
**THEN** 出力に "Job not found" が含まれ（`tests/unit/cli/resume.test.ts` TC-RESUME-010 が無改変で green）、かつ slug で探した事実を示す文言も同時に含まれる

---

### TC-015: `job resume --help` で runResume が呼ばれない（回帰）

**Category**: unit
**Priority**: should
**Source**: design.md > Risks / tasks.md > T-05

**GIVEN** `tests/unit/cli/help-flag-dispatch.test.ts` の dispatch テストが存在する
**WHEN** `specrunner job resume --help` をテストが模倣する形で実行する
**THEN** `runResume` handler が呼ばれず（spy が呼ばれていない）exit 0 の assertion が pass する（TC-HELP-DISPATCH-03 の exit 0 / 非呼び出し assertion が "No detailed help available" 期待の更新後も維持される）

---

### TC-016: ヘルプに相互排他 2 組と --from 有効値が明記される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `JOB_RESUME_USAGE` 定数が定義され resume エントリに配線されている
**WHEN** `specrunner job resume --help` の出力を検査する
**THEN** `--detach` と `--json` が相互排他であることが明記され、`--prompt` と `--prompt-file` が相互排他であることが明記され、`--from` の有効値（有効な step 名の列挙）および複合 step が `--from` 対象外である旨の注記が含まれる

---

## Result

```yaml
result: completed
total: 16
automated: 16
manual: 0
must: 12
should: 4
could: 0
blocked_reasons: []
```
