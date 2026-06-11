# ADR-20260612: reviewer チェーン完走後の退行ゲートで累積 findings 台帳を最終コードと再照合する

**Date**: 2026-06-12
**Status**: accepted

## Context

ADR-20260611 の直列 reviewer チェーンでは、後段 reviewer のループで `code-fixer` がコードを変更しても承認済みの上流 reviewer は再実行されない。上流の approved は「承認時点のコード」に対する保証であり、「チェーン完走時点の最終コード」に対する保証ではない。

`conformance`（受け入れゲート）は tasks.md / design.md / spec.md / request.md の 4 成果物照合に判定対象が固定されており（`src/prompts/conformance-system.ts`）、spec に表現されていない reviewer レンズ（security / performance 観点等）の退行は検出されない。

この空白を埋めるため、全 reviewer チェーン完走後・conformance 前に「退行ゲート」step を置き、チェーン途中で修正された findings（累積台帳）が最終コードでも修正されたままかを再照合する。

前提となる標準化済みの基盤:

- judge 契約（findings 由来 verdict 導出・finding ref 実在検証・no-tool-call escalation）は `executor.ts` の `isJudgeStep`（`reportTool === JUDGE_REPORT_TOOL` の identity 判定）に集約済み
- pipeline 合成は `PipelineDescriptor` でデータ化済み（ADR-20260604）
- `composeReviewerDescriptor` が custom reviewer 非空時のみ base を拡張し、ゼロ個では base を参照同一で返す（ADR-20260611 D9）
- `buildReviewerChainTransitions` が reviewer chain から impl phase の遷移行を生成する純関数として確立済み（ADR-20260611 D4）

## Decision

### D1: 退行ゲートを「custom reviewer 非空時のみ」合成される impl-phase step として注入する

ゲートを `STANDARD_DESCRIPTOR` には含めず、`composeReviewerDescriptor` が custom reviewer を 1 件以上検出したときだけ、最後の reviewer と conformance の間に step として挿入する。reviewer ゼロ個では `composeReviewerDescriptor` が base を参照同一で返す既存の早期 return（ADR-20260611 D9）をそのまま通り、ゲートは pipeline に現れない。

`STANDARD_DESCRIPTOR` が byte-identical に保たれるため、zero-reviewer のテスト群が無変更で green になる。

### D2: チェーン先頭からの再走ではなく「台帳照合」を選ぶ

ゲートは reviewer チェーンを先頭から再実行せず、累積台帳の各項目が最終コードで維持されているかだけを照合する。

再走は reviewer 間の矛盾要求による振動（互いの修正の差し戻し合い）で予算を食い潰すリスクがある。台帳照合は項目数で収束が有界であり、矛盾は「直すと別項目が壊れる」という形で顕在化して escalation として人間に届く。

### D3: `JUDGE_REPORT_TOOL` identity の再利用で executor を無改修にする

ゲート step の `reportTool` に `JUDGE_REPORT_TOOL` singleton をそのまま参照させる。`executor.ts` の `isJudgeStep` は identity（`=== JUDGE_REPORT_TOOL`）で判定するため、findings 由来の verdict 導出・finding ref の実在検証・no-tool-call 時 escalation がゲートにも executor 無改修で適用される。

ADR-20260611 D3 で custom reviewer が確立した手法の再適用。

### D4: 既存の chain 遷移 generator にゲートをチェーン末尾として乗せる

`composeReviewerDescriptor` が遷移を生成する際、reviewer chain に ゲートを末尾追加した `fixableChain = [...reviewerChain, REGRESSION_GATE]` を `buildReviewerChainTransitions` に渡す。`nextAfterReviewer(REGRESSION_GATE, fixableChain)` は末尾要素なので `conformance` を返し、ゲートには次の遷移が自動生成される:

- `regression-gate` needs-fix → `code-fixer`
- `regression-gate` approved → `conformance`
- `code-fixer` approved → `regression-gate`（active reviewer がゲートのとき）

### D5: `deriveImplFixerChain` を分離して code-fixer を共用する

ゲート専用の fixer は作らず、`code-fixer` を共用する（`loopFixerPairs[REGRESSION_GATE] = code-fixer`）。code-fixer の findings 取得チェーンを `deriveImplReviewerChain`（reviewer chain のみ）と `deriveImplFixerChain`（custom reviewer 非空時にゲートを末尾追加）に分離し、code-fixer の `reads()` / `buildMessage()` を `deriveImplFixerChain` に切り替える。

