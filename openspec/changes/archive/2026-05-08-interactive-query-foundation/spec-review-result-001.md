# Spec Review Result: interactive-query-foundation — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.95 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: spec-reviewer, security-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 1

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 6 | 0.30 | 1.80 |
| consistency | 6 | 0.25 | 1.50 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 9 | 0.15 | 1.35 |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** | | | **6.95** |

### スコア理由

- **completeness 6**: `QueryFn` の return type を `AsyncGenerator<unknown, void>` に変更する D3 は明記されているが、その影響を受ける `ClaudeCodeRunner.run()` の message iteration（`message.type === "result"` で `unknown` 型上のプロパティアクセスがコンパイルエラーになる）への対応タスクが欠落。request.md の要件番号にも #9 重複・#10 欠番がある。
- **consistency 6**: `queryInteractive()` の return type が design D2 では `Query`（SDK の interrupt/streamInput 付きオブジェクト）と明記されているのに、tasks 3.1 では `queryFn({ prompt, options })` の戻り値（= `AsyncGenerator<unknown, void>`）をそのまま返すと記述。`Query` と `AsyncGenerator<unknown, void>` は異なる型であり、設計と実装タスクの間に矛盾がある。tasks 5.4 の `run.ts` bootstrap 統合も「実装時判断」に委ねられており仕様未確定。
- **feasibility 8**: 各変更は個別に実現可能。QueryOptions の optional フィールド追加は後方互換、bootstrap 抽出も mechanical。queryInteractive() の型矛盾が解消されれば実装は素直。
- **security 9**: 認証・認可の変更なし。session 関連 option（sessionId / resume）は SDK へのパススルーのみで独自処理なし。`permissionMode: "bypassPermissions"` は既存仕様を維持。
- **maintainability 7**: Hexagonal Architecture の依存方向を維持する D1/D2 の判断は妥当。ただし `LocalRuntime` が `QueryFn` を adapter 層（`agent-runner.ts`）から import する既存の依存方向違反は本変更で悪化（`AsyncIterable<unknown>` 対応で adapter 型が core に一層漏出）。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | design.md D2 / tasks.md 3.1 | `queryInteractive()` の return type が design では `Query`（SDK オブジェクト。`interrupt()` / `streamInput()` 等のメソッド付き）だが、tasks では `queryFn()` の戻り値（`AsyncGenerator<unknown, void>`）をそのまま返すと記述。`Query` extends `AsyncGenerator` だが追加メソッドを持つため型レベルで異なる。request.md も「caller が Query の全メソッドにアクセスできる」と明記しており、`QueryFn` 経由では `Query` 型を返せない矛盾がある。 | 2 つのうちいずれかを選択し、design/tasks を統一する: (a) `queryInteractive()` は `queryFn` を経由せず SDK の `sdkQuery` を直接呼ぶ（`Query` を返せるが DI/testability が低下）。テスト用に `sdkQueryFn` を別途注入する経路を追加。(b) R1 では `queryInteractive()` の return type を `AsyncGenerator<unknown, void>` とし、R2 で `Query` 型キャストまたは別注入経路を追加する旨を design の Open Question に明記。request.md の「Query オブジェクトをそのまま返す」も合わせて修正。 |
| 2 | MEDIUM | completeness | tasks.md / design.md D3 | `QueryFn` の return type を `SDKMessage` → `unknown` に変更する tasks 2.2 は記載があるが、`ClaudeCodeRunner.run()` 内の `message.type === "result"` / `message as SDKResultMessage` 等の message iteration が `unknown` 型でコンパイルエラーになる影響のタスクが欠落。`ClaudeCodeRunner` は adapter 層なので `SDKMessage` を直接扱えるが、`QueryFn` の return type が `unknown` になるため iterator の型推論が壊れる。 | tasks に 2.4 を追加: 「`ClaudeCodeRunner.run()` 内の `this.queryFn()` 戻り値の iteration で `unknown` → `SDKMessage` への型アサーションを追加する（`for await (const message of messages as AsyncGenerator<SDKMessage, void>)`）」。または `ClaudeCodeRunner` 内では `QueryFn` ではなく adapter 固有の `TypedQueryFn`（return type が `SDKMessage`）を使い、`QueryFn` は core 用の public type とする。 |
| 3 | MEDIUM | consistency | tasks.md 5.4 | `run.ts` の bootstrap 統合で「loadConfig は preflight 内で実行済みなので二重読み込みを避ける設計にする」と書きつつ「bootstrap に config を渡せるオーバーロードを用意するか、run.ts のみ部分的に直接構築するかは実装時判断」と委ねている。bootstrap の signature が確定しないと create/resume の呼び出し側もテスト記述も揺れる。 | bootstrap の signature を確定する: (a) `bootstrap(cwd, repo)` 単一 signature のまま、`run.ts` は bootstrap を使わず `createGitHubClient` + `createRuntime` を直接呼ぶ（bootstrap は create/resume 専用）。(b) `bootstrap(cwd, repo, config?)` で optional config を受け取り、省略時は `loadConfig()` を呼ぶ overload。いずれかを design D4 に記載。 |
| 4 | MEDIUM | completeness | request.md 要件 9 / 10 | 要件 #9 が「bootstrap」と「isResultMessage の移動」で重複し、#10 が欠番。design/tasks は正しくカバーしているが、request → tasks のトレーサビリティ（「要件 N → タスク X」）で混乱が生じる。 | request.md の要件番号を整番する: isResultMessage の移動を #10 に振り直し、テスト要件を #11〜#14 に再採番。 |
| 5 | LOW | consistency | proposal.md / openspec/specs/ | `QueryOptions` 拡張は `step-execution-architecture` capability の契約変更だが、delta spec が存在しない。optional フィールド追加のため後方互換ではあるが、spec lineage が途切れる。`QueryFn` 型変更も `claude-code-runtime` に影響するが同様に delta spec なし。 | (a) 推奨: `openspec/changes/interactive-query-foundation/specs/step-execution-architecture/spec.md` に MODIFIED ブロックを追加し、`QueryOptions` の新フィールド 4 つを記録。(b) 最低限: proposal.md の Impact セクションに「delta spec 不要の根拠: 全フィールド optional で後方互換」を 1 文追加。 |

## Iteration Comparison

（iteration 1 のため省略）

### Improvements
- N/A

### Regressions
- N/A

### Unchanged Issues
- N/A

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.95 | needs-fix | 初回 — HIGH 1 件（queryInteractive return type 矛盾）、MEDIUM 3 件 |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue（spec-fixer に修正を依頼し iteration 2 で再評価）

### 停滞検出ルール

- 初回のため停滞検出は適用なし。

## Summary

設計の方向性は妥当。Hexagonal Architecture を維持しつつ SDK 固有の対話機能を `LocalRuntime` 固有メソッドとして提供する D1/D2 の判断、CLI bootstrap の DRY 化、isResultMessage の適切なレイヤー移動はいずれも合理的。

blocking は HIGH 1 件: **`queryInteractive()` の return type が design（`Query`）と tasks（`AsyncGenerator<unknown, void>`）で矛盾**。request.md の意図は「caller が Query の全メソッドにアクセスできる」だが、`QueryFn` 経由のアプローチではこれを満たせない。DI と型安全性のトレードオフを design で明示的に解決する必要がある。

MEDIUM 3 件（ClaudeCodeRunner の unknown 型対応タスク欠落、run.ts bootstrap signature 未確定、要件番号重複）は 1 iteration で吸収可能。
