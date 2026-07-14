# Cross-Boundary-Invariants Review — round-inspection-fail-closed — iter 1

## Reviewer

cross-boundary-invariants  
目的: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Scope

```
src/core/port/runtime-strategy.ts
src/core/runtime/local.ts
src/core/runtime/managed.ts
src/core/pipeline/parallel-review-round.ts
src/core/runtime/__tests__/local-round-git.test.ts
src/core/runtime/__tests__/managed-round-git.test.ts
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts
```

（specrunner/ 配下のドキュメント類は対象外）

---

## Methodology

変更後のコードが触れていない既存機構（`applyRoundResults`・`commitRound`・fast-path・resume 経路）との境界を中心に、以下の 4 軸で交差確認した。

1. **Seam contract の完全性** — `listWorktreeChanges` の呼び出し元が残らず DU 対応しているか。
2. **Fast-path / resume との干渉** — `all-approved fast path` や resume 後の挙動が新 escalation 経路と矛盾しないか。
3. **`aggregateVerdictResult` の上書き順序** — step 7b の上書きが step 7 と競合しないか。
4. **Test fake の網羅性** — `string[]` を返す stale fake が残っていないか。

---

## Findings

### [OK] Seam contract の更新は完全

`grep -rn listWorktreeChanges src` で全参照を確認した。

- Port（`RuntimeStrategy` optional / `RealRuntimeStrategy` required）: 更新済み。
- `LocalRuntime` / `ManagedRuntime`: 更新済み（`implements RealRuntimeStrategy` で compile-time 強制）。
- Consumer（`ParallelReviewRound`）: DU 分岐に更新済み。
- Test fakes in `parallel-review-round-git-effects.test.ts`: `{kind:"success", paths}` / `{kind:"unavailable", reason}` を返すよう更新済み。
- `parallel-review-round-resume.test.ts` / `parallel-review-round-state-commit.test.ts` の fakes: `listWorktreeChanges` を省略（method omission 経路）しており変更不要。skip 経路（`?.listWorktreeChanges` が falsy）が正常に動作する。

`string[]` を返す stale fake は存在しない。

### [OK] `ManagedRuntime` の `success:[]` 維持

`managed.ts` は `{kind:"success", paths:[]}` を返す。`unavailable` にしていないことは設計判断（D3）に従っており、managed で parallel custom reviewer を使う設計が Non-Goal である限り正当。

### [OK] `aggregateVerdictResult` の上書き順序

step 7 で `aggregateVerdict([...memberVerdicts.values()])` が実行された後、step 7b の `unavailable` 分岐が "escalation" に上書きする。`toStage` / `offending` 分岐との間に競合はない（`if/else` で排他）。`roundError` は最大 1 箇所のみ設定される。

### [FINDING-1: LOW] ROUND_INSPECTION_UNAVAILABLE escalation 後の resume で fast-path が inspection を再実行しない

**境界**: `unavailable → escalation → commitRound (member statuses="approved")` × `resume → pending=0 → all-approved fast-path`

**状況**:

1. 全 member が "approved" を返す。
2. `applyRoundResults(statuses, memberVerdicts, headSha)` が実行され、member statuses が "approved" に更新される（これは step 7 で行われ、step 7b の inspection より前）。
3. `inspection.kind === "unavailable"` → `aggregateVerdictResult = "escalation"`, `roundError = ROUND_INSPECTION_UNAVAILABLE`。
4. `commitRound` が実行される。引数 `reviewerStatuses: statuses`（member "approved"）と coordinator syntheticRun（"escalation"）が同時に persist される。
5. pipeline は awaiting-resume で停止する。

**再開時**:

6. `deriveReviewerStatuses` → 全 member が "approved"。
7. `selectPendingMembers` → `pending = []`。
8. all-approved fast path（L142-147）が実行される。ここから先は fan-out ブロック（else）に入らないため、`listWorktreeChanges` も `commitRoundArtifacts` も呼ばれない。
9. coordinator が "approved" で persist される。宣言済み declared files は uncommitted のまま残り、宣言外変更の検査が完了しないまま round が approved になる。

**影響**:

- B-15 の「worktree inspection pass なしに approved に落とさない」という意図が、resume 経路では徹底されない。
- 宣言済みファイルが commit されないまま後続 step（conformance → pr-create）に進む可能性がある。

**緩和要因**:

- escalation により human intervention が必須であり、worktree の目視確認機会がある。設計コメントも「resume 時に worktree の全変更は commit されず保持される」と明記し、uncommitted 状態を認知している。
- 変更前の fail-open（inspection 失敗 → `[]` → coordinator "approved" 直通）より、escalation が挟まる分だけ安全性は高い。
- 本事象が顕在化するには「全 member approve」「git inspection 失敗」「human が resume」の 3 条件が重なる必要がある。

**修正案** （本 request のスコープ外、別 issue として起票を推奨）:

inspection が `unavailable` で終わるとき、member statuses を "approved" に persist せず "pending" に保留する（または coordinator が escalation のときは member statuses を commit しない）設計変更で解消できる。ただし `applyRoundResults` + `commitRound` の責務分割を見直す必要があり、本 change とは独立した設計判断。

---

### [OBSERVATION] `infra` が `unavailable` 経路でも構築される

`CommitPushInfra`（`infra`）は L224-229 で構築された後、`unavailable` 分岐では使われない。実害はないが（git 呼び出しが発生しない）、コードの明瞭性として `infra` の構築を `success` 分岐内に移せばより意図が明確になる。変更は任意。

---

## Acceptance Criteria 確認

| 基準 | 確認結果 |
|------|----------|
| local: git status 非ゼロ終了 → `{kind:"unavailable"}` | ✓ test 固定済み |
| local: spawn 例外 → `{kind:"unavailable"}` | ✓ test 固定済み |
| local: exit 0 → `{kind:"success", paths}` | ✓ test 固定済み |
| managed: `{kind:"success", paths:[]}` | ✓ test 固定済み |
| consumer: `unavailable` → escalation, `roundError.code = "ROUND_INSPECTION_UNAVAILABLE"` | ✓ test 固定済み |
| consumer: `unavailable` → `commitRoundArtifacts` 呼ばない | ✓ test 固定済み |
| consumer: synthetic coordinator StepRun verdict + error 確認 | ✓ test 固定済み |
| `success` 経路で宣言外変更検出・scoped commit が維持される | ✓ Scenario 1-5 継続 green |
| port doc comment から "Never throws — returns [] on any error" 削除 | ✓ 確認済み |
| `typecheck && test` が green | ✓ verification-result 全フェーズ passed |

---

## Verdict

- **verdict**: approved

FINDING-1 は実在する cross-boundary gap だが、（a）変更前の fail-open より安全、（b）human intervention が必須、（c）uncommitted 状態は設計が認知済み、という 3 点から本 request のスコープ内で blocking にはならない。別 issue として「inspection 失敗時に member statuses を approved に commit しない」設計を検討することを推奨する。
