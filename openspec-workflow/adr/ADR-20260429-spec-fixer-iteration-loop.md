# ADR-20260429: Spec-Fixer + Iteration Loop — Pipeline 層に loop プリミティブを確立し、role 別 Agent 分離で Managed Agents 制約を構造的に回避する

**Date**: 2026-04-29
**Status**: accepted

## Context

PR #22（ADR-20260429-spec-review-pipeline）で `runPipeline` は `[propose, spec-review]` の 2 step 直列実行となり、spec-review が `needs-fix` を返した時点でパイプラインは停止する暫定実装となった。openspec-workflow 本来の挙動は「spec-review needs-fix → spec-fixer → 再 spec-review」を最大 N 回反復する **iteration ループ** で完結する設計であり、そこに到達するには Pipeline 層に loop プリミティブを導入する必要がある。

このループは spec-review だけでなく、後続の code-review でも同型で再利用される予定であり、spec-fixer 実装時に Pipeline 層の汎用 primitive として確立しておくことが構造的に正しい（後付けで loop を導入すると spec-fixer step 内に閉じ込められた制御フローを再分解する手間が発生する）。

加えて、ADR-20260429-positioning-vs-gsd-and-openspec で整理した Managed Agents 制約 — `SessionCreateParams.system` の不在、Agent バージョンに固定された system prompt / tools / model、Custom Tool の Agent 単位定義 — を踏まえ、本 request では spec-fixer を **専用 Agent** として新設し、PR #22 で踏んだ「同一 Agent を異なる role で再利用すると system prompt と user message が矛盾する」罠を設計起点から構造的に回避する。

## Decision

### D1. Loop プリミティブを Pipeline 層に置く（spec-fixer step 内に閉じない）

`src/core/loop.ts` を新設し、`runLoopUntil(state, deps, { body, evaluator, maxIterations, onExceeded, loopName })` を export する。body は 1 iteration ぶんの処理一式（spec-fixer → spec-review の連結など）を内包し、evaluator が verdict を返し、`approved` / `escalation` で exit、`needs-fix` で次反復、上限到達で `onExceeded` を呼んで exit する。この primitive は code-review iteration loop でも再利用する前提で API を設計する。

### D2. iteration ごとにセッションを新規作成する（既存セッションへの追記ではない）

各 iteration の spec-fixer / spec-review はそれぞれ新規 `sessions.create` を呼ぶ。前 iteration のセッション ID は state に履歴として残るが再利用しない。**Author-Bias Elimination**（前回の自分の指摘を覚えていると確証バイアスを誘発するリスク）を構造的に低減する。セッション作成 API コストは許容範囲。

### D3. iteration 上限は `config.pipeline.maxRetries` で設定可能にする（既定 2）

openspec-workflow 準拠で既定値 2。`config.json` に `pipeline.maxRetries` キーを追加し、`getAgentId` 等と同パターンの fallback chain で読み出す。per-request override（request.md の補足から指定）は本 ADR ではスコープ外（次 request で評価）。

### D4. retry 上限到達時の verdict は `escalation` に統合し、`error.code` で詳細を区別する

新しい verdict 値（`retries-exhausted` 等）は導入しない。`state.steps["spec-review"]` 末尾要素の verdict を `escalation` に上書きし、`state.error = { code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: "...", hint: "spec-review-result-<NNN>.md を確認..." }` を書き込む。stdout に `[iter N] retries exhausted, escalating` を出力する。verdict 3 値（approved / needs-fix / escalation）を消費する側（state file 読み取り、UI 表示）の場合分けを増やさない。

### D5. spec-fixer 専用 Agent を新設（Custom Tools なし）

`src/init/agent.ts` を `createOrReuseProposeAgent` と `createOrReuseSpecFixerAgent` に分割し、spec-fixer Agent には:

- 修正専用の system prompt（修正のみ実行、レビュー禁止、Author-Bias Elimination の精神）
- **Custom Tools 空配列**（`register_branch` を含めない。propose 時点で branch は登録済み）
- 標準 toolset (`agent_toolset_20260401`) のみ
- propose Agent と同モデル

