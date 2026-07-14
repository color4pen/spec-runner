# Design: added-turn 削減の仕上げ — 追加ターン metrics の journal 永続化と code-review post-work turn の除去

## Context

追加 AI ターン削減施策に、観測性と残ターンの 2 つの積み残しがある。編集面は disjoint だが、物語は「added-turn 削減の仕上げ」で一体である。

**現状 1（観測性の欠落）**: `addedTurns` metrics（`{ reportRetry, postWork, outputRepair }`）は local 実行時に in-memory で算出され、`AgentRunResult.addedTurns`（`src/core/port/agent-runner.ts:213`）→ `StepRun.outcome.addedTurns`（`src/state/schema/types.ts:165`）まで伝播する。executor / commit-orchestrator / state helper はこれを書く（`src/core/step/executor.ts:492`, `src/core/step/commit-orchestrator.ts:103`, `src/state/helpers.ts:131`）。しかし journal record 型 `StepAttemptRecord.outcome`（`src/store/event-journal.ts:36-50`）に `addedTurns` フィールドが無い。ゆえに:
- `stepRunToRecord`（`src/store/event-journal.ts:344-363`）は addedTurns を書き出さない。
- `fold`（`src/store/event-journal.ts:274-293`）は addedTurns を復元しない。

journal は append-only の行単位 JSON（`src/store/event-journal.ts:332`）で、integrity 検査は行 JSON 妥当性のみ（`src/store/journal-integrity.ts`）でフィールド形状は検査しない。結果として、journal round-trip（crash-recovery の fold、または archive 後の閲覧）を経ると addedTurns が消え、各 step が何ターン追加したかが run 後に照会できない。

**現状 2（無条件 post-work turn）**: code-review step は `followUpPrompt`（`src/core/step/code-review.ts:161-175`）を持つ。これは `step-context-builder`（`src/core/step/step-context-builder.ts:86,151`）で `postWorkPrompts` に組み込まれ、adapter（`src/adapter/claude-code/agent-runner.ts:749-803`）が main work turn 成功のたびに無条件で 1 turn 実行する。この turn は review-feedback の .md を Read し Fix カラム ∈ {yes,no} と severity 定義一致を確認するが、pipeline の routing は構造化 `report_result` findings を読むのであって .md ではない（`src/core/step/step-completion.ts:146-154` が `deriveJudgeVerdict` を構造化 findings に適用）。この self-check はどの pipeline 判定も gate せず、非 load-bearing な人間向け成果物を採点するだけのターンを毎回消費している。テーブル・必須 7 カラムの **形式** は既存の content-format outputContract（`src/core/step/code-review.ts:139-159`）が既に担保している。main review turn は severity 定義を system prompt 経由で既に受け取っている（`src/core/step/code-review.ts:86`）。

**adapter の count-miss**: local adapter（`src/adapter/claude-code/agent-runner.ts`）は addedTurns を算出するが、post-work turn が失敗する経路（`:763-776`）は `postWork++`（`:779`）より前に early-return するため、失敗した post-work turn が計上されない。さらに `addedTurns` を欠く return 経路（`:667-677` agent redirect 超過, `:685-695` main query 失敗, `:884-895` result file not found, `:916-926` timeout, `:933-943` error）が存在する。不変（`src/core/port/agent-runner.ts:208`）: `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts`（postWork は不変に含まれない別カウンタ）。

## Goals / Non-Goals

**Goals**:

- G1: `addedTurns` を journal record に永続化する。write→fold の round-trip をロスレスにする。addedTurns を持たない旧 record は fold で undefined を許容する（後方互換）。
- G2: local adapter の post-work turn count-miss を修正する。post-work turn が失敗する経路でも `addedTurns.postWork` に計上する。addedTurns を欠く全 return 経路に addedTurns を付与し、返却値を常に整合させる。不変 `reportRetry + outputRepair === followUpAttempts` を保つ。
- G3: code-review の無条件 post-work self-check turn を除去する。`followUpPrompt` を撤去し、形式担保は既存 content-format outputContract に委ねる。

