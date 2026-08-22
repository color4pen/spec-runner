# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーション検証

**`src/core/runtime/local.ts:752` `commitFinalState`**

- 確認: 行 752 は `async commitFinalState(deps: PipelineDeps, state: JobState): Promise<void>` の宣言。正確。
- `LocalRuntime.commitFinalState` は `commitFinalState`（`src/core/step/commit-push.ts` のスタンドアロン関数）を呼ぶラッパー。
- `commit-push.ts:commitFinalState` は `pipelineManagedPaths(slug)` を使い管理パス（state.json / events.jsonl / usage.json / bite-evidence-result.md / pr-create-result.md）のみを pathspec commit → push（2 試行）→ 失敗は `stderrWrite` のみ、throw しない（`commit-push.ts:877-882`）。
- request.md が「1 retry」と書いているのは 2 試行（1 回目 + 1 retry）を指しており正確。

**`src/core/attach/checkpoint-policy.ts` `attachQuiescentPolicy`**

- 確認: `attachQuiescentPolicy`（行 155）は status が `awaiting-resume` → `attachResumePolicy`、`awaiting-archive` → `attachArchivePolicy`、それ以外（`running` 含む）→ `not-quiescent` エラー、という設計で request.md の記述と一致する。

**「checkpoint commit の親はローカル branch tip」**

- 確認: `commitFinalState` は rebase せずローカル HEAD 上にそのまま commit → push する。未 push 作業 commit が tip にあれば push 対象に含まれる。

**管理パスの完全性**

- `pipelineManagedPaths(slug)` は `state.json / events.jsonl / usage.json / bite-evidence-result.md / pr-create-result.md` の 5 パスを返す（`round-git-scope.ts:109`）。request.md が列挙するのは 4 パスで `pr-create-result.md` の記載が省略されているが、内容の正確性は損なわれていない。

### Step 2: 問題再現ロジックの確認

- 実測 (#1059) に対応する再現経路: `commitAndPush`（ステップ末尾） → push 拒否 → escalate/halt → `commitFinalState` 呼び出し（`pipeline.ts:615`） → 管理パスをローカル HEAD 上に commit → 同一理由（e.g. `.github/workflows/` push 拒否）で push 再拒否 → origin には `running` 状態の checkpoint のまま → `attachQuiescentPolicy` が `not-quiescent` で拒否 → ephemeral runner で job 回復不能。
- このロジックはコードの動作から正しく導出されている。

### Step 3: 実装範囲・受け入れ条件の妥当性

- 実装 3 項目は明確に境界が引かれており、設計ステップで具体化可能な内容。
- 受け入れ条件 5 項目（テスト固定 3 件 + 既存テスト green + typecheck && test green）は具体的かつ検証可能。
- 非目標の明示（push 拒否原因対処・attach override・未 push commit 救出・archive 経路）は実装の拡大防止として適切。

### Step 4: journal event インフラの確認

- `src/store/event-journal.ts` に各種 record 型（`StepAttemptRecord`, `TransitionRecord`, `InterruptionRecord`, `OperatorEventRecord` 等）が定義済み。
- 「積み直しの発生を journal event として記録する」（実装範囲 2）は既存 append-only 設計に従い新規 record 型追加で実現可能。

## 検証できなかった項目

None — 主要コードアサーションはすべて直接確認済み。

## Findings 詳細

typed findings 参照。軽微な観察事項のみ（blocking 指摘なし）。

- `pipelineManagedPaths` が返す管理パスは 5 個だが request.md の列挙は 4 個（`pr-create-result.md` 省略）。設計・実装に影響する誤りではなく低優先度の観察事項。
