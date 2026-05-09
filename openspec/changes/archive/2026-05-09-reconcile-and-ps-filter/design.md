## Context

spec-runner の JobState は 7 つの status を持つ。`lifecycle.ts` で遷移ルールが宣言的に定義されているが、外部状態（GitHub PR の MERGED/CLOSED）との乖離を検出する仕組みがない。ユーザーが GitHub UI で直接 PR をマージした場合、job は `awaiting-merge` のまま永続する。

`ps` コマンドは `--active` / `--all` の 2 フラグしかなく、特定 status でのフィルタができない。

## Goals / Non-Goals

**Goals:**

- `reconcileStaleRunning` — stale な running job を検出し `awaiting-resume` への遷移結果を返す純粋関数
- `reconcilePrState` — `awaiting-merge` + PR MERGED の場合に `archived` への遷移結果を返す純粋関数
- `ps --status <status>` — 任意 status でフィルタ
- `ps` 表示時に `awaiting-merge` ジョブの PR マージ状態を `gh pr view` で確認し hint 表示

**Non-Goals:**

- reconcile 結果の自動永続化（表示のみ。state 変更は `finish` の責務）
- `doctor` への reconciliation 統合
- cron / バックグラウンド reconciliation

## Decisions

**D1: reconcile は純粋関数、I/O なし**

- **Decision**: `reconcileStaleRunning` / `reconcilePrState` は `lifecycle.ts` の `transitionJob` を呼ぶ純粋関数。`TransitionResult | null` を返す
- **Rationale**: テスト容易性。`ps` は表示判定に使い、永続化は呼び出し元（将来の `doctor` や `finish`）の責務

**D2: `reconcile.ts` の配置は `src/state/`**

- **Decision**: `src/state/reconcile.ts` に配置する
- **Rationale**: `lifecycle.ts` と同レイヤー。依存方向: `reconcile → lifecycle → schema`。`core/resume/safety.ts` の `isStaleRunning` を import する（`core → state` 方向ではなく `state → core` にならないよう注意: `isStaleRunning` は pure なので `state/` 側から呼んでも問題ない）
- **Update**: 依存方向を再確認 — `src/state/reconcile.ts` が `src/core/resume/safety.ts` を import すると `state → core` 方向になり module-boundary 違反の可能性がある。代替案: `isStaleRunning` のロジックを inline するか、`safety.ts` を `src/state/` に移動する。ここでは **inline** を選択する（PID チェック + 15min threshold の 5 行）

**D3: `--status` は enum 制約付き string flag**

- **Decision**: `FlagDef` の `values` で全 `JobStatus` 値を列挙する
- **Rationale**: typo を flag-parser レベルで弾ける。unknown status でのフィルタは意味がない

**D4: PR 状態確認は `gh pr view --json state` を subprocess で実行**

- **Decision**: `awaiting-merge` のジョブに対してのみ `gh pr view <number> --repo <owner/repo> --json state` を実行
- **Rationale**: rate limit リスクは無視可能（`awaiting-merge` は通常 0-2 個）。`gh` CLI がなければ静かにスキップ

**D5: PR hint は表示のみ、state 変更しない**

- **Decision**: `(PR merged, run finish)` を STATUS 列に append する
- **Rationale**: スコープ外の自動遷移を避ける。ユーザーに行動を促す

**D6: `--status` と `--active` / `--all` の優先度**

- **Decision**: `--status` 指定時は `--active` / `--all` を無視する。`--status` が最優先
- **Rationale**: 明示的なフィルタが暗黙のプリセットに優先する原則

## Risks / Trade-offs

- **`state → core` import の回避**: D2 の通り `isStaleRunning` を inline する。将来 safety.ts の閾値が変わったら reconcile.ts にも反映が必要だが、stale detection の定義が reconcile と resume で異なる可能性も考慮すると、独立性のほうが価値がある
- **`gh` CLI 依存**: `gh` がインストールされていない環境では PR hint が出ない。doctor で `gh` の有無を検出しているため、ユーザーは認知済み