を割り当てる。propose Agent との混在を構造的に防ぐ。`specrunner init` の post-init 不変条件に「spec-fixer Agent の `custom_tools` が空 (`[]` / `null` / `undefined` のいずれも許容、`register_branch` 文字列の不在のみを検証)」を追加する。

### D6. config schema を `agents.{propose, specReview, specFixer}` に拡張、`config.agent.id` は legacy fallback として保持

新フォーマットは `config.agents.propose` / `config.agents.specFixer` を持ち、読み取り側は次の順で fallback する:

1. `config.agents.{role}.id` が存在 → それを使う
2. なければ `config.agent.id`（旧形式）に fallback → **propose role のみ許可**。spec-fixer / specReview ロールでは `CONFIG_INCOMPLETE` で `Run 'specrunner init' to create role-specific agents.` を返す
3. `config.pipeline.maxRetries` 未設定 → 既定 2

`agents.specReview` は将来の専用 Agent 化に備えた reserved-only キー（本 ADR では未使用）。`config.agent.id` は型定義の TSDoc に `@deprecated` を付与しつつ、書き込みは propose Agent と同期し続ける（既存 `specrunner ps` / 古い config を破壊しない）。

### D7. `JobState.steps[stepName]` を `Array<StepResult>` に変更し、`StepResult.iteration` を必須化

各 step の結果を時系列配列で保持する。書き込みは `pushStepResult(state, stepName, partial)` ヘルパ経由（既存 merge-style `appendStepResult` は本 delta で削除し、すべての呼び出し元を置換）。読み取りは `getLatestStepResult(state, stepName): StepResult | undefined` ペアヘルパで最終 iteration を返す。`pushStepResult` と `getLatestStepResult` は `src/state/helpers.ts` に同居。

旧形式（オブジェクト）の状態ファイルとの互換は読み込み層 (`src/state/io.ts`) で `state.steps[name]` がオブジェクトだった場合に長さ 1 の配列 `[{ ...obj, iteration: 1 }]` に正規化する。version は据え置き（`version: 1`）。`specrunner ps`（読み込みのみ）では永続化されないため stderr 警告のみを出す。

### D8. `PipelineDeps` を `src/core/types.ts` に切り出し、`pipeline.ts` ↔ `loop.ts` 循環 import を構造的に防ぐ

`src/core/pipeline.ts` と `src/core/loop.ts` の双方が依存する `PipelineDeps` 型を `src/core/types.ts` に切り出し、両者が `types.ts` から import することで循環参照を防ぐ。`src/core/steps/*.ts` も同様に `types.ts` から import する。

### D9. `src/core/session-runner.ts` に `runManagedAgentSession` ヘルパを抽出

`spec-review.ts` と `spec-fixer.ts` の session 作成〜poll〜完了判定（約 80 行）を `runManagedAgentSession(deps, { agentId, environmentId, repo, githubToken, initialMessage, timeoutMs, stepName }): Promise<{ sessionId, status, error? }>` に集約する。step 関数側は `pushStepResult` / `writeJobState` / AgentID 解決のみを担う。propose.ts は SSE 経由のため対象外。

### D10. `runPipeline` リファクタ — step + loop の合成（公開 API は無変更）

`runPipeline(state, deps)` のシグネチャは維持しつつ、内部を「step 順次 + `runLoopUntil` 合成」に書き換える。propose 完了後に `runLoopUntil` を呼び、body 内で `iter > 1` の場合のみ spec-fixer を実行し、その後 spec-review を実行する。永続化（`writeJobState`）責務は body 内 step 関数にあり、`runLoopUntil` 自体は state ファイルを書かない。

## Alternatives Considered

### Alternative 1: spec-fixer step 内に loop を閉じ込める（逆ネスト案）

- **Pros**: spec-fixer 実装時の変更面積が小さい
- **Cons**: 修正（spec-fixer の責務）と再評価ループ制御を 1 つの step に混ぜることになる。code-review iteration loop で再利用する際に同じ罠が再現し、spec-fixer から制御フローを切り出し直す必要が生じる
- **Why not**: D1 で却下。Pipeline 層 primitive としての汎用化を優先

### Alternative 2: 既存セッションに `events.send` で追記して再評価

