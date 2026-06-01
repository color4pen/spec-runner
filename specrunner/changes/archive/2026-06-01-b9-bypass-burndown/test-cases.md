# Test Cases: b9-bypass-burndown

## Summary

- **Total**: 26 cases
- **Automated** (unit/integration): 23
- **Manual**: 3
- **Priority**: must: 16, should: 9, could: 1

---

### TC-001: `fail()` が `transitionJob` 経由で status を変更する

**Category**: unit
**Priority**: must
**Source**: T-02, D1

**GIVEN** `JobStateStore.fail()` が呼ばれ、対象 job の status が `"running"` である
**WHEN** `fail()` の本体が実行される
**THEN** `transitionJob(state, "failed", { trigger: "store-fail", ... })` が呼ばれ、直接 spread で `status: "failed"` を書く箇所は存在しない

---

### TC-002: `job-state-store.ts` に `status: "failed" as JobStatus` の直書きが残っていない

**Category**: unit
**Priority**: must
**Source**: T-02, T-05

**GIVEN** 変更適用後の `src/store/job-state-store.ts`
**WHEN** `status:\s*"failed"` パターンで grep する（コメント行除外）
**THEN** マッチゼロ（直書きが消えている）

---

### TC-003: `exit-guard.ts` が `transitionJob` 経由で status を変更する

**Category**: unit
**Priority**: must
**Source**: T-03, D2

**GIVEN** プロセス終了時、exit-guard が `status === "running"` の job を処理している
**WHEN** exit handler が当該 job に対して実行される
**THEN** `transitionJob(state, "awaiting-resume", { trigger: "exit-guard", ... })` が呼ばれ、直接 spread による `status: "awaiting-resume"` 書き込みは存在しない

---

### TC-004: `exit-guard.ts` に `status: "awaiting-resume"` の直書きが残っていない

**Category**: unit
**Priority**: must
**Source**: T-03, T-05

**GIVEN** 変更適用後の `src/core/lifecycle/exit-guard.ts`
**WHEN** `status:\s*"awaiting-resume"` パターンで grep する（コメント行除外）
**THEN** マッチゼロ

---

### TC-005: `local.ts` の signal-handler が `transitionJob` 経由で status を変更する

**Category**: unit
**Priority**: must
**Source**: T-04, D3

**GIVEN** `local.ts` の `signalCleanup` が `running` 状態の job に対して SIGINT を処理している
**WHEN** signal handler が実行される
**THEN** `transitionJob(current, "awaiting-resume", { trigger: "signal-handler", ... })` が呼ばれ、直接 spread による書き込みは存在しない

---

### TC-006: `local.ts` に `"awaiting-resume" as const` の直書きが残っていない

**Category**: unit
**Priority**: must
**Source**: T-04, T-05

**GIVEN** 変更適用後の `src/core/runtime/local.ts`
**WHEN** `"awaiting-resume"\s*as\s*const` パターンで grep する（コメント行除外）
**THEN** マッチゼロ

---

### TC-007: `arch-allowlist.ts` の B-9 エントリが空になっている

**Category**: unit
**Priority**: must
**Source**: T-05

**GIVEN** 変更適用後の `tests/unit/architecture/arch-allowlist.ts`
**WHEN** `ARCH_ALLOWLIST.filter(e => e.invariant === "B-9")` を評価する
**THEN** 空配列が返される（エントリ 0 件）

---

### TC-008: B-9 regression guard が空 allowlist でも合成違反を検出する

**Category**: unit
**Priority**: must
**Source**: T-06, D4

**GIVEN** B-9 allowlist エントリがすべて削除され、空配列である
**WHEN** B-9 regression guard テストが synthetic な status 直書きマッチを inject して `filterViolations(injectedMatches, [])` を呼ぶ
**THEN** violation が返される（空 allowlist で suppression されない）、テストが green

---

### TC-009: live B-9 scan テストが violation ゼロで green になる

**Category**: unit
**Priority**: must
**Source**: T-06, T-07

