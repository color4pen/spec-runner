# Test Cases: build-fixer の config 編集を同一 job 内 verification に反映する（in-job coverage 再解決）

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 12
- **Manual**: 1
- **Priority**: must: 8, should: 4, could: 1

---

## Spec Scenario 由来（GWT 省略・Source 参照のみ）

### TC-001: build-fixer が追加した exclude が同一 job 内の後続 verification で反映される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: verification は実行直前に coverage config を disk から再解決する > Scenario: build-fixer が追加した exclude が同一 job 内の後続 verification で反映される

---

### TC-002: in-memory config ではなく再解決した coverage が使われる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification は実行直前に coverage config を disk から再解決する > Scenario: in-memory config ではなく再解決した coverage が使われる

---

### TC-003: commands は job 開始時の値を保持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再解決の対象範囲は verification.coverage に限定される > Scenario: commands は job 開始時の値を保持する

---

### TC-004: verification 無関係の config は途中変更されない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 再解決の対象範囲は verification.coverage に限定される > Scenario: verification 無関係の config は途中変更されない

---

### TC-005: project-local config が存在すれば再解決を適用する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再解決の起点は verification の cwd、適用は project-local 存在を条件とする > Scenario: project-local config が存在すれば再解決を適用する

---

### TC-006: project-local config が存在しなければ job 開始時 config を維持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再解決の起点は verification の cwd、適用は project-local 存在を条件とする > Scenario: project-local config が存在しなければ job 開始時 config を維持する

---

### TC-007: disk config が壊れていても verification は job 開始時 config で走る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再解決の失敗は job 開始時の config へ fail-safe する > Scenario: disk config が壊れていても verification は job 開始時 config で走る

---

## 非 Scenario 由来（GWT 記述）

### TC-008: coverage を宣言しない project-local config では applied:true かつ coverage:undefined を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `<repoRoot>/.specrunner/config.json` が存在するが `verification.coverage` を持たない（例: `verification.commands` のみ宣言）
**WHEN** `reloadCoverageConfig(cwd)` を呼ぶ
**THEN** `{ applied: true, coverage: undefined }` を返す（project-local が存在する＝apply 判定、coverage は未宣言なので undefined）

---

### TC-009: exclude を書き換えて再呼び出しすると最新の disk 値が返る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `<repoRoot>/.specrunner/config.json` に `coverage.exclude: ["src/types.ts"]` が書かれており、`reloadCoverageConfig(cwd)` の初回呼び出しで `exclude: ["src/types.ts"]` が得られた状態
**WHEN** disk 上の config を `coverage.exclude: ["src/types.ts", "src/other.ts"]` に更新した後、`reloadCoverageConfig(cwd)` を再度呼ぶ
**THEN** 返り値の `coverage.exclude` は `["src/types.ts", "src/other.ts"]`（常に disk の現在値を読む。キャッシュしない）

---

### TC-010: user-global config と project-local partial config の overlay が coverage を正しく解決する

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** user-global config が `verification.commands` を持ち、project-local config が `verification.coverage`（`command`/`lcovPath`/`include`）のみを宣言している（`commands` は未宣言）
**WHEN** `reloadCoverageConfig(cwd)` を呼ぶ
**THEN** `{ applied: true, coverage: { … project-local で宣言した値 } }` を返す（loadConfig の 2 層 overlay により project-local の coverage が正しく取得される）

---

### TC-011: runVerification の第4引数に deps.request.baseBranch が渡される（変更なし）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `VerificationStep.run` が実行される（reloadCoverageConfig は `applied: true` / `applied: false` いずれでも可）
**WHEN** `runVerification` が呼ばれる
**THEN** 第4引数は `deps.request.baseBranch`（coverage 再解決の追加前後で変化しない）

---

### TC-012: 既存 verification-step.test.ts が hermetic を維持する（実 git/fs I/O を踏まない）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `src/core/verification/reload-coverage-config.js` が `vi.mock` で差し替えられ、既定で `{ applied: false }` を返す状態
**WHEN** `tests/unit/core/step/verification-step.test.ts` の全テスト（TC-11: baseBranch 検証を含む）を実行する
**THEN** 実 git / 実 fs I/O を一切踏まずに全ケースが green になる。特に `applied: false` のとき effective config = `deps.config.verification` となり、既存の baseBranch assertion が維持される

---

### TC-013: docs/configuration.md に in-job 再解決の挙動と対象範囲の記述が存在する

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** `docs/configuration.md` の `verification.coverage` セクションを参照する
**WHEN** ドキュメントを確認する
**THEN** 以下の3点が 1〜2 文以上で記述されている: (1) build-fixer 等による同一 job 内 `.specrunner/config.json` 編集が後続 verification に反映されること、(2) 再解決の対象が `verification.coverage` に限定され `verification.commands` 等は job 開始時の値を保持すること、(3) config 変更は従来どおり PR に含まれ人間レビュー可能であること。既存記述と矛盾しない（追記のみ）。

---

## Result

```yaml
result: completed
total: 13
automated: 12
manual: 1
must: 8
should: 4
could: 1
blocked_reasons: []
```
