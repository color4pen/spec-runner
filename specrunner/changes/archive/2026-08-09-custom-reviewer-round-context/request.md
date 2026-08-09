# custom reviewer に周回知識(前周 findings・operator 裁定)を注入する

## Meta

- **type**: new-feature
- **slug**: custom-reviewer-round-context
- **base-branch**: main
- **adr**: true

## 背景

custom reviewer は毎周回、前周の記憶を持たずにレビューする。round N+1 の reviewer は「自分が前周何を指摘したか」「code-fixer がその後何を変更したか」「operator が escalation にどう裁定したか」をいずれも知らないため、(a) 修正済みの指摘を stale なまま再提出する、(b) operator が裁定済みの事項を再発見して escalation を蒸し返す、という無駄な往復が起きる。

同じ問題は spec-review では prior-round context 注入(spec-review.ts + prior-round-context.ts)、adr-gen では post-fix context 注入(adr-gen.ts + post-fix-context.ts)で既に解消済みであり、注入 seam(`prepareRoundContext`)も共通化されている。custom reviewer だけがこの seam を実装していない。

また operator の裁定(`job resume --prompt`)は最初の 1 unit にしか届かない one-shot で、state に永続化されないため、以降の周回・step からは裁定の存在自体が見えない。

## 現状コードの前提

- custom reviewer の user message は diffStat と request 制約のみで組み立てられ(src/core/step/custom-reviewer.ts:35-73 `buildCustomReviewerMessage`、diffStat 参照は :44-46)、前周 findings・fixer 変更・operator 裁定を含まない。step object(同 :105-165)は `prepareRoundContext` を実装していない
- 周回 context 注入 seam は実装済み: `buildStepContext`(src/core/step/step-context-builder.ts:151-160)が step の `prepareRoundContext` を best-effort 実行し `dynamicContext` にマージする。利用例は spec-review(src/core/step/spec-review.ts:97-106 + src/core/step/prior-round-context.ts)と adr-gen(src/core/step/adr-gen.ts:179-187 + src/core/step/post-fix-context.ts)。fan-out member でも executor → `buildStepContext` 経由で seam に到達する
- `job resume --prompt` は one-shot・非永続: src/core/command/resume.ts:435 → src/core/command/runner.ts:223-225 → src/core/pipeline/pipeline.ts:208-255(`depsWithoutResume` で strip、最初の unit のみ受領)。state への書き込み経路は存在しない
- 構造化裁定 `decisions` は issue-comment 経路のみで生成され(src/core/inbox/planner.ts:288-316、src/core/inbox/run-inbox.ts:289-294)、verdict 層の再エスカレーション抑制(src/core/decision/decision-ledger.ts:66-73)にのみ使われる。reviewer の prompt には注入されない — reviewer は裁定済み finding を再発見・再報告し、verdict 層で初めて filter される
- adapter 層は全 agent step 共通で change folder artifact bundle と先行 step の touched-files を注入する(src/adapter/claude-code/agent-runner.ts:464-476)が、これは file 一覧のヒントであり findings・rationale・裁定は含まない
- regression-gate は findings ledger block を独自に持ち(src/core/pipeline/regression-gate.ts:54-59, 136-172)、新規退行の検出に限定済み

## 要件

1. custom reviewer step に `prepareRoundContext` を実装し、iteration ≥ 2 のとき「前周の自分自身の findings の projection(severity / resolution / file / title)」と「前周以降の code-fixer commit から machine-derived した変更 file 一覧」を prompt block として注入する。既存の prior-round-context.ts / post-fix-context.ts の導出・block 構築パターンを流用し、再指摘プロトコル(対象 file を Read で読み直す / 再指摘には rationale を明示する / 指摘の全量列挙は維持する)を block に含める
2. `job resume --prompt <text>` の内容を JobState に operator 裁定記録として永続化する(自由記述 + 対象 step + 時刻)。現行の one-shot deps 注入(最初の unit への `<resume-context>`)は変更しない — 永続化は追加のみ
3. 永続化された operator 裁定記録と、既存の `decisions` ledger(issue-comment 由来)の内容を、以降の custom reviewer round の prompt に「operator 裁定」block として注入する。裁定済み事項を再指摘する場合は裁定 rationale への反論を明示するプロトコルを block に含める
4. 注入用の導出が失敗した場合(git 失敗・findings 欠落等)は block 全体を省略して続行する(throw しない・部分注入しない)。DynamicContext への追加 field は in-memory only(非永続)とする

## スコープ外

- built-in code-review step への同機構の適用(別 request 候補)
- regression-gate への注入(独自の ledger block を既に持つ)
- spec-review / adr-gen の既存注入の変更
- `resumePrompt` の one-shot 意味論の変更(全周回への deps 再注入はしない)
- inbox / issue-comment の decisions 生成フローの変更

## 受け入れ基準

- [ ] iteration ≥ 2 の custom reviewer の user message に前周 context block(前周自身の findings projection + code-fixer commit 由来の変更 file 一覧 + 再指摘プロトコル)が注入されることをテストで固定する。iteration 1 では注入されない
- [ ] 導出失敗時(git 失敗 / 前周 findings 欠落)は block 全体を省略して throw せず続行することをテストで固定する
- [ ] `job resume --prompt` の内容が JobState に永続化されることをテストで固定する
- [ ] 永続化された operator 裁定と decisions ledger の内容が、以降の custom reviewer round の prompt に block として注入されることをテストで固定する(裁定記録が無い場合は block なし)
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 注入は既存 seam(`prepareRoundContext` → `dynamicContext` → `buildMessage`)で行う。spec-review / adr-gen と同型に揃え、adapter 層の共通注入(#971/#972 系)には足さない — findings・裁定は step 固有の意味を持ち、全 step 共通 bundle に混ぜると受け手の規律が書けない
- **採用**: operator 裁定の永続化は新レコード型(自由記述 + step + 時刻)とする。**却下**: 既存 `DecisionRecord` への相乗り — DecisionRecord は findingKey と finding snapshot が必須で、自由記述の裁定は構造的に適合しない
- **却下**: `resumePrompt` の one-shot 廃止(以降の全 unit への再注入)— 注入所有権を pipeline 先頭で一元化した現行設計(pipeline.ts の D4)に逆行し、どの step が裁定を「消費」したか追えなくなる。永続化 + 明示 block 注入で同じ目的をより監査可能に達成する
- **却下**: built-in code-review への同時適用 — 対象を custom reviewer に限定して 1 review 収束ループに収める。機構は流用可能な形(step 非依存の導出関数)にする
- **却下**: verdict 層の decisions 抑制(decision-ledger.ts)の拡張のみで済ませる案 — 抑制は報告後の filter であり、reviewer が同じ調査を毎周やり直すコストと stale 指摘の混入は防げない。prompt 注入が根本側
