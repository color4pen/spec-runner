# Regression Gate Result — pipeline-sole-committer (iter 001)

Verified 12 findings from the review ledger against the current branch.

---

## Verified FIXED (7)

### F-001 [HIGH] synthesizedCommits 台帳が生産コードで populate されない
- `commit-orchestrator.ts` line 29: `appendSynthesizedCommit` が import されている。
- `commitSuccess`（lines 365–373）: `result.commitOid` と `result.exitCommitOid` の両方を `appendSynthesizedCommit` で台帳へ append している。
- `commitRound`（lines 585–590）: `roundCommitOid` を同様に append している。
- **状態: FIXED**

### F-002 [HIGH] commitFinalState の push 前に egress 検証がない
- `commit-push.ts` lines 587–601: commit 後に HEAD OID を取得し `synthesizedCommits ∪ {newOid}` の ledger で `verifyEgressLedger` を呼んでいる。失敗時は push を skip して return する。
- **状態: FIXED**

### F-003 [MEDIUM] HEAD guard の git reset --mixed 失敗が無視される
- `parallel-review-round.ts` lines 287–294: `gitExecResult` の結果を `!resetResult.ok || resetResult.exitCode !== 0` で検査し、失敗時に `SpecRunnerError` を throw する。
- **状態: FIXED**

### F-004 [LOW] guarded mode 空変更フォールバック `-- .` が実質 bare add-A
- `commit-push.ts` lines 472–477: `changedPaths.length > 0` の場合のみ `git add -A -- <paths>` を呼ぶ。`changedPaths` が空の場合は add をスキップし、後続の `diff --cached --quiet` exit 0 で early return する。`["add", "-A", "--", "."]` フォールバックは削除済み。
- **状態: FIXED**

### F-006 [MEDIUM] CLI step exit-HEAD が synthesizedCommits に未記録
- `executor.ts` lines 580–586: `step.run()` 後に exit-HEAD を捕捉し、entry-HEAD と異なれば `exitCommitOid` としてセット。
- `commit-orchestrator.ts` lines 371–373: `commitSuccess` で `result.exitCommitOid` を `appendSynthesizedCommit` で台帳へ append。
- **状態: FIXED**

### F-007 [MEDIUM] propagateVerificationResult push が egress backstop を経由しない
- `propagate.ts` lines 74–88: commit 後に HEAD OID を取得し `synthesizedCommits ∪ {newOid}` の set で `rev-list` 結果を照合するインライン egress チェックを実施。未知 commit があれば `{ ok: false, error }` を返し push しない。
- **状態: FIXED**

### F-008 [LOW] guarded mode の空変更フォールバック（F-004 継続）
- F-004 と同一コード変更で解決済み。
- **状態: FIXED**

---

## NOT FIXED — Regressions (5)

### F-005 [LOW] T-10 完了マーカーが実装と不一致
- `tasks.md` T-10（lines 129–138）: "scoped residual halt → 非宣言変更は commit に含まれない・halt しない 期待へ" と記載して ✓ マーク。
- **実際**: `commit-push.ts` lines 397–411 は依然 `writeScopeViolationError` を throw している。`write-scope-bypass-closure.test.ts` の TC-008/009 もまだ `WRITE_SCOPE_VIOLATION` halt を期待している（行 926–962, 993–1027）。
- tasks.md の完了マーカーと実装・テスト双方が乖離したまま。
- **状態: NOT FIXED**

### F-009 [MEDIUM] D5 fail-closed: scoped postStatus.ok=false が黙殺される
- `commit-push.ts` line 397: `if (postStatus.ok && postStatus.paths.length > 0) { ... }` — `ok:false` の場合はブロック全体がスキップされ処理が続行する。
- `design.md` D5（lines 164–166）: "scoped residual の `getWorktreeChangedPaths` `ok:false` → 黙殺スキップを廃し、status 失敗を `commitEffectFailedError` で halt する" と明記。
- `tasks.md` T-06（line 82）: "[x]" マーク済みだが対応するコードパスは未修正。
- GUARDED モード（lines 443–447）では `statusResult.ok` が false の場合に `commitEffectFailedError` を throw しており正しく fix 済み。SCOPED モードのみ未対応。
- **状態: NOT FIXED**

### F-010 [MEDIUM] roundError ROUND_HEAD_ADVANCED が後続検査で上書きされる
- `parallel-review-round.ts` lines 365–426: git effects inspection ブロックが `!inspectionEscalated` ガードなしで実行される。
- HEAD guard（lines 272–304）が発火（`inspectionEscalated=true`, `roundError.code="ROUND_HEAD_ADVANCED"`）した後、mixed reset により reviewer の変更が worktree に残存する。
- 続く worktree inspection（lines 374–425）で `offending.length > 0` になれば `roundError = { code: "ROUND_NONDECLARED_CHANGE", ... }` で上書きされ、`ROUND_HEAD_ADVANCED` が state から消失する。
- コメント（lines 362–363）には "Already true if HEAD guard fired" と記載があるが、`inspectionEscalated` の再セットは `roundError` 上書きを防がない。
- **状態: NOT FIXED**

### F-011 [LOW] D7: scoped residual restore+halt が design と反して残存
- `design.md` D7（lines 190–193）: "scoped residual restore + halt（`commit-push.ts:411-448`）: checkpoint が管理パス限定になり leak 経路が消えるため、residual の restore は不要。非宣言変更の worktree 残留は後続 round の offending 検査で fail-closed に捕捉される。"
- `commit-push.ts` lines 407–411: two-step restore（clean -f + checkout HEAD）と `writeScopeViolationError` throw が残存。設計は「commit に含まれないが halt しない」だが実装は halt する。
- **状態: NOT FIXED**（より保守的な動作で security 上は問題ないが D7 に違反）

### F-012 [LOW] Bare git commit without pathspec（guarded changedPaths=0 fallback）
- `commit-push.ts` lines 491–494:
  ```ts
  const commitArgs: string[] =
    changedPaths.length > 0
      ? ["commit", "-m", commitMessage, "--", ...changedPaths]
      : ["commit", "-m", commitMessage];
  ```
  `changedPaths.length === 0` の場合、pathspec なしの bare `git commit` が生成される。
- 実行上は unreachable（add スキップ → diff --cached exit 0 → early return のため commit に到達しない）だが、コードとして F-004 不変条件に静的違反している。`write-scope-invariants.test.ts` の TC-021 は bare `git add -A` のみを静的検査し、bare `git commit` は対象外。
- **状態: NOT FIXED**

---

## 集計

| 状態 | 件数 |
|------|------|
| FIXED | 7 |
| NOT FIXED | 5 |
| 合計 | 12 |