`deriveImplReviewerChain` 自体にゲートを足さないことで「reviewer chain」の意味境界を保ち、`buildReviewerChainTransitions` の zero-reviewer parity 入力（`["code-review"]`）への影響をゼロにする。ゲートが最新 `startedAt` を持つときだけ active reviewer がゲートになり、code-fixer はゲートの退行 findings を読む。

### D6: 純関数 `collectFindingsLedger` で累積 findings 台帳を構築する

純関数 `collectFindingsLedger(state, reviewerChain)` を新設する。台帳の定義:

- 対象は reviewer chain（`["code-review", ...names]`、ゲート自身を除く）の各 step の全 iteration
- `resolution === "fixable"` の finding のみを採る（`decision-needed` は escalation 済みでチェーン完走時点に現れない）
- 構造的重複（同一 `file` + `line` + `title`）を `dedupeFindings` で排除する
- 意味的重複（表現違いの同一指摘）の判断はゲート agent に委ねる

全 iteration を走査するのは「途中で修正されて後に approved になった項目」を取りこぼさないため。

### D7: ゲート自身の iteration 予算と exhaustion を持たせる

`composeReviewerDescriptor` が `maxIterationsByStep[REGRESSION_GATE] = REGRESSION_GATE_MAX_ITERATIONS`（hardcode 定数）を供給し、`loopNames` にゲートを含める。`Pipeline.resolveMaxIterations` と既存の per-step exhaustion / episode-reset 機構（ADR-20260611 D6）がゲートにそのまま適用される。

`LOOP_ERROR_CODES[REGRESSION_GATE]` に `REGRESSION_GATE_RETRIES_EXHAUSTED` を追加し、exhaustion 時に `regression-gate-result-NNN.md` を指す hint を出す。exhaustion は `handleExhausted` 経由で `awaiting-resume`（resumeStep = `code-fixer`）に落ちる。

ゲートの予算を pipeline の global maxRetries から独立させ、台帳照合という有界タスクに見合う小さな予算で収束/halt させる。

### D8: ゲートの role は `gate`、`AGENT_STEP_NAMES` / `STEP_NAMES` には追加しない

descriptor の `roles[REGRESSION_GATE] = { role: "gate", phase: "impl" }` とする。agent definition の `role` は custom reviewer と同様に型アサーション（`"regression-gate" as AgentStepName`）で持たせ、`AGENT_STEP_NAMES` / `STEP_NAMES` には追加しない。managed runtime での agent 自動登録は custom reviewers と同じく deferred。

kernel の step 名 whitelist・双方向 guard・`STEP_NAMES` を一切触らないことで zero-reviewer の既存テストへの波及をゼロにする。

## Alternatives Considered

### Alt-A: チェーン全体を先頭から再走させる（D2 の不採用案）

- **Pros**: 全 reviewer が最終コードを新たに評価するため、台帳に入っていない観点の退行も検出できる
- **Cons**: reviewer 間の矛盾要求（A は「変数名を short に」、B は「変数名を descriptive に」等）でコードが振動し、互いの修正を差し戻し合って予算を食い潰すリスクがある。収束が項目数で有界にならない
- **Why not**: 台帳照合は「fixer が修正した findings」という有限集合を対象とするため収束が項目数で有界。矛盾は `decision-needed` として顕在化し escalation で人間に届く。architect 評価済み

### Alt-B: `STANDARD_DESCRIPTOR` にゲートを常設し、runtime で skip 判定する（D1 の不採用案）

- **Pros**: pipeline 形状が常に一定で実装がシンプル
- **Cons**: zero-config の pipeline テスト・遷移表が変わる。skip 判定ロジックが pipeline engine に漏れ、`STANDARD_DESCRIPTOR` の byte-identical 保証が崩れる
- **Why not**: custom reviewer 非空かどうかは合成時点で確定する構造的性質。`composeReviewerDescriptor` の合成判定として表現することで、`STANDARD_DESCRIPTOR` の zero-reviewer 完全一致（ADR-20260611 D9）をそのまま維持できる

### Alt-C: ゲート専用の fixer step を追加する（D5 の不採用案）

