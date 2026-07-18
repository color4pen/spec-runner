# Test Cases: scenario / spec の凍結・承認を revision（commit OID）に束縛する

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

- **Total**: 21 cases
- **Automated** (unit/integration): 19
- **Manual**: 2
- **Priority**: must: 18, should: 3, could: 0

---

## scenario 凍結を commit OID に束縛する（D1）

### TC-001: test-case-gen 確定 commit 後に test-cases.md を改竄（time-boundary）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: testDerivation と biteEvidence SHALL bind the scenario freeze to the test-case-gen revision blob（MODIFIED） > Scenario: test-case-gen 確定 commit の後に test-cases.md を改竄（time-boundary）

### TC-002: 協調改竄（test-cases.md@HEAD と events.jsonl@HEAD を同時に書き換え）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: testDerivation と biteEvidence SHALL bind the scenario freeze to the test-case-gen revision blob（MODIFIED） > Scenario: 協調改竄（test-cases.md@HEAD と events.jsonl@HEAD を同時に書き換え）

### TC-003: scenario が anchor から HEAD まで不変（positive）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: testDerivation と biteEvidence SHALL bind the scenario freeze to the test-case-gen revision blob（MODIFIED） > Scenario: scenario が anchor から HEAD まで不変（positive）

### TC-004: testCaseGenOid 欠落 / test-cases.md 取得不能

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: testDerivation と biteEvidence SHALL bind the scenario freeze to the test-case-gen revision blob（MODIFIED） > Scenario: testCaseGenOid 欠落 / test-cases.md 取得不能

---

## specReview を reviewed revision に束縛する（D2）

### TC-005: spec-review 確定 commit 後に spec.md を変更（time-boundary）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: specReview SHALL bind the approval to the reviewed revision blob（MODIFIED） > Scenario: spec-review 確定 commit の後に spec.md を変更（time-boundary）

### TC-006: spec.md が承認から HEAD まで不変（positive）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: specReview SHALL bind the approval to the reviewed revision blob（MODIFIED） > Scenario: spec.md が承認から HEAD まで不変（positive）

### TC-007: specReviewOid 欠落 / spec.md 取得不能

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: specReview SHALL bind the approval to the reviewed revision blob（MODIFIED） > Scenario: specReviewOid 欠落 / spec.md 取得不能

---

## floor 統合（exitCode による歯化）

### TC-008: scenario time-boundary — floor 統合 exitCode 1（T1 歯）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04: floor integration テスト（歯 T1/T2/T4/T5/T6 を exitCode で固定）

**GIVEN** test-case-gen 確定 commit の `test-cases.md` が S、後続 finalHeadOid の `test-cases.md` が S'（不一致）の job、`biteEvidence:required` / `testDerivation:frozen` floor
**WHEN** merge-then-archive の floor gate を実行する
**THEN** exitCode 1、`mergePullRequest` 未呼び出し（fail-closed）

### TC-009: 協調改竄 — floor 統合 exitCode 1（T2 歯）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04: floor integration テスト（歯 T1/T2/T4/T5/T6 を exitCode で固定）

**GIVEN** `test-cases.md`@finalHeadOid が S' に改竄され、`events.jsonl`@finalHeadOid の lineage frozen hash も S' に合わせて書き換え済みの job（testCaseGenOid 側の `test-cases.md` は S のまま）
**WHEN** `biteEvidence:required` floor で floor gate を実行する
**THEN** commit-OID 束縛が `test-cases.md`@testCaseGenOid（S）と @finalHeadOid（S'）の不一致を検出し exitCode 1（events.jsonl lineage hash の書き換えは無効化される）

### TC-010: specReview time-boundary — floor 統合 exitCode 1 / 0（T4 歯）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04: floor integration テスト（歯 T1/T2/T4/T5/T6 を exitCode で固定）

**GIVEN** negative: verdict=approved、`spec.md`@specReviewOid=SPEC、@finalHeadOid=SPEC'（不一致）の job、`specReview:required` floor
**WHEN** floor gate を実行する
**THEN** negative: exitCode 1；positive（`spec.md` が anchor から finalHeadOid まで不変 + approved）: exitCode 0、`mergePullRequest` 呼び出し

### TC-011: fail-closed 網羅 — floor 統合 exitCode（T5 歯）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04: floor integration テスト（歯 T1/T2/T4/T5/T6 を exitCode で固定）

**GIVEN** 以下の各 job を個別に用意する: (i) testCaseGenOid 欠落、(ii) specReviewOid 欠落、(iii) `test-cases.md`@testCaseGenOid が `readFileAtCommit` で unavailable、(iv) `test-cases.md`@finalHeadOid が unavailable、(v) `spec.md`@specReviewOid が unavailable、(vi) `spec.md`@finalHeadOid が unavailable
**WHEN** 対応する floor（`biteEvidence:required` / `specReview:required`）で floor gate を実行する
**THEN** 各ケースで当該次元が absent → exitCode 1（fail-closed）

### TC-012: 実 config anti-regression — scopedTestCommand 未設定で fail-closed（T6）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04: floor integration テスト（歯 T1/T2/T4/T5/T6 を exitCode で固定）

**GIVEN** `scopedTestCommand` 未設定（`runTestsAtCommit` unavailable）の runtime、`biteEvidence:required` floor、protected path を touch する job
**WHEN** floor gate を実行する
**THEN** exitCode 1（#848 の歯を退行させない）

