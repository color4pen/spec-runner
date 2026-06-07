# Test Cases: validated step-name cast

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 10
- **Manual**: 3
- **Priority**: must: 8, should: 5, could: 0

---

### TC-001: 登録済み step 名は検証を通過して返る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 動的 step 名は `StepName` として扱う前に whitelist 検証する > Scenario: 登録済み step 名は検証を通過して返る

---

### TC-002: 未登録の step 名は実行時エラーになる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 動的 step 名は `StepName` として扱う前に whitelist 検証する > Scenario: 未登録の step 名は実行時エラーになる

---

### TC-003: 正常系で記録される step 名は force cast と同一

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: pipeline / runtime の resumePoint 記録は検証付き cast で行う > Scenario: 正常系で記録される step 名は force cast と同一

---

### TC-004: resume の任意 step チェックは未確定 step を検証スキップする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipeline / runtime の resumePoint 記録は検証付き cast で行う > Scenario: resume の任意 step チェックは未確定 step を検証スキップする

---

### TC-005: 空文字を toStepName に渡すと throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** 空文字列 `""` はいかなる step 名にも一致しない
**WHEN** `toStepName("")` を呼ぶ
**THEN** エラーが throw される

---

### TC-006: 旧 alias など非 StepName 文字列を toStepName に渡すと throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `"critic"` は過去の alias であり現在の `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` のいずれにも含まれない
**WHEN** `toStepName("critic")` を呼ぶ
**THEN** エラーが throw される

---

### TC-007: resume.ts で state.step が truthy かつ登録済み step 名のとき startStepForCheck が設定される

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-06

**GIVEN** `resumePoint` が `undefined` で `state.step` が `"implementer"` など登録済み step 名（truthy）である
**WHEN** resume が `startStepForCheck` を解決する
**THEN** `startStepForCheck` は `toStepName("implementer")` の結果（`"implementer"` as `StepName`）になり `undefined` でも throw でもない

---

### TC-008: src 配下で as StepName が残るのは job-state-store.ts の 1 箇所のみ

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** 実装後の `src/` ディレクトリ全体
**WHEN** `grep -rn "as StepName" src/` を実行する
**THEN** マッチするのは `src/store/job-state-store.ts` の `"init"` フォールバック行 1 箇所のみである

---

### TC-009: job-state-store.ts の "init" フォールバック cast が変更されていない

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08 / request.md > スコープ外

**GIVEN** `src/store/job-state-store.ts:674` 付近の journal 復元コード
**WHEN** 本 change の diff を確認する
**THEN** `(validated.step ?? "init") as StepName` の行に変更がなく、元の形のまま残っている

---

### TC-010: 置換後に不要となった StepName 型 import が除去されている

**Category**: manual
**Priority**: should
**Source**: design.md > Risks / Trade-offs / tasks.md > T-02, T-05

**GIVEN** `pipeline.ts`・`local.ts`・`managed.ts` から `as StepName` cast が除去された状態
**WHEN** 各ファイルの import 宣言を確認する
**THEN** `StepName` が他の箇所で使われていないファイルでは `StepName` の import が除去されており、使用継続ファイル（`resume.ts`・`resolve-step.ts`）では残っている

---

### TC-011: resolve-step.ts の --from 不正値エラーが従来のメッセージを維持する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 / design.md > D3

**GIVEN** `--from` に未登録の step 名が渡された状態
**WHEN** `resolveResumeStep` が `--from` を解決しようとする
**THEN** "Available step names:" を含むエラーメッセージが throw され、既存テスト `tests/unit/core/resume/resolve-step.test.ts` が green のまま

---

### TC-012: bun run typecheck が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** 全 8 箇所の置換と `toStepName` の再導入が完了した状態
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーがゼロで終了する

---

### TC-013: bun run test が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07, T-08

**GIVEN** `toStepName` の unit test（`tests/unit/core/step/step-names.test.ts`）を含む全テストスイート
**WHEN** `bun run test` を実行する
**THEN** 全テストが pass する

---

## Result

```yaml
result: completed
total: 13
automated: 10
manual: 3
must: 8
should: 5
could: 0
blocked_reasons: []
```
