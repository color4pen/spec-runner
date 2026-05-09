# Spec Review Result — reconcile-and-ps-filter

- **iteration**: 1
- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-09

## Summary

仕様は request の全要件を網羅し、既存コードベースの型・関数・モジュール構造と整合している。CRITICAL/HIGH の指摘なし。4 件の LOW 所見あり、いずれも実装を阻害しない。

## Completeness

| Requirement | Covered by | Status |
|---|---|---|
| Req 1: `src/state/reconcile.ts` 新設 | Phase 1 (tasks 1.1-1.4) | OK |
| Req 2: `reconcileStaleRunning` | Task 1.2-1.3 | OK |
| Req 3: `reconcilePrState` | Task 1.4 | OK |
| Req 4: `--all` flag | 既存。proposal Impact で確認済み | OK |
| Req 5: `--status <status>` flag | Phase 2 (tasks 2.1-2.3) | OK |
| Req 6: PR merged hint 表示 | Phase 3 (tasks 3.1-3.4) | OK |
| AC: `gh` CLI 非存在でエラーにならない | Task 3.1 catch clause | OK |
| AC: typecheck + test green | Phase 5 (tasks 5.1-5.2) | OK |

## Consistency

- `TransitionResult`, `TransitionContext`, `JobState`, `JobStatus`, `PullRequestInfo`, `RepositoryInfo` — 全型が `schema.ts` / `lifecycle.ts` と一致
- `transitionJob` 呼び出しの引数形式 `(state, targetStatus, { trigger, reason })` が `lifecycle.ts` の signature と一致
- `FlagDef` の `values` プロパティが `flag-parser.ts` に存在し、enum 制約が機能する
- `listJobStates`, `ACTIVE_STATUSES`, `getJobSlug` の import パスが正しい
- 既存 `runPs` のフィルタ優先順序 (active → all → default) に `status` を最優先で挿入する設計が明確

## Feasibility

- 全タスクが既存の infrastructure（`transitionJob`, `FlagDef.values`, `Bun.spawn`）で実装可能
- `state → core` 依存回避のため `isStaleRunning` を inline する判断（D2 Update）は妥当
- テスト計画が関数の入出力境界を十分にカバーしている

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | design.md:24 | D1 で「純粋関数、I/O なし」と記述するが、`isProcessAlive` は `process.kill(pid, 0)` システムコールを実行する。意図（filesystem 書き込みなし）は正しいが「純粋関数」は不正確 | 「副作用のない関数（state 書き込みなし）」等に表現を修正する。実装に影響なし |
| 2 | LOW | consistency | tasks.md:33 | `reconcile.ts` の stale threshold は 15 分（`safety.ts` 準拠）だが、既存 `ps.ts:33` の visual stale marker は 1 時間。目的が異なるため divergence は妥当だが、実装者が混乱する可能性がある | tasks.md Phase 1 に「注: ps.ts の STALE_THRESHOLD_MS (1h) とは異なる。reconcile は state 遷移判定用で safety.ts と同一閾値を使う」と注記を追加する |
| 3 | LOW | maintainability | tasks.md:173 | STATUS 列の padEnd を 12→40 に拡張すると、全行の幅が約 160 文字になり標準ターミナル (120 列) を超える | 実装時に実際の表示を確認し、padEnd(30) 程度への調整や hint の短縮 (`(merged)` 等) を検討する |
| 4 | LOW | performance | tasks.md:120-133 | `checkPrMerged` に subprocess timeout がない。`gh` がハングすると `ps` が無期限にブロックする。awaiting-merge が 0-2 個のため実リスクは極めて低い | `setTimeout` または `AbortSignal.timeout(5000)` の付与を検討する |

## Scores

| Category | Score |
|---|---|
| completeness | 9 |
| consistency | 8 |
| feasibility | 9 |

## Verdict Rationale

CRITICAL: 0, HIGH: 0。全要件が tasks.md のタスクにトレーサブル。既存コードベースとの型・API 整合性が確認済み。LOW 4 件は実装時に対応可能な範囲であり、仕様承認を阻害しない。
