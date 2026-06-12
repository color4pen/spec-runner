# Design: agent prompt の完了契約文言を provider 非依存にする

## Context

pipeline の各ステップ agent には system prompt（`src/prompts/` 配下 14 ファイル）が与えられる。
この prompt 群は完了契約を「`report_result` tool を呼び出して完了を宣言する」という **MCP tool 前提**の文言で固定し、加えて完了タイミングを `end_turn`（Claude SDK のターン意味論）という語で表現している。

同じ system prompt は 3 つの runtime に **同一文字列のまま**渡される:

- **claude-code / managed**: `report_result` を実 tool として登録する。tool の description（`src/core/step/report-tool.ts`）が「call this tool before ending your turn」と正確に指示し、CLI は tool 呼び出しを構造的に検出して完了とする。
- **codex**: `report_result` を tool として持たない。`reportTool.zodSchema` を OpenAI strict schema に変換し `outputSchema` として注入（`src/adapter/codex/agent-runner.ts:139-141,247,398-403`）、finalResponse の JSON を completion として解釈する。tool description は **codex に渡されない**（`buildOutputSchema` は `zodSchema` のみ使用、description を捨てる）。follow-up リトライ文言（同 `:461-463`）は既に「スキーマに一致する JSON のみで返す」という codex 向けに差し替え済み。

結果として codex は、main work turn の system prompt で「存在しない `report_result` tool を呼べ」と指示され続ける。GPT 系モデルに対する誤誘導であり、tool を探す／呼ぼうとして失敗する原因になる。follow-up だけ codex 向けに直っているが、本体 prompt は未対応で「提供される完了手段」と「prompt の指示」が食い違ったまま実行される。

本 change は **prompt 文言の整合のみ**を対象とし、runtime の完了検出ロジック・tool 登録・schema には手を入れない。

### 現状の文言出現箇所（検証済み）

- 全 14 prompt が `report_result` に言及。再頻出の 2 文:
  - `作業完了時は必ず \`report_result\` tool を呼び出してください。`（producer/judge 共通の導入文）
  - `tool を呼ばずに turn を終了しないでください。`（共通の締め文）
- `end_turn` は `design-system.ts`（最多）, `implementer-system.ts`, `test-case-gen-system.ts`, `code-fixer-system.ts`, `build-fixer-system.ts`, `request-review-system.ts`, `adr-gen-system.ts`, `spec-review-system.ts`, `spec-fixer-system.ts` の system prompt / initial-message に分散。
- `src/prompts/judge-rules.ts` の `VERDICT_BLOCKING_RULES` は「derived by CLI from report_result findings」「`report_result` findings が矛盾した場合」と完了機構名を含む。これは `PIPELINE_RULES` 経由で review 系 prompt にも展開される。
- `src/core/step/report-tool.ts` の tool description は `report_result` / 「call this tool」を含むが、これは **claude-code/managed の実 tool description であり、codex には渡されない**（= prompt 文言ではない）。
- `src/errors.ts:306-307` は「agent did not call report_result」という **runtime エラー文言**（completion 検出機構の一部）。prompt ではない。

## Goals / Non-Goals

**Goals**:

- 3 runtime に共有される prompt 表層（`src/prompts/`）から、runtime 固有の完了機構名（`report_result` / `end_turn`）を排除し、**provider 中立の完了表現に統一**する。
- 完了の意味（正常完了 = `ok:true` / 自発的失敗 = `ok:false` + `reason`、judge の findings 報告）は中立表現で **保持**する。
- 文言の一貫性を fragment-coverage 方式のテストで固定する（決定した中立表現が全対象 prompt に存在し、廃止した表現が残っていないこと）。
- claude-code 経路の完了検出（tool 呼び出し検出・follow-up リトライ）を退行させない。

**Non-Goals**:

- runtime の完了検出ロジック・tool 登録・`outputSchema` 変換・follow-up リトライ実装の変更（`src/adapter/`, `src/core/step/executor.ts`）。
- `src/core/step/report-tool.ts` の tool description 変更（claude-code/managed の実 tool description として正確であり、codex には渡されない）。
- `src/errors.ts` の runtime エラー文言変更（completion 検出機構の一部。claude-code path テストが固定済み）。
- judge ルール本体の **意味**変更（DECISION_NEEDED_DEFINITION / OBSERVATION_DEFINITION の判定内容、verdict blocking の論理）。
- prompt の英語化（GPT 系での言語選択は別判断）。
- codex adapter の実装変更（本 change では注入点の追加は不要 — D1 参照）。

