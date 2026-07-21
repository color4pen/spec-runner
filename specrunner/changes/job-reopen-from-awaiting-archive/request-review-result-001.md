# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証

1. **`src/state/lifecycle.ts:39`** — `["awaiting-archive", new Set(["archived", "canceled"])]`
   - 確認済み。`VALID_TRANSITIONS` の `awaiting-archive` エントリは line 39 に存在し、`archived` と `canceled` のみを許可している。`running` への遷移は存在しない。

2. **`conformanceApprovedForVerifiedRevision` in `src/core/pipeline/reverification.ts`**
   - 確認済み。line 108 に関数定義あり。conformance の `commitOid` と verification の `commitOid` を照合し、不一致・欠落は fail-closed（`false`）で返す設計。reopen 後に新 commit が積まれれば commitOid 不一致で stale 承認は自動的に routing で弾かれる。

3. **`selectPendingMembers` / `approvedAtCommit` in `src/core/pipeline/reviewer-status.ts`**
   - 確認済み。line 95 に関数定義あり。`baselineCommit` と `approvedAtCommit` の照合により、commitOid が一致しない reviewer は pending 扱い（fail-closed）。

4. **StepRun の `commitOid` フィールド**
   - 確認済み。`src/state/schema/types.ts:209` に `commitOid?: string` として定義されている。

5. **`job resume <slug> [--from <step>] [--prompt <text>]` in `src/core/command/`**
   - 確認済み。`src/cli/command-registry.ts` の `resume` サブコマンド（line 550〜）に `from`・`prompt`・`prompt-file` フラグと positional `slug` が定義されている。`src/core/command/resume.ts` に `ResumeCommand` 実装あり。

6. **write-scope enforcement in `src/core/step/commit-push.ts`**
   - 確認済み。guarded mode（line 282〜）で `git status --porcelain` → `findWriteScopeViolations` → 違反検出時は restore + `writeScopeViolationError` throw というフローが実装されている。

7. **iteration-based artifact ファイル（`*-result-NNN.md` / `review-feedback-NNN.md`）**
   - 確認済み。`src/util/paths.ts` に `requestReviewResultPath`（slug, iteration）・`specReviewResultPath`・`reviewFeedbackPath` が定義されており、イテレーション番号を suffix に持つファイル名を生成する。step 実行時は `(state.steps?.[stepName]?.length ?? 0) + 1` でイテレーション番号を決定する（`src/templates/step-output-templates.ts:385`）。

8. **events.jsonl append-only**
   - 確認済み。`src/store/event-journal.ts` に実装されており、`appendEventRecord` 関数が単体レコードを追記する設計。errors.ts には「append-only source of truth」の記述あり。

### FSM 設計の分析

- `canTransition('awaiting-archive', 'running')` は現在 `false` を返す。
- `resume.ts` は line 155 で `canTransition(state.status, "running")` が `false` なら拒否する。
- `reopen` コマンドで `awaiting-archive → running` を許可するには、FSM を迂回するか、FSM に追加した上で resume 側に明示ガードを追加するかの実装判断が必要。要件 3 で "reopen 操作経由でのみ" と明示されており、設計判断はアーキテクト評価に記録済み。

### PR merge 状態チェックの実現可能性

- `src/kernel/github-client.ts` の `getPullRequest()` port は `state: "OPEN" | "MERGED" | "CLOSED"` を返す。
- 要件 2（merged PR を持つ job への reopen 拒否）は既存の GitHub adapter で実現可能。

### `job cancel` の remote branch 削除確認

- `src/core/cancel/runner.ts:201` — `spawn("git", ["push", "origin", "--delete", branch])` が実装されており、cancel は remote branch を削除する。背景記述「job cancel は remote branch を削除するため PR が破壊され、fix-forward に使えない」は正確。

### 要件の整合性確認

- 受け入れ基準はすべてテスト可能な条件として表現されている。
- 証跡保存（要件 4）と承認の不変性（スコープ外 "承認 record の削除・書き換えはしない"）は一貫している。
- minimumAssurance 非依存（要件 9）：archive floor gate は `src/core/archive/achieved-assurance.ts` にあり、reopen 経路とは独立しているため影響なし。

## 検証できなかった項目

None（すべての主要アサーションをコード読取で確認した）。

## Findings 詳細

指摘なし。