---

## 実 runtime E2E（時間境界化）

### TC-013: T3 positive E2E — anchor/HEAD 別 commit で biteEvidence + specReview 成立

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05: 実 runtime E2E を時間境界化する（D4 / T3）

**GIVEN** 実 git repo に以下の commit 系列を構築する: `init` → `spec-review 確定`（spec.md=SPEC、specReviewOid）→ `test-case-gen 確定`（test-cases.md=S、testCaseGenOid）→ `test-materialize`（baseOid、テスト赤）→ `implementer 確定`（green、spec.md/test-cases.md 不変、positive finalHeadOid）。forward type、実 LocalRuntime
**WHEN** `biteEvidence:required` + `specReview:required` floor で `deriveAchievedAssurance` を実行する
**THEN** `achieved.biteEvidence === "required"`、`achieved.specReview === "required"`（anchor commit と HEAD が別 commit）

### TC-014: scenario negative E2E — anchor 後に test-cases.md 改竄で fail-closed

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05: 実 runtime E2E を時間境界化する（D4 / T3）

**GIVEN** TC-013 の commit 系列に加えて `tamper-scenario` commit（finalHeadOid）を追加（test-cases.md を S' に改竄）。実 LocalRuntime
**WHEN** `biteEvidence:required` floor で `deriveAchievedAssurance` を実行する
**THEN** `testDerivation` / `biteEvidence` absent（testCaseGenOid と finalHeadOid の content hash 不一致 → fail-closed）

### TC-015: spec negative E2E — anchor 後に spec.md 改竄で fail-closed

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05: 実 runtime E2E を時間境界化する（D4 / T3）

**GIVEN** TC-013 の commit 系列に加えて `tamper-spec` commit（finalHeadOid）を追加（spec.md を変更）。実 LocalRuntime
**WHEN** `specReview:required` floor で `deriveAchievedAssurance` を実行する
**THEN** `specReview` absent（specReviewOid と finalHeadOid の spec.md content hash 不一致 → fail-closed）

---

## 構造的一貫性・backward-compat

### TC-016: events.jsonl / fold 依存撤去の確認

**Category**: manual
**Priority**: must
**Source**: design.md > D1: scenario 凍結を test-case-gen 確定 commit の blob に束縛する / tasks.md > T-01

**GIVEN** 実装後の `src/core/archive/achieved-assurance.ts`
**WHEN** import 文と events.jsonl 読取・fold 呼び出しのコードパスを目視確認する
**THEN** `import { fold } from "../../store/event-journal.js"` が削除され、`events.jsonl` を読む処理が残存しない

### TC-017: blob freeze（diffPathsBetweenCommits）が scenario 凍結とは独立した歯として存置されている

**Category**: unit
**Priority**: must
**Source**: design.md > D1 存置明示 / tasks.md > T-01

**GIVEN** scenario 凍結成立（`test-cases.md` が anchor↔HEAD 一致）だが、materialized test file が `baseOid`→`finalHeadOid` 間で改竄された job
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `testDerivation` / `biteEvidence` absent（`diffPathsBetweenCommits` による blob freeze の歯が独立して fail-closed を維持する）

### TC-018: specReview block が floor.specReview が constrain するときのみ実行

**Category**: unit
**Priority**: should
**Source**: design.md > D2: specReview を spec-review 確定 commit の blob に束縛する / tasks.md > T-02

**GIVEN** `floor.specReview` が undefined（constrain しない）の job、`readFileAtCommit` の呼び出しを記録する spy を持つ fake runtime
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `readFileAtCommit`（spec.md）が一度も呼ばれない（I/O ゼロ）

### TC-019: isSpecRequired によって specReview 束縛を緩めない

**Category**: unit
**Priority**: should
**Source**: design.md > D2 alternatives considered / tasks.md > T-02

**GIVEN** `isSpecRequired` が false を返す spec-exempt type の job、`floor.specReview` が required を要求、`readFileAtCommit` が spec.md を unavailable と返す
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `specReview` absent（fail-closed）、spec-exempt type であっても束縛を緩めない

### TC-020: 破壊確認コメントが T1 / T2 の negative テストに記載されている

**Category**: manual
**Priority**: should
**Source**: design.md > D3: positive と同型の adversarial negative を必須にする / tasks.md > T-03 / T-04

**GIVEN** 実装後の `tests/unit/core/archive/achieved-assurance-completeness-unit.test.ts` および `completeness-integration.test.ts`
**WHEN** T1 / T2 の negative テスト箇所のコメントを確認する
**THEN** 「跨ぎ比較を同一 commit（finalHeadOid のみ）に戻すと T1/T2 が通ってしまう」旨の破壊確認コメントが T1・T2 各テストに記載されている

### TC-021: typecheck && test 全体 green（T7 backward-compat）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06: backward-compat 監査と全体 green（T7）

**GIVEN** 実装完了後の codebase、意味が変わる期待更新（scenario-freeze 系・specReview 束縛系）は明示的に更新済み
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーなし、全テスト green。production 変更が `src/core/archive/achieved-assurance.ts` のみ（port / runtime / caller は無変更）であることを diff で確認する

## Result

```yaml
result: completed
total: 21
automated: 19
manual: 2
must: 18
should: 3
could: 0
blocked_reasons: []
```