- **Pros**: fixer が退行 findings の文脈を直接知ることができる
- **Cons**: reviewer ごとに専用 fixer を持つと収束ループの組み合わせ爆発を招く（ADR-20260611 Alt-C と同型）
- **Why not**: `deriveImplFixerChain` で findings の供給元にゲートを追加するだけで共用 fixer がゲートの退行 findings を読める。専用 fixer の利得はない

### Alt-D: `deriveImplReviewerChain` 自体にゲートを追加する（D5 の不採用案）

- **Pros**: fixer 用の派生関数を別途用意せずに済む
- **Cons**: 「reviewer chain」という概念にゲートが混入し、意味境界が崩れる。`buildReviewerChainTransitions` の zero-reviewer parity 入力（`["code-review"]`）にも影響し得る
- **Why not**: fixer 用途専用の `deriveImplFixerChain` を分離することで、reviewer chain の意味を保ちつつゲートを findings 供給元として追加できる

### Alt-E: 専用 `REGRESSION_GATE_REPORT_TOOL` を新設し `isJudgeStep` を拡張する（D3 の不採用案）

- **Pros**: ゲート専用の report tool として明示的に型安全に扱える
- **Cons**: `executor.ts` の判定面を増やすだけで利得がない。`JUDGE_REPORT_TOOL` singleton をそのまま参照することで executor 無改修で全防御が適用される（ADR-20260611 Alt-E と同型）
- **Why not**: identity 再利用（D3）の方がシンプルで executor との結合が変わらない

### Alt-F: `collectFindingsLedger` で最終承認直前の run だけを収集する（D6 の不採用案）

- **Pros**: 台帳がシンプルになり、重複排除ロジックが不要になる
- **Cons**: 「途中の iteration で修正されて最終 run では findings に出ない項目」を取りこぼす。チェーン完走時点で approved になった reviewer の最終 run に退行対象が残らない
- **Why not**: 全 iteration を走査することで「最終 run には現れない修正済み項目」を台帳に確実に取り込める

### Alt-G: global `maxRetries` をゲート予算に共用する（D7 の不採用案）

- **Pros**: 設定項目が増えない
- **Cons**: ゲートの予算が pipeline 既定値に結合し、台帳照合という有界タスクに対して過大 or 過小な予算が固定される。ゲートのみ独立して調整できない
- **Why not**: `maxIterationsByStep[REGRESSION_GATE]` に専用定数を供給することで、台帳照合に見合う小さな予算で収束/halt させ、将来の config 化も局所化できる

## Consequences

### Positive

- 直列 reviewer チェーンで後段修正が上流 approved 済み観点を退行させる空白が埋まる
- チェーン先頭からの再走（振動リスク）を避け、台帳照合（項目数で有界）で収束させる
- `JUDGE_REPORT_TOOL` identity 再利用・`buildReviewerChainTransitions` 末尾追加により executor / chain generator を無改修でゲートに適用できる
- `STANDARD_DESCRIPTOR` が byte-identical に保たれ、zero-reviewer の既存テスト群への影響がゼロ

### Negative

- custom reviewer 非空のテストは「最後の reviewer の approved 遷移先が `regression-gate` → `conformance`」に変わるため更新が必要
- `JUDGE_REPORT_TOOL` singleton への identity 依存が暗黙の seam になる。singleton を差し替えるとゲートの judge 判定も崩れる
- managed runtime でのゲート agent 自動登録は未解決（custom reviewers と同じ既知制約）

### Known Debt / Deferred

- ゲート予算（`REGRESSION_GATE_MAX_ITERATIONS`）の config 化は必要になれば別途
- 空台帳での決定的 skip（agent 即 approved でなく構造的な遷移スキップ）は初期 hardcode として future work
- managed runtime での `AgentRegistry` へのゲート動的登録は別 request

## References

- Request: `specrunner/changes/review-regression-gate/request.md`
- Design: `specrunner/changes/review-regression-gate/design.md`
- Spec: `specrunner/changes/review-regression-gate/spec.md`
- Related: `specrunner/adr/2026-06-11-custom-reviewer-data-driven-extensibility.md`（直列 reviewer チェーン・judge 契約・chain 合成の基盤）
- Related: `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（PipelineDescriptor + registry）
- Related: `specrunner/adr/2026-05-28-tool-driven-step-completion.md`（JUDGE_REPORT_TOOL 契約）
