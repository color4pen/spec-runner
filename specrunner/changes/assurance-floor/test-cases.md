# Test Cases: assurance の構造化と archive 時 minimumAssurance floor の強制

## Summary

- **Total**: 21 cases
- **Automated** (unit/integration): 21
- **Manual**: 0
- **Priority**: must: 16, should: 5, could: 0

---

### TC-001: satisfiesFloor — 全制約フィールドが rank 以上のとき true を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ProfileAssurance shall expose typed floor-comparable fields with a lattice > Scenario: floor is satisfied when every constrained field meets or exceeds its rank

---

### TC-002: satisfiesFloor — 制約フィールドが rank 未満のとき false を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ProfileAssurance shall expose typed floor-comparable fields with a lattice > Scenario: floor is violated when a constrained field is below its rank

---

### TC-003: satisfiesFloor — assurance にフィールドが欠落 / 未知値のとき fail-closed で false

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ProfileAssurance shall expose typed floor-comparable fields with a lattice > Scenario: absent or unknown assurance field fails closed against a constraining floor

---

### TC-004: satisfiesFloor — 空 floor は任意の assurance に対して true

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: ProfileAssurance shall expose typed floor-comparable fields with a lattice > Scenario: an empty floor is satisfied by any assurance

---

### TC-005: STANDARD_PROFILE — assurance 構造化後も policyDigest が自己整合する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: STANDARD_PROFILE shall carry the strongest assurance and remain self-consistent > Scenario: standard profile self-consistency holds after structuring assurance

---

### TC-006: STANDARD_PROFILE — assurance が任意の floor を満たす

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: STANDARD_PROFILE shall carry the strongest assurance and remain self-consistent > Scenario: standard assurance satisfies any floor

---

### TC-007: R1 形式（assurance:{}）の checkpoint が verify-checkpoint の digest 検証を通過する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: R1-format checkpoints shall remain attachable after assurance is structured > Scenario: an R1 profile with assurance:{} passes attach digest verification

---

### TC-008: well-formed な minimumAssurance config が検証を通過する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ArchiveConfig shall accept a minimumAssurance floor definition > Scenario: a well-formed minimumAssurance config parses

---

### TC-009: 不正な level 値が config 検証で拒否される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ArchiveConfig shall accept a minimumAssurance floor definition > Scenario: an invalid level value is rejected

---

### TC-010: sub-floor profile が protected path を touch するとき merge が fail-closed で停止する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the archive merge gate shall enforce the floor out-of-loop and fail closed > Scenario: sub-floor profile touching a protected path is blocked

---

### TC-011: standard profile が protected path を touch しても floor を満たし merge が進む

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the archive merge gate shall enforce the floor out-of-loop and fail closed > Scenario: standard profile touching a protected path passes the floor

---

### TC-012: protected path を touch しない変更は floor 未満でも merge が進む

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the archive merge gate shall enforce the floor out-of-loop and fail closed > Scenario: a change that touches no protected path passes even below floor

---

### TC-013: minimumAssurance 未設定の config では gate が何もしない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the archive merge gate shall enforce the floor out-of-loop and fail closed > Scenario: absent minimumAssurance config is a no-op

---

### TC-014: changed-file list が truncated のとき fail-closed で停止する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the archive merge gate shall enforce the floor out-of-loop and fail closed > Scenario: a truncated changed-file list fails closed

---

### TC-015: assurance:{} が ProfileAssurance に代入可能（後方互換）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `ProfileAssurance` が typed optional フィールドと index signature を持つ新定義になっている
**WHEN** `assurance: {}` を `ProfileAssurance` 型に代入し、`computePolicyDigest` に渡す
**THEN** typecheck が通り、excess-property エラーも欠落フィールドエラーも発生しない

---

### TC-016: assurance:{ level:"high" } が ProfileAssurance に代入可能（index signature 互換）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `ProfileAssurance` が index signature `[key: string]: unknown` を保持している
**WHEN** `assurance: { level: "high" }` を `ProfileAssurance` 型に代入する
**THEN** typecheck が通り、unknown キーが excess-property エラーにならない

---

### TC-017: STANDARD_PROFILE.assurance が最強値と deep-equal

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `STANDARD_PROFILE` 定数が module load 済みの状態
**WHEN** `STANDARD_PROFILE.assurance` の各フィールドを確認する
**THEN** `{ testDerivation: "frozen", biteEvidence: "required", specReview: "required" }` と deep-equal であり、余計なフィールドを持たない

---

### TC-018: protectedPaths が配列でない場合に config 検証が拒否する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** `archive.minimumAssurance.protectedPaths` に文字列（配列でない値）を設定した config
**WHEN** config validation を実行する
**THEN** 検証が失敗し、`protectedPaths` フィールドに関するエラーメッセージが返される

---

### TC-019: CLI が config.archive.minimumAssurance を runMergeThenArchive に伝播する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** `archive.minimumAssurance` が設定された config が存在する
**WHEN** `job archive --with-merge` を実行し CLI が config を読み込む
**THEN** `runMergeThenArchive` の引数 `minimumAssurance` に config の値がそのまま渡される

---

### TC-020: config が不在のとき minimumAssurance が undefined として渡り gate が無効になる

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** `archive.minimumAssurance` を持たない config、またはconfig 読込が失敗する状況
**WHEN** `job archive --with-merge` を実行する
**THEN** `runMergeThenArchive` に `minimumAssurance: undefined` が渡り、floor gate が何もしない

---

### TC-021: fail-closed escalation のメッセージに matched files と effective assurance / 要求 floor が含まれる

**Category**: integration
**Priority**: should
**Source**: design.md > D4: archive gate に floor を Step 3.6 として独立ブロックで足す

**GIVEN** sub-floor profile を持つ job の PR が `minimumAssurance.protectedPaths` にマッチするファイルを含む
**WHEN** archive merge gate の Step 3.6 が floor 違反を検出する
**THEN** escalation の `detectedState` に matched files のリストと effective assurance および要求 floor の値が記載され、`resumeCommand` に `specrunner job archive --with-merge <slug>` が含まれ、`exitCode 1` で停止する

---

## Result

```yaml
result: completed
total: 21
automated: 21
manual: 0
must: 16
should: 5
could: 0
blocked_reasons: []
```
