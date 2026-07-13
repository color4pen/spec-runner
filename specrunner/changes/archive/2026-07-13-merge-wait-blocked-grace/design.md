# Design: merge-wait blocked grace

## Context

`job archive --with-merge` の merge-wait loop（`src/core/archive/merge-then-archive.ts`）は、CI checks が `success` になった直後に GitHub の `mergeStateStatus` が `BLOCKED → CLEAN` へ再計算されるまでのラグ（transient）を考慮していない。

現状ロジック（L422-426）：

```
if (rollup.state === "success" && isBlocked) {
  → 即 blockedAfterChecksEscalation (exitCode 1)
}
```

この判定が transient な `BLOCKED` を "非 check の branch-protection 要件未達" と誤認し、即 escalation してジョブを中断させる。実際には数秒後に `CLEAN` へ変わって merge 可能になる。

対して `rollup.state === "none"` には `NONE_CHECK_GRACE_MS`（60s、set-once）の grace があり、checks 出現を待つ仕組みが既にある。

## Goals / Non-Goals

**Goals**:
- `success && BLOCKED` 観測時に即 escalation せず、`BLOCKED_CHECK_GRACE_MS` の猶予を与えて poll を継続する。
- grace 内に `isBlocked` が false（CLEAN）になれば通常の merge パスへ進む。
- grace 超過後も BLOCKED のままなら `blockedAfterChecksEscalation` を呼び出す（真の branch-protection 未達として扱う）。
- 実装は `noneGraceStart` と同型の set-once タイマーで統一し、全体 timeout（`effectiveTimeoutMs`）の内側に収める。

**Non-Goals**:
- archived-but-unmerged の recovery（別 request）。
- config / verification 系の変更。
- merge 方式（squash）や archive の順序変更。
- `NONE_CHECK_GRACE_MS` の値や動作変更。
- `BLOCKED` 以外の `mergeStateStatus`（DIRTY / CONFLICTING）の扱い変更。

## Decisions

### D1: 定数 `BLOCKED_CHECK_GRACE_MS = 30_000`

**Rationale**: `mergeStateStatus` の lag は GitHub の内部再計算によるもので、実測では秒オーダー。`NONE_CHECK_GRACE_MS`（60s、CI 出現待ち）より短い 30s で十分かつ保守的。独立した定数にすることで、将来の調整が明確に行える。

**Alternatives considered**:
- `NONE_CHECK_GRACE_MS` と同値（60s）にする → 用途が異なる（CI 出現待ち vs API lag 待ち）ため意味的に乖離する。
- 設定値にする → 「minimal-deps North Star」方針に反し、調整が必要になる根拠が現時点でない。

### D2: set-once タイマー `blockedGraceStart`（`noneGraceStart` と同型）

**Rationale**: 最初の `success && BLOCKED` 観測時に一度だけセット（never reset）。以降の poll で `isBlocked` が false になれば grace を問わず merge へ進む。grace 超過後も BLOCKED なら escalation。この構造は `noneGraceStart` と完全に対称で、コードの理解コストを最小化する。

**Alternatives considered**:
- 毎 loop でタイマーをリセット → grace の意味が変わり、永続 BLOCKED で escalation されなくなる。
- カウンタ（retry 回数）で管理 → poll interval が変わると挙動も変わり、ms 単位の deadline との整合が難しい。

### D3: grace 中のログ出力

**Rationale**: `none` grace と同形式でログを出力し、オペレーターがジョブの進行状況を判断できるようにする。

```
PR #N checks success but mergeStateStatus BLOCKED (Xs / 30s grace). Waiting Ys...
```

**Alternatives considered**:
- ログなし → 問題再発時に診断情報が消える。

### D4: `effectiveTimeoutMs` との関係

grace は全体 deadline の"内側"に置く。すなわち `blockedGraceStart` が set された後、全体 timeout が先に来た場合は timeout escalation が優先する。grace と timeout は独立した別経路であり、grace 中に timeout に達した場合は `rollup.state === "pending"` のタイムアウト処理ではなく、loop の次 iteration で全体 timeout を確認する必要がある。

**実装上の注意**: `success && BLOCKED && grace not expired` のとき、`sleepFn` して `continue` する。次の iteration で再び `success && isBlocked` かどうかを確認する。全体 timeout は loop 内の別ブランチ（`rollup.state === "pending"` の後）で確認されるが、`success && BLOCKED` の grace 継続パスは pending ブランチを通らないため、grace ループ内でも全体 timeout を確認する必要がある。

## Risks / Trade-offs

- [Risk] grace 中に真の branch-protection 未達（required review）が BLOCKED を維持し続けた場合、30s 遅延してから escalation する。  
  **Mitigation**: 30s は許容範囲内の遅延。required review の場合は grace 内に CLEAN にならないため最終的に escalate される。

- [Risk] `mergeStateStatus` が success → pending → success → BLOCKED のように oscillate した場合、`blockedGraceStart` は最初の観測でセットされるため、実際の BLOCKED 継続時間より短い grace になることがある。  
  **Mitigation**: set-once の設計は意図的。grace はあくまで「初見時の猶予」であり、oscillation は稀なエッジケース。

## Open Questions

なし。architect 評価済みの設計判断に基づく実装。
