# Spec Review Result: remove-session-timeout — Iteration 2

## Verdict

- **verdict**: approved
- **score**: 8.00 / 10.0 (pass threshold: 7.0)
- **iteration**: 2 / 2
- **trend**: improving (+1.18)
- **agents**: architect, spec-reviewer, pattern-reviewer (security-reviewer: not enabled)
- **retries**: 1/2
- **blocking_findings**: CRITICAL: 0, HIGH: 0

> Total ≥ 7.0、CRITICAL: 0、HIGH: 0 のため `approved`。

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 8 | 0.30 | 2.40 |
| consistency | 8 | 0.25 | 2.00 |
| feasibility | 8 | 0.20 | 1.60 |
| security | — (skipped: security-reviewer not enabled) | 0.15 | (excluded) |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** (weights renormalized after security skip: ÷0.85) | | | **8.00** |

> security-reviewer が enabled に含まれていないため security カテゴリを除外し残り weight (0.85) で正規化。Raw 加重合計 6.80 / 0.85 = 8.00。本 spec はネットワーク境界・新規認証経路を導入しないため security 欠落の実害は小さい。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | openspec/changes/remove-session-timeout/specs/message-streaming/spec.md | iteration 1 Finding #1 を「30 attempts Polling timeout Scenario を main spec に戻す」方針で対応した結果、当 delta は main spec の `### Requirement: Client Status Polling After Session Completion` をそのまま再掲する no-op MODIFIED となった。`openspec validate --strict` は pass するが、(a) delta 本文に変更差分が無いため archive 時に意味のある spec 履歴が残らない、(b) main spec の隣接 Requirement `Repository Status API` が delta の対象外であることが暗黙的になっている（明示的な「scope 外」記述が delta 内に無い）。spec-fix-report Note では「ファイル削除が不可能なため」とあるが、change folder 内の delta は通常のファイル削除（`rm openspec/changes/remove-session-timeout/specs/message-streaming/spec.md` + 親 dir も空なら削除）で取り除ける。 | (a) delta ファイルと親 `specs/message-streaming/` ディレクトリを削除し、proposal.md / design.md の「scope 外」記述で済ませる、または (b) delta を残す場合は冒頭に「<!-- このファイルは scope 外確認のための no-op delta — main spec と完全一致 -->」コメントと、`Repository Status API` Requirement が本 request の対象外である旨を明記する。`openspec validate --strict` は両ケースで pass する見込み。 |
| 2 | LOW | feasibility | openspec/changes/remove-session-timeout/proposal.md:33 | iteration 1 Finding #2 で path drift を修正したが、`src/core/session/client.ts 等（SessionClient.pollUntilComplete シグネチャ変更）` の path が残存している。実体は `src/adapter/anthropic/session-client.ts`（grep 確認済 — line 63 に `pollUntilComplete` 呼び出し、line 68 に `?? "SESSION_TIMEOUT"` フォールバックあり）。tasks.md §3.1 は「`SessionClient.pollUntilComplete` のシグネチャから timeoutMs を削除する」と書かれているが、編集対象ファイルが `session-client.ts` であることが明示されていない。 | proposal.md:33 の `src/core/session/client.ts 等` を `src/adapter/anthropic/session-client.ts` に修正する。tasks.md §3.1 末尾に「（実体: `src/adapter/anthropic/session-client.ts`、`?? "SESSION_TIMEOUT"` フォールバック line 68 周辺の削除を含む）」を追加する。実装フェーズで grep 実施すれば発見可能なため blocking ではないが、approved 後の post-fix で対応推奨。 |
| 3 | LOW | maintainability | openspec/changes/remove-session-timeout/tasks.md §4.4 | `pollIntervalMs` の扱い（schema 残置 vs 定数化）を「実装者が選択」と委ねている。design D3 と cli-config-store delta は「当面 tagged optional として schema に残置」が推奨方針として明記されているため、tasks 側でも推奨方針を default にして「他方を選ぶ場合は理由を記録する」形にすると判断ばらつきが減る。 | §4.4 を「(a) を default として採用し schema に残置する。(b) を選ぶ場合は ADR を切る」に書き換える、または design D3 を参照する明示リンクを追加する。blocking ではない。 |

### Pattern-Reviewer 観点（review-lessons.md 由来）

- review-lessons.md L63「設定可能なパラメータ（timeout 等）が spec の Scenario でも変数表記に統一され、固定値と config 上書き経路の不整合を生んでいないか」 — 本 request は timeout 自体を撤廃するため、当該パターンは原理的に解消される。Finding #3 の `pollIntervalMs` も同系統だが、本 request 内で「schema 残置 + 定数化は別 request」という明示判断が追加されたため再発リスクなし
- 再発検出: ゼロ
- iteration 1 で指摘した「絶対値リテラル（706 件）」も相対表現に置き換えられ、L63 系の固定値クセが新たに混入する箇所はない

