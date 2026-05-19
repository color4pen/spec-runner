# Test Cases: multi-layer-defense-integration-test

## Summary

多層防衛 (dsv + spec-review + design) 連携 integration test のテストシナリオ。  
`tests/multi-layer-defense.test.ts` に TC-MLD-01 〜 TC-MLD-05 の 5 ケースを実装する。

---

## TC-MLD-01: Happy path — 3 層全正常

- **Category**: Integration
- **Priority**: must
- **Source**: request.md 要件 2 / tasks.md T-02

### GIVEN

- request type = `spec-change`
- mock: `mockDeltaSpecValidator` → 常に `{ ok: true }` を返す
- mock: `specReviewVerdicts = ["approved"]`
- 正常な specs/ 構造を design が作成したとみなす mock 構成

### WHEN

- pipeline を `buildRunner()` で起動する

### THEN

- `result.status === "awaiting-merge"`
- `result.steps["delta-spec-validation"]` が 1 件、verdict = "approved"
- `result.steps["spec-review"]` が 1 件、verdict = "approved"
- `result.steps["delta-spec-fixer"]` が undefined (未起動)
- `result.steps["spec-fixer"]` が undefined (未起動)
- `result.steps["implementer"]` が defined (後段まで完走)
- `result.steps["verification"]` が defined

---

## TC-MLD-02: Sub-B catch — spec-review が不十分な delta spec の中身を検出

- **Category**: Integration
- **Priority**: must
- **Source**: request.md 要件 3 / tasks.md T-03

### GIVEN

- request type = `spec-change`
- design が specs/ ディレクトリ構造は作成したが、delta spec の内容が不十分な状態
- mock: `mockDeltaSpecValidator` → 常に `{ ok: true }` を返す（dsv は両呼び出しとも approved）
- mock: `specReviewVerdicts = ["needs-fix", "approved"]`（1 回目で不十分な内容を検出）

### WHEN

- pipeline を起動し、spec-review が 1 回目に `needs-fix` を返す

### THEN

- `result.status === "awaiting-merge"`
- `result.steps["delta-spec-validation"]` が 2 件、両方 verdict = "approved"
  - 1 件目: design 後の初回検証
  - 2 件目: `spec-fixer` → `delta-spec-validation` の遷移による再検証
- `result.steps["spec-review"]` が 2 件、verdict = ["needs-fix", "approved"]
- `result.steps["spec-fixer"]` が 1 件（`delta-spec-fixer` ではなく `spec-fixer` 経由）
- `result.steps["delta-spec-fixer"]` が undefined（dsv は approved のため未起動）
- `result.steps["implementer"]` が defined（後段まで完走）

---

## TC-MLD-03: Sub-A catch — dsv が specs/ 構造違反 (legacy-flat-file) を検出

- **Category**: Integration
- **Priority**: must
- **Source**: request.md 要件 4 / tasks.md T-04

### GIVEN

- request type = `spec-change`
- design が specs/ を作らず flat な legacy 構造を作成したとみなす mock 構成
- mock: `mockDeltaSpecValidator` →
  - 1 回目: `{ ok: false, violations: [{ path: "…/delta-spec.md", reason: "legacy-flat-file", suggested: "Move to specs/<capability>/spec.md" }] }`
  - 2 回目: `{ ok: true }`
- mock: `specReviewVerdicts = ["approved"]`

### WHEN

- pipeline を起動し、dsv が 1 回目に `needs-fix` を返す

### THEN

- `result.status === "awaiting-merge"`
- `result.steps["delta-spec-validation"]` が 2 件、verdict = ["needs-fix", "approved"]
- `result.steps["delta-spec-fixer"]` が 1 件（dsv ループを経由）
- `result.steps["spec-review"]` が 1 件、verdict = "approved"
- `result.steps["spec-fixer"]` が undefined（spec-review は approved のため未起動）
- `result.steps["implementer"]` が defined（後段まで完走）

---

## TC-MLD-04: 2 層同時 failure 5-a — design + spec-review が共に bug、dsv が単独で防衛

