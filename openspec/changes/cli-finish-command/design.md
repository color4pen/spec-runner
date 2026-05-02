## Context

SpecRunner は Anthropic Managed Agents 上でエージェントを実行し、self-host pipeline で PR を生成するところまで dogfooding-005 で達成した。しかし生成された PR を閉じる手段が CLI 側に存在せず、PR が積み上がる状況が発生している（PR #48 readme-status-section が OPEN のまま）。

参照可能な前例として、openspec-workflow に `request-merge` skill があり、PR merge → openspec archive → awaiting-merge → merged 遷移 → archive PR 作成 + auto-merge → worktree / branch 削除を多段で実行する。ただしこの skill は次の前提を持つ:

1. ローカル Claude Code セッションが対話的に実行される
2. ローカル worktree が存在する（agent が main worktree から派生した子 worktree で作業した）
3. conflict-resolver / openspec-archive-change など LLM agent を auto-fire できる

SpecRunner では agent がリモート Managed Agents 環境で動くため worktree は存在せず、feature branch も remote にしか push されない。したがって `request-merge` の前提は成立しない。さらに、後片付けは job state ファイルから機械的に再現できるべきで、LLM 駆動は責務超過かつ非決定的になる。

本 change はこの gap を埋める CLI 単体の deterministic finish を新設する。

## Goals / Non-Goals

**Goals:**

- `specrunner finish <jobId>` 単体で PR merge 後の後片付けを LLM 不要で deterministic に完了させる
- 6 種の正規化 PR 状態（OPEN_MERGEABLE / OPEN_BEHIND / OPEN_CONFLICTS / OPEN_CHECKS_FAILING / MERGED / CLOSED）に対する明確な分岐ルールを定義する
- 冪等性: 同一 jobId への 2 回目の finish は no-op になる
- 部分実行状態（feature merged 済みだが archive 未完了等）からの resume を可能にする
- archive 反映を archive PR 経由で行い、local main への直 push を禁止する（branch protection 整合）
- escalation 時の stdout フォーマットを統一し、人間が次に何をすべきかが必ず読める

**Non-Goals:**

- LLM 駆動の auto-recovery（rebase / conflict 解消の自動化等）— 全て escalation で人間判断に委ねる
- ローカル worktree / feature branch の削除 — Managed Agents 環境ではどちらも存在しない
- session artifacts（observations.jsonl / MEMORY.md）の統合 — worktree が無いので不要
- spec-runner 以外の plugin author repo 向け pending-changes 集約 — consumer repo のみを対象
- self-bootstrap での finish 自身の merge — chicken-and-egg のため最初は手動 merge し、その後 dogfooding-006 で PR #48 を最初の finish ターゲットにする

## Decisions

### 1. archive 反映方式: archive PR 経由（main 直 push 禁止）

**選択**: `chore/archive-<slug>` ブランチで commit → push → `gh pr create` → `gh pr merge --auto` で main に反映する。

**代替案**:
- (a) main 直 commit / 直 push → branch protection rule に抵触する可能性が高い。audit trail も残らない
- (b) archive PR 経由 → branch protection と整合し、PR としての履歴が残る

**根拠**: SpecRunner 自身の repo は今後 branch protection を導入していく方向性であり、CLI が直 push を前提にすると将来破綻する。`gh pr merge --auto` の利用不可時は即時 merge fallback で動作を保つ。

### 2. GitHubClient port 拡張 vs gh CLI 継続

**選択**: gh CLI を subprocess で呼び出し続ける（pr-create runner と同パターン）。

**代替案**:
- (a) `GitHubClient` port に `mergePullRequest` / `viewPullRequest` を追加し、Octokit ベースで実装
- (b) gh CLI 継続

**根拠**: pr-create runner の前例があり、auth は既存 OAuth トークン経由で透過的に動く。merge / view 程度のために port 拡張するのは over-engineering。pattern-reviewer の判断次第で将来 port 化を ADR で評価する余地は残す。

### 3. escalation philosophy: LLM auto-recovery を入れない

**選択**: rebase / conflict 解消 / checks failing 修正は人間に委ねる。CLI は検知と推奨アクション提示のみ行う。

**代替案**:
- (a) conflict-resolver / build-fixer skill を LLM 経由で auto-fire（openspec-workflow と同パターン）
- (b) 検知 + 推奨アクション提示のみで停止

**根拠**: finish の本質は「PR merge 後の deterministic な後片付け」であり、LLM を呼び出した瞬間に non-deterministic になる。再実行容易性も損なわれる。escalation は失敗ではなく「人間判断に委ねる正常終了形態」と位置づけ、stdout フォーマットを統一して再実行コマンドを必ず提示する。

### 4. requests dir 遷移先: `merged/` を採用

**選択**: `openspec-workflow/requests/merged/<slug>/`。

**代替案**:
- (a) `openspec-workflow/requests/done/<slug>/` （古い conventions）
- (b) `merged/` （最近の openspec-workflow に整合）

**根拠**: 最近の openspec-workflow は `awaiting-merge` → `merged` の遷移を標準としている。`done/` は legacy 名であり混乱を招く。

### 5. JobStatus に `archived` を新設するか `success` で十分か

**選択**: `archived` を新設する。

