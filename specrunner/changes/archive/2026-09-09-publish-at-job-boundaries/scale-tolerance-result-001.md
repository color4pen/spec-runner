# Scale-Tolerance Review — publish-at-job-boundaries — Iteration 1

**Reviewer**: scale-tolerance  
**Date**: 2026-09-08  
**Scope**: archive・sidecar・issue/PR・コメント・journal の件数増加に対する走査、ロード、API 呼び出し

---

## Evidence

### 調査範囲

| 対象 | 確認内容 |
|---|---|
| `src/store/job-state-store.ts` | reviewer の `paths` に一致する唯一の本体差分。初期 state への boolean policy 格納のみ |
| `src/core/step/commit-push.ts` | 新設された publish-only の履歴列挙、ledger 照合、push retry |
| `src/core/pipeline/pipeline.ts` | PR 前後・正常終了・halt の公開境界と呼び出し頻度 |
| `src/core/command/runner.ts` | pipeline 前 gate halt の公開経路 |
| `src/core/runtime/local.ts` | terminal commit と publication capability、sidecar/journal への影響 |
| `src/core/notify/issue-notifier.ts` | issue comment の追加呼び出し・fan-out の有無 |
| `design.md` | D2〜D7 の公開範囲、境界、archive/managed 契約 |
| `tasks.md` | T-02〜T-09 の実装範囲と検証証跡 |

### 単調増加軸ごとの評価

| 増加対象 | 差分によるコスト | 評価 |
|---|---|---|
| archive | archive directory の走査・ロード追加なし | 問題なし |
| sidecar | sidecar 一覧走査の追加なし。policy は job state の定数フィールド参照 | 問題なし |
| issue / PR | 新しい一覧 API 呼び出しなし。PR 処理前の publication は Git transport であり、PR 件数に依存しない | 問題なし |
| comments | notification body の分岐変更のみで、コメント一覧取得や件数比例 fan-out なし | 問題なし |
| journal | 新しい journal 全件 fold・全件ロードは追加されていない。terminal commit は既存の単一 job の管理 path を扱う | 問題なし |

### Git publication のコスト

`publishCommittedBranch` は remote feature ref がある通常ケースで `origin/<branch>..HEAD` の未公開 commit のみを列挙し、各 OID を `Set` 化した ledger と照合する。この処理は O(unpublished commits) であり、job 境界でのみ実行される。step ごとの push を廃止したため境界間の commit 数には比例するが、成功後は outgoing range が空になり、archive・sidecar・issue/PR・comment・journal の累積件数には比例しない。

初回 publication の `HEAD --not --remotes=origin` は repository history を探索し得るが、既知 remote ancestry を除外する Git revision walk であり、remote feature ref 作成前の一度だけ使われる。tick、exit guard、polling loop には接続されておらず、本 reviewer の needs-fix 基準に該当しない。

### 呼び出し頻度

- 通常 step / fixer / review round / verification: commit-only で publication なし
- PR job: pre-PR と post-PR の明示境界
- no-PR 正常終了: terminal boundary のみ
- controlled halt: 保存済み policy が有効な場合のみ
- signal / beforeExit / process loss: publication 追加なし
- push retry: 1 回の再試行に固定され、件数比例 fan-out なし

## Findings

なし。

## Observations

### O-01: boundary publication は未公開 commit 数に線形

**Severity**: low

複数 step の commit をまとめて送る設計上、公開境界の `rev-list` と ledger 照合は未公開 commit 数に線形となる。ただしコストを払うのは明示された job boundary のみで、成功後は range がリセットされる。単調増加する repository-wide artifact の定期走査ではなく、仕様が要求する fail-closed batch 検査に対応する有界なコストである。

## Evidence Summary

- checked: 8
- skipped: 0
- unverified: 0
- verification: `verification-result.md` の build / typecheck / test / lint 成功証跡を再利用し、重複実行していない