- **Category**: Integration
- **Priority**: must
- **Source**: request.md 要件 5-a / tasks.md T-05

### GIVEN

- request type = `spec-change`
- design が delta spec MUST 規約チェックリストを見逃した（bugged）
- spec-review も specs/ 不在を見逃す（bugged = 何でも "approved" を返す）
- mock: `mockDeltaSpecValidator` →
  - 1 回目: `{ ok: false, violations: [{ path: "specrunner/changes/test-slug/specs/", reason: "no-specs-for-required-type", suggested: "Add at least one delta spec under specs/<capability>/spec.md" }] }`（PR #282 reproduction と同型）
  - 2 回目: `{ ok: true }`
- mock: `specReviewVerdicts = ["approved"]`（bugged な動作を模倣）

### WHEN

- pipeline を起動し、dsv が単独の防衛層として `no-specs-for-required-type` 違反を検出する

### THEN

- `result.status === "awaiting-merge"`
- `result.steps["delta-spec-validation"]` が 2 件、verdict = ["needs-fix", "approved"]
- `result.steps["delta-spec-fixer"]` が 1 件（dsv が単独 catch し delta-spec-fixer を起動）
- `result.steps["spec-review"]` が 1 件、verdict = "approved"（dsv 修復後に走るため正常パスに見える）
- `result.steps["spec-fixer"]` が undefined
- `result.steps["implementer"]` が defined（pipeline が完走）

---

## TC-MLD-05: 2 層同時 failure 5-b — design + dsv が共に bug、spec-review が単独で防衛

- **Category**: Integration
- **Priority**: must
- **Source**: request.md 要件 5-b / tasks.md T-06

### GIVEN

- request type = `spec-change`
- design が delta spec MUST 規約チェックリストを見逃した（bugged）
- dsv も `no-specs-for-required-type` rule が無効化された状態（bugged = 常に ok を返す）
- mock: `mockDeltaSpecValidator` → 常に `{ ok: true }`（bugged な動作を模倣）
- mock: `specReviewVerdicts = ["needs-fix", "approved"]`（spec-review が単独で不足を検出）

### WHEN

- pipeline を起動し、spec-review が単独の防衛層として 1 回目に `needs-fix` を返す

### THEN

- `result.status === "awaiting-merge"`
- `result.steps["delta-spec-validation"]` が 2 件、両方 verdict = "approved"（dsv は bugged のため両回 approved）
- `result.steps["spec-review"]` が 2 件、verdict = ["needs-fix", "approved"]（1 回目で catch、spec-fixer 修復後の 2 回目で approved）
- `result.steps["spec-fixer"]` が 1 件（spec-review が catch し spec-fixer を起動）
- `result.steps["delta-spec-fixer"]` が undefined（dsv は approved のため未起動）
- `result.steps["implementer"]` が defined（pipeline が完走）

---

## TC-SCAFFOLD-01: テストファイル scaffolding の型安全性

- **Category**: Build
- **Priority**: must
- **Source**: tasks.md T-01

### GIVEN

- `tests/multi-layer-defense.test.ts` が新規作成されている
- import / vi.mock 宣言、beforeEach / afterEach、helper 関数群 (buildPipelineMockClient, buildMockGithubClient, buildRunner, makeJobState, buildConfig, buildRequest) が定義されている
- `buildRequest()` のデフォルト type が `"spec-change"` に設定されている

### WHEN

- `bun run typecheck` を実行する

### THEN

- 型エラーなし (exit code 0)
- 既存テストファイルへの型 regression なし

---

## TC-GREEN-01: 全テスト green

- **Category**: Build
- **Priority**: must
- **Source**: request.md 要件 6 / tasks.md T-07

### GIVEN

- TC-MLD-01 〜 TC-MLD-05 が `tests/multi-layer-defense.test.ts` に実装されている
- 既存の `tests/pipeline-integration.test.ts` に変更がない

### WHEN

- `bun run typecheck && bun run test` を実行する

### THEN

- typecheck が exit code 0
- 全テスト (TC-MLD-01 〜 TC-MLD-05 + 既存テスト) が pass
- regression なし
