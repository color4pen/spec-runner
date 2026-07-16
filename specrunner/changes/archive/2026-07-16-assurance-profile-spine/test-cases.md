# Test Cases: assurance profile を branch-borne immutable 属性として JobState に載せ、attach で digest 検証する（R1 背骨）

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 19
- **Manual**: 1
- **Priority**: must: 18, should: 2, could: 0

---

### TC-001: profile を持つ state を round-trip しても値が保たれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: JobState は effective profile を optional な branch-borne 属性として保持する > Scenario: profile を持つ state を round-trip しても値が保たれる

---

### TC-002: profile を持たない legacy state も有効として読める

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: JobState は effective profile を optional な branch-borne 属性として保持する > Scenario: profile を持たない legacy state も有効として読める

---

### TC-003: STANDARD_PROFILE は自己整合である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: standard profile は自己整合な単一定義として存在する > Scenario: STANDARD_PROFILE は自己整合である

---

### TC-004: computePolicyDigest は policyDigest フィールドを hash 入力に含めない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: standard profile は自己整合な単一定義として存在する > Scenario: computePolicyDigest は policyDigest フィールドを hash 入力に含めない

---

### TC-005: computePolicyDigest は本体フィールドの変化を反映する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: standard profile は自己整合な単一定義として存在する > Scenario: computePolicyDigest は本体フィールドの変化を反映する

---

### TC-006: 新規ジョブの state に STANDARD_PROFILE が記録される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 新規ジョブ起動時に standard profile を branch-borne に記録する > Scenario: 新規ジョブの state に STANDARD_PROFILE が記録される

---

### TC-007: profile を持たない state は STANDARD_PROFILE に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: profile 欠落時は standard に解決し、state を書き換えない > Scenario: profile を持たない state は STANDARD_PROFILE に解決される

---

### TC-008: profile を持つ state はその値に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: profile 欠落時は standard に解決し、state を書き換えない > Scenario: profile を持つ state はその値に解決される

---

### TC-009: 状態遷移を跨いで profile が不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: profile は job 生存中 immutable である > Scenario: 状態遷移を跨いで profile が不変

---

### TC-010: resume を跨いで profile が不変

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: profile は job 生存中 immutable である > Scenario: resume を跨いで profile が不変

---

### TC-011: policyDigest 不一致の checkpoint は拒否される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は stored profile の自己整合を fail-closed で検証する > Scenario: policyDigest 不一致の checkpoint は拒否される

---

### TC-012: schemaVersion が対応上限超過の checkpoint は拒否される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は stored profile の自己整合を fail-closed で検証する > Scenario: schemaVersion が対応上限超過の checkpoint は拒否される

---

### TC-013: 自己整合な profile を持つ checkpoint は attach できる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は stored profile の自己整合を fail-closed で検証する > Scenario: 自己整合な profile を持つ checkpoint は attach できる

---

### TC-014: profile を持たない checkpoint は後方互換で attach できる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は stored profile の自己整合を fail-closed で検証する > Scenario: profile を持たない checkpoint は後方互換で attach できる

---

### TC-015: 既存の挙動系テストが無変更で green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: profile の導入は standard の観測挙動を変えない > Scenario: 既存の挙動系テストが無変更で green

---

### TC-016: profile の値に基づく分岐が存在しない

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: profile の導入は standard の観測挙動を変えない > Scenario: profile の値に基づく分岐が存在しない

**GIVEN** 本変更後のコードベース（`src/` 全域）
**WHEN** `profile.id` / `profile.assurance` / `profile.budget` の値を参照する条件分岐を静的解析またはコードレビューで探す
**THEN** pipeline 実行・attach・resume の工程選択・省略・enforcement に profile の値を用いる分岐が存在しない（`STANDARD_PROFILE` の定数参照・型宣言・digest 計算のみが存在する）

---

### TC-017: src/util/hash.ts は leaf 制約を満たし、移設前後で同一出力を返す

**Category**: unit
**Priority**: must
**Source**: design.md > D1. 純粋 hash util を leaf（`src/util/hash.ts`）へ移設し、旧位置は re-export shim にする / T-01

**GIVEN** `src/util/hash.ts` が新設され、`src/core/agent/hash.ts` が re-export shim になっている
**WHEN** （a）`src/util/hash.ts` の import 宣言を解析する、（b）同一 object に対し両パスから `hashObject` を呼び出す
**THEN** （a）`src/util/hash.ts` は `src` 内の他モジュールを一切 import しない（`node:crypto` のみ依存する leaf）
**AND** （b）`src/util/hash.ts` 経由と `src/core/agent/hash.ts`（shim）経由で同一入力に対し同一の `sha256:` プレフィックス付きハッシュ文字列を返す

---

### TC-018: profile を patch 型に渡すとコンパイルエラーになる

**Category**: unit
**Priority**: must
**Source**: design.md > D4. `buildInitialJobState` が `STANDARD_PROFILE` を焼き込み、profile は job 生存中 immutable / T-05

**GIVEN** `TransitionContext.patch` および `JobStateStore.update` の patch 型が `Omit<JobState, "profile" | …>` として定義されている
**WHEN** patch オブジェクトに `profile` フィールドを含めるコード（例: `patch({ profile: someProfile })`）を書く
**THEN** `bun run typecheck` がコンパイルエラーを報告し、profile の上書きがコンパイル時に禁止されている
**AND** profile を patch しない既存 caller はすべて typecheck が green のまま

---

### TC-019: validateJobState は profile を opaque として通過させる

**Category**: unit
**Priority**: should
**Source**: design.md > D6. `validateJobState` は profile を厳格検証せず opaque optional として放置する / T-06

**GIVEN** （a）profile フィールドが存在する JobState JSON、（b）profile フィールドが存在しない JobState JSON、（c）profile に不整合な policyDigest を持つ JobState JSON
**WHEN** 各 JSON を `validateJobState` で検証する
**THEN** いずれの場合も `state-json-invalid` エラーを throw しない（profile の整合性チェックは validateJobState の責務ではない）
**AND** 他フィールドの妥当性チェックは従来通り機能する

---

### TC-020: core-invariants / module-boundary テストが green（新規 divergence なし）

**Category**: unit
**Priority**: must
**Source**: design.md > D1 / T-01（layer 依存の closure model 維持）

**GIVEN** `src/state/profile.ts` が `src/util/hash.ts`（leaf）から `hashObject` を import しており、`src/core/` は import していない
**WHEN** `tests/unit/architecture/core-invariants.test.ts` および `module-boundary.test.ts` を実行する
**THEN** 両テストが green（shared-kernel→domain の新規 B-3 違反が存在しない）

---

## Result

```yaml
result: completed
total: 20
automated: 19
manual: 1
must: 18
should: 2
could: 0
blocked_reasons: []
```
