# Cross-Boundary Invariants Review — Iteration 004

**Change**: job-reopen-from-awaiting-archive  
**Reviewer**: cross-boundary-invariants  
**Date**: 2026-07-22

## Scope

対象は diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかの検出。  
実装の正しさやテスト網羅性ではなく、既存機構との相互作用に潜む欠陥が対象。

Iteration 004 は、前回（003）が走査した I-01〜I-12 と重複しない新規不変条件に絞る。

---

## Invariant Walk Results

### I-13: cancel コマンドの awaiting-archive ガード

**観点**: `src/core/command/cancel/runner.ts` にある `state.status === "awaiting-archive" && !force` ガードが、reopen 後に誤って発火しないか。

**確認**: reopen が成功した時点で job は `running` 状態になる。cancel の当該ガードは `awaiting-archive` のみに反応するため、reopen 後の `running` job には発火しない。また reopen が途中失敗した場合は state.json が `awaiting-archive` のままであり、cancel が再度 `awaiting-archive` に対して正しく振る舞う（force なしなら明示確認を求める）。

**判定**: 不変条件維持 ✓

---

### I-14: selectPendingMembers の null baselineCommit 経路

**観点**: managed runtime がベースラインコミットを提供しない場合（`baselineCommit == null`）、`selectPendingMembers` のリビジョン束縛チェックがスキップされる経路が reopen 後に意図せず拡張されていないか。

**確認**: `reviewer-status.ts` の該当コードは変更なし。`baselineCommit == null` の場合は `approvedAtCommit` チェックをスキップし、旧承認を有効として扱う managed runtime フォールバックは、reopen 前後で同一動作。local runtime は `baselineCommit` を常に設定するため影響なし。

**判定**: 不変条件維持 ✓

---

### I-15: `_journal` カウンタの operatorEvents 非追跡

**観点**: `state.json` の `_journal` カウンタ（`historyCount`/`stepCounts`）が operator event を追跡しないことが意図的か、かつ delta 同期ロジックを壊さないか。

**確認**: `fold()` は `historyCount`（transition record 数）と `stepCounts`/`stepsTotal`（step-attempt 数）のみをカウントする。lineage record 同様、operator event record はカウントされない設計。`src/store/job-journal.ts` の delta 追跡ロジック（`journalState._journal` との比較）は `historyCount` と `stepCounts` のみを参照しており、operator event の非追跡は仕様通りで delta 同期に影響しない。

**判定**: 不変条件維持 ✓ (intentional non-tracking)

---

### I-16: reopen patch 後の `state.step` 陳腐化

**観点**: reopen の `transitionJob` patch が `state.step` を更新しないため、`state.step` が旧ステップ名（例: "pr-create"）を保持したまま pipeline executor に渡されるか。

**確認**: `ReopenCommand.prepare()` の `PrepareResult` は `startStep` フィールドで再開ステップを指定する。pipeline executor は `startStep` を参照して実行を開始し、executor が最初の step に入った時点で `state.step` を更新する。reopen patch に `step` の変更が含まれないことは設計通り（D4: patch clears only run-control fields）。`state.step` の陳腐化は `prepare()` 完了から executor 最初の step 更新まで狭い窓で発生するが、この間に他のコードが `state.step` に依存する呼び出しはない。

**判定**: 不変条件維持 ✓（narrow window のみ、benign）

---

### I-17: codeChangedSinceLastVerification と human push の不可視性

**観点**: reopen 後のパイプラインで、human が push した修正コミットを `codeChangedSinceLastVerification` が検知できず、再 verification がスキップされる経路が存在するか。

**確認**: `src/core/pipeline/reverification.ts` の `codeChangedSinceLastVerification(state)` は:

```typescript
const implMax = maxEndedAt(state.steps, [IMPLEMENTER, BUILD_FIXER, CODE_FIXER]);
const verifMax = maxEndedAt(state.steps, [VERIFICATION]);
return implMax !== null && (verifMax === null || implMax > verifMax);
```

これは specrunner ステップの `endedAt` タイムスタンプのみを比較する。**git push は一切参照しない**。

問題シナリオを追跡する:

1. PR open 後 pipeline が走り、conformance が `approved` を返し verification が pass → adr-gen → pr-create で `awaiting-archive` に遷移。  
2. operator が human fix を push (C1 → C2)。  
3. `job reopen --from code-review` を実行。pipeline が code-review から再開。  
4. code-review が "ok"（human fix で clean）→ code-fixer / build-fixer / implementer は**実行されない**。  
5. conformance step が実行される。  
6. `STANDARD_TRANSITIONS` における conformance の routing:
   ```
   { step: CONFORMANCE, on: "approved", to: VERIFICATION, when: codeChangedSinceLastVerification },
   { step: CONFORMANCE, on: "approved", to: ADR_GEN },
   ```
7. `codeChangedSinceLastVerification` は step 3 以降に implementer/code-fixer/build-fixer が動いていないため **false** を返す。  
8. conformance が `approved` → **verification をスキップして adr-gen へ直行**。  
9. `conformanceApprovedForVerifiedRevision` は `verification → adr-gen` 遷移にのみ存在し、ここでは評価されない。  
10. 結果: human が push した C2 コードは**未 verification のまま adr-gen → pr-create** まで進む。