- **Pros**: セッション作成 API コストを節約できる
- **Cons**: spec-review が前回の自分の findings を覚えており、確証バイアスで「修正が不十分」と判定し続けやすい。セッションのコンテキスト窓を圧迫する
- **Why not**: D2 で却下。Author-Bias Elimination がコスト最適化に勝る

### Alternative 3: max retries をハードコード（2）

- **Pros**: 設定面が増えない
- **Cons**: 将来の調整可能性を奪う。コスト・SLA に応じた tuning ができない
- **Why not**: D3 で却下。fallback default 2 で usability を確保しつつ override を許容

### Alternative 4: 新 verdict `retries-exhausted` を導入

- **Pros**: 型レベルで「上限超過」が表現される
- **Cons**: 既存 verdict 3 値（approved / needs-fix / escalation）を消費する側（state ファイル読み取り、CLI 出力、UI 表示）の場合分けが増える。escalation に統合し詳細を `error.code` で区別する方が変更面積が小さい
- **Why not**: D4 で却下。`escalation` ＋ `SPEC_REVIEW_RETRIES_EXHAUSTED` で十分

### Alternative 5: 同一 Agent を流用し user message で role を指定（Managed Agents 制約を user-level で吸収）

- **Pros**: Agent 作成コストが 1 つで済む
- **Cons**: PR #22 で踏んだ罠そのもの。`SessionCreateParams.system` 不在のため Agent 単位の system prompt と user message の役割指定が矛盾する。Custom Tools も role-specific に出し分けできない
- **Why not**: D5 で却下。Agent 単位での分離が Managed Agents 制約への構造的解決

### Alternative 6: 旧 config 形式（`config.agent.id`）を即廃止

- **Pros**: schema が単純化される
- **Cons**: 既存ユーザーの config を破壊する。`specrunner ps` 等の旧 read path も壊れる
- **Why not**: D6 で却下。deprecation コメント付きで保持し、削除は Phase 2 GA 時の clean-up request に委ねる

### Alternative 7: state schema を `steps_v2` 等の別キーで増設

- **Pros**: 旧形式読み出しと新形式書き込みを物理的に分離できる
- **Cons**: 二重管理が発生し、読み手側の場合分けが増える。version バンプ + migration 強制は CLI usability を損なう
- **Why not**: D7 で却下。`steps` を直接拡張し読み込み層で正規化

### Alternative 8: Step interface 抽象化を本 request に含める

- **Pros**: spec-fixer 実装と同時に共通パターンを抽象化できる
- **Cons**: spec-fixer 実装で 3 step 揃った後に別 request でまとめてリファクタする方が安全（PR #22 振り返りでの議論）。本 request は loop primitive の確立に集中する
- **Why not**: 明示的にスコープ外（request.md / proposal.md）

## Consequences

### Positive

- **loop primitive の Pipeline 層確立**: spec-review の自動修復ループが完成し、code-review でも同じ `runLoopUntil` で iteration loop を実装できる。後続 request の実装コストが大幅に減る
- **Managed Agents 制約への構造的対処**: spec-fixer 専用 Agent + Custom Tools 空配列で、PR #22 の罠を設計起点から回避。spec-review 専用 Agent 化（次 request）も同パターンで安全に実施できる
- **N-step state の時系列保存**: `JobState.steps[name]: StepResult[]` により iteration ごとの verdict 推移が状態ファイルに残り、`specrunner ps` での履歴表示や Phase 2 の plateaued/regressing 検出（GAN ループ収束判定）の土台になる
- **ヘルパ抽出による重複撲滅**: `runManagedAgentSession` で spec-review / spec-fixer の session ライフサイクル 80 行重複を一元化。code-review でも再利用予定
- **循環 import の構造的防止**: `PipelineDeps` を `src/core/types.ts` に切り出し、`pipeline.ts` ↔ `loop.ts` ↔ `steps/*.ts` の依存方向を一方向（types ← all）に整理
- **公開 API 無変更**: `runPipeline` の外向けシグネチャは維持されるため、`src/cli/run.ts` の call site も無変更。内部実装のみリファクタ

### Negative

