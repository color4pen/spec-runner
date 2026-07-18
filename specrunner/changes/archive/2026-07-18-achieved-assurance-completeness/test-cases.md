# Test Cases: achieved-assurance の達成判定を完成させる

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

- **Total**: 29 cases
- **Automated** (unit/integration): 28
- **Manual**: 1
- **Priority**: must: 10, should: 18, could: 1

---

## Scenario 由来テストケース（spec.md）

### TC-001: base-red だが HEAD で依然 red の場合 biteEvidence:required floor が fail-closed になる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: biteEvidence SHALL require a measured HEAD-green at the final archive HEAD > Scenario: base-red だが HEAD で依然 red

---

### TC-002: base-red かつ HEAD-green（同一凍結 test 群）の場合 biteEvidence:required floor を満たす

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: biteEvidence SHALL require a measured HEAD-green at the final archive HEAD > Scenario: base-red かつ HEAD-green（同一凍結 test 群）

---

### TC-003: lineage の frozen hash が null の場合 testDerivation と biteEvidence が absent になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: testDerivation と biteEvidence SHALL require a two-layer scenario freeze > Scenario: frozen hash が null

---

### TC-004: finalHeadOid の test-cases.md が frozen hash と不一致の場合 testDerivation と biteEvidence が absent になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: testDerivation と biteEvidence SHALL require a two-layer scenario freeze > Scenario: finalHeadOid の test-cases.md が frozen hash と不一致

---

### TC-005: 非 forward type で base-red・HEAD-green が成立しても biteEvidence:required floor が fail-closed になる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: biteEvidence SHALL be gated to forward-strategy request types > Scenario: 非 forward type で base-red・HEAD-green が成立

---

### TC-006: 最新 spec-review verdict が approved でない場合 specReview:required floor が fail-closed になる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: specReview SHALL require an approved verdict > Scenario: 最新 spec-review verdict が approved でない

---

### TC-007: 最新 spec-review verdict が approved の場合 specReview:required floor を満たす

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: specReview SHALL require an approved verdict > Scenario: 最新 spec-review verdict が approved

---

### TC-008: archived path 配下の file を suffix で解決して内容を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The runtime SHALL provide a commit-scoped file read primitive > Scenario: archived path 配下の file を suffix で解決して読む

---

### TC-009: 非存在 OID または managed runtime で readFileAtCommit が unavailable を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The runtime SHALL provide a commit-scoped file read primitive > Scenario: 非存在 OID / managed runtime

---

## 非 Scenario 由来テストケース（design.md / tasks.md）

### TC-010: spec-review run が存在しない場合 specReview が absent になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07: deriveAchievedAssurance の unit テスト > specReview（T5 導出側）

**GIVEN** `state.steps["spec-review"]` が空配列またはキー自体が存在しない
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.specReview` は absent（`specReview:"required"` floor に対し fail-closed）

---

### TC-011: 最新 spec-review verdict が needs-fix の場合 specReview が absent になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07: deriveAchievedAssurance の unit テスト > specReview（T5 導出側）

**GIVEN** 最新 spec-review run の `outcome.verdict` が `"needs-fix"`
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.specReview` は absent

---

### TC-012: 最新 spec-review verdict が escalation の場合 specReview が absent になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07: deriveAchievedAssurance の unit テスト > specReview（T5 導出側）

**GIVEN** 最新 spec-review run の `outcome.verdict` が `"escalation"`
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.specReview` は absent

---

### TC-013: 最新 spec-review verdict が null の場合 specReview が absent になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07: deriveAchievedAssurance の unit テスト > specReview（T5 導出側）

**GIVEN** 最新 spec-review run の `outcome.verdict` が `null`
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.specReview` は absent

---

### TC-014: chore type の job は base-red・HEAD-green が成立しても biteEvidence が absent になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07: deriveAchievedAssurance の unit テスト > type gate（T4 導出側）

