# Test Cases: event-bus-interface-demote

## Summary

- **Total**: 16 cases
- **Automated** (unit/integration): 15
- **Manual**: 1
- **Priority**: must: 13, should: 2, could: 1

---

### TC-001: IEventBus interface のシグネチャ確認

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01 / design.md D1

**GIVEN** `src/kernel/event-bus.ts` が新設されている
**WHEN** ファイル内の `IEventBus` interface を検査する
**THEN** `on(event: string, handler: (payload: any) => void): void` の 1 メソッドのみが定義されており、export されている

---

### TC-002: kernel/event-bus.ts が import ゼロ原則を守る

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** `src/kernel/event-bus.ts` が作成されている
**WHEN** ファイル内の import 文を検査する
**THEN** 他モジュールへの import 文が 1 行も存在しない（kernel の「import ゼロ」原則を維持）

---

### TC-003: IEventBus interface に JSDoc が記述されている

**Category**: unit
**Priority**: could
**Source**: tasks.md T-01

**GIVEN** `src/kernel/event-bus.ts` が作成されている
**WHEN** JSDoc コメントを確認する
**THEN** 「shared-kernel 層の subscriber が domain の concrete EventBus に依存せず subscribe するための最小契約」であることを説明する JSDoc が存在する

---

### TC-004: pipeline-logger.ts が core/ を import しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** `src/logger/pipeline-logger.ts` の import が修正されている
**WHEN** `grep "core/" src/logger/pipeline-logger.ts` を実行する
**THEN** 結果が空（マッチ 0 件）であり、上向き依存が解消されている

---

### TC-005: pipeline-logger.ts の subscribe メソッドが IEventBus 型を受け取る

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 / design.md D2

**GIVEN** `pipeline-logger.ts` の import が `IEventBus` に切り替えられている
**WHEN** `subscribe` メソッドのシグネチャを検査する
**THEN** `subscribe(events: IEventBus)` と宣言されており、`../kernel/event-bus.js` から import している

---

### TC-006: concrete EventBus が IEventBus を structural typing で満たす

**Category**: unit
**Priority**: should
**Source**: design.md D1

**GIVEN** `IEventBus` が `on(event: string, handler: (payload: any) => void): void` を要求する
**WHEN** TypeScript コンパイラが `EventBus` インスタンスを `IEventBus` 型として扱う箇所を型チェックする
**THEN** 型エラーが発生しない（structural typing により `EventBus` が `IEventBus` を自動的に満たす）

---

### TC-007: pipeline-logger.test.ts が concrete EventBus を引き続き import できる

**Category**: unit
**Priority**: should
**Source**: design.md Risks/Trade-offs

**GIVEN** テストファイルは B-3 の grep スコープ外（`--exclude *.test.ts` フィルタ）
**WHEN** `pipeline-logger.test.ts` が concrete `EventBus` を `core/event/event-bus` から import する
**THEN** アーキテクチャテストに引っかからず、テスト内の型安全性（payload の型チェック）が保たれる

---

### TC-008: arch-allowlist.ts から B3-logger エントリが削除されている

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03

**GIVEN** `tests/unit/architecture/arch-allowlist.ts` が修正されている
**WHEN** ファイル内を `B3-logger` で検索する
**THEN** `tracking: "B3-logger"` のエントリおよび関連コメント行が 1 行も存在しない

---

### TC-009: arch-allowlist.ts に B-3 invariant の allowlist エントリがゼロ

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03 / request.md 受け入れ基準

**GIVEN** `B3-logger` エントリが削除されている
**WHEN** `ARCH_ALLOWLIST` 配列を `invariant === "B-3"` でフィルタする
**THEN** 結果が空配列（B-3 の実違反エントリがゼロ）

---

### TC-010: arch-allowlist.ts の B-1 allowed-edge 記録が保持されている

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03

**GIVEN** `arch-allowlist.ts` から B3-logger エントリが削除されている
**WHEN** `ARCH_ALLOWLIST` 配列を確認する
**THEN** `R2-local-adapter`、`R2-dispatching-adapter`、`R2-managed-adapter` の B-1 エントリが残っており削除されていない

---

### TC-011: suppression-demo テストが合成エントリで filterViolations の suppression 機構を検証する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 / design.md D4

**GIVEN** `"does not flag violations that are correctly allowlisted"` テストが合成エントリ方式に書き換えられている
**WHEN** テスト内でローカル定義した `syntheticAllowlist`（hypothetical なファイルパス・パターン・`invariant: "B-3"`）に合致する `GrepMatch[]` を `filterViolations` に渡す
**THEN** `filterViolations` の戻り値が空配列（suppression 機構が正しく機能している）

---

### TC-012: suppression-demo テストが実 ARCH_ALLOWLIST の内容に依存しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 / request.md 要件 3

**GIVEN** suppression-demo テストが合成エントリ方式に書き換えられている
**WHEN** `ARCH_ALLOWLIST` からエントリが追加・削除される
**THEN** suppression-demo テストの pass/fail が変化しない（実 allowlist の中身と非結合）

---

### TC-013: suppression-demo テストが no-op になっていない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 / request.md 要件 3

**GIVEN** suppression-demo テストが書き換えられている
**WHEN** テストの内容を検査する
**THEN** `expect(true).toBe(true)` のような無条件パスする assertion が存在せず、`filterViolations` の戻り値に対する実質的な検証（`toHaveLength(0)` など）が行われている

---

### TC-014: EventBus の publish/subscribe 挙動が不変

**Category**: unit
**Priority**: must
**Source**: request.md 受け入れ基準 / design.md Non-Goals

**GIVEN** `src/core/event/event-bus.ts` の実装が変更されていない（interface 抽出のみ）
**WHEN** 既存の EventBus ユニットテストを実行する
**THEN** 全テストが pass し、`on()` / `emit()` / `off()` の振る舞いが変更前と同一

---

### TC-015: B-3 arch live test が実コードに対して green

**Category**: integration
**Priority**: must
**Source**: tasks.md T-05 / request.md 受け入れ基準

**GIVEN** `pipeline-logger.ts` の import が修正され、`B3-logger` が allowlist から削除されている
**WHEN** `core-invariants.test.ts` の B-3 invariant テスト（live grep）を実行する
**THEN** `src/logger/`、`src/state/`、`src/git/`、`src/parser/` 等の shared-kernel 層から `core/` への import が検出されず、テストが green

---

### TC-016: プロジェクト標準 verification が全通過

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05 / request.md 受け入れ基準

**GIVEN** T-01〜T-04 の全実装が完了している
**WHEN** `bun run build && bun run typecheck && bun run lint && bun run test` を実行する
**THEN** 4 コマンドすべてが exit code 0 で終了する

---

## Result

```yaml
result: completed
total: 16
automated: 15
manual: 1
must: 13
should: 2
could: 1
blocked_reasons: []
```