**GIVEN** 3 箇所の直書きがすべて `transitionJob` 経由に書き換えられている
**WHEN** live B-9 scan テストが `src/` 配下を grep スキャンする
**THEN** 直接 status 書き込みが検出されず、violation ゼロでテスト green

---

### TC-010: B-9 allowlist suppression テストが削除されている

**Category**: unit
**Priority**: must
**Source**: T-06, D4

**GIVEN** 変更適用後の `tests/unit/architecture/core-invariants.test.ts`
**WHEN** `"does not flag status writes that are correctly allowlisted (B-9 allowlist suppression)"` を文字列検索する
**THEN** 該当テストブロックが存在しない

---

### TC-011: `running → failed` 遷移が `VALID_TRANSITIONS` で合法である

**Category**: unit
**Priority**: must
**Source**: D1（遷移合法性分析）

**GIVEN** `status: "running"` の JobState
**WHEN** `transitionJob(state, "failed", { trigger: "store-fail", reason: "...", patch: {...} })` を呼ぶ
**THEN** 例外がスローされず、返却された state の status が `"failed"` になっている

---

### TC-012: `fail()` 呼び出し後の state に `updatedAt` が `transitionJob` によって自動付与される

**Category**: unit
**Priority**: should
**Source**: D1（patch フィールドの活用）

**GIVEN** `status: "running"` の JobState（任意の `updatedAt` 値）
**WHEN** `fail()` を呼ぶ
**THEN** 返却 state の `updatedAt` は `transitionJob` が付与した新しい ISO 文字列であり、`fail()` 内に手動の `new Date().toISOString()` spread が存在しない

---

### TC-013: exit-guard の `running → awaiting-resume` 遷移が合法である

**Category**: unit
**Priority**: must
**Source**: D2（遷移合法性分析）

**GIVEN** exit-guard が `status === "running"` のチェックを通過した JobState
**WHEN** `transitionJob(state, "awaiting-resume", { trigger: "exit-guard", ... })` を呼ぶ
**THEN** 例外がスローされず、state の status が `"awaiting-resume"` になっている

---

### TC-014: exit-guard は `running` 以外の job をスキップする

**Category**: unit
**Priority**: should
**Source**: D2（line 19 guard）

**GIVEN** exit-guard のループ対象に `status !== "running"` の job（例: `"failed"`, `"terminated"`）が含まれる
**WHEN** exit handler が実行される
**THEN** その job に対して `transitionJob` が呼ばれない（既存 guard が維持されている）

---

### TC-015: signal-handler の race condition — `awaiting-merge` 状態では throw が catch される

**Category**: unit
**Priority**: should
**Source**: D3（race condition 分析）

**GIVEN** job が `"awaiting-merge"` に遷移した直後（race window）、teardown 前に SIGINT を受信した
**WHEN** `signalCleanup` 内で `transitionJob(current, "awaiting-resume", {...})` を呼ぶ
**THEN** `awaiting-merge → awaiting-resume` は `VALID_TRANSITIONS` にないため `transitionJob` が throw し、既存の catch handler が例外を swallow して `process.exit(130)` に進む。job の state は変更されない

---

### TC-016: signal-handler の `running → awaiting-resume` 遷移が合法である

**Category**: unit
**Priority**: must
**Source**: D3, T-04

**GIVEN** `status: "running"` の job 実行中に SIGINT を受信した
**WHEN** `signalCleanup` が `transitionJob(current, "awaiting-resume", { trigger: "signal-handler", ... })` を呼ぶ
**THEN** 例外がスローされず、state の status が `"awaiting-resume"` になっている

---

### TC-017: `local.ts` の signal-handler パターンが `managed.ts` と一致する

**Category**: manual
**Priority**: should
**Source**: T-04, D3

**GIVEN** 変更適用後の `src/core/runtime/local.ts` と `src/core/runtime/managed.ts`
**WHEN** 両ファイルの signal-handler の `transitionJob` 呼び出し部分を目視比較する
**THEN** `local.ts` も `managed.ts` 同様に `canTransition` guard なしで `transitionJob` を直接呼んでいる（例外は既存 catch で swallow）

