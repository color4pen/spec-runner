# Test Cases: pipeline を request.md で選択可能にし、scope を強制できない runtime を着手前に拒否する汎用 gate

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 16
- **Manual**: 4
- **Priority**: must: 14, should: 6, could: 0

---

### TC-001: pipeline 指定を抽出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request.md Meta は optional な pipeline 選択を受け付け、absent は standard に解決する > Scenario: pipeline 指定を抽出する

---

### TC-002: pipeline 未指定は undefined・standard 解決

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: request.md Meta は optional な pipeline 選択を受け付け、absent は standard に解決する > Scenario: pipeline 未指定は undefined・standard 解決

---

### TC-003: 未知 id は既知 id 一覧付きエラーで停止

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 未知の pipeline id は着手前に既存の registry エラーで弾かれる > Scenario: 未知 id は既知 id 一覧付きエラーで停止

---

### TC-004: scope 宣言 ＋ 導出不能 runtime は着手前に停止し state を作らない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: permissionScope を宣言する profile は changed-files を導出できる runtime を着手前に要求する > Scenario: scope 宣言 ＋ 導出不能 runtime は着手前に停止し state を作らない

---

### TC-005: エラー文言は runtime 種別名でなく能力で表現する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: permissionScope を宣言する profile は changed-files を導出できる runtime を着手前に要求する > Scenario: エラー文言は runtime 種別名でなく能力で表現する

---

### TC-006: permissionScope を持つ任意 id が同一に gate される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: gate 判定は permissionScope の有無から導出し profile 名で分岐しない > Scenario: permissionScope を持つ任意 id が同一に gate される

---

### TC-007: permissionScope を持たない profile は id に依らず gate を通過する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: gate 判定は permissionScope の有無から導出し profile 名で分岐しない > Scenario: permissionScope を持たない profile は id に依らず gate を通過する

---

### TC-008: 導出可能 runtime は scope 宣言 profile を通過する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: canDeriveChangedFiles が true または absent のとき gate は通過する > Scenario: 導出可能 runtime は scope 宣言 profile を通過する

---

### TC-009: predicate 未実装の runtime は通過する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: canDeriveChangedFiles が true または absent のとき gate は通過する > Scenario: predicate 未実装の runtime は通過する

---

### TC-010: registry に scope 宣言 profile が増えていない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: registry は不変で gate は production で発火せず、既定挙動が完全一致する > Scenario: registry に scope 宣言 profile が増えていない

---

### TC-011: 既定経路の挙動が無変更

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: registry は不変で gate は production で発火せず、既定挙動が完全一致する > Scenario: 既定経路の挙動が無変更

---

### TC-012: Meta design-only が DESIGN_ONLY_DESCRIPTOR に解決される

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: Meta 経由 design-only は DESIGN_ONLY_DESCRIPTOR に到達し既存経路を壊さない > Scenario: Meta design-only が DESIGN_ONLY_DESCRIPTOR に解決される

---

### TC-013: Meta design-only は gate を通過する（permissionScope 無し）

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Meta 経由 design-only は DESIGN_ONLY_DESCRIPTOR に到達し既存経路を壊さない > Scenario: Meta design-only は gate を通過する（permissionScope 無し）

---

### TC-014: resolution 妥当値は 2 値のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: FindingResolution の妥当値集合は不変 > Scenario: resolution 妥当値は 2 値のまま

---

### TC-015: UnsupportedRuntimeCapabilityError の class properties が正しい

**Category**: unit
**Priority**: should
**Source**: design.md > D4: typed error は専用クラス `UnsupportedRuntimeCapabilityError`、文言は runtime 能力で表現

**GIVEN** `new UnsupportedRuntimeCapabilityError("test-pipeline")` を instantiate する
**WHEN** `name` と `pipelineId` プロパティを参照する
**THEN** `name === "UnsupportedRuntimeCapabilityError"` かつ `pipelineId === "test-pipeline"` である（`instanceof Error` も成立）

---

### TC-016: parser が core/pipeline を import しない（DSM 制約）

**Category**: manual
**Priority**: must
**Source**: design.md > D1: pipeline 選択は request.md Meta（additive・optional `pipeline`）。parser は抽出のみ / tasks.md > T-01

**GIVEN** T-01 実装後の `src/parser/request-md.ts`（および `src/parser/` 配下）
**WHEN** import 宣言と依存グラフを検査する
**THEN** `src/core/pipeline` への import が 0 件であり、parser → domain の逆 edge が生まれていない

---

### TC-017: runtime-capability-gate.ts が pure module（fs/child_process/env/SDK import なし）

**Category**: manual
**Priority**: must
**Source**: design.md > D2: gate は `permissionScope` の有無から導出する純関数 / tasks.md > T-02

**GIVEN** 新規作成された `src/core/pipeline/runtime-capability-gate.ts`
**WHEN** import 宣言を検査する
**THEN** `fs`・`child_process`・環境変数操作・外部 SDK への import が 0 件であり、`core/pipeline → core/port` 以外の新規逆 edge が無い

---

### TC-018: テスト後に PIPELINE_REGISTRY が元の 2 本に戻る（テスト間リークなし）

**Category**: unit
**Priority**: should
**Source**: design.md > D5: registry 不変 → gate は production で inert、検証は fixture で駆動 / tasks.md > T-05

**GIVEN** `beforeEach` で `PIPELINE_REGISTRY` にユニーク fixture id の scope 宣言 descriptor を追加し、call-site 結合テストを実行する
**WHEN** `afterEach` 後に `PIPELINE_REGISTRY` のキー一覧を確認する
**THEN** fixture descriptor が削除され、`standard` と `design-only` の 2 本のみが残る（他テストへのリークなし）

---

### TC-019: bun run typecheck && bun run test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07: 全体検証

**GIVEN** 本 change の全 task（T-01〜T-06）を実装した状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラー 0 件・テスト全件 pass で終了する

---

### TC-020: arch 不変条件（B-1〜B-11 ＋ DSM closure）が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07: 全体検証

**GIVEN** 本 change の全 task を実装した状態
**WHEN** arch 不変条件チェック（B-1〜B-11 ＋ DSM closure）を実行する
**THEN** 新モジュール `runtime-capability-gate.ts` が domain 内純関数として配置され、`core/pipeline → core/port` 以外の新規逆 edge を作らず、全不変条件が green である

---

## Result

```yaml
result: completed
total: 20
automated: 16
manual: 4
must: 14
should: 6
could: 0
blocked_reasons: []
```
