# Conformance Result — bootstrap-commit-egress-ledger — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### tasks.md (J1)

全 8 タスクのチェックボックスが [x] 済み（iteration 1 から変更なし）。

- T-01 (`workspace-materializer.ts`): rev-parse + appendSynthesizedCommit ブロック lines 226–242、import line 27。
- T-02 (`local.ts`): rev-parse + appendSynthesizedCommit ブロック lines 414–428、import line 61。
- T-03 (`managed.ts`): rev-parse + appendSynthesizedCommit ブロック lines 244–257（git push より前）、import line 18。
- T-04–T-07: テストファイル 4 本現存。
- T-08: verification-result.md で build/typecheck/test/lint 全フェーズ exit 0 確認。

### design.md (J2)

| 決定 | 確認内容 | 状態 |
|------|---------|------|
| D1: `git rev-parse HEAD` でキャプチャ | 3 ファイル全て `git commit` 直後に `spawnFn("git", ["rev-parse", "HEAD"], ...)` を呼ぶ | ✅ |
| D2: rev-parse 失敗で fail-closed | 3 ファイル全て `exitCode !== 0` で throw。`workspace-materializer.ts` は throw 前に `manager.remove + prune` を実行 | ✅ |
| D3: `updateJobState` + `appendSynthesizedCommit` で永続化 | 3 ファイル全て `updateJobState(jobId, (s) => appendSynthesizedCommit(s, bootstrapOid), ...)` を呼ぶ | ✅ |
| D4: 3 ファイルへの import 追加 | `workspace-materializer.ts:27`、`local.ts:61`、`managed.ts:18` | ✅ |
| D5: egress 検証ロジックは変更なし | `src/core/step/commit-push.ts` / `src/state/schema/operations.ts` は diff なし | ✅ |

### spec.md (J3)

**Requirement: Bootstrap commit OID SHALL be recorded in synthesizedCommits**

| Scenario | テスト | 証拠 |
|----------|--------|------|
| workspace-materializer new-run path | TC-001 (`bootstrap-egress-ledger-wm.test.ts`) | `trackedState.synthesizedCommits` に `BOOTSTRAP_OID` を含むことをアサート |
| local.ts no-worktree run path | TC-002 (`bootstrap-egress-ledger-local.test.ts`) | `JobStateStore` 経由で load した永続化状態に `BOOTSTRAP_OID` を含むことをアサート |
| managed.ts run path | TC-003 (`bootstrap-egress-ledger-managed.test.ts`) | managed local state に `MANAGED_BOOTSTRAP_OID` を含むことをアサート |

**Requirement: Bootstrap SHALL fail closed when rev-parse fails**

| Scenario | テスト | 証拠 |
|----------|--------|------|
| workspace-materializer rev-parse 失敗 | TC-004 (`bootstrap-egress-ledger-wm.test.ts`) | `rejects.toThrow()` + `manager.remove`/`prune` 呼び出しをアサート |
| local.ts rev-parse 失敗 | TC-005 (`bootstrap-egress-ledger-local.test.ts`) | `rejects.toThrow()` をアサート |
| managed.ts rev-parse 失敗 | TC-006 (`bootstrap-egress-ledger-managed.test.ts`) | `rejects.toThrow()` をアサート |

**Requirement: Egress check SHALL pass on the first push after bootstrap**

| Scenario | テスト | 証拠 |
|----------|--------|------|
| first push egress passes（bootstrap OID in ledger） | TC-007 (`bootstrap-egress-ledger-e2e.test.ts`) | 実 git リポジトリで `verifyEgressLedger({ ledger: [bootstrapOid, stepOid] })` が resolve することをアサート |
| first push egress fails（bootstrap OID absent、破壊確認） | TC-008 (`bootstrap-egress-ledger-e2e.test.ts`) | `verifyEgressLedger({ ledger: [stepOid] })` が `EGRESS_UNKNOWN_COMMIT` で reject することをアサート |

**Requirement: Existing egress and synthesis tests SHALL remain green**

- `commit-push.ts` / `operations.ts` は無変更（diff なし）。
- TC-009 でエクスポート intact を確認。
- `bun run test` exit 0（614 test files、8944 tests passed）。

### request.md 受け入れ基準 (J4)

| 基準 | 状態 | 根拠 |
|------|------|------|
| 3 経路で synthesizedCommits への OID 記録をテストで固定 | ✅ | TC-001, TC-002, TC-003 |
| 手動 seed なしの実 git bootstrap → 初回 push で EGRESS_UNKNOWN_COMMIT が発生しないことを固定 | ✅ | TC-007 |
| rev-parse 失敗の注入で bootstrap が失敗することを固定 | ✅ | TC-004, TC-005, TC-006 |
| 修正前の挙動に戻すと該当テストが fail する破壊確認 | ✅ | TC-008（bootstrapOid を意図的に omit → EGRESS_UNKNOWN_COMMIT） |
| 既存の egress / 合成 / revision 束縛テストは無改変で green | ✅ | diff なし + verification passed |
| `typecheck && test` が green | ✅ | verification-result.md: 全フェーズ exit 0 |

### iteration 2 の変更確認（F-001 修正）

iteration 001 の code-review で指摘された F-001（R2 テストのモックが全呼び出しを一律 reject し、台帳永続化失敗の destruction coverage として不完全）が修正されている。

修正後の R2 describe ブロック（`bootstrap-egress-ledger-wm.test.ts`）:

```typescript
updateJobState: vi.fn()
  .mockResolvedValueOnce(undefined)   // call 1: worktreePath
  .mockResolvedValueOnce(undefined)   // call 2: request.path
  .mockRejectedValueOnce(new Error("ledger persistence failed")), // call 3: ledger append
```

- 呼び出し 1（worktreePath 記録）・呼び出し 2（request.path 更新）は成功。
- 呼び出し 3（`appendSynthesizedCommit` — 台帳追記）のみ reject。
- `appendSynthesizedCommit` の呼び出しのみを `.catch(() => {})` で囲む改変を行うとテストが fail するため、destruction coverage として機能する。
- コメントも呼び出し順を正確に記述している（regression-gate-result-003.md で確認済み）。

F-002（原子性ギャップ）は code-fixer が LOW 判定でスキップ（events.jsonl 記録）。未適用のままであり退行ではない。

## 検証できなかった項目

None

## Findings 詳細

None