**Non-Goals**:

- managed adapter への addedTurns 計上追加（別 gap、本 request 対象外）。
- content-format seam への per-row 決定論検証（Fix/severity 値の負検査・全行 universal 検査）の新設。routing は構造化 findings 経由で .md は非 load-bearing のため不要。
- 完了契約の初回注入・`skipWhen`・その他 post-work prompt。
- code-fixer の legacy-resume 時 .md フォールバック経路（`src/core/step/code-fixer.ts:323`）の変更。

## Decisions

### D1: addedTurns を journal record の optional field として永続化する

`StepAttemptRecord.outcome` に `addedTurns?: { reportRetry: number; postWork: number; outputRepair: number }` を追加し、`stepRunToRecord` と `fold` の双方で、既存 optional field（`toolResult` / `followUpAttempts` / `transientRetryAttempts` / `skipReason` / `completionReportDiagnostics`）と同一の conditional-spread パターン（`...(x !== undefined ? { x } : {})`）で write / restore する。

- **Rationale**: journal の他の optional outcome field はすべてこのパターンで扱われている（`src/store/event-journal.ts:282-286, 354-358`）。同じパターンに従うことで、旧 record（addedTurns なし）は fold で undefined になり後方互換が保たれ、新 record は round-trip でロスレスに保存される。integrity は行 JSON 妥当性のみ検査するため、フィールド追加と衝突しない。
- **Alternatives considered**:
  - addedTurns を必須フィールドにする案 → 旧 record を fold できなくなり後方互換を破る。却下。
  - journal の projection（state.json / NormalizedJobState）側にのみ保持し record には載せない案 → crash-recovery の fold は record から復元するため、record に載せなければ復元できない。目的（round-trip 永続化）を達成しない。却下。

### D2: post-work count を消費 turn 基準で計上し、全 return 経路に addedTurns を付与する

local adapter の post-work loop（`src/adapter/claude-code/agent-runner.ts:749-803`）で、`postWork++` を post-work turn の失敗チェック（`:763`）より **前**、`runFollowUpQueryWithRetry` の呼び出し直後へ移動する。turn が消費された時点で必ず 1 加算されるため、成功・失敗いずれの経路でも計上される。あわせて `addedTurns` を欠く return 経路すべてに addedTurns を付与する:

- follow-up 実行後で counter が生きている経路（result file not found: `:884-895`）→ 実カウンタ `{ reportRetry, postWork, outputRepair }`。
- follow-up 開始前 / catch block で counter が block-scope 外の経路（agent redirect 超過 `:667-677`, main query 失敗 `:685-695`, timeout `:916-926`, error `:933-943`）→ `ADDED_TURNS_ZERO`（`src/core/port/agent-runner.ts:241`）。これらの経路は follow-up turn 消費前 / 消費値取得不能で、返却する `followUpAttempts` も 0 のため、`0 + 0 === 0` で不変が成立する。

- **Rationale**: postWork は消費された turn の数を測る指標であり、成功/失敗で計上有無が変わるのは誤り。移動により「turn を実行したら数える」という自然な意味論になる。postWork は不変 `reportRetry + outputRepair === followUpAttempts` に含まれないため、移動は不変に影響しない。`ADDED_TURNS_ZERO` は port が「余分な turn がなくても構造的に完全な object を返す」ために提供する凍結値であり、error/timeout 経路の構造的完全性に合致する。ClaudeCodeRunner が全経路で addedTurns を返すことで「返却値が常に整合する」を満たす。
- **Alternatives considered**:
  - 4 カウンタ（`followUpAttempts` / `reportRetry` / `postWork` / `outputRepair`）を run() 関数スコープへ hoist し、catch を含む全経路で実カウンタを参照する案 → catch 経路の `followUpAttempts` が現行の literal `0` から実値へ変わる。これは addedTurns の scope 外フィールドの挙動変更であり、当該地点では実値も 0 のため観測上の利得がない。blast radius を増やすだけなので却下し、error/timeout には `ADDED_TURNS_ZERO` を用いる。
  - postWork++ を失敗 early-return 内に個別複製する案 → 計上ロジックが 2 箇所に分裂し drift の温床。single increment point の方が堅牢。却下。

