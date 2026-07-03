# Test Cases: 設計レイヤ CLI（aozu）受け口の結線 — 入口ゲートと出口 hook

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration): 22
- **Manual**: 1
- **Priority**: must: 16, should: 7, could: 0

---

## TC-001: 既定 config で validate が spawn しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 無効（既定）のとき aozu を一切 spawn しない > Scenario: 既定 config で validate が spawn しない

---

## TC-002: 既定 config で preflight が spawn しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 無効（既定）のとき aozu を一切 spawn しない > Scenario: 既定 config で preflight が spawn しない

---

## TC-003: 既定 config で archive が spawn しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 無効（既定）のとき aozu を一切 spawn しない > Scenario: 既定 config で archive が spawn しない

---

## TC-004: validate が exit 1 の request を不合格にする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 有効時、引用が解決しない request を入口で不合格にする > Scenario: validate が exit 1 の request を不合格にする

---

## TC-005: preflight が exit 1 の request を不合格にする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 有効時、引用が解決しない request を入口で不合格にする > Scenario: preflight が exit 1 の request を不合格にする

---

## TC-006: 合格 request で validate が成功する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 有効時、合格 request は従来どおり進行する > Scenario: 合格 request で validate が成功する

---

## TC-007: 合格 request で preflight が継続する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 有効時、合格 request は従来どおり進行する > Scenario: 合格 request で preflight が継続する

---

## TC-008: 列挙 type で --require-citation が付く

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--require-citation` を config 列挙 type にのみ付与する > Scenario: 列挙 type で --require-citation が付く

---

## TC-009: 非列挙 type で --require-citation が付かない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--require-citation` を config 列挙 type にのみ付与する > Scenario: 非列挙 type で --require-citation が付かない

---

## TC-010: mark の書いた state 変更が archive コミットに含まれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 出口 hook が mark implemented を worktree 内で実行し archive コミットに含める > Scenario: mark の書いた state 変更が archive コミットに含まれる

---

## TC-011: mark exit 1 は archive を継続する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: mark の exit 1 は警告継続、exit 2 は失敗 > Scenario: exit 1 は archive を継続する

---

## TC-012: mark exit 2 は archive を失敗させる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: mark の exit 1 は警告継続、exit 2 は失敗 > Scenario: exit 2 は archive を失敗させる

---

## TC-013: doctor が有効かつ aozu 不在で fail を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor が結線有効かつ aozu 不在を検出する > Scenario: 有効かつ不在で fail

---

## TC-014: doctor が無効時に pass を返し execFile を呼ばない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor が結線有効かつ aozu 不在を検出する > Scenario: 無効で pass（spawn なし）

---

## TC-015: request template 出力に設計要素引用セクションが含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request テンプレに設計要素引用セクションを含める > Scenario: template 出力に引用セクションが含まれる

---

## TC-016: 引用セクションを含むテンプレが parseRequestMdContent を通過する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: request テンプレに設計要素引用セクションを含める > Scenario: 引用セクションを含むテンプレが validate を通過する

---

## TC-017: designLayer の型不正で CONFIG_INVALID が送出される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `designLayer.enabled` に文字列（非真偽値）を持つ `.specrunner/config.json`
**WHEN** `validateConfig` でスキーマ検証を実行する
**THEN** `CONFIG_INVALID` エラーコードの例外が送出され、フィールド名を含むメッセージが返る

---

## TC-018: resolveDesignLayerConfig が designLayer 不在の config で既定値を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `designLayer` セクションを持たない config オブジェクト
**WHEN** `resolveDesignLayerConfig(config)` を呼び出す
**THEN** `{ enabled: false, command: "aozu", requireCitationTypes: [] }` が返る

---

## TC-019: aozu コマンド不在（ENOENT / exitCode null）で check-gate が passed:false を返す

**Category**: unit
**Priority**: should
**Source**: design.md > D2: 入口ゲートモジュール

**GIVEN** `designLayer.enabled: true` の config と、`exitCode: null`（ENOENT 相当）を返す fake SpawnFn
**WHEN** `runDesignLayerCheckGate` を実行する
**THEN** `{ passed: false, exitCode: null }` が返り、stderr メッセージが stderrWrite へ透過される

---

## TC-020: prNumber 不在のとき mark-hook が --pr を省略する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** `designLayer.enabled: true` の config と、`prNumber` を渡さない呼び出し
**WHEN** `runDesignLayerMarkHook({ slug: "some-slug", designLayer, cwd, spawn })` を実行する
**THEN** spawn の引数リストに `"--pr"` が含まれず、mark implemented は `--request some-slug` のみで呼ばれる

---

## TC-021: mark-hook が exit 0 後に git add -A を実行して marked を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria / design.md > D7

**GIVEN** `designLayer.enabled: true` の config と、最初の spawn（mark implemented）が exit 0 を返し、続く spawn（git add -A）も exit 0 を返す fake SpawnFn
**WHEN** `runDesignLayerMarkHook` を実行する
**THEN** spawn が 2 回呼ばれ（1 回目: mark implemented、2 回目: git add -A in cwd）、戻り値は `{ status: "marked" }` である

---

## TC-022: executeValidate で config 解決が失敗した場合に無効扱いで no-op になる

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-04 Acceptance Criteria

**GIVEN** `cwd` を渡さない（または config.json 不在のディレクトリを渡す）opts で `executeValidate` を呼ぶ
**WHEN** config のベストエフォート解決が失敗する
**THEN** aozu は spawn されず、既存の validate フロー（parse 成功 → 0 返却）が維持される

---

## TC-023: 検証ゲート — typecheck / lint / build / test がすべて green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-10 検証ゲート

**GIVEN** 本 change の全タスク（T-01 〜 T-09）が実装済みの状態
**WHEN** `bun run typecheck` / `bun run lint` / `bun run build` / `bun test` を順に実行する
**THEN** すべてのコマンドが成功（exit 0）し、既存テストに差分が無く（テンプレ固定テストの節追加を除く）、新規追加テストも green である

---

## Result

```yaml
result: completed
total: 23
automated: 22
manual: 1
must: 16
should: 7
could: 0
blocked_reasons: []
```
