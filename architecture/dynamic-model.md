# Dynamic Model — 動的構造（実行時の関係・束縛・状態遷移）

> `domain-model.md`（静的なデータの形）の対になる **実行時の構造**。状態機械・実行時束縛・遷移の「形」を定義する。
> **structure-only**: 状態・遷移・束縛の **形と寿命** を書く。それを駆動する **アルゴリズム/手順は behavior**（spec / `specrunner/adr/`）であり、ここからは参照に留める。
> **SoT 境界**: 正確な遷移ロジックはコードが正典（`→ src/...`）。本書は陳腐化しない粒度（状態集合・許可遷移・束縛の寿命・不変条件）まで。

---

## State machines

### JobStatus 状態機械（lifecycle）— JobState の遷移不変条件
- **状態集合（7値）**: `running | awaiting-resume | awaiting-archive | failed | terminated | archived | canceled`。
- **区分**: active = {`running`, `awaiting-resume`}（実行中・再開待ち）／ terminal = {`archived`, `canceled`}（出口なし。以後どこへも遷移しない）。
- **許可遷移（VALID_TRANSITIONS）**: 下表のセルのみ許可。表に無い遷移は throw（同一 status への遷移は常に noop=許可）。

  | from \ to | running | awaiting-resume | awaiting-archive | failed | terminated | archived | canceled |
  |---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
  | **running** | — | ✓ | ✓ | ✓ | ✓ |  | ✓ |
  | **awaiting-resume** | ✓ | — |  |  |  |  | ✓ |
  | **awaiting-archive** |  |  | — |  |  | ✓ | ✓ |
  | **failed** | ✓ | ✓ |  | — |  |  | ✓ |
  | **terminated** | ✓ |  |  |  | — |  | ✓ |
  | **archived** |  |  |  |  |  | — |  |
  | **canceled** |  |  |  |  |  |  | — |

- **不変条件**:
  - 遷移の**計算**は `transitionJob`（pure・I/O なし）が VALID_TRANSITIONS を引いて行う。不正遷移は throw・同 status は noop。
  - Aggregate への**永続化**は `JobStateStore` 経由のみ（計算と永続化は別レイヤ）。
  - `awaiting-archive → archived` が正常完走の最終遷移（archive が client-closed に確定）。**merge は GitHub 上の外部イベントであり job status の遷移ではない**（CLI は merge を status 遷移として持たない）。`running → awaiting-resume` は異常終了 guard（exit-guard）が倒す checkpoint。
- **単一 mutator 不変**: `JobState.status` の変更は `transitionJob` 経由のみ。`patch + persist` での status 直書きは禁止。この不変は `model.md` B-9 ＝ `tests/unit/architecture/core-invariants.test.ts` が機械強制する。
- → `src/state/lifecycle.ts`（VALID_TRANSITIONS / TERMINAL_STATUSES / ACTIVE_STATUSES / transitionJob が正典）／ `src/state/schema.ts`（`JobStatus`。legacy の `success` / `awaiting-merge` は load 時に `awaiting-archive` へ remap）

### Pipeline 状態機械（steps × transitions）
- **状態 ＝ step**、**遷移 ＝ transition 表**（`{from, on: <outcome 値>, to}`）＋ loop（`to` が前 step を指す ＋ 上限）。どの遷移にも一致しない outcome は **fail-closed（escalate）**。
- 状態集合（step）・許可遷移・収束意味論は記述子（`PipelineDescriptor`）が持ち、`pipelineId` で選ぶ。
- → `src/core/pipeline/`（transition 表・収束意味論が正典）。routing の解決手順は behavior（spec）。

---

## Runtime bindings

### liveness — 論理ジョブ ↔ 物理実行コンテキストの束縛
- **束縛**: 論理ジョブ（`JobState` Aggregate）↔ 物理実行コンテキスト（process `pid` / worktree `worktreePath` / agent `session`）。
- **寿命**: run 開始で establish、resume で再利用 or 再 establish。**branch-borne state（truth）には載せず**、machine-local sidecar（`.specrunner/local/<slug>/`、gitignore・regenerable）に metadata として持つ。
- **再導出**: `worktreePath` は規約 `.git/specrunner-worktrees/<slug>-<jobId8>` から、`pid` / `session` は run ごと新規。
- **binder**: runtime ＋ `WorktreeManager`（worktree）。
- **不変条件**: liveness は Aggregate に属さない。失っても（別マシン・CI・掃除）git から論理ジョブを復元でき、束縛は再 establish される。
- → 確立・撤去・再導出の手順は behavior（spec / in-loop change）。

---

## 使い方
- **状態遷移を読む** → JobStatus FSM（status の遷移）／ Pipeline FSM（step の遷移）。
- **論理↔物理の対応を読む** → Runtime bindings（liveness）。
- 静的な型/データは `domain-model.md`、実行時にどのコンポーネントが絡むか（協調）は `components.md`。
