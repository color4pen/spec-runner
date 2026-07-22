# Conformance Result — bootstrap-commit-egress-ledger — iter 1

## 検証した項目

### tasks.md (J1)

全 8 タスクのチェックボックスが [x] 済み。

- T-01 (`workspace-materializer.ts`): import 追加 (line 27)、rev-parse + updateJobState ブロックを `if (opts?.requestFilePath)` ガード内 lines 226–242 に挿入済み。
- T-02 (`local.ts`): import 追加 (line 61)、rev-parse + updateJobState ブロックを `if (isRunPath && opts?.requestFilePath)` 二重ガード内 lines 414–428 に挿入済み。
- T-03 (`managed.ts`): import 追加 (line 18)、rev-parse + updateJobState ブロックを `git push origin` ブロック(line 260)より前の lines 244–257 に挿入済み。
- T-04–T-07: テストファイル 4 本作成済み。
- T-08: verification-result.md で build/typecheck/test/lint 全フェーズ exit 0 確認。

### design.md (J2)

| 決定 | 確認内容 |
|------|---------|
| D1: `git rev-parse HEAD` でキャプチャ | 3 ファイル全て `git commit` 直後に `spawnFn("git", ["rev-parse", "HEAD"], ...)` を呼ぶ |
| D2: rev-parse 失敗で fail-closed | 3 ファイル全て `exitCode !== 0` で throw。workspace-materializer.ts は throw 前に `manager.remove + prune` を実行（既存 commit 失敗パスと同じパターン） |
| D3: `updateJobState` + `appendSynthesizedCommit` で永続化 | 3 ファイル全て `updateJobState(jobId, (s) => appendSynthesizedCommit(s, bootstrapOid), ...)` を呼ぶ |
| D4: 3 ファイルへの import 追加 | `workspace-materializer.ts:27`, `local.ts:61`, `managed.ts:18` で確認 |
| D5: egress 検証ロジックは変更なし | `git diff main...HEAD -- src/core/step/commit-push.ts` が空。`git diff main...HEAD -- src/state/schema/operations.ts` も空 |

### spec.md (J3)

**Requirement: Bootstrap commit OID SHALL be recorded in synthesizedCommits**

| Scenario | テスト | 証拠 |
|----------|--------|------|
| workspace-materializer new-run path | TC-001 (`bootstrap-egress-ledger-wm.test.ts`) | `trackedState.synthesizedCommits` に `BOOTSTRAP_OID` が含まれることをアサート |
| local.ts no-worktree run path | TC-002 (`bootstrap-egress-ledger-local.test.ts`) | `JobStateStore` 経由で load した永続化状態に `BOOTSTRAP_OID` が含まれることをアサート |
| managed.ts run path | TC-003 (`bootstrap-egress-ledger-managed.test.ts`) | managed local state に `MANAGED_BOOTSTRAP_OID` が含まれることをアサート |

**Requirement: Bootstrap SHALL fail closed when rev-parse fails**

| Scenario | テスト | 証拠 |
|----------|--------|------|
| workspace-materializer rev-parse 失敗 | TC-004 (`bootstrap-egress-ledger-wm.test.ts`) | `rejects.toThrow()` + `manager.remove`/`prune` 呼び出しをアサート |
| local.ts rev-parse 失敗 | TC-005 (`bootstrap-egress-ledger-local.test.ts`) | `rejects.toThrow()` をアサート |
| managed.ts rev-parse 失敗 | TC-006 (`bootstrap-egress-ledger-managed.test.ts`) | `rejects.toThrow()` をアサート |

**Requirement: Egress check SHALL pass on the first push after bootstrap**

| Scenario | テスト | 証拠 |
|----------|--------|------|
| first push egress passes (bootstrap OID in ledger) | TC-007 (`bootstrap-egress-ledger-e2e.test.ts`) | 実 git リポジトリで `verifyEgressLedger({ ledger: [bootstrapOid, stepOid] })` が resolve することをアサート |
| first push egress fails (bootstrap OID absent, 破壊確認) | TC-008 (`bootstrap-egress-ledger-e2e.test.ts`) | `verifyEgressLedger({ ledger: [stepOid] })` が `EGRESS_UNKNOWN_COMMIT` で reject することをアサート |

**Requirement: Existing egress and synthesis tests SHALL remain green**

- `commit-push.ts` / `operations.ts` は無変更（diff 空）。
- TC-009 でエクスポート intact を確認。
- `bun run test` exit 0（verification-result.md）。

### request.md 受け入れ基準 (J4)

| 基準 | 状態 | 根拠 |
|------|------|------|
| 3 経路で synthesizedCommits への OID 記録をテストで固定 | ✓ | TC-001, TC-002, TC-003 |
| 手動 seed なしの実 git bootstrap → 初回 push で EGRESS_UNKNOWN_COMMIT が発生しないことを固定 | ✓ | TC-007 |
| rev-parse 失敗の注入で bootstrap が失敗することを固定 | ✓ | TC-004, TC-005, TC-006 |
| 修正前の挙動に戻すと該当テストが fail する破壊確認 | ✓ | TC-008（bootstrapOid を意図的に omit → EGRESS_UNKNOWN_COMMIT） |
| 既存の egress / 合成 / revision 束縛テストは無改変で green | ✓ | diff 空 + verification passed |
| `typecheck && test` が green | ✓ | verification-result.md: 全フェーズ exit 0 |

## 検証できなかった項目

None

## Findings 詳細

None
