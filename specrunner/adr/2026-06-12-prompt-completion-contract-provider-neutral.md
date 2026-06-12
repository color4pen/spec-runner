# ADR: 共有 agent prompt の完了契約文言を provider 中立に統一する

**Date**: 2026-06-12
**Status**: accepted

## Context

`2026-05-28-tool-driven-step-completion` ADR は `report_result` custom tool による step 完了判定を確立し、各 system prompt の末尾に「タスク完了時は必ず `report_result` tool を呼び出してください」という完了指示を追加した。この文言は **MCP tool / custom tool 呼び出し**という claude-code / managed runtime の affordance を前提とする。

spec-runner は 3 つの runtime を持つ:

- **claude-code / managed**: `report_result` を実 tool として登録し、tool 呼び出しを構造的に検出して完了とする。
- **codex**: `report_result` を tool として持たず、同 tool の zodSchema を OpenAI strict schema に変換して `outputSchema` として注入し、finalResponse の JSON を completion として解釈する。

結果として、`src/prompts/` 配下 14 ファイルに書かれた「`report_result` tool を呼び出せ」という完了指示が codex runtime に対して **存在しない tool への誤誘導**になっていた。同様に `end_turn`（Claude SDK のターン意味論）を使った文言も codex / managed に対して意味がない。

follow-up リトライ文言（`src/adapter/codex/agent-runner.ts`）は既に codex 向けに「スキーマに一致する JSON のみで返す」に差し替え済みだったが、system prompt 本体（全 runtime に同一文字列で渡される）は未対応で、提供される完了手段と prompt の指示が食い違ったまま実行されていた。

## Decision

### D1: 共有 prompt 表層を provider 中立の文言に統一する（adapter 注入ではなく）

`src/prompts/` 配下の全 prompt から `report_result` および `end_turn` という runtime 固有トークンを除去し、機構非依存の完了表現（「完了結果を報告せよ」「作業を終える前に報告を完了せよ」等）に統一する。

**Rationale**: 完了の**機構**は既に runtime 固有の affordance で agent に伝わっている。claude-code / managed は tool list に `report_result` が可視で tool description が「You MUST call this tool before ending your turn」と明示する。codex は `outputSchema` と codex 向け follow-up 文言が完了手段を指示する。共有 prompt が完了機構名を名指しする必然性はなく、prompt は「完了結果を報告せよ」という機構非依存の意図だけを述べ、機構の具体は各 runtime の affordance に委ねる（→ Alternative 1・2 を参照）。

### D2: 中立完了文言を単一ソース化（`src/prompts/fragments.ts`）

廃止文言が 14 ファイルに散在するため、中立表現を定数として `fragments.ts` に集約し、各 prompt から参照する。

- producer 系の `## Completion` フッター（共通形）は定数（`COMPLETION_DIRECTIVE`）として定義し、各 prompt から参照。
- judge 系は findings ブロックが step 固有のため、フッターの導入文と締め文のみを共有定数（`COMPLETION_REPORT_LINE` / `COMPLETION_NO_EARLY_STOP_LINE`）として切り出し inline ブロックで再利用。
- fragment-coverage テストが正準定数を `import` して `toContain` で全 14 prompt に一貫適用されることを固定する。

### D3: `end_turn` 用語の扱い — prompt 文言は中立化、API フィールド値は不変

prompt 中の `end_turn`（「end_turn しない」「session を終了（end_turn）」等）は Claude のターン意味論前提の語であり codex / managed と共有できない。中立語（「作業を終える」「セッションを終了する」等）に置換する。

Claude SDK の `stop_reason: "end_turn"`（`src/adapter/claude-code/message-types.ts` および adapter テストの値）は API フィールド値であり、claude-code 固有層に閉じているため変更しない。

### D4: `VERDICT_BLOCKING_RULES` の完了機構参照を中立化（ルール意味は保持）

`judge-rules.ts` の `VERDICT_BLOCKING_RULES` 内「report_result findings」を「報告された findings」に置換する。verdict blocking の論理（decision-needed → escalation、critical/high → needs-fix、findings 由来の導出が優先）は変更しない。

**Rationale**: Non-Goal の「judge ルール本体の意味変更」が守るのは判定ロジックであって、完了機構名の参照は provider 中立化の対象に含まれる。

### D5: テスト戦略 — fragment-coverage に neutrality 断言を追加し、runtime テストは無変更

fragment-coverage テストに neutrality 断言を追加する: 対象 14 prompt が `report_result` / `end_turn` を含まないこと、決定した中立トークンを含むことを断言。