## Decisions

### D1: 共有 prompt 表層を provider 中立の文言に統一する（adapter 注入ではなく）

要件 1（「中立表現に統一」 vs 「adapter が provider 別注入」）の判断。**中立表現への統一**を採用する。

**Rationale（why neutral, not injection）**:
完了の**機構**は既に runtime 固有の affordance で agent に伝わっている:
- claude-code / managed: `report_result` 実 tool（tool list に名前が見え、description が「call this tool before ending your turn」と指示）。
- codex: `outputSchema`（フィールド形状を schema で提示）＋ codex 向け follow-up 文言。

つまり共有 prompt が完了**機構名**を名指しする必然性はない。prompt は「完了結果を報告せよ」という機構非依存の意図だけを述べ、機構の具体は各 runtime の affordance に委ねればよい。`report_result` を名指しすることが codex への誤誘導の発生源である。

**Alternatives considered**:
- **(B) adapter が provider 別の完了指示を system prompt に注入する**: prompt 側に slot を設け、claude-code は「call report_result」、codex は「return JSON matching the schema」を注入する。却下 — (1) 完了契約の知識が tool description / outputSchema と注入文言に二重化し drift する、(2) 新たな注入点の追加は codex adapter 実装変更に踏み込み Non-Goal に反する、(3) 「LLM session に state を持たせない／表層を増やさない」North Star に逆行する。
- **(C) 現状維持し codex follow-up で補正させる**: main work turn は誤誘導されたまま。tool を探す無駄ターンが発生し、request が問題として明示している不整合を解消しない。却下。

### D2: 中立完了文言を単一ソース化（`src/prompts/fragments.ts`）

廃止文言が 14 ファイルに散在するため、中立表現を定数として `fragments.ts` に集約し、各 prompt から参照する。

- producer 系（design / implementer / spec-fixer / code-fixer / build-fixer / test-case-gen / adr-gen / conformance）の `## Completion` フッターは共通形のため、中立フッター定数（例 `COMPLETION_DIRECTIVE`）として 1 箇所に定義し、`buildSystemPrompt` の fragment として append、または inline 参照する。
- judge 系（code-review / spec-review / regression-gate / custom-reviewer）は findings ブロックが step 固有のため、フッターの**導入文**と**締め文**だけを共有定数（例 `COMPLETION_REPORT_LINE` / `COMPLETION_NO_EARLY_STOP_LINE`）として切り出し、各 prompt の inline ブロック内で再利用する。
- これにより fragment-coverage テストが「正準トークン」を import して `toContain` で固定できる（既存 `DECISION_NEEDED_DEFINITION` / `VERDICT_BLOCKING_RULES` と同じパターン）。

**Rationale**: 既存コードベースは共有規律を fragment 定数（`COMMIT_DISCIPLINE`, `PIPELINE_RULES`）として `buildSystemPrompt` で合成する設計。完了文言も同パターンに載せるのが一貫し、DRY で drift を防ぎ、テスト固定の正準ソースになる。

**Alternatives considered**:
- 各ファイルに中立文字列を inline コピー: 8 件以上の重複が将来 drift する。却下。

### D3: `end_turn` 用語の扱い — prompt 文言は中立化、API レベルの値は不変

要件 2。prompt 中の `end_turn`（「end_turn しない」「session を終了（end_turn）」等）は Claude のターン意味論前提の語であり codex/managed と共有できない。「作業を終える」「セッションを終了する」「finish」等の中立語に置換する。

一方、Claude SDK の `stop_reason: "end_turn"`（`src/adapter/claude-code/message-types.ts` および adapter テストの値）は **API フィールド値**であり prompt 文言ではない。変更しない。

**Rationale**: D1 と同じ — 共有表層から runtime 固有のターン語彙を除く。API 値は claude-code 固有層に閉じており codex に漏れない。