**GIVEN** `state.request.type = "chore"`、materialized test が base:red・HEAD:green・凍結 intact
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.biteEvidence` は absent

---

### TC-015: spec-change type の job は base-red・HEAD-green が成立しても biteEvidence が absent になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07: deriveAchievedAssurance の unit テスト > type gate（T4 導出側）

**GIVEN** `state.request.type = "spec-change"`、materialized test が base:red・HEAD:green・凍結 intact
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.biteEvidence` は absent（本 change 自体が spec-change であり非 forward gate の対象である）

---

### TC-016: FORWARD_TYPES が gate.ts から export され in-loop gate と同一の値を持つ

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: FORWARD_TYPES を gate.ts から export する（D3 の単一 source）

**GIVEN** `gate.ts` から `FORWARD_TYPES` を import する
**WHEN** その値を確認する
**THEN** `FORWARD_TYPES` は `Set(["bug-fix","new-feature"])` と等しく、import が型エラーなく成功する。既存 gate.test.ts が無変更 green。

---

### TC-017: readFileAtCommit が複数エントリに一致する場合 unavailable を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: commit-scoped file read primitive を runtime seam に追加する（D5）

**GIVEN** `git ls-tree -r` の出力に `<suffix>` で終わるエントリが 2 件以上存在する OID
**WHEN** `readFileAtCommit(oid, pathSuffix, cwd)` を呼ぶ
**THEN** `{ kind:"unavailable", reason: <ambiguous-match-message> }` を返し、例外を throw しない

---

### TC-018: readFileAtCommit が 0 件一致の場合 unavailable を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: commit-scoped file read primitive を runtime seam に追加する（D5）

**GIVEN** `git ls-tree -r` の出力に `<suffix>` で終わるエントリが 0 件の OID と pathSuffix
**WHEN** `readFileAtCommit(oid, pathSuffix, cwd)` を呼ぶ
**THEN** `{ kind:"unavailable", reason: <not-found-message> }` を返し、例外を throw しない

---

### TC-019: readFileAtCommit の内容ハッシュが digestArtifacts と byte 一致する（round-trip）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria > round-trip 一致 / design.md > D5 > hash byte 一致

**GIVEN** 実 commit の utf-8 text file（test-cases.md など）が存在する OID と cwd
**WHEN** `readFileAtCommit` で内容を取得し、`"sha256:" + sha256hex(Buffer.from(content,"utf8"))` でハッシュを算出する
**THEN** そのハッシュが同 file の `digestArtifacts`（working-tree）による hash と byte 一致する

---

### TC-020: finalHeadOid での runTestsAtCommit が unavailable の場合 biteEvidence が absent になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05: derivation に HEAD-green 実測を入れる（D1） > Acceptance Criteria

**GIVEN** base:red 確立済み、forward type、scenario 凍結 intact
**And** `runtime.runTestsAtCommit(finalHeadOid, ...)` が `{ kind:"unavailable" }` を返す
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.biteEvidence` は absent（HEAD-green 未実測は fail-closed）

---

### TC-021: HEAD で一部 file のみ green の場合 biteEvidence が absent になる（欠落検知）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05: derivation に HEAD-green 実測を入れる（D1） > Acceptance Criteria

**GIVEN** base:red 確立済み、forward type、scenario 凍結 intact
**And** `runTestsAtCommit(finalHeadOid, ...)` が materializedTestFiles の一部のみ `passed:true` を返す（残りは `passed:false` または結果欠落）
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.biteEvidence` は absent（完全被覆を要求するため）

---

### TC-022: events.jsonl が readFileAtCommit で取得不能の場合 testDerivation と biteEvidence が absent になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04: derivation に scenario 二層凍結を入れる（D2） > Acceptance Criteria

**GIVEN** `runtime.readFileAtCommit(finalHeadOid, "<slug>/events.jsonl", cwd)` が `{ kind:"unavailable" }` を返す
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.testDerivation` と `achieved.biteEvidence` はいずれも absent

---

### TC-023: state.request.slug が欠落している場合 testDerivation と biteEvidence が absent になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04: derivation に scenario 二層凍結を入れる（D2） > Acceptance Criteria

**GIVEN** `state.request.slug` が `null` または `undefined`（archived path を suffix で解決できない）
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.testDerivation` と `achieved.biteEvidence` はいずれも absent

