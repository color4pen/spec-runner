# Test Cases: 先行 step の touched files を後続 step prompt に伝搬する

## Summary

- **Total**: 27 cases
- **Automated** (unit/integration): 25
- **Manual**: 0
- **Priority**: must: 25, should: 2, could: 0

---

## 記録: 完全 input を持つ message 種別からの抽出

### TC-001: assistant message の Read/Edit/Write からパスが抽出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 完全 input を持つ message 種別から touched files を記録する > Scenario: assistant message の Read/Edit/Write からパスが抽出される

### TC-002: 部分的 input の content_block_start は記録されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 完全 input を持つ message 種別から touched files を記録する > Scenario: 部分的 input の content_block_start は記録されない

### TC-003: Grep / Glob / Bash は記録対象外

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 完全 input を持つ message 種別から touched files を記録する > Scenario: Grep / Glob / Bash は記録対象外

---

## 記録: 正規化・除外・dedup・cap

### TC-004: worktree 外のパスは除外される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 記録パスを worktree 相対に正規化し、対象外パスを除外する > Scenario: worktree 外のパスは除外される

### TC-005: change folder 配下のパスは除外される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 記録パスを worktree 相対に正規化し、対象外パスを除外する > Scenario: change folder 配下のパスは除外される

### TC-006: 同一パスは重複排除される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 記録パスを worktree 相対に正規化し、対象外パスを除外する > Scenario: 同一パスは重複排除される

### TC-007: 100 件で打ち切られる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 記録パスを worktree 相対に正規化し、対象外パスを除外する > Scenario: 100 件で打ち切られる

### TC-008: change folder の trailing slash 境界判定（specrunner/changes-archive/ を誤除外しない）

**Category**: unit
**Priority**: should
**Source**: design.md > D4: 正規化ルール

**GIVEN** assistant message の Read block の `file_path` が `specrunner/changes-archive/foo/bar.ts`（change folder 外の類似 prefix のパス）を指す
**WHEN** adapter がそのパスを正規化する
**THEN** そのパスは除外されず `touchedFiles` に含まれる

---

## 記録: state への永続化・置換

### TC-009: 成功した sequential step の記録が state に書き込まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 記録を state store に一元化して永続化し、再実行で置換する > Scenario: 成功した sequential step の記録が state に書き込まれる

### TC-010: 同一 step の再実行で記録が置換される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 記録を state store に一元化して永続化し、再実行で置換する > Scenario: 同一 step の再実行で記録が置換される

### TC-011: 記録しない runtime は state を触らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 記録を state store に一元化して永続化し、再実行で置換する > Scenario: 記録しない runtime は state を触らない

### TC-012: touchedFiles が空配列の場合でも state にエントリが書き込まれる

**Category**: unit
**Priority**: must
**Source**: design.md > D3: 伝搬経路（undefined と [] の区別）

**GIVEN** claude-code adapter の sequential step が成功し、`AgentRunResult.touchedFiles` が `[]`（空配列）である
**WHEN** CommitOrchestrator が commitSuccess を実行する
**THEN** `state.touchedFiles[step.name]` が `[]` として書き込まれ、エントリ自体が存在する（`undefined` とは区別される）

---

## 注入: buildTouchedFilesSection

### TC-013: 先行 step 記録あり → セクションと制限禁止文言が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 後続 step の prompt に先行 step の記録をヒントとして注入する > Scenario: 先行 step 記録あり → セクションと制限禁止文言が含まれる

### TC-014: 記録なし → 従来 prompt と同一

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 後続 step の prompt に先行 step の記録をヒントとして注入する > Scenario: 記録なし → 従来 prompt と同一

### TC-015: currentStepName は注入対象から除外される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04: Acceptance Criteria

**GIVEN** `state.touchedFiles` に `currentStepName` のエントリのみが非空で存在し、他の step のエントリは存在しない
**WHEN** `buildTouchedFilesSection(state, currentStepName)` を呼ぶ
**THEN** `""` を返す（自己 step の記録は注入対象に含まれない）

### TC-016: 16KB 超過 → 注入なし

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 注入セクションのサイズ上限を超えたら注入しない > Scenario: 16KB 超過 → 注入なし

---

## 注入: adapter 配線（integration）

### TC-017: claude-code adapter の prompt 組成で先行 step 記録ありのとき注入セクションが含まれる

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05: Acceptance Criteria

**GIVEN** 先行 step の非空 `touchedFiles` を持つ `ctx.state` を claude-code adapter に与える
**WHEN** adapter が agent step の first prompt を組み立てる
**THEN** query に渡る first prompt に先行 step 名とファイル一覧のセクション、および「範囲をこの一覧に制限してはならない」趣旨の文言が含まれる

### TC-018: claude-code adapter 空記録時の first prompt が注入前と byte 同一

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05: Acceptance Criteria

**GIVEN** `state.touchedFiles` が空（または現 step 以外の非空エントリなし）の `ctx.state` を claude-code adapter に与える
**WHEN** adapter が agent step の first prompt を組み立てる
**THEN** prompt は注入なしの場合と byte 単位で同一である

---

## state schema: validateJobState

### TC-019: validateJobState が touchedFiles 不在の legacy state を受理する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Acceptance Criteria

**GIVEN** `touchedFiles` フィールドを持たない JobState JSON（legacy state）
**WHEN** `validateJobState` を呼ぶ
**THEN** throw せずに state を返す（後方互換性を維持）

### TC-020: validateJobState が非 object な touchedFiles を throw する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Acceptance Criteria

**GIVEN** `touchedFiles` が配列など非 object な値を持つ JobState JSON
**WHEN** `validateJobState` を呼ぶ
**THEN** バリデーションエラーを throw する

### TC-021: validateJobState が value に非配列を持つ touchedFiles を throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: Acceptance Criteria

**GIVEN** `touchedFiles` の value（step 名に対応する値）が string 配列でなく object などの非配列な値を持つ JobState JSON
**WHEN** `validateJobState` を呼ぶ
**THEN** バリデーションエラーを throw する

---

## resume 経路

### TC-022: state 往復で記録が保持される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume 経路で記録が保持され、resume 後の step にも注入される > Scenario: state 往復で記録が保持される

### TC-023: resume 後の step prompt に注入される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume 経路で記録が保持され、resume 後の step にも注入される > Scenario: resume 後の step prompt に注入される

---

## codex adapter

### TC-024: codex job では記録が生成されず注入もされない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: codex は記録せず、注入は共有層経由で将来拡張可能とする > Scenario: codex job では記録が生成されず注入もされない

### TC-025: 注入は両 adapter で共通の共有層関数を経由する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: codex は記録せず、注入は共有層経由で将来拡張可能とする > Scenario: 注入は両 adapter で共通の共有層関数を経由する

---

## 回帰ゲート

### TC-026: src/core/step/ 配下の既存 buildMessage テストが無改変で green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08: Acceptance Criteria

verification フェーズ `test` を実行し、`src/core/step/` 配下の既存テストが全て green であることを確認する。注入は adapter 層で行うため `buildMessage` を変更しない設計であり、既存テストは無改変で通過しなければならない。

### TC-027: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08: Acceptance Criteria

verification フェーズの `typecheck` および `test` コマンドが両方 green であることを確認する。全 T-01〜T-07 の実装が揃った状態でこの gate を通過する。

---

## Result

```yaml
result: completed
total: 27
automated: 25
manual: 0
must: 25
should: 2
could: 0
blocked_reasons: []
```