### D4: `VERDICT_BLOCKING_RULES` の完了機構参照を中立化（ルール意味は保持）

`judge-rules.ts` の `VERDICT_BLOCKING_RULES` 内「report_result findings」を「報告された findings」（および英文「derived by CLI from the reported findings」）に置換する。verdict blocking の論理（decision-needed → escalation、critical/high → needs-fix、findings 由来導出が優先）は **一字も変えない**。

**Rationale**: Non-Goal の「judge ルール本体の**意味**変更」が守るのは判定ロジックであって、完了機構名の参照は本 change の対象（完了契約文言の provider 非依存化）に含まれる。既存の fragment-coverage 断言（`decision-needed` / `escalation` / `needs-fix` / `findings 由来の導出が優先` の存在）は置換後も成立する。

**Alternatives considered**:
- `VERDICT_BLOCKING_RULES` を対象外にする: review 系 prompt に `report_result` が残り、要件 1 の「全 prompt に一貫適用」を満たせない。却下。

### D5: テスト戦略 — fragment-coverage に neutrality 断言を追加し、prompt テストのみ更新

- `src/prompts/__tests__/fragment-coverage.test.ts` に neutrality 断言を追加: 対象 14 prompt（exported system prompt 定数・初期メッセージ template / builder 出力）について `report_result` / `end_turn` を **含まない**こと、決定した中立トークンを **含む**ことを断言。`VERDICT_BLOCKING_RULES` が `report_result` を含まないことも断言。
- `src/prompts/__tests__/custom-reviewer-system.test.ts:54-57`（`contains report_result tool requirement`）は **prompt 文言テスト**なので、中立完了文言の存在を断言する形に更新する。
- claude-code **runtime** テスト（`transient-error.test.ts:225` の「Agent did not call report_result」、`agent-runner-transient-retry.test.ts` / `agent-redirect-integration.test.ts` の `stop_reason: "end_turn"`）は機構・API 値の断言であり **無変更で green を維持**する（要件 3 / 受け入れ基準 2 の対象）。

**Rationale**: 「claude-code 経路の既存テストが無変更で green」が指すのは runtime 機構を固定するテスト。prompt 文言テストは文言変更に追従するのが正しく、無変更対象ではない。両者を design で明確に分離する。

## Risks / Trade-offs

- [Risk] 中立化で tool 名が消え、claude モデルが `report_result` を呼ばなくなる（完了検出が follow-up に依存して遅延）。
  → Mitigation: `report-tool.ts` の tool description が「You MUST call this tool before ending your turn」と引き続き明示し、tool は agent の tool list に可視。中立 prompt（「完了結果を報告せよ」）＋ 名前付き tool description で十分な信号。follow-up リトライも温存。claude-code 完了検出テストが無変更 green で退行を検出する。
- [Risk] 散在する `report_result` / `end_turn` の置換漏れで prompt 間が不整合になる。
  → Mitigation: fragment-coverage テストが全 14 prompt で**廃止トークンの不在**を断言する。漏れは即テスト失敗。
- [Risk] `VERDICT_BLOCKING_RULES` 文字列変更が他テストの部分文字列断言を壊す。
  → Mitigation: 変更は「report_result」トークンのみ。既存断言は別の部分文字列（`decision-needed` 等）を対象としており影響しない。
- [Trade-off] 中立フッターの定数化（D2）で `fragments.ts` に定数が増える。
  → 既存 fragment パターンの踏襲であり、重複削減・テスト固定の利得が上回る。

## Open Questions

なし（中立トークンの具体文字列は D2 の方針に沿って tasks.md で確定する）。

## Notes / Follow-ups（本 change 対象外の観察）

- `src/adapter/shared/prompt-builder.ts` の runtime instructions ヘッダは "local Claude Code mode" と名乗るが、完了表現自体は "After completing your task, end your session."（既に中立）。完了契約文言としては問題なく、runtime ラベリングは本 change のスコープ外。
- 本 change は **codex-adapter-parity の取り込み後**に着手する（structured output の最終挙動が前提）。取り込み後、実 request 1 本を codex runtime で end-to-end 完走させて実証する（受け入れ基準とは別の仕上げ確認）。
