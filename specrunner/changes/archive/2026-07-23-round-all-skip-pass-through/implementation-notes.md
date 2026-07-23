# Implementation Notes: round-all-skip-pass-through

受け入れ基準「ROUND_ALL_MEMBERS_SKIPPED の停止を期待していた既存テストは新仕様の期待に更新し、
更新対象を implementation-notes に列挙する」への対応記録。

## 期待値を更新した既存テスト一覧

### 1. `src/core/pipeline/__tests__/reviewer-status.test.ts`

| テスト名 | 変更前の期待 | 変更後の期待 |
|---|---|---|
| TC-003: `aggregateVerdict(["skipped", "skipped"])` | `"escalation"` | `"approved"` |

**変更内容**: custom-reviewer-canon-binding D6 で追加された「非空かつ全 skipped → escalation」分岐を削除し、全 skip が既定の `approved` に落ちるようになったことを反映。

---

### 2. `src/core/pipeline/__tests__/parallel-review-round-canon.test.ts`

| テスト名 | 変更前の期待 | 変更後の期待 |
|---|---|---|
| TC-006(canon)/TC-038: round outcome（all-skip） | `"escalation"` | `"approved"` |
| TC-038: `coordinatorRun.outcome.verdict`（all-skip） | `"escalation"` | `"approved"` |
| TC-038: `coordinatorRun.outcome.error`（all-skip） | `{ code: "ROUND_ALL_MEMBERS_SKIPPED" }` | `null` |
| TC-002/TC-038: single-member all-skip round outcome | `"escalation"` | `"approved"` |

**変更内容**:
- D1 の集約変更（`aggregateVerdict` 全 skip → `approved`）により round outcome が `"approved"` になる。
- D2 の roundError 設定削除により `coordinatorRun.outcome.error` が `null` になる。
- 単一 member 構成でも全 skip = 構造的 skip として同様に `"approved"` になる。

---

### 3. `tests/reviewer-activation-e2e.test.ts`

| テスト名 | 変更前の期待 | 変更後の期待 |
|---|---|---|
| TC-ACT-01 / TC-001: paths 不一致で全 skip → `result.status` | `"awaiting-resume"` | `"awaiting-archive"` |
| TC-ACT-02（requestTypes 不一致）: 全 skip → `result.status` | `"awaiting-resume"` | `"awaiting-archive"` |
| TC-ACT-04 / TC-002（first test）: 単一 reviewer skip → `result.status` | `"awaiting-resume"` | `"awaiting-archive"` |

**変更内容**: D1（集約 verdict approved）+ D2（roundError=null）+ D4（終端 seam 削除）の合算で、全員 skip の job が `awaiting-resume` で停止せず `awaiting-archive` まで到達する。TC-040 の期待更新に相当。

以下のテストは**変更なし**（従来どおり `awaiting-archive`）:
- TC-ACT-02（requestTypes 一致ケース）
- TC-ACT-03（条件無指定 reviewer は常時起動）
- TC-ACT-04（second test: 1 skip + 1 approved = mixed → `"awaiting-archive"` は変化なし）
- TC-ACT-05（reviewers/ 空の場合）

---

## 変更なしで green な canon 束縛テスト群

以下は本 change のスコープ外であり期待値更新不要（無変更で green）:

- `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts`
- `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts`
- `tests/canon-binding-e2e.test.ts`
- `src/core/pipeline/__tests__/round-git-scope.test.ts`

これらは `selectPendingMembers` / `applyRoundResults` の canonHash 束縛、`computeCanonHash`、
`ROUND_NONDECLARED_CHANGE` 等を検証しており、本 change の対象（`aggregateVerdict` 集約 /
roundError 設定 / terminal seam / chain routing）とは独立している。