- **iteration ごとの API コスト増**: 1 retry あたり agent retrieve + session create + events.send + poll の追加コストが発生（数十円〜数百円のオーダー）。Author-Bias Elimination のトレードオフとして許容
- **Agent 数の倍化**: `specrunner init` が propose / spec-fixer の 2 Agent を作成・同期する。post-init 検証ロジックも 2 倍。spec-review 専用 Agent 化（次 request）でさらに 1 つ増える見込み
- **state schema 変更による広範な書き換え**: `JobState.steps[name]` の配列化は state を読み書きする全箇所（pipeline, steps/*, cli/ps, tests）に影響する。読み込み層の正規化で破壊的変更は回避するが、テスト数十件の rewriting が発生
- **`config.agent.id` 二重管理の継続**: deprecation 期間中は新形式 (`agents.propose`) と旧形式 (`agent.id`) を同期書き込みする責務が `specrunner init` に残る。clean-up 時の version バンプまで継続

### Risks

- **[R1] iteration ごとに新規セッションを作るコスト** → 1 retry あたり数十円〜数百円。**Mitigation**: `config.pipeline.maxRetries` で上限制御（既定 2）、コスト最適化は別 request
- **[R2] `JobState.steps` 配列化で既存テスト・ps コマンドが破綻するリスク** → 読み込み層で旧形式 → 配列正規化を一元化、`getLatestStepResult` で外向け API を維持。**Mitigation**: 全呼び出し元を `getLatestStepResult` 経由に置換し回帰テストで保護
- **[R3] spec-fixer Agent の system prompt が修正範囲を逸脱して新規要件追加に走る** → system prompt 内で「修正のみ・方針変更禁止」を強く明記、`<user-request>` XML タグでプロンプトインジェクション緩和、verification は次 iter の spec-review 再評価ループそのものが担保
- **[R4] retry 上限到達時に `escalation` 上書きが過去 iteration の verdict を覆い隠す懸念** → `state.steps["spec-review"]` は配列なので過去 iteration の verdict は全保存。最終要素のみ書き換え
- **[R5] spec-fixer の git push が rate limit に当たる** → 標準ツール（git）の認証付き push と内部 retry に委ねる。**Mitigation**: 個別対応はスコープ外
- **[R6] `config.agents.specFixer.id` 不在のまま `specrunner run` が起動される** → run 開始時に `getAgentId(config, "specFixer")` の fallback chain で見つからない場合 `CONFIG_INCOMPLETE` を返す。**Mitigation**: `Run 'specrunner init' to create the spec-fixer agent.` の hint を出す
- **[R7] spec-fixer push 失敗が approved を返す spec-review の偶発的成功を引き起こす** → spec-review iter 2 #3 で議論された経路。本 request では retry 上限まで委ねる方針（spec-fixer-session の Requirement に明記）。**Mitigation**: 構造的解決は次 request

### Known Design Debt（review-feedback / spec-review で MEDIUM/LOW として残った構造的課題）

以下は本 request の実装フェーズで MEDIUM/LOW として残ったが修正スコープ外の負債。次の change で対処を推奨する:

- **(M1) `src/core/sanitize.ts` 不在 — `slug` / `branch` / `findingsPath` の XML injection 検証なし**: spec-fixer.ts と spec-review.ts の `<user-request>` 埋め込み箇所で、改行・XML 特殊文字・`</user-request>` 文字列を含む値が検証されていない。Git branch 名は通常改行を含まないが API レイヤで明示検証していない (review-feedback iter 2 #1, iter 1 #6 carry-over)
- **(M2) `tests/spec-review-step.test.ts` の fail-fast path 回帰テスト未追加**: iter 1 #1 修正で `getAgentId` 例外時の `failJobState` + `pushStepResult` + rethrow 挙動を導入したが、ユニットテストで保護されていない (review-feedback iter 2 #2)
- **(M3) `tests/init.test.ts` の spec-fixer Agent 冪等作成テスト未追加**: tasks 3.6/3.7（post-init 不変条件チェック、spec-fixer Agent の create/update/404 再作成）が `[ ]` 未完了。モック Anthropic API で検証可能 (review-feedback iter 2 #3, iter 1 #7 carry-over)
- **(M4) `test-cases.md` TC-001/002/003 等の stdout 文字列不整合**: `[iter 1/2]` 形式で stdout 検証を要求するが、design D10 正式仕様は verdict 行 `[iter N]` / 開始・exhaust 行 `[iter N/MAX]`。test-cases.md 側が誤り (review-feedback iter 2 #4, iter 1 #8 carry-over)
- **(M5) spec-review-session spec の Array-Compatibility Note が OpenSpec validator 互換未確認**: `## ADDED/MODIFIED/REMOVED Requirements` 以外の見出しが許容されるか OpenSpec v1.3.1 規約上明示されていない。archive 時に `openspec validate --strict` で警告される可能性 (spec-review iter 2 #1)
- **(M6) `<NNN>` プレースホルダの解釈余地**: hint テンプレート `spec-review-result-<NNN>.md` の `<NNN>` を「最終 iteration」と「最初に needs-fix を返した iteration」のどちらに解釈するかが Scenario レベルで例示されていない。実装では最終 iteration を採用 (spec-review iter 2 #2)
- **(M7) push 失敗 + 偶発的 approved の Trade-off 明文化**: spec-fixer push 失敗が検出されないまま spec-review が approved を返す経路を Scenario で許容するか、spec-review 側に「修正コミット反映の判定基準」を追加するか未決定 (spec-review iter 2 #3)
- **(L1) `src/core/steps/spec-fixer.ts:92` の `"main"` フォールバック dead path**: propose 成功後は branch が必ず登録されているため事実上 dead path。発火した場合 spec-fixer が main を直接 push する危険あり。`if (!branch) throw new SpecRunnerError("BRANCH_NOT_REGISTERED", ...)` で fail-fast すべき (review-feedback iter 2 #5, iter 1 #9 carry-over)
- **(L2) `src/core/steps/spec-fixer.ts:180-184` の素 `Error` 使用**: プロジェクト規約は `SpecRunnerError` 投擲 + `runRunCore` の `instanceof` チェック。この箇所だけ素 Error で fallback パスへ落ちる (review-feedback iter 2 #6, iter 1 #10 carry-over)
- **(L3) `test-cases.md` TC-054 priority 不整合**: `must` priority だが `manual` category で未実装。形式上「must かつ未実装」が残る。`should` に下げるか summary に「manual must」許容を明記 (review-feedback iter 2 #7, iter 1 #11 carry-over)
- **(L4) `src/core/completion.ts:45` 未使用 param**: `tsc --noUnusedParameters` で `'attempt' is declared but its value is never read.` 検出。本 request の責務外だが variant チェックで露出 (review-feedback iter 2 #8, iter 1 #12 carry-over)

## 参照

- [ADR-20260429-positioning-vs-gsd-and-openspec.md](ADR-20260429-positioning-vs-gsd-and-openspec.md) — Managed Agents 制約（`SessionCreateParams.system` 不在、Agent 単位の prompt/tools 固定）
- [ADR-20260429-spec-review-pipeline.md](ADR-20260429-spec-review-pipeline.md) — PR #22 baseline（N-step `runPipeline` / fresh-per-task dispatcher / file-based verdict）
- [ADR-20260424-session-pipeline-design.md](ADR-20260424-session-pipeline-design.md) — 4 セッション直列モデル（spec-fixer の位置付け）
- [ADR-20260427-cli-first-architecture.md](ADR-20260427-cli-first-architecture.md) — CLI ファースト方針
- `openspec/changes/spec-fixer-iteration-loop/proposal.md` — 本 change の提案
- `openspec/changes/spec-fixer-iteration-loop/design.md` — 詳細設計（Decision D1-D11）
- `openspec/changes/spec-fixer-iteration-loop/module-analysis.md` — `PipelineDeps` 切り出しと `runManagedAgentSession` 抽出の根拠
- `openspec-workflow/requests/active/2026-04-29-spec-fixer-iteration-loop/spec-review-result-002.md` — spec-review approved (8.85)
- `openspec-workflow/requests/active/2026-04-29-spec-fixer-iteration-loop/review-feedback-002.md` — code-review approved (7.80)