**代替案**:
- (a) `success` のまま据え置く（PR merge 完了時点で `success`、archive 完了でも変わらない）
- (b) `archived` を新設し、`success` → `archived` の遷移を明示する

**根拠**: archive まで完了した job と、PR merged だが archive 未完了の job は意味が違う（後者は resume 可能な部分完了状態）。状態を区別しないと `specrunner ps` で finish 対象を見つけにくくなる。後方互換性は既存ファイルがそのまま読めることで担保する。

### 6. 入力解決の優先順位

**選択**: jobId → --slug → awaiting-merge dir 自動検出 の 3 段階。

**根拠**: jobId は最も曖昧性がない。--slug は state file が壊れているケースの fallback。awaiting-merge 自動検出は「単一 PR が滞留している小規模 repo」での UX 改善（dogfooding-006 のような最初の finish 実行で typing なしで動く）。複数 slug 検出時は安全側に倒して停止する。

### 7. 状態正規化テーブルを 6 種に固定

**選択**: gh の `mergeStateStatus` は CLEAN / DIRTY / BEHIND / BLOCKED / HAS_HOOKS / UNSTABLE / UNKNOWN 等多数あるが、CLI からは 6 種の正規化状態（OPEN_MERGEABLE / OPEN_BEHIND / OPEN_CONFLICTS / OPEN_CHECKS_FAILING / MERGED / CLOSED）にマップする。

**根拠**: gh の状態モデルは GitHub の内部実装に追従して変動する。CLI 側の分岐ロジックを 6 種に固定すれば、新しい mergeStateStatus 値が増えても safe default（OPEN_CHECKS_FAILING 扱い）に倒せる。test もこの 6 状態を網羅するだけで済む。

### 8. subprocess wrapper の再利用

**選択**: `node:child_process.spawn` を pr-create runner と同じパターンで使う。stdout / stderr の capture と exit code チェックを共通化する。

**根拠**: pr-create runner で実績がある。ストリーミング処理は不要（finish の subprocess は秒単位で完了する）。

## Risks / Trade-offs

- **[Risk] gh CLI の出力 schema 変更**: `gh pr view --json` のフィールド構造が将来変わると正規化ロジックが壊れる → Mitigation: schema 検証用の minimal type 定義を持ち、想定外フィールドは `OPEN_CHECKS_FAILING` 相当の safe default にフォールバックする。test で 6 状態すべてを fixture から再現する。
- **[Risk] auto-merge 利用不可な repo での fallback**: `gh pr merge --auto` が即失敗した場合の即時 merge fallback は branch protection が厳しい repo では動かない可能性がある → Mitigation: fallback も失敗した場合は escalation で停止し、人間に手動 merge を促す。
- **[Risk] git mv の atomicity**: `awaiting-merge/<slug>` の mv 中に SIGINT で中断されると中間状態が残る可能性 → Mitigation: `git mv` は git index 経由で atomic に近い。中断時は次回 finish 実行時の冪等チェック（`merged/<slug>/` 存在確認）で resume する。
- **[Risk] dogfooding-006 で finish 自身を finish できない**: chicken-and-egg → Mitigation: 最初の finish merge は手動。merge 後すぐに PR #48 を最初の finish ターゲットとして dogfooding-006 を実行する。
- **[Trade-off] escalation 時に LLM auto-recovery を持たない**: openspec-workflow と比較して人間操作が増えるが、deterministic 保証と引き換え。SpecRunner の責務境界として明示的に切り分ける。
- **[Trade-off] GitHubClient port を拡張しない**: pr-create runner と同様に gh CLI 依存が継続するが、Managed Agents 環境では gh CLI が前提なので大きな問題にはならない。port 化が必要になった時点で ADR で評価する。

## Migration Plan

1. **Phase 1（本 change のマージ）**: `specrunner finish` を CLI に追加し、手動 merge する（self-bootstrap 不可のため）
2. **Phase 2（dogfooding-006）**: PR #48 readme-status-section を最初の finish ターゲットとして実行し、deterministic 動作を E2E 検証する
3. **Phase 3（既存 success state の取り扱い）**: 既存の `status="success"` の job state は現状のまま。新規 finish 完了時のみ `archived` に書き込む。バックフィル script は提供しない（必要になった時点で別 change として検討）
4. **rollback**: 本 change は新規追加のみで既存挙動を破壊しないため、rollback は CLI を 1 つ前のバージョンに戻すだけで完了する。state schema 拡張も後方互換なので state file の手当ては不要

## Decisions (追加)

### 9. `JobStatus` 型の確定 location

**決定**: `JobStatus` は `src/state/schema.ts:5` の union として一元定義済み。`archived` 追加は本ファイルの編集 + 全 consumer の exhaustive-switch 確認（`src/cli/ps.ts` 等）で完了する。`src/lib/jobs/state.ts` というパスは存在しない。

## Open Questions

- **archive PR の auto-merge 待機**: `gh pr merge --auto` queue 後に CLI を即時 exit する設計だが、CI が遅延すると user 視点では「いつ archive が反映されたか」が不明になる。`specrunner ps` 側で archive PR の状態を表示する拡張は別 change として検討する
- **`--slug` での複数 state 該当時の挙動**: 最新 `updatedAt` を採用する仕様だが、より厳密にしたいケース（例: explicit error で停止）は需要が出てから別 change として議論する