### Architect 観点（design 妥当性 + Devil's Advocate）

- D1（完全削除）— 妥当性は iteration 1 と同じ。代替案却下理由は健全
- D2（lazy migration）— 妥当。`job-state-store` delta で `state.error.code` の正規定義テーブルを Requirement 本体に移したのは single source of truth 強化として優秀（iteration 1 Finding #6 への対応）
- D3（silent ignore）— 妥当。iteration 1 Finding #5 で曖昧だった `pollIntervalMs` の扱いが「schema 残置（tagged optional）」と明示され境界が確定した
- D4（REMOVED + MODIFIED 使い分け）— `message-streaming` を scope 外と明記し 6 spec へ訂正済み。iteration 1 Finding #1 の HIGH 案件は scope creep の本質（fail-safe 削除）を回避できた
- 過剰設計の検出: なし
- Devil's Advocate: 「真に hang する session を完全無視する設計」は依然として fragile な側面を持つが、design Risks に「Out of scope but tracked #1/#2」として cancel smoke test と elapsed time UX 可視化が明記されたため、追跡漏れリスクは低減した

## Iteration Comparison

### Improvements

- **Finding #1 (HIGH → resolved)**: `message-streaming` delta が wall-clock timeout 参照と Polling timeout Scenario 削除を含む scope creep だったが、Polling timeout Scenario を main spec と同等に復元し、proposal/design の「7 spec」を「6 spec」に訂正。scope creep の本質は除去された（残課題は no-op delta としての見栄え — Finding #1 LOW に降格）
- **Finding #2 (MEDIUM → mostly resolved)**: proposal/design/tasks の path 表記が実体に整合（`src/core/step/executor.ts`、`src/state/schema.ts`、`src/config/schema.ts`）。`getTimeoutMs(stepName, cfg)` ヘルパー削除タスク（§4.3）と adapter 層 timeoutMs 削除タスク（§3.5/3.6）を追加。残課題は proposal.md:33 の `src/core/session/client.ts` のみ（Finding #2 LOW に降格）
- **Finding #3 (MEDIUM → resolved)**: design Risks §1 に「Out of scope but tracked #1/#2」として cancel smoke test と elapsed time 可視化 UX を明記
- **Finding #4 (LOW → resolved)**: 「706 件」固定値が「変更前ベースライン比で減少なし」相対表現に統一
- **Finding #5 (LOW → resolved)**: `pollIntervalMs` の扱いが cli-config-store delta REMOVED Reason と tasks §4.4 で明示（schema 残置を推奨）
- **Finding #6 (LOW → resolved)**: `state.error.code` 正規定義テーブルが `JobStateStore is the Sole Persistence Authority` Requirement 本体（Scenarios の上）に移り single source of truth 化

### Regressions

なし。

### Unchanged Issues

なし。iteration 1 の全 6 findings に対応済み（HIGH × 1、MEDIUM × 2、LOW × 3）。

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.82 | needs-fix | 初回。HIGH 1 件（message-streaming scope creep）+ MEDIUM 2 + LOW 3 |
| 2 | 8.00 | approved | 全 6 findings 対応済み。残 LOW 3 件は post-merge fixup で対応可 |

## Convergence

- **trend**: improving (+1.18)
- **recommendation**: proceed to next phase（test-cases 生成 → 実装）
- 残 LOW findings は blocking ではないため、approved として次フェーズへ進む

## Summary

iteration 1 で指摘した 6 findings（HIGH 1、MEDIUM 2、LOW 3）すべてに対応済み。scope creep の本質だった `message-streaming` delta の wall-clock timeout 参照と Polling timeout Scenario 削除は除去され、主たる修正対象は CLI step session の `pollUntilComplete` timeout 撤廃に集中している。path drift は実リポジトリ構造（`src/core/step/`、`src/state/schema.ts`、`src/config/schema.ts`、`src/adapter/anthropic/session-runner.ts`、`completion.ts`）に整合し、`getTimeoutMs(stepName, cfg)` ヘルパーと adapter 層 timeoutMs フォールバックの削除タスクも明示された。`pollIntervalMs` の扱い（schema 残置）と `state.error.code` の正規定義（`job-state-store` Requirement 本体に集約）も single source of truth が確立された。`openspec validate remove-session-timeout --type change --strict` は pass。残課題は (1) `message-streaming` no-op delta の整理、(2) proposal.md:33 の `src/core/session/client.ts` 残存 path、(3) `pollIntervalMs` decision の default 化 — いずれも LOW で blocking ではない。実装フェーズへ進める状態。