design.md の D5 では「reopen 後は conformanceApprovedForVerifiedRevision が false を返し再 verification が保証される」と記述されているが、これは不正確。`conformanceApprovedForVerifiedRevision` は `verification → adr-gen` 遷移 (STANDARD_TRANSITIONS の第3エントリ) にのみ存在し、`conformance → verification` への routing は `codeChangedSinceLastVerification` のみが制御する。code-fixer 等が動かない reopen 経路では再 verification は保証されない。

この欠陥は:
- code-review から reopen かつ human fix が push 済みの場合に発生する
- 「clean code-review → code-fixer not triggered → verification skip」の組み合わせが条件
- TC-011 / TC-012 は commitOid 束縛をテストするが、conformance→verification routing の timestamp blind spot はテストされていない

**判定**: **不変条件 VIOLATED** — 欠陥 F-02 として記録

---

## Findings

### Finding F-02: codeChangedSinceLastVerification が human push を検知できず再 verification が保証されない

**Severity**: medium  
**Resolution**: fixable  
**Files**:
- `src/core/pipeline/reverification.ts` — `codeChangedSinceLastVerification` 実装
- `src/core/pipeline/types.ts` — STANDARD_TRANSITIONS routing

**現状**:  
`codeChangedSinceLastVerification` は specrunner ステップ（implementer/build-fixer/code-fixer）の `endedAt` タイムスタンプのみを比較し、git の HEAD commit を参照しない。  
reopen 後に code-review ステップから再開し、human fix で code-review が clean（code-fixer 不発動）の場合、`codeChangedSinceLastVerification` が false を返し、conformance は verification をスキップして adr-gen に直行する。  
design.md D5 の「conformanceApprovedForVerifiedRevision が再 verification を保証する」は不正確。当該関数は `verification → adr-gen` 遷移にのみ存在し、`conformance → adr-gen` bypass を防がない。

**発生条件** (全て揃ったとき):
1. `awaiting-archive` から reopen
2. reopen の `--from` が `code-review` またはそれより後のステップ
3. human が push した修正コミットが存在（reopen 前後問わず）
4. code-review が clean（code-fixer が起動しない）
5. conformance が `approved`

**影響**: 未 verification の人手修正コードが adr-gen → pr-create まで進む（セキュリティ・品質ゲートの抜け）。

**修正案**:
- オプション A: `codeChangedSinceLastVerification` を git HEAD commitOid ベースに変更（`lastVerifiedCommit` との比較）。
- オプション B: STANDARD_TRANSITIONS に「reopen 後は常に verification を要求」するフラグを追加し、reopen job では `codeChangedSinceLastVerification` を true 固定にする。
- オプション C: `FoldResult.operatorEvents` に reopen 記録があれば `conformanceApprovedForVerifiedRevision` 相当のチェックを `conformance → adr-gen` 遷移にも追加する。

---

## Evidence Summary

| # | 検証項目 | 結果 |
|---|---------|------|
| 1 | VALID_TRANSITIONS 変更なし / canTransition("awaiting-archive","running")=false (I-01 確認済み) | ✓ |
| 2 | ResumeCommand.prepare() の guard が awaiting-archive を拒否し続ける (I-02) | ✓ |
| 3 | allowReopen:true が B-17 test で reopen.ts のみに限定 (I-03) | ✓ |
| 4 | FoldResult リテラル 2 件に operatorEvents:[] 追加済み (I-04) | ✓ |
| 5 | assertJobFinishable が running job の archive を拒否 (I-05) | ✓ |
| 6 | exit-guard が running job を awaiting-resume へ遷移 (I-06) | ✓ |
| 7 | selectPendingMembers commitOid 不一致で stale 承認を pending 化 (I-07) | ✓ |
| 8 | appendOperatorEvent が B-13 監視対象外（gap として記録済み F-01） (I-08) | ⚠ F-01(LOW, iter003) |
| 9 | B-10 host↔token 束縛: src/cli/reopen.ts (I-09) | ✓ |
| 10 | CWD ratchet: 両 reopen.ts allowlist 登録済み (I-10) | ✓ |
| 11 | RESOLVE_REPO_ROOT_ALLOWED_FILES 侵害なし (I-11) | ✓ |
| 12 | TERMINAL_STATUSES 不変 (I-12) | ✓ |
| 13 | cancel ガードが reopen 後の running job に誤発火しない (I-13) | ✓ |
| 14 | selectPendingMembers null baselineCommit 経路が reopen で拡張されない (I-14) | ✓ |
| 15 | _journal カウンタが operatorEvents を意図的に非追跡 (I-15) | ✓ |
| 16 | reopen patch 後の state.step 陳腐化は benign (I-16) | ✓ |
| 17 | codeChangedSinceLastVerification が human push を検知できず再 verification スキップ (I-17) | ✗ F-02(MEDIUM) |

- **checked**: 17（I-01〜I-17 すべて）
- **skipped**: 0
- **unverified**: 0
