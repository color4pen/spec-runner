# Spec Review Result: session-lifecycle-extraction — Iteration 1

## Verdict

- **verdict**: approved
- **iteration**: 1
- **trend**: — (初回)
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Summary

設計方針は妥当。RuntimeStrategy + CommandRunner の 2 層抽象化により、4 箇所の runtime 分岐と run/resume の構造的重複を適切に解消する。ポリモーフィズムの適用粒度（Strategy 層での runtime 吸収、Template Method 層での command 骨格統一）は問題の性質に合致している。

以下 4 件の MEDIUM は実装時に解決可能だが、事前に明確化すると implementer の判断コスト（特に sequencing 問題）を削減できる。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | tasks.md:129-141 vs tasks.md:165-168 | Task 3.3 は `prepare()` 内で `runPreflight()` を呼ぶと記述。一方 Task 4.1 は `runRunCore` を「preflight → createRuntime → PipelineRunCommand.execute() の 3 行」とし、preflight を CLI 側で実行する前提。`createRuntime(config)` は config を必要とするため、preflight が prepare() 内にあると runtime を constructor DI できない（Design D5 の `constructor(runtime)` パターンと矛盾する）。implementer が sequencing を誤ると二重 preflight か runtime の lazy-init が必要になる | Task 3.3 の prepare() から preflight を除外し、PipelineRunCommand の constructor に `(runtime, preflightResult, options)` を受ける設計に統一する。Task 4.1 の記述が正として、Task 3.3 の prepare() は `createJobState` + slug 導出 + return PrepareResult のみに修正する |
| 2 | MEDIUM | consistency | design.md:197-208 vs tasks.md:116-127 | PrepareResult の定義が design.md と tasks.md で不一致。design.md は `events: EventBus` を含み `verbose` を含まない。tasks.md は `verbose: boolean` を含み `events` を含まない。request.md 要件 14「EventBus + ProgressDisplay の構築は CommandRunner.execute() 内で 1 回行う」は tasks.md 側と整合するが、design.md が更新されていない | design.md の PrepareResult から `events: EventBus` を削除し `verbose: boolean` を追加する。EventBus 構築を execute() 内で行う旨を design.md D5 の template method コード例に反映する |
| 3 | MEDIUM | consistency | tasks.md:200-201 vs request.md 受け入れ基準 | 受け入れ基準「config.runtime の if/else がコードベース全体で 1 箇所のみ」は rm.ts（L56）と rm/runner.ts（L101, L167）の 3 箇所が残るため達成不可能。tasks.md の Notes で rm.ts スコープ外を明記しているが、Task 5.1 の acceptance は「src/config/ 内のスキーマ定義・migration は除く」としか書いておらず rm を除外していない | Task 5.1 の acceptance を「src/core/runtime/factory.ts の 1 箇所のみ（src/config/ 内のスキーマ定義・migration および src/cli/rm.ts・src/core/rm/ を除く）」に修正する |
| 4 | MEDIUM | completeness | design.md:27 | `query()` の戻り値 `AsyncGenerator<Message>` の `Message` 型が supporting types に未定義。Claude Code SDK の型か Anthropic API の型か、あるいは新設の runtime 中立型か不明。将来の dialog 用とはいえ interface 定義のコンパイルに必要 | design.md の Supporting Types に `Message` 型の定義を追加する（例: `type Message = { role: string; content: string }` のような runtime 中立な最小型）、または query() の戻り値型を `AsyncGenerator<unknown>` にして「dialog 実装時に型を確定する」注記を加える |
| 5 | LOW | consistency | design.md:211-212 | Design D5 error handling で「pipeline throw は catch → outputPipelineThrowError → cleanup → return 1」と記述するが、template method の 7-step sequence では teardown() が step 7（handleResult の後）にあり、catch パスからの teardown() 呼び出しが明示されていない。catch 内で teardown() を呼ばないと signal handler がリークする | template method のコード例に try-finally パターンを追加するか、catch ブロック内に `await this.runtime.teardown(handle, "error")` を明記する |
| 6 | LOW | maintainability | design.md:260 | `PipelineDeps` に `runner: AgentRunner` を追加すると、`client?: SessionClient` は AgentRunner 生成のためだけに存在していたフィールドが事実上 dead field になる（pipeline step は runner 経由で実行され client を直接参照しない）。本 request では削除不要だが、将来の cleanup 対象として認識されていない | design.md の Design Decisions テーブルに「client フィールドは本 request では維持。runner 追加により unused になるが、後方互換のため削除は別 request で行う」旨の decision を追記する |

## Iteration Comparison

（iteration 1 のため空欄）

### Improvements
- N/A

### Regressions
- N/A

### Unchanged Issues
- N/A
