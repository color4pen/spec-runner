# Test Cases: changed-files 導出失敗を fail-closed 化する（`listChangedFiles` を DU 化）

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration): 18
- **Manual**: 5
- **Priority**: must: 7, should: 14, could: 2

---

### TC-001: seam — 導出成功は変更ファイル集合を伴って返る

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 変更ファイル観測 seam は「導出成功」と「導出不能」を戻り値で区別する > Scenario: 導出成功は変更ファイル集合を伴って返る

---

### TC-002: seam — 空の変更集合は「変更なし」を意味し導出不能と区別される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 変更ファイル観測 seam は「導出成功」と「導出不能」を戻り値で区別する > Scenario: 空の変更集合は「変更なし」を意味する

---

### TC-003: seam — 導出不能は診断文字列を伴って返り throw しない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 変更ファイル観測 seam は「導出成功」と「導出不能」を戻り値で区別する > Scenario: 導出不能は診断文字列を伴って返る

---

### TC-004: LocalRuntime — git diff exit 0 なら導出成功（変更ファイルをrepo相対で返す）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local runtime は git diff 失敗を導出不能として返す > Scenario: git diff が exit 0 なら導出成功

---

### TC-005: LocalRuntime — git diff 非ゼロ終了なら導出不能（exit code を reason に含む）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local runtime は git diff 失敗を導出不能として返す > Scenario: git diff が非ゼロ終了なら導出不能

---

### TC-006: LocalRuntime — spawn 例外なら導出不能（エラー概要を reason に含む）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local runtime は git diff 失敗を導出不能として返す > Scenario: spawn 例外なら導出不能

---

### TC-007: ManagedRuntime — 常に導出不能を返す（空の導出成功は返らない）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: managed runtime は導出不能を返す > Scenario: managed は常に導出不能を返す

---

### TC-008: scope-check — 導出能力のある runtime で導出不能なら UNKNOWN を合成する（fail-closed）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scope-check は導出不能を UNKNOWN 合成で fail-closed 化する > Scenario: 導出能力のある runtime で導出不能なら UNKNOWN を合成する（fail-closed）

---

### TC-009: scope-check — 構造的非導出では listChangedFiles を呼ばず UNKNOWN を合成する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: scope-check は導出不能を UNKNOWN 合成で fail-closed 化する > Scenario: 構造的非導出では従来どおり listChangedFiles を呼ばず UNKNOWN を合成する

---

### TC-010: scope-check — 導出成功なら従来どおり deriveScopeBreach を実行する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: scope-check は導出不能を UNKNOWN 合成で fail-closed 化する > Scenario: 導出成功なら従来どおり breach を導出する

---

### TC-011: activation gate — 導出能力のある runtime で導出不能なら paths 条件付き reviewer を活性化する（fail-closed）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reviewer activation gate は導出不能を reviewer 活性化で fail-closed 化する > Scenario: 導出能力のある runtime で導出不能なら paths reviewer を活性化する（fail-closed）

---

### TC-012: activation gate — 導出成功なら従来どおり paths 条件を評価する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: reviewer activation gate は導出不能を reviewer 活性化で fail-closed 化する > Scenario: 導出成功なら従来どおり paths 条件を評価する

---

### TC-013: round-invalidation — managed の invalidation 不発が保存される

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: round-invalidation・no-op-detect は導出不能を no-signal として扱い現挙動を保存する > Scenario: managed runtime の invalidation 不発が保存される

---

### TC-014: no-op-detect — 導出不能でも source 変更 0 として escalate 方向を保存する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: round-invalidation・no-op-detect は導出不能を no-signal として扱い現挙動を保存する > Scenario: no-op-detect は導出不能でも source 変更 0 として escalate 方向を保存する

---

### TC-015: 挙動保存 consumer — 導出成功なら従来どおり変更ファイル集合で処理する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: round-invalidation・no-op-detect は導出不能を no-signal として扱い現挙動を保存する > Scenario: 導出成功なら従来どおり処理する

---

### TC-016: capability predicate と DU が別軸を担う（矛盾しない）

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: capability predicate は DU と相補で維持される > Scenario: predicate と DU が別軸を担う

---

### TC-017: `ChangedFilesResult` 型が port 定義ファイルに export され domain import を増やさない

**Category**: manual
**Priority**: could

**GIVEN** `src/core/port/runtime-strategy.ts` に `ChangedFilesResult` DU が定義されている
**WHEN** ファイルの import 文と型定義を確認する
**THEN** `ChangedFilesResult` が export されており、`reason: string` のみで表現されて domain モジュールへの import が増加していない

---

### TC-018: `RealRuntimeStrategy` / B-11 が無変更のまま維持される

**Category**: manual
**Priority**: should

**GIVEN** DU 化の変更が適用されている
**WHEN** `runtime-strategy.ts` の `RealRuntimeStrategy` 定義と `canDeriveChangedFiles` の必須宣言を確認する
**THEN** `RealRuntimeStrategy` の interface に変更が無く、`listChangedFiles` が base の必須メソッドのまま、`canDeriveChangedFiles` が必須のまま維持されている

---

### TC-019: LocalRuntime の `canDeriveChangedFiles()` が DU 化後も `true` を返し続ける

**Category**: unit
**Priority**: should

**GIVEN** `LocalRuntime` の `listChangedFiles` が DU を返すよう変更されている
**WHEN** `LocalRuntime.canDeriveChangedFiles()` を呼ぶ
**THEN** `true` が返る（DU 化による変更が無い）

---

### TC-020: ManagedRuntime の `canDeriveChangedFiles()` が DU 化後も `false` を返し続ける

**Category**: unit
**Priority**: should

**GIVEN** `ManagedRuntime` の `listChangedFiles` が `unavailable` を返すよう変更されている
**WHEN** `ManagedRuntime.canDeriveChangedFiles()` を呼ぶ
**THEN** `false` が返る（DU 化による変更が無い）

---

### TC-021: `grep -rn "listChangedFiles" src tests` で `string[]` を返す stub が残っていない

**Category**: manual
**Priority**: should

**GIVEN** DU 化の全変更と fake 移行が完了している
**WHEN** `grep -rn "listChangedFiles" src tests` で全 stub / spy を列挙する
**THEN** `string[]` を直接返す stub が 0 件であり、全て `{kind:"success", files:[...]}` または `{kind:"unavailable", reason:...}` を返す形式になっている

---

### TC-022: `bun run typecheck && bun run test` が green

**Category**: manual
**Priority**: must

**GIVEN** DU 化の全変更（seam / runtime 実装 / consumer 配線 / test fake 移行）が適用されている
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 両コマンドが exit 0 で完了し、型エラーおよびテスト失敗が 0 件である

---

### TC-023: managed の `listChangedFiles=unavailable` と `listWorktreeChanges=success:[]` の非対称が意図的に維持される

**Category**: manual
**Priority**: could

**GIVEN** ManagedRuntime の `listChangedFiles` と `listWorktreeChanges` がそれぞれ実装されている
**WHEN** managed runtime で両メソッドの戻り値を確認する
**THEN** `listChangedFiles` は `{kind:"unavailable"}` を返し（base...HEAD の diff を構造的に導出できないため）、`listWorktreeChanges` は `{kind:"success", paths:[]}` を返す（member が local worktree に書かず真の空であるため）
**AND** この非対称は `canDeriveChangedFiles()===false` と整合し設計書（design.md D3）に記録されている

---

## Result

```yaml
result: completed
total: 23
automated: 18
manual: 5
must: 7
should: 14
could: 2
blocked_reasons: []
```