---

### TC-024: test-cases.md が readFileAtCommit で取得不能の場合 testDerivation と biteEvidence が absent になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04: derivation に scenario 二層凍結を入れる（D2） > Acceptance Criteria

**GIVEN** `runtime.readFileAtCommit(finalHeadOid, "<slug>/events.jsonl", cwd)` は frozen hash を持つ lineage を返す
**And** `runtime.readFileAtCommit(finalHeadOid, "<slug>/test-cases.md", cwd)` が `{ kind:"unavailable" }` を返す
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.testDerivation` と `achieved.biteEvidence` はいずれも absent

---

### TC-025: 二層凍結 intact かつ blob freeze intact の場合 type 非依存で testDerivation:"frozen" になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria > シナリオ二層凍結 intact → testDerivation:"frozen"（type 非依存）/ design.md > D3

**GIVEN** `state.request.type = "refactoring"`（非 forward type）
**And** scenario 二層凍結 intact（frozen hash non-null、test-cases.md hash 一致）、blob freeze intact
**WHEN** `deriveAchievedAssurance` を実行する
**THEN** `achieved.testDerivation = "frozen"`（type gate は testDerivation に適用されないことを確認）
**And** `achieved.biteEvidence` は absent（type gate で除外）

---

### TC-026: 実 config（scopedTestCommand 未設定）で biteEvidence:required floor が fail-closed になる

**Category**: integration
**Priority**: must
**Source**: request.md > 受け入れ基準 > T6（実 config anti-regression 保持）/ tasks.md > T-08 > T6

**GIVEN** この repo の実 config（`scopedTestCommand` 未設定、`runTestsAtCommit` が unavailable を返す）
**And** `biteEvidence:required` を含む minimumAssurance floor が設定された job
**And** biteEvidence floor の判定に進む（protected path を touch する変更）
**WHEN** floor gate（Step 3.6）を実行する
**THEN** `exitCode 1`（fail-closed）となり `mergePullRequest` が呼ばれない（#848 の歯を退行させない）

---

### TC-027: BiteEvidenceRecord.testHash の doc/comment が実装（worktree hash）と一致している

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-06: testHash の provenance 齟齬を解消する（P1-low）

**GIVEN** `src/state/schema/types.ts` の `BiteEvidenceRecord.testHash` doc と `gate.ts` の testHash 算出箇所 comment を確認する
**WHEN** 実装（`digestArtifacts(cwd,...)` = gate 実行時の worktree 内容 hash）と照合する
**THEN** doc/comment が「gate 実行時の worktree 内容 digest（baseOid の内容でない）」と明記されている。behavior 変更は無く、既存テストが無変更 green。

---

### TC-028: 既存 achieved-assurance / floor / bite-evidence / tamper テストが意味変更分を除き無変更で green になる

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-09: backward-compat 監査と全体 green（T8）/ request.md > 受け入れ基準 > T8

**GIVEN** 本 change の実装が完了した状態
**And** 既存テストのうち HEAD-green 追加・scenario 凍結追加で意味が変わらない fail-closed 系テスト（TC-004〜TC-011 相当、satisfiesFloor、getProfile、in-loop gate.test.ts、tamper テスト）
**WHEN** `bun run test` を実行する
**THEN** これらのテストが無変更で green（本 change で意味が変わる positive-path テストは明示的に更新済み）

---

### TC-029: typecheck と全テストスイートが green になる

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-09 Acceptance Criteria / T-08 Acceptance Criteria

**GIVEN** 本 change（T-01 〜 T-09）の実装が完了した状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーなし、全テスト green

---

## Result

```yaml
result: completed
total: 29
automated: 28
manual: 1
must: 10
should: 18
could: 1
blocked_reasons: []
```
