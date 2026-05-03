# Spec Review Result: remove-session-timeout — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 7.05 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer, pattern-reviewer (security-reviewer: not enabled)
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 1

> 加重合計は 7.0 を超えるが、HIGH ≥ 1 のため verdict は自動的に `needs-fix`（review-standards.md 承認阻止条件）。

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 6 | 0.25 | 1.50 |
| feasibility | 7 | 0.20 | 1.40 |
| security | — (skipped: security-reviewer not enabled) | 0.15 | (excluded) |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** (weights renormalized after security skip: ÷0.85) | | | **7.05** |

> security-reviewer が enabled に含まれていないため、review-standards.md「Skip / Status 報告」に従い、security カテゴリを合計から除外し残り weight (0.85) で正規化。Raw 加重合計 5.80 / 0.85 = 6.82。なお security 寄与なしでも本 spec はネットワーク境界・新規認証経路を導入しないため、欠落による実害は小さい。再計算: (2.10 + 1.50 + 1.40 + 0.80) = 5.80 を 0.85 で割ると 6.82。… 7.0 を超えない。**訂正**: Total = 6.82 / 10.0、threshold 未達。verdict は HIGH 有無に関わらず `needs-fix`。

### 訂正後 Verdict

- **verdict**: needs-fix
- **score**: 6.82 / 10.0 (pass threshold: 7.0)
- 理由: HIGH ≥ 1 (Finding #1) **かつ** Total < 7.0

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/changes/remove-session-timeout/specs/message-streaming/spec.md (whole file) | `message-streaming` spec は Next.js Web UI のクライアント polling（EventSource、最大 30 attempts、ブラウザ `router.refresh()`）を扱う仕様であり、本 request の対象である CLI step session の `pollUntilComplete` wall-clock timeout とは別軸である。delta は UI 用の最大試行数 fail-safe (`Polling timeout` Scenario, "30 attempts → ユーザーにリフレッシュ提案") を撤廃する変更を含むが、これは `SESSION_TIMEOUT` error code とも `StepExecutor.getTimeoutMs` とも無関係であり、scope creep。request.md 要件 6 に「`message-streaming/spec.md`（Polling timeout Scenario）」と書かれていることが原因だが、要件作成時に web UI 仕様であることが見落とされた可能性が高い。撤廃すると UI が無限ポーリングになり別問題を生む。 | (a) `message-streaming/specs/spec.md` delta をこの change から削除する、または (b) 削除せず "Polling timeout" Scenario をそのまま残す（30 attempts fail-safe を維持）形に書き換える。同時に request.md 要件 6 の `message-streaming/spec.md` 行と proposal/design の対応記述を削除/訂正する。本 request の本質（CLI step session timeout 撤廃）にはこの spec の変更は不要。 |
| 2 | MEDIUM | feasibility | openspec/changes/remove-session-timeout/proposal.md:31-37, design.md (Migration Plan §1) | Impact / Migration Plan で参照する実装パスが現リポジトリ構造と乖離している: (a) `src/core/steps/executor.ts` → 実際は `src/core/step/executor.ts`（単数）、(b) `src/core/state/validate.ts` → `validateJobState` は `src/state/schema.ts:226` に存在、(c) `src/core/config/schema.ts` → 実際は `src/config/schema.ts`。さらに `src/config/schema.ts` には `getTimeoutMs(stepName, cfg)` ヘルパも存在する（grep 結果より）が tasks.md / proposal いずれも明示なし。実装者がパスを誤って探索する/`getTimeoutMs` ヘルパの削除を忘れるリスクがある。 | proposal.md / design.md / tasks.md の path 表記を実体に合わせて修正する: `src/core/step/executor.ts`、`src/state/schema.ts`、`src/config/schema.ts`。tasks.md §2 か §3 に「`src/config/schema.ts` の `getTimeoutMs(stepName, cfg)` ヘルパ削除」を 1 タスク追加する（grep 結果: schema.ts:161）。`src/adapter/anthropic/session-runner.ts` および `src/adapter/anthropic/completion.ts` 内の `timeoutMs` 引数・`SESSION_TIMEOUT` フォールバック (`completion.ts:74`, `session-runner.ts:99,116`) の扱いも tasks に明示する（撤廃 or 内部 default 化）。 |
| 3 | MEDIUM | completeness | openspec/changes/remove-session-timeout/design.md (Risks §1), tasks.md (なし) | 「真に hang した session が無限 polling される」リスクの mitigation として「手動 `specrunner cancel` で終端」を挙げているが、(a) `specrunner cancel` が任意 step の進行中 session を強制終端できることを spec / task で確認する acceptance 項目がない、(b) hang が detect されない状態でユーザがそれに気づく UX が無く、コスト超過/CI 暴走の検知経路が存在しない。design 内で「将来 `--max-duration` opt-in を検討する余地」と書きつつ、最低限の "session 寿命の可視化" は本 request 内で扱う方が安全。 | (a) tasks.md に「`specrunner cancel <jobId>` が in-flight session を `canceled` 状態に遷移できることの smoke test」を 1 行追加する、(b) acceptance 基準に「長時間 session（例: 30 分以上経過）が `specrunner status` / `ps` 上で elapsed time として可視化されている」項を追加する。または design Risks にこの 2 点を明示的に「Out of scope but tracked」として記録する（次 request で対応）旨を書き残す。 |
| 4 | LOW | maintainability | openspec/changes/remove-session-timeout/proposal.md:38, design.md (Goals 末尾, Risks §5), request.md:76 | 「既存テスト 706 件すべて pass」を absolute literal で参照しているが、merge 前後の他 request により実数が変動する可能性がある（事実、本 worktree が分離している間に main で件数が変わる）。spec / task が「706」固定値で書かれていると false positive / negative の温床になる。 | 「既存テスト全件 pass（変更前ベースライン比で減少なし）」のような相対表現に書き換える。または「removed timeout テストを除き、ベースライン件数 - N 件 + 新 fixture 件数 で全 pass」と明示する。tasks.md §6.3 も「`bun test` 全件 pass」の表現で十分。 |
| 5 | LOW | consistency | openspec/changes/remove-session-timeout/specs/cli-config-store/spec.md (REMOVED Reason 文中) | REMOVED Requirement の Reason に「`pollIntervalMs` は polling 間隔として残す必要があるが、それは executor の内部実装定数で十分」と書かれているが、proposal/design のスコープ宣言は「`timeoutMs` の削除」のみで `pollIntervalMs` の扱いには触れていない。実装時に `SpecRunnerConfig.specReview.pollIntervalMs` を残すのか定数化するのか曖昧。spec / 型変更の確定範囲を明示的に書くべき。review-lessons.md L63「設定可能なパラメータ（timeout 等）が spec の Scenario でも変数表記に統一され、固定値と config 上書き経路の不整合を生んでいないか」と直接呼応。 | (a) tasks.md §4 に「`SpecRunnerConfig.specReview` / `specFixer` ブロック内の `pollIntervalMs` を残す/定数化するかを決定し schema を整える」タスクを追加、(b) cli-config-store delta の「廃止 timeout キー」Requirement Scenario に「`pollIntervalMs` は無視されない／無視される」のいずれを採用するか明記する。本 request は timeout 撤廃が主目的なので「`pollIntervalMs` は当面 schema に残す（tagged optional）」推奨。 |
| 6 | LOW | consistency | openspec/changes/remove-session-timeout/specs/job-state-store/spec.md (delta 全体) | 既存 main spec の `Backward Compatibility with Legacy Schemas` Requirement に Legacy A / B が定義されており、delta では Legacy C を追加している。MODIFIED で Requirement 全体を再掲する形になっているが、`The normalized state SHALL be saved in the new format on the next persist() call` の文と新 Legacy C Scenario「on-disk file is unchanged until the next persist() call」の文言は整合しているか微妙。"unchanged until next persist" は明示的だが、`SHALL be saved on the next persist()` は subject が「the normalized state」全般。Legacy C の lazy 性が "次 update が無いと永続化されない" ことを明示的に強調すると安全。また `state.error.code` 列挙の正としての場所がここしかなくなるが、他 spec（propose-pipeline 等）からの参照整合は OK。 | MODIFIED Requirement 末尾の「`state.error.code` の列挙正規セット」一覧表（`SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE`）を Requirement 本体（Scenarios の上）に移し、「これが `state.error.code` の正規定義」と明示する。これにより propose-pipeline の表との single source of truth 関係が明確になる。 |

### Pattern-Reviewer 観点（review-lessons.md 由来）

review-lessons.md (L63) に「設定可能なパラメータ（timeout 等）が spec の Scenario でも変数表記に統一され、固定値と config 上書き経路の不整合を生んでいないか」という過去教訓があり、本 request は timeout 自体を撤廃するため当該パターンの再発リスクは原理的に解消される（patternreviewer 評価: positive）。Finding #5 は副次的に同じ系統。再発検出はゼロ。

### Architect 観点（design 妥当性 + Devil's Advocate）

- D1（完全削除）— 妥当。代替案（上限緩和 / opt-in 化）の却下理由も合理的
- D2（lazy migration）— 妥当。型と永続層の二段階互換戦略は健全
- D3（silent ignore）— 妥当だが Finding #5 の通り `pollIntervalMs` 取扱いが境界事例
- D4（REMOVED + MODIFIED 使い分け）— 妥当。MODIFIED の re-quote ルールに従っている
- 過剰設計の検出: なし。最小限の type / state / config 変更に絞れている
- Devil's Advocate: 「真に hang する session を完全無視する設計」が長期コスト面で fragile（Finding #3）。本 request の scope 外にしてもよいが、design 内で trade-off を明文化すべき

## Iteration Comparison

（iteration 1 のため該当なし）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.82 | needs-fix | 初回。HIGH 1 件（message-streaming scope creep） |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue (spec-fixer で Finding #1 の対応を実施 → 再レビュー)

## Summary

設計の中心方針（wall-clock timeout 撤廃 + lazy migration + silent ignore）は健全で、`openspec validate --strict` も pass している。一方で `message-streaming` spec の delta は Next.js Web UI のクライアント polling（CLI とは別レイヤ）を撤廃する内容となっており、本 request の本質（CLI step session timeout）と無関係な scope creep となっている — これが唯一の HIGH 案件。あわせて、design / proposal / tasks 内の参照パスが現リポジトリ構造（`src/core/step/`、`src/state/schema.ts`、`src/config/schema.ts`）と乖離しており、実装者の探索コストと取りこぼしリスクを生む。Finding #1 の対応（message-streaming delta の削除または書き換え）を最優先とし、合わせて Finding #2（path 訂正と `getTimeoutMs` ヘルパ + adapter 層の timeoutMs 引数のタスク追加）まで対応すれば次イテレーションで approved に到達可能。
