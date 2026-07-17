# Test Cases: minimumAssurance floor を「達成 provenance」で判定する

## Summary

- **Total**: 29 cases
- **Automated** (unit/integration): 29
- **Manual**: 0
- **Priority**: must: 17, should: 12, could: 0

---

### TC-001: custom verification.commands 環境で biteEvidence required floor が fail-closed になる（anti-regression）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the archive floor gate shall evaluate achieved provenance, not declared assurance > Scenario: custom verification.commands repo fails closed on a required floor (anti-regression)

---

### TC-002: profile 欠落（legacy）job が宣言最強プロファイルで floor を素通りしない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the archive floor gate shall evaluate achieved provenance, not declared assurance > Scenario: a profile-absent (legacy) job is not authorized by declaration

---

### TC-003: 全 base-red かつ凍結 intact の job が floor を満たし merge が進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the archive floor gate shall evaluate achieved provenance, not declared assurance > Scenario: an achieved job passes the floor and merges

---

### TC-004: materialize 済み test が baseOid→HEAD 間で改変されている場合に fail-closed になる（凍結の歯）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: achieved biteEvidence shall require freeze plus out-of-loop base-red > Scenario: a tampered (modified) test file fails the freeze tooth

---

### TC-005: baseOid で green の test（空洞）が base-red 要件を満たさず fail-closed になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: achieved biteEvidence shall require freeze plus out-of-loop base-red > Scenario: a hollow test (base-green) fails the base-red tooth

---

### TC-006: 最終 HEAD OID undefined で constrained floor に対し fail-closed になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: unestablished provenance shall fail closed (no fail-open) > Scenario: each unavailable path fails closed against a constrained floor

---

### TC-007: baseOid 欠落で constrained floor に対し fail-closed になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: unestablished provenance shall fail closed (no fail-open) > Scenario: each unavailable path fails closed against a constrained floor

---

### TC-008: listCommitChangedFiles unavailable で constrained floor に対し fail-closed になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: unestablished provenance shall fail closed (no fail-open) > Scenario: each unavailable path fails closed against a constrained floor

---

### TC-009: 二 OID diff unavailable で constrained floor に対し fail-closed になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: unestablished provenance shall fail closed (no fail-open) > Scenario: each unavailable path fails closed against a constrained floor

---

### TC-010: runTestsAtCommit unavailable で constrained floor に対し fail-closed になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: unestablished provenance shall fail closed (no fail-open) > Scenario: each unavailable path fails closed against a constrained floor

---

### TC-011: materialized test 0 件で constrained floor に対し fail-closed になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: unestablished provenance shall fail closed (no fail-open) > Scenario: each unavailable path fails closed against a constrained floor

---

### TC-012: spec-review step 実行済みで achieved specReview が required になる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: achieved testDerivation and specReview shall be derived from mechanical facts > Scenario: spec-review executed yields achieved specReview required

---

### TC-013: spec-review step 未実行で achieved specReview が absent になり specReview required floor を落とす

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: achieved testDerivation and specReview shall be derived from mechanical facts > Scenario: no spec-review run yields absent specReview

---

### TC-014: diffPathsBetweenCommits が二 OID 間で不変の paths に対し空 files の success を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: a two-OID path freeze primitive shall exist on the runtime seam > Scenario: unchanged paths return an empty success

---

### TC-015: diffPathsBetweenCommits が二 OID 間で変更された paths を success の files に含めて返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: a two-OID path freeze primitive shall exist on the runtime seam > Scenario: changed paths return them in a success result

---

### TC-016: managed runtime の diffPathsBetweenCommits が常に unavailable を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: a two-OID path freeze primitive shall exist on the runtime seam > Scenario: managed runtime returns unavailable

---

### TC-017: baseOid / candidateOid / testHash を持つ BiteEvidenceRecord が validation を通り round-trip する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: BiteEvidenceRecord shall be bindable to the final HEAD and remain backward compatible > Scenario: a full record round-trips through state validation

---

### TC-018: 旧形式（OID / testHash フィールド欠落）BiteEvidenceRecord が valid のまま読める（後方互換）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: BiteEvidenceRecord shall be bindable to the final HEAD and remain backward compatible > Scenario: a legacy record without the new fields remains valid