---

### TC-018: 変更後に `bun run typecheck` が green になる

**Category**: manual
**Priority**: must
**Source**: T-02 / T-03 / T-04 各 AC, T-07

**GIVEN** T-02〜T-06 の変更がすべて適用されている
**WHEN** `bun run typecheck` を実行する
**THEN** exit 0、型エラーゼロ

---

### TC-019: プロジェクト標準 verification 4 コマンドすべてが green になる

**Category**: manual
**Priority**: must
**Source**: T-07

**GIVEN** すべての変更が適用されている
**WHEN** `bun run build && bun run typecheck && bun run lint && bun run test` を実行する
**THEN** 4 コマンドすべてが exit 0（B-9 arch test 含む）

---

### TC-020: scan で確定した bypass が 3 件（または scan で確定した全件）であることを確認する

**Category**: unit
**Priority**: must
**Source**: T-01

**GIVEN** `src/store/` および `src/core/` を対象に status 直書きパターンで grep した結果（テストファイル・コメント行・`core/verification/`・`create()` 初期化行を除外）
**WHEN** `arch-allowlist.ts` の B-9 エントリと照合する
**THEN** allowlist 外の新規 bypass がゼロであり、修正対象が B9-store-fail / B9-exit-guard / B9-signal-handler の 3 件（または scan で発見された追加分）として確定している

---

### TC-021: B-1 allowlist エントリが変更後も維持されている

**Category**: unit
**Priority**: should
**Source**: T-05

**GIVEN** 変更適用後の `tests/unit/architecture/arch-allowlist.ts`
**WHEN** `ARCH_ALLOWLIST.filter(e => e.invariant === "B-1")` を評価する
**THEN** B-1 エントリが残存している（B-9 削除による誤削除がない）

---

### TC-022: `fail()` 呼び出し時に `transitionJob` が history エントリを追加する

**Category**: unit
**Priority**: should
**Source**: D1（Risks — history 重複に関するトレードオフ）

**GIVEN** `status: "running"` の JobState（history が空または既存エントリあり）
**WHEN** `fail()` が `transitionJob` を経由して実行される
**THEN** 返却 state の `history` に `failed` 遷移の記録が追加されている（`transitionJob` が自動付与）

---

### TC-023: `job-state-store.ts` の `transitionJob` import パスが正しい

**Category**: unit
**Priority**: should
**Source**: T-02, D5

**GIVEN** 変更適用後の `src/store/job-state-store.ts`
**WHEN** import 文を確認する
**THEN** `transitionJob` が `"../state/lifecycle.js"` から import されている

---

### TC-024: `exit-guard.ts` の `transitionJob` import パスが正しい

**Category**: unit
**Priority**: should
**Source**: T-03

**GIVEN** 変更適用後の `src/core/lifecycle/exit-guard.ts`
**WHEN** import 文を確認する
**THEN** `transitionJob` が `"../../state/lifecycle.js"` から import されている

---

### TC-025: `local.ts` の `transitionJob` import パスが正しい

**Category**: unit
**Priority**: should
**Source**: T-04

**GIVEN** 変更適用後の `src/core/runtime/local.ts`
**WHEN** import 文を確認する
**THEN** `transitionJob` が `"../../state/lifecycle.js"` から import されている

---

### TC-026: `fail()` が既に `"failed"` な job に対して呼ばれた場合は noop になる

**Category**: unit
**Priority**: could
**Source**: D1（`failed → failed` は same-status noop）

**GIVEN** `status: "failed"` の JobState（二重呼び出しシナリオ）
**WHEN** `transitionJob(state, "failed", {...})` を呼ぶ
**THEN** `transitionJob` の same-status チェックにより状態変更なしで終了する（例外なし）

---

## Result

```yaml
result: completed
total: 26
automated: 23
manual: 3
must: 16
should: 9
could: 1
blocked_reasons: []
```