### D3: code-review の `followUpPrompt` を撤去して無条件 post-work turn を完全除去する

`CodeReviewStep`（`src/core/step/code-review.ts`）から `followUpPrompt` フィールドを削除する。code-review は `getFollowUpPrompt` を定義していないため、削除で code-review の `postWorkPrompts` は空になる（`specrunner/rules/code-review/` が存在しないため rules 由来の follow prompt も無い）。形式（テーブル・必須 7 カラム）は既存 content-format outputContract（`src/core/step/code-review.ts:139-159`）が引き続き担保する。severity 判断は main review turn 本体で行う（system prompt 経由で severity 定義を受領済み）。

- **Rationale**: self-check turn が守る対象（.md の Fix/severity 値）は routing の入力ではない。routing verdict は構造化 findings から `deriveJudgeVerdict` で導出され（`src/core/step/step-completion.ts:146-154`, `src/core/step/judge-verdict.ts:32-40`）、.md はレビュー agent が構造化 findings と同時に書く人間向け成果物である。ゆえに毎回の post-work turn は pipeline 安全に寄与せず、除去しても pipeline 遷移の観測挙動は不変。形式の最低限は content-format 契約が担保するため、値検証機構の新設は不要。
- **Alternatives considered**:
  - content-format seam に負検査（must-not-match / 全行 universal 検査）を足して .md の Fix/severity 値を CLI 検証する案 → blast radius が大きく、守る対象（.md）が routing に効かないため費用対効果が無い。却下（architect 評価済み）。
  - `getFollowUpPrompt` で条件付き実行にして残す案 → gate すべき pipeline 判定が存在しないため、条件を問わず非 load-bearing。除去が正しい。却下。

## Risks / Trade-offs

- [Risk] addedTurns フィールド追加が旧 journal の fold を壊す → **Mitigation**: optional field + conditional-spread により旧 record は fold で undefined になる。後方互換を test で固定（旧 record fold で `outcome.addedTurns === undefined`、例外なし）。
- [Risk] post-work count の移動が不変 `reportRetry + outputRepair === followUpAttempts` を崩す → **Mitigation**: postWork は不変に含まれない別カウンタ。移動は不変を触らない。不変の保存を test で固定。
- [Risk] `followUpPrompt` 撤去で .md の Fix/severity 値の品質保証が弱まる → **Mitigation**: .md は非 load-bearing（routing は構造化 findings 経由）。「.md が routing の入力でない」ことを test で lock。形式適合 .md で post-work/repair が発火しないこと、形式違反 .md で従来どおり repair が発火することを test で固定（content-format 契約の挙動保存）。
- [Trade-off] error/timeout 経路の addedTurns を `ADDED_TURNS_ZERO` にする → 当該経路は step 失敗であり、消費 turn の正確な内訳より構造的完全性を優先する。返却値の自己整合（`0 + 0 === 0`）は保たれる。
- [注記: legacy-resume エッジ] code-fixer は structured toolResult を欠く旧 job の resume 時のみ .md にフォールバックする（`src/core/step/code-fixer.ts:323`）。.md は review agent が構造化 findings と同時に書くため write 時点で整合しており、judge-verdict は既に構造化 findings で routing 済み。本変更はこのフォールバック経路を変更しないためエッジを悪化させない。

## Open Questions

なし（architect 評価済み。分割案・content-format 負検査案・4 カウンタ hoist 案はいずれも却下済み）。