claude-code runtime テスト（「Agent did not call report_result」エラー文言、`stop_reason: "end_turn"` の値）は完了機構・API 値の断言であり無変更で green を維持する。prompt 文言テストは文言変更に追従するのが正しく、runtime 機構テストとは明確に分離する。

## Alternatives Considered

### Alternative 1: adapter が provider 別の完了指示を system prompt に注入する

prompt 側に slot を設け、claude-code は「call report_result」、codex は「return JSON matching the schema」を注入する。

- **Pros**: prompt 文言が runtime ごとに正確になり、モデルへの指示と実際の affordance が完全一致する
- **Cons**: 完了契約の知識が tool description / outputSchema と注入文言に二重化して drift する。新たな注入点追加は codex adapter 実装変更に踏み込み Non-Goal に反する。「LLM session に state を持たせない / 表層を増やさない」North Star に逆行する
- **Why not**: tool description / outputSchema がすでに各 runtime で完了機構を正確に伝えているため、共有 prompt に重複して名指す価値がない。二重管理の drift リスクが利得を上回る

### Alternative 2: 現状維持し codex follow-up 文言のみで補正させる

follow-up リトライ文言は既に codex 向けに差し替え済みであるため、main work turn の誤誘導は受容し follow-up で吸収させる。

- **Pros**: 変更範囲がゼロで regression リスクがない
- **Cons**: codex の main work turn において agent が存在しない tool を探す無駄ターンが発生し続ける。「提供される完了手段と prompt の指示が食い違ったまま」という本 request が解消すべき不整合を解消しない
- **Why not**: 根本原因（prompt の誤誘導）に対処しないまま follow-up retry に依存するのは `Avoid patchwork fixes` 原則に反する

### Alternative 3: 中立文字列を 14 ファイルに直接 inline コピーする（fragments.ts を使わない）

fragments.ts に定数を集約せず、各 prompt ファイルに中立文言を直書きする。

- **Pros**: fragments.ts への依存が増えない。各ファイルが自己完結する
- **Cons**: 同一文言が 8 件以上のファイルに重複し、将来の文言変更で drift が発生する。fragment-coverage テストが「正準トークンを import して断言」というパターンを使えず、テスト固定が弱くなる
- **Why not**: 既存コードベースは共有規律を fragment 定数（`COMMIT_DISCIPLINE`, `PIPELINE_RULES`）として集約する設計。同パターンに載せるのが一貫しており DRY を維持できる

### Alternative 4: `VERDICT_BLOCKING_RULES` を中立化スコープから除外する

`judge-rules.ts` の `VERDICT_BLOCKING_RULES` は judge ルール本体であるため、「ルール意味の変更禁止」を理由に対象外にする。

- **Pros**: ルール文言の変更リスクがゼロになる
- **Cons**: review 系 prompt に `report_result` という runtime 固有トークンが残り、要件「全 prompt に一貫適用」を満たせない。blocking 論理（decision-needed / critical|high / findings 優先）を変えずに「report_result findings」を「報告された findings」に置換するだけであり、ルールの意味は変わらない
- **Why not**: Non-Goal の「judge ルール本体の意味変更」が守るのは判定ロジックであって、完了機構名のトークンは provider 中立化の対象に含まれる

## Consequences

### Positive

- codex runtime に対する「存在しない tool を呼べ」という誤誘導が解消される
- 完了文言の単一ソース化（D2）により将来の drift がテストで即検出される
- `report_result` / `end_turn` 不在を全 prompt で機械的に保証できる
- 新 runtime を追加する際に共有 prompt の変更が不要になる（runtime 固有の完了機構は affordance 層で完結する）

### Negative

- claude モデルが tool description のみで `report_result` を呼ぶ信号として頼る。中立化でシステム prompt の明示的な tool 名指し誘導が失われるが、tool list + tool description の可視性で補完できると判断した
- `fragments.ts` に定数が 3 件追加される（既存 fragment パターンの踏襲であり許容範囲）

## References

- Related: [`2026-05-28-tool-driven-step-completion.md`](./2026-05-28-tool-driven-step-completion.md) — `report_result` tool 設計の起点。本 ADR はその prompt 表層を中立化する後続決定
- Request: `specrunner/changes/prompts-completion-contract-neutral/request.md`
- Design: `specrunner/changes/prompts-completion-contract-neutral/design.md`
- Implementation: `src/prompts/fragments.ts`・`src/prompts/`（全 14 ファイル）・`src/prompts/__tests__/fragment-coverage.test.ts`
