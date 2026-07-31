# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 現状コードの前提（コードアサーション 12 件全数確認）

1. **`src/cli/command-registry.ts:389`** — `generate:` subcommand が line 389 に実在。line 401 で `ClaudeCodeOneShotQueryClient` を new して `executeCreate` へ渡す。line 76 の usage 文字列に `request generate "<text>"` が存在。

2. **`src/core/command/request-create.ts:6`** — `executeCreate(text, opts, client: OneShotQueryClient)` が line 6 から始まる関数シグネチャ（`client: OneShotQueryClient` は line 9）で実在。

3. **`src/core/request/manager.ts:5,10`** — `create` 関数が line 5、`generator.generate(text, cwd, client)` の呼び出しが line 10 に実在。

4. **`src/core/request/generator.ts:5,20`** — line 5 に `REQUEST_GENERATE_SYSTEM_PROMPT` import、line 20 に `generate` 関数。`appendInvocation`（usage 記録）は lines 48–56 に実在（`command: "request-generate"` で呼ぶ）。

5. **`src/prompts/request-generate-system.ts`** — 実在。90 行（主張の「約 90 行」と一致）。`buildSystemPrompt` skeleton 使用を line 1 の import で確認。

6. **`src/core/port/one-shot-query-client.ts`** — port interface が実在（`OneShotQueryClient` / `OneShotQueryOptions` / `OneShotQueryResult`）。

7. **`src/adapter/claude-code/one-shot-query-client.ts`** — `ClaudeCodeOneShotQueryClient` 実装が実在。

8. **`src/core/usage/types.ts:11`** — `CommandInvocation.command` の union が line 11 で `"request-review" | "request-generate" | "job"` であることを確認。`"request-review"` が廃止済みコマンドの残置前例として存在。

9. **`src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`** — line 68 に `REQUEST_GENERATE_SYSTEM_PROMPT` import、line 121 に `ALL_15_AGENT_PROMPTS` への追加エントリ（TC-025 も request-generate 専用 test として存在）を確認。

10. **`architecture/components.md` の廃止後状態** — ports 表（line 108–114）に `OneShotQueryClient` は記載なし。adapters 表（lines 176–185）の claude-code adapter は `AgentRunner` のみ。主張の「#938 で廃止後の状態」を確認。

11. **`architecture/adr/2026-07-31-deterministic-request-entrance.md`** — 実在、status = accepted。D1（port 廃止）/ D2（LLM 境界を job 実行経路に閉じる）/ D3（B-18 提案）を確認。

12. **「OneShotQueryClient の消費者は generate 一本鎖のみ」** — grep で確認: 参照ファイルは 7 件（`manager.ts`, `generator.ts`, `one-shot-query-client.ts`(port), `index.ts`(re-export), `request-create.ts`, `command-registry.ts`, `adapter/.../one-shot-query-client.ts`）、すべて generate chain または定義自体。他に消費者なし。

13. **`architecture/divergence-status.md`** — line 12 に「既知の未収束（2026-07-31）」として本乖離が明示的に記録されていることを確認。

14. **`docs/request-authoring.md`** — `request generate` への言及なし（line 5 は `request template` / `request validate` のみ）。`request prompt` の追加案内が必要な状態。

15. **`request validate` コマンド実在** — command-registry.ts line 78 に `request validate <file|slug>` が実在。

### 要件・受け入れ基準の検証

- **Req 1**（`request prompt` 新設）: 3 部構成（起票規律 / 雛形 / `request validate` 指示）が明記され、決定的・副作用なしの制約が明示。`docs/request-authoring.md` の現状と整合する。
- **Req 2**（`request generate` 廃止）: 削除対象の一本鎖が網羅的に列挙されていることをコードで確認。`"request-generate"` literal 残置の根拠も `types.ts:11` で確認。
- **Req 3**（知識の単一ソース化）: `request-generate-system.ts` 内の規格知識を共有モジュールへ抽出し、`request prompt` と `request template`/`request new` が同一ソースを消費する。現状 `request template` の知識源については別途実装で担保される（request.md の受け入れ基準で import 構造保証を要求）。
- **Req 4**（B-18 歯）: 既存 `core-invariants.test.ts` / `module-boundary.test.ts` の様式の実在を確認。追加する検査が sabotage-red になる条件が受け入れ基準で要求されている。
- **Req 5**（docs 追随）: CLI usage 文字列（line 76）に `request generate` が残存、`docs/request-authoring.md` は現状 generate を言及しないが `request prompt` の追加案内が必要。
- **受け入れ基準 8 件**はすべて機械検証可能な形で記述されている。

### 設計判断の確認

採用・却下の判断が ADR-20260731 と整合していることを確認:
- `"request-generate"` literal 残置 — `"request-review"` の前例が `types.ts:11` で確認済み
- OneShotQueryClient の汎用 seam 温存却下 — ADR 代替案 2 と一致
- repo 固有知識を `request prompt` 出力に含めない — MEMORY.md の「No project-local refs in CLI」原則と整合

## 検証できなかった項目

None。コードアサーション 12 件、要件 5 件、受け入れ基準 8 件、設計判断すべてを確認した。

## Findings 詳細

None。
