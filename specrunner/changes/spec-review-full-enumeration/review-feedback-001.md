# Review Feedback 001: spec-review-full-enumeration

## 検証した項目

### 受け入れ基準 (6 件)

**AC-1** `spec-review prompt の Method 節に全量列挙規律が含まれることを prompt contract テストで固定`
- `src/prompts/spec-review-system.ts` line 49 に「全量列挙の規律」が Method 番号 5 として追記済。
- `src/prompts/__tests__/spec-review-full-enumeration-prompt.test.ts` が `extractSection()` で `## Method` 節のみを切り出してアサート（全文 grep でない）。TC-001・TC-009 の両 describe がすべて green。
- `tests/prompts/spec-review-system.test.ts` にも同等の section-extraction アサートを追加。

**AC-2** `後出し判定純関数の 3 値をテストで固定`
- `src/core/step/finding-recency.ts` の `classifyFindingRecency` が設計 D4 の判定規則を完全実装（null / 空白行 → indeterminate、全行 trim 走査）。
- `tests/unit/core/step/finding-recency.test.ts` の TC-002/TC-003/TC-004 が late / not-late / indeterminate を固定。trim ずれ・空白行・両者 null も TC-010・TC-011 でカバー。

**AC-3** `iteration 2 の spec-review 完了で per-finding の後出し判定が journal に記録される`
- `CommitOrchestrator.applySuccessPostPersistEffects` が `step.name === SPEC_REVIEW && iteration >= 2` で `recordFindingRecency` を呼ぶ。persist 後の best-effort ブロックに配置済。
- TC-005 が iteration=2 / 2 findings（一方 late、他方 not-late）で `appendFindingRecency` が 1 件呼ばれ per-finding recency を持つ record が返ることを確認。TC-019 が `fold()` → `FoldResult.findingRecency` round-trip を確認。

**AC-4** `後出し検出が verdict / escalationReason を変更しない`
- `step-completion.ts` / `judge-verdict.ts` / `verifyFindingRefs` は無変更。後出し検出は persist 後の後処理専用ブロック。
- TC-007 が `FindingRecencyStore`（`appendFindingRecency` のみ、他メソッドなし）で `recordFindingRecency` を実行し `resolves.not.toThrow()` で完了を確認。

**AC-5** `iteration 1 では後出し検出が実行されない`
- オーケストレーターで `iteration >= 2` ゲート、`recordFindingRecency` 内部でも `iteration < 2` 早期 return（二重防御）。TC-006・TC-022 がそれぞれ層を検証。

**AC-6** `typecheck && test が green`
- `bun run typecheck`: exit 0。
- `bun run test`: 9559 passed, 1 skipped（646 file 全通過）。

### 実装詳細の確認

- `src/core/port/runtime-strategy.ts` — `RevisionContentPair` DTO・`readRevisionContent?` optional port を追加。`RealRuntimeStrategy` intersection で両 concrete runtime に required 実装を強制。
- `LocalRuntime.readRevisionContent` — fs 読み + `git show <oid>:<file>`。never throw、失敗 null。
- `ManagedRuntime.readRevisionContent` — `getRawFile(branch, file)` / prior は常に null。never throw。
- `FindingRecencyRecord` を `EventRecord` union に追加。`fold()` が `finding-recency` 行を `FoldResult.findingRecency` に収集。optional field のため既存の FoldResult リテラルは無改変で通る。
- `appendFindingRecency` を `JobJournal` / `JobStateStore` に追加。lineage と同形の `appendEventRecord` 委譲。

### test-cases.md 全 25 件の対照確認

| TC | Priority | 結果 |
|----|----------|------|
| TC-001 | must | ✓ 節抽出アサート |
| TC-002 | must | ✓ late |
| TC-003 | must | ✓ not-late |
| TC-004 | must | ✓ indeterminate |
| TC-005 | must | ✓ iteration 2 で append 1 件 |
| TC-006 | must | ✓ iteration 1 で append なし |
| TC-007 | must | ✓ verdict 書き戻し経路なし |
| TC-008 | must | ✓ late ≥1 で stderr 出力 |
| TC-009 | must | ✓ 5 節骨格保持 |
| TC-010 | should | ✓ 空白行 indeterminate |
| TC-011 | should | ✓ trim 一致・行番号ずれ許容 |
| TC-012 | must | ✓ LocalRuntime 現 + prior 返却 |
| TC-013 | should | ✓ 非存在 OID で prior=null |
| TC-014 | should | ✓ 非存在 path で current=null |
| TC-015 | should | ✓ ManagedRuntime（TC-MR-006 として実装） |
| TC-016 | must | ✓ readRevisionContent 未実装で全 indeterminate |
| TC-017 | should | ✓ late=0 で stderr 未呼び出し |
| TC-018 | should | ✓ findings=0 で append なし |
| TC-019 | must | ✓ fold() findingRecency 収集 |
| TC-020 | should | ✓ journal-only（state 非 materialize） |
| TC-021 | should | ✓ 未知 type 行の forward compat |
| TC-022 | must | ✓ scope finding 除外 |
| TC-023 | should | ✓ 例外握り潰しで step 完了 |
| TC-024 | must | ✓ typecheck green |
| TC-025 | must | ✓ test suite green |

## 検証できなかった項目

None。acceptance criteria 全 6 件および test-cases.md の全 25 件を確認済。

## Findings 詳細

### F-1: `StepOutcome.commitOid` — 参照されない dead スキーマフィールド

**Severity**: low / **Resolution**: fixable
**File**: `src/state/schema/types.ts` line 173

`StepOutcome` に `commitOid?: string` が追加されたが、production コードにも test アサートにも `outcome.commitOid` を読む箇所が存在しない。オーケストレーター (`commit-orchestrator.ts` line 278) は `stepRun.commitOid`（StepRun トップレベル）を読むため、`StepOutcome.commitOid` に値を設定しても `priorOid` 解決には影響しない。コメントには「test construction patterns のために追加」とあるが、実際には下記 F-2 の構築パターンで `outcome.commitOid` を設定しているものの、その値は読まれていない。フィールドを削除するか、読み側でフォールバックを設けて機能させることを推奨。

---

### F-2: TC-022 の `priorStepRun` が `outcome.commitOid` を設定しているが orchestrator は `stepRun.commitOid`（トップレベル）を読む

**Severity**: low / **Resolution**: fixable
**File**: `tests/unit/core/step/spec-review-scope-exclusion.test.ts` line 147

```ts
const priorStepRun: StepRun = {
  attempt: 1, sessionId: null,
  outcome: {
    verdict: "needs-fix", findingsPath: null, error: null,
    commitOid: PRIOR_COMMIT_OID,  // ← outcome の中
  },
  // ← トップレベルの commitOid: PRIOR_COMMIT_OID が無い
  startedAt: "...", endedAt: "...",
};
```

`applySuccessPostPersistEffects` が解決する `priorOid` は `stepRuns[0]?.commitOid ?? null` = `null`（`priorStepRun.commitOid` は undefined）となる。`recordFindingRecency` がモックされているためテストは合格するが、「オーケストレーターが正しい `priorOid` を解決して `recordFindingRecency` に渡す」という経路は TC-022 では検証されていない。production パスは `pushStepResult` がトップレベル `commitOid` を正しく設定するため動作は正しいが、テスト上の誤解リスクがある。修正案: `priorStepRun` のトップレベルに `commitOid: PRIOR_COMMIT_OID` を移し、受け取った params の `priorOid` を追加アサートする。
