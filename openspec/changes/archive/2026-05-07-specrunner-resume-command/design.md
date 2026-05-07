## Context

pipeline が escalation・loop exhaustion・SIGINT で停止すると `awaiting-resume` status + `ResumePoint` が state file に記録される（PR #107）。`Pipeline.run(startStep, jobState, deps)` は任意の step から実行可能な signature を既に持つ。worktree は `state.worktreePath` に記録され、`awaiting-resume` 時は削除されない（PR #106）。

既存の CLI パターン（`run`, `finish`, `rm`）は `src/cli/<command>.ts` に `runXxxCore()` を置き、`bin/specrunner.ts` から呼ぶ構造。slug → jobState の解決は `resolveBySlug()`（`src/core/finish/resolve-target.ts`）が実装済み。

## Goals / Non-Goals

**Goals:**

- `awaiting-resume` の job を途中の step から再開する CLI コマンド
- `--from` で再開起点を override できる
- 連続 escalation の検出と拒否（無限ループ防止）
- worktree の再利用（残存時）と新規作成（削除済み時）

**Non-Goals:**

- session の再利用（fresh session を使う。session resume は将来の最適化）
- `running` status の job の中断と再開（別 issue）
- pipeline の transition table や step 実装の変更

## Decisions

### D1. slug → jobState 解決

**Decision**: `listJobStates()` + `getJobSlug()` でスラグに一致する `JobState` を直接返す専用関数（`resolveJobStateBySlug()`）を `src/core/resume/resolve-job.ts` に作成する。`src/core/finish/resolve-target.ts` の `resolveBySlug()` は resume では使用しない。

**Rationale**: `resolveBySlug()` は内部で `buildResolvedTarget()` を呼び出し、`pullRequest`（number, url）と `branch` が存在しない場合に `{ok: false, exitCode: 2}` を返す。`awaiting-resume` の job は pr-create 前に停止していることが大半であり PR 情報がなく、`resolveBySlug()` を使うと slug 解決が常に失敗する。resume に必要なのは `JobState` そのものであり、`ResolvedTarget`（PR 情報付き）は不要。

**Alternatives considered**:
- **(A) resolveBySlug の PR 必須チェックを optional に緩和する**: finish の既存契約を変更することになり影響が広い。別途リファクタリング issue として扱う。
- **(B) resolveBySlug の slug matching 部分だけを共有ユーティリティに切り出す**: 本 request のスコープ外。将来の refactor 対象として有効。

### D2. `--from` の step 解決ロジック

**Decision**: `--from` は abstract role（`critic` / `fixer` / `creator`）を受け取り、`resumePoint.step` の phase（spec 系 / code 系）に応じて具体的な step に変換する。`--from` 省略時は `critic` をデフォルト値として使用する。

**Rationale**: ユーザーは pipeline の内部 step 名（`spec-review`, `code-fixer`）を知らなくてもよい。phase を推論することで UX を簡潔にする。

**Mapping**:

| `--from` | spec phase (`resumePoint.step` ∈ {propose, spec-review, spec-fixer}) | code phase (`resumePoint.step` ∈ {implementer, verification, build-fixer, code-review, code-fixer, pr-create}) |
|----------|------|------|
| `critic` (default) | `spec-review` | `code-review` |
| `fixer` | `spec-fixer` | `code-fixer` |
| `creator` | `propose` | `implementer` |

**Alternatives considered**:
- **(A) 生の step 名を直接指定**: `--from spec-fixer` は正確だが、ユーザーに pipeline 内部知識を要求する。`--step` として将来の advanced option に残す余地はある。

### D3. iteration counter リセット

**Decision**: リセット不要。`Pipeline.runInternal()` の `loopIters` は関数ローカル変数（`new Map()`）なので、新しい `pipeline.run()` 呼び出しで自動的に 0 から始まる。

**Rationale**: Pipeline の既存設計が意図せずリセットを実現している。追加のコードは不要。

### D4. 連続 escalation 検出

**Decision**: `state.steps[resumeStep]` の末尾 N 件（N=3）を走査し、すべての verdict が `escalation` or `error` なら resume を拒否する。`--force` で override 可能。

**Rationale**: 同じ step が繰り返し失敗するなら人間の介入が必要。3 回は十分なリトライ回数。

### D5. worktree 管理

**Decision**: `state.worktreePath` が存在し、ディスク上にも残っていればそのまま再利用。なければ `WorktreeManager.create()` で新規作成し、`state.worktreePath` を更新する。

**Rationale**: `awaiting-resume` 時は worktree が保持される設計（`cleanupWorktreeOnFailure` が skip する）。crash / 手動削除のケースのみ新規作成が必要。

### D6. stale state 検出

**Decision**: `state.updatedAt` が 24 時間以上前なら warning を stderr に出力。pipeline 実行は block しない。

**Rationale**: branch が drift している可能性を示唆するが、判断はユーザーに委ねる。24 時間は通常の作業サイクルに対して十分な閾値。

### D7. status gate

**Decision**: `state.status !== "awaiting-resume"` の場合は拒否。`--force` で `running` 以外のすべての status を override 可能。`running` は常に拒否（二重実行防止）。

**Rationale**: `running` の job を resume すると二重実行になり state が破損する。それ以外（`failed`, `terminated`）は `--force` でリカバリを許容する。

## Risks / Trade-offs

- **session 非再利用**: 再開時に新しい session が作られるため、前回の session context は失われる。step の出力ファイル（spec-review-result.md 等）が worktree に残っているので、agent は読むことができる。将来の session resume 対応で解消可能。
- **worktree 不整合**: crash 後に worktree が中途半端な状態で残る可能性。git status の確認は resume の責務外（ユーザーが確認すべき）。
- **`--from creator` の破壊性**: propose / implementer から再実行すると、既存の成果物が上書きされる可能性がある。既知のリスクとして受容する。
