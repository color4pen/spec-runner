# step 完了時に宣言された契約を機械検証し、不足は follow-up で修復させる

## Meta

- **type**: new-feature
- **slug**: step-completion-verification
- **base-branch**: main
- **adr**: true

## 背景

step は出力契約を宣言しているが（writes() による出力パス、implementer prompt による tasks.md の [x] 更新）、完了時にそれを検証する機構がない。宣言は agent への指示にとどまり、履行は自己申告のまま後段へ流れる。

実害は2形態で観測済み。(1) design agent が worktree 外の絶対パスに成果物を書き、CLI が空テンプレートを commit、12 分後に spec-review が「artifacts が空」で escalation した（2026-06-10、#598）。(2) implementer のタスク完了は 3 step 後の conformance（LLM judge）が初めて検査する構造で、チェック漏れの発見が全工程1周分遅れる。

入力側には RuntimeStrategy.validateStepInputs（STEP_INPUT_MISSING）による実行前検証が存在する。本 request はその対称となる出力側の完了時検証を追加する。#598 の提案を包含する。

## 現状コードの前提

- 入力側検証は実装済み: `deps.runtimeStrategy.validateStepInputs` が required 入力を実行前に検証し、欠落は `STEP_INPUT_MISSING` で halt する（`src/core/step/executor.ts:139-143`）
- 出力側は宣言のみ: step は `writes()` で出力を宣言する（例: `src/core/step/implementer.ts:114-118`）が、完了時の実在チェックはない
- implementer の「完了タスクを [x] に更新せよ」は prompt 上の指示のみ（`src/core/step/implementer.ts:71`）。完了時の機械検証はなく、verdict ファイルも持たない（`resultFilePath` は null、`parseResult` は NULL_PARSE_RESULT — `src/core/step/implementer.ts:128-135`）
- tasks.md のチェックボックス完了を最初に検査するのは conformance の判定項目1（`src/prompts/conformance-system.ts:26`）で、LLM judge による
- follow-up 機構は存在するが静的: `postWorkPrompts`（specrunner/rules/ 由来）を success 時に無条件で流す（`src/adapter/shared/follow-up.ts:10-15`、組み立ては `src/core/step/executor.ts:234`）。step ごとの followUpPrompt seam は executor にある（`src/core/step/executor.ts:193`）
- report_result 未呼び出し時の follow-up リトライ（policy.maxAttempts まで追撃）という同型の先例が agent-runner に存在する（`src/adapter/claude-code/agent-runner.ts:14`）

## 要件

1. step 完了時（commit 前）に CLI が宣言された契約を決定論で検証する出力検証層を追加する
   - writes() で宣言されたパスが worktree 配下に実在すること
   - implementer は加えて tasks.md に未完了チェックボックス `[ ]` が残っていないこと
2. 検証失敗時の応答ポリシーを契約ごとに選べる:
   - **follow-up**: 不足の具体（未完了タスク名、欠落パス）を列挙した prompt を同一セッションに追撃し、修復させる。試行は既存の follow-up 予算に乗る
   - **halt**: STEP_INPUT_MISSING と対称のエラー（STEP_OUTPUT_MISSING 相当）で即停止する
3. 既定ポリシー: tasks.md 未完了は follow-up（予算枯渇後も残る場合は halt）、writes() 欠落は halt（空 scaffold の commit を防ぐことが目的のため）
4. follow-up prompt は静的文ではなく、検証結果（state / worktree の観測）から計算される条件付き prompt として組み立てる
5. 検証は local / managed 両 runtime で機能する（validateStepInputs と同じ RuntimeStrategy seam に置く）
6. すべての契約が満たされる場合、pipeline の挙動・出力は現行と完全に一致する

## スコープ外

- 「[x] と記したが実際は未実施」の検出（conformance の責務のまま）
- 宣言パス外への書き込み検出（git status と writes() の突き合わせ）
- judge step への適用（report tool 契約と follow-up リトライで既に守られている）

## 受け入れ基準

- [ ] writes() 宣言パスが欠落したまま step が完了すると commit 前に halt する（#598 の事故が design 完了時に即検出される）
- [ ] implementer 完了時に `[ ]` が残ると、残タスク名を列挙した follow-up が同一セッションに送られる
- [ ] follow-up 予算枯渇後も `[ ]` が残る場合は halt する
- [ ] 全契約が満たされる場合、既存テストが無変更で green
- [ ] local / managed 両 runtime で検証が機能する（mock でテスト）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 3 層構造: 検出は CLI の決定論（ゼロトークン・観測可能な事実のみ）、修復は agent の同一セッション follow-up（文脈が温かく最小コスト）、最後の砦は halt → escalation（人間）。検出に LLM を使わない
- 応答ポリシーは契約の性質で選ぶ: セッション内で修復可能なもの（tasks.md の取りこぼし）は follow-up、続行が後段を汚すもの（出力欠落のまま commit）は halt
- 入力側 validateStepInputs と対称の出力側検証として RuntimeStrategy seam に置き、local / managed の対称性を保つ
