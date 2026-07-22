# Regression Gate Result — bootstrap-commit-egress-ledger — iter 2

## Ledger Item Verification

### F-001 (LOW): `git commit` と `updateJobState(appendSynthesizedCommit)` 間の原子性ギャップ（クラッシュウィンドウ）

**File**: `src/core/runtime/workspace-materializer.ts:226`

---

## 調査方法

1. `git diff main...HEAD` で実装変更差分を確認
2. `workspace-materializer.ts`, `local.ts`, `managed.ts` の実装を精読
3. `runner.ts` の setupWorkspace エラー補足パスを確認
4. `exit-guard.ts` の `beforeExit` ハンドラを確認
5. `events.jsonl` でパイプライン遷移を追跡

---

## 主要修正の確認（一次的欠陥の解消）

3 経路すべてで `git commit` 直後に `rev-parse HEAD` + `appendSynthesizedCommit` を呼ぶ修正が存在する：

| 経路 | 行 | 状態 |
|------|-----|------|
| `workspace-materializer.ts` | 226–242 | ✅ 存在 |
| `local.ts` | 414–428 | ✅ 存在 |
| `managed.ts` | 244–257 | ✅ 存在 |

bootstrap commit の台帳未記録（100% 再現）は解消されており、退行なし。

---

## 台帳項目（F-001）の現状確認：原子性ギャップ

### クラッシュウィンドウの経路分析

**正常系・非クラッシュ系**（`updateJobState` が throw した場合）:

1. `git commit` 成功
2. `rev-parse HEAD` 成功（`bootstrapOid` 変数に格納）
3. `updateJobState(appendSynthesizedCommit)` が throw
4. エラーが `setupWorkspace` を通じて `runner.ts:152` の catch まで伝播
5. `runner.ts:154`: `transitionJob(jobState, "failed", {...})` で "failed" に遷移
6. `runner.ts:159`: `persistJobState` で "failed" を永続化
7. `runner.ts:287` `finally { keepAlive.release() }` 発火
8. `beforeExit` ハンドラ発火 → `state.status !== "running"` で早期 return

→ 状態は "failed" に遷移するため、`beforeExit` による "awaiting-resume" 誤遷移は発生しない。

**ハードクラッシュ系**（SIGKILL / OOM）:

1. `git commit` 成功
2. SIGKILL でプロセス終了（`updateJobState` 完了前）
3. ジョブは "running" 状態のまま残留
4. `specrunner resume` でジョブを再開
5. `rev-list HEAD --not --remotes=origin` に bootstrap commit が含まれる
6. `synthesizedCommits` に bootstrap OID がない → EGRESS_UNKNOWN_COMMIT

このシナリオは `beforeExit` 経由ではなく、`running` 状態のまま残留した job の resume 経路で発生しうる。

### 修正の存否確認

F-001 の修正方針として提示された 2 案：

| 修正案 | 実装状況 |
|--------|---------|
| resume 経路で `git log` を走査し bootstrap commit 候補 OID を `synthesizedCommits` に補完 | **未実装** |
| `updateJobState` 失敗時に job を terminated に遷移させ "awaiting-resume" への誤遷移を防ぐ | **未実装** |

どちらの修正も本ブランチの差分に存在しない（`src/core/resume/`、`src/core/lifecycle/exit-guard.ts` は無変更）。

### 補足：cross-boundary-invariants レビューとの整合

`events.jsonl` より、cross-boundary-invariants reviewer は F-001 を LOW/fixable と評価しつつ **approved** を返した（`verdict: "approved"` with findings）。その後 code-fixer は実行されず、regression-gate に直接遷移している。F-001 は approved 判定の根拠外 finding として残存している。

---

## Evidence Summary

- **checked**: 1（F-001 の存否確認）
- **skipped**: 0
- **unverified**: 0

F-001 が示す原子性ギャップは現在のコードに残存している（修正未適用）。一次的欠陥（bootstrap commit の台帳未記録）は解消済みで退行なし。