---

### TC-019: 既存の protected-paths gate / truncated fail-closed テストが無変更で green を保つ（回帰保存）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: existing gates and unit contracts shall be preserved > Scenario: the protected-paths gate and truncated fail-closed are unchanged

---

### TC-020: diffPathsBetweenCommits に空配列 paths を渡すと git を呼ばず success {files:[]} を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `paths` 引数が空配列 `[]`
**WHEN** local runtime の `diffPathsBetweenCommits` を呼ぶ
**THEN** git diff は実行されず `{ kind: "success", files: [] }` を返す

---

### TC-021: diffPathsBetweenCommits で git が非 0 exit / spawn error のとき unavailable を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** spawn fake が `git diff --name-only` に対して非 0 exit コードを返す
**WHEN** local runtime の `diffPathsBetweenCommits` を呼ぶ
**THEN** `{ kind: "unavailable", reason: ... }` を返す（throw しない）

---

### TC-022: BiteEvidenceRecord の新フィールドに非 string 値が入ると validation がエラーを返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `BiteEvidenceRecord` の `baseOid` フィールドに数値（例: `123`）を設定した state
**WHEN** schema validation を実行する
**THEN** validation が失敗しエラーを返す（`baseOid` は string を強制）

---

### TC-023: in-loop bite gate が生成する record に baseOid / candidateOid が埋まる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `resolveBaseCandidateOids` が valid な baseOid / candidateOid を返す forward-strategy gate 実行
**WHEN** in-loop bite gate が `BiteEvidenceRecord` を生成する
**THEN** 生成された各 record の `baseOid` と `candidateOid` が resolved OID と一致する

---

### TC-024: digestArtifacts を持たない runtime では record の testHash が absent になる

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** `digestArtifacts` メソッドを提供しない fake runtime を使う gate 実行
**WHEN** in-loop bite gate が `BiteEvidenceRecord` を生成する
**THEN** 生成された record に `testHash` フィールドが含まれない

---

### TC-025: floor が biteEvidence / testDerivation を constrain しない場合 base-red I/O が呼ばれない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** floor が `specReview: required` のみを constrain し biteEvidence / testDerivation は constrain しない
**WHEN** `deriveAchievedAssurance` を呼ぶ
**THEN** `listCommitChangedFiles` と `runTestsAtCommit` と `diffPathsBetweenCommits` がいずれも呼ばれない

---

### TC-026: deriveAchievedAssurance は想定外の例外が発生しても throw しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 / design.md > D2

**GIVEN** `resolveBaseCandidateOids` が内部で例外を投げる状態
**WHEN** `deriveAchievedAssurance` を呼ぶ
**THEN** 関数は throw せず、影響を受けた dimension を absent とした `{ achieved, diagnostics }` を返す

---

### TC-027: fail-closed 時の escalation メッセージに matched files と job slug が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `biteEvidence: required` floor の protected path を touch する job で achieved が absent になる（fail-closed）
**WHEN** archive gate が escalation を生成する
**THEN** escalation の `detectedState` に matched files と job slug が含まれ、`exitCode` が 1 である

---

### TC-028: CLI --with-merge 経路で LocalRuntime と config が runMergeThenArchive に伝播する

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** config の読み込みが成功し `--with-merge` フラグ付きで archive CLI を実行する
**WHEN** `runMergeThenArchive` が呼ばれる
**THEN** 引数の `assuranceRuntime` が `LocalRuntime` インスタンスであり、`config` が読み込まれた `SpecRunnerConfig` である

---

### TC-029: CLI で config 読み込みが失敗しても --with-merge がクラッシュしない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 / design.md > D5

**GIVEN** `loadConfig()` が失敗し config を返さない状態で `--with-merge` を実行する
**WHEN** archive CLI が処理を進める
**THEN** `assuranceRuntime` と `config` が undefined で渡され（または渡されず）、floor gate は no-op となり CLI がクラッシュしない

---

## Result

```yaml
result: completed
total: 29
automated: 29
manual: 0
must: 17
should: 12
could: 0
blocked_reasons: []
```
