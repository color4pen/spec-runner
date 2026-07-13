# archive --with-merge の merge-wait が transient BLOCKED で誤 escalation するのを修正

## Meta

- **type**: bug-fix
- **slug**: merge-wait-blocked-grace
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

## 背景

`job archive --with-merge` の merge-wait loop は、CI checks が success になった直後、GitHub の mergeStateStatus が `BLOCKED → CLEAN` へ再計算される前に判定すると、「checks success かつ BLOCKED」を非 check の branch-protection 要件未達と誤認して即 escalation する。実際には mergeState 反映のラグ（transient）で、数秒後には CLEAN になり merge 可能。この誤 escalation で job が中断し手動復旧が必要になる。

## 現状コードの前提

- `src/core/archive/merge-then-archive.ts:422-426`: `rollup.state === "success"` かつ `isBlocked` のとき `blockedAfterChecksEscalation` で即 escalation する（grace なし）。
- 対して `rollup.state === "none"` には grace（`NONE_CHECK_GRACE_MS`、`:432-457`）があり、checks 出現を待つ。
- `mergeStateStatus` は毎 loop で `getPullRequest` から再取得している（`:310, :335`）。
- DIRTY / CONFLICTING は別途 conflict escalation（`:336`）、全体 timeout は `effectiveTimeoutMs`（`:460-473`）。

## 要件

1. `rollup.state === "success" && isBlocked` のとき、即 escalation せず grace 期間だけ poll を継続する。後続の再取得で mergeStateStatus が CLEAN（isBlocked=false）へ変わったら merge へ進む。grace を過ぎても BLOCKED のままなら、従来どおり branch-protection escalation する（真の非 check 要件＝required review 等）。
2. grace は既存の none-check grace と同型の set-once タイマーで実装し、全体 timeout（`effectiveTimeoutMs`）内に収める。既存の conflict / check-failure / timeout 判定は変えない。

## スコープ外

- archived-but-unmerged の recovery（別 request で扱う）。
- config / verification 系。
- merge 方式（squash）や archive の順序変更。

## 受け入れ基準

- [ ] checks success ＋ 一時的 BLOCKED → 後続 poll で CLEAN になれば merge へ進むことをテストで固定する。
- [ ] checks success ＋ grace 超過後も BLOCKED のまま → branch-protection escalation することをテストで固定する。
- [ ] 既存の conflict / check-failure / timeout の挙動が不変であることをテストで確認する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- 即 escalation を廃し grace を入れる。none-check grace と同型にして機構を統一する。
- grace を無限にせず全体 timeout 内に収める（既存の deadline を流用）。
- mergeState を信用しきらず最終 mergeability は merge endpoint で決める既存方針は維持（grace はあくまで「即断しない」ための猶予）。
