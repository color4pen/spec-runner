# step prompt に change folder 入力 artifact を同梱する

## Meta

- **type**: new-feature
- **slug**: step-prompt-artifact-injection
- **base-branch**: main
- **adr**: false

## 背景

pipeline の各 step agent は change folder の入力 artifact（tasks.md / design.md 等）をパス指示に従い毎回 Read している。直近 2 job（28 セッション）の transcript 実測では、change folder artifact への Read が 46 回 / 580 turn 発生し、同一ファイルが最大 12 セッションで重複読みされていた。artifact の内容を CLI が prompt 組み立て時に同梱すれば、この Read turn とその round trip を排除できる。

なお「同梱ブロックをセッション間で prompt cache 共有する」構想は制御実験で不成立が確認済み（cache breakpoint は tools ブロック末尾と message 全体末尾にのみ存在し、message 途中の共通 prefix は共有されない）。本 request の目的は turn 削減と latency 短縮のみであり、cache 共有を前提とした設計制約（バイト同一レイアウト等）は課さない。

## 現状コードの前提

- src/adapter/claude-code/agent-runner.ts:459-486 — fullPrompt は `step.buildMessage(state, stepCtx)` + resumeSection + `buildAdditionalInstructions(ctx)` + completion directive の連結で組み立てられる
- src/adapter/shared/prompt-builder.ts — `buildAdditionalInstructions` / `buildResumeSection` は claude-code / codex 両 adapter が import する共有層（src/adapter/claude-code/agent-runner.ts:43, src/adapter/codex/agent-runner.ts:23）
- 各 step の buildMessage は artifact をパスで指示し agent に Read させる: src/core/step/implementer.ts:96, src/core/step/conformance.ts:85-86, src/core/step/code-review.ts:78, src/core/step/custom-reviewer.ts:62

## 要件

1. agent を起動する全 step の prompt 組み立て時に、change folder 直下の入力系 artifact のうち**その時点で存在するもの**の内容を prompt に同梱する。対象: request.md / design.md / tasks.md / spec.md / test-cases.md / rules.md。出力系 artifact（verification-result.md、*-result-*.md、implementation-notes.md 等）は同梱しない。
2. 同梱は adapter 共有層の 1 箇所で行い、**各 step の buildMessage 文言は変更しない**。同梱ブロックはファイル毎にパス名ヘッダを付け、「以下の artifact は既に本文に含まれているため改めて Read する必要はない（Read してもよい）」と明示する。
3. サイズ上限: 同梱対象の合計サイズが上限定数（64KB）を超える場合は同梱を行わず従来動作にフォールバックする（fail-open）。部分同梱はしない。
4. 同梱は agent の探索を制限しない。artifact の Read・その他ファイルの探索は従来通り許可されたまま。

## スコープ外

- touched files の step 間伝搬(別 request で対応)
- prompt cache 共有を意図したレイアウト制約(実験で不成立確認済み)
- 効果実測(merge 後に attended で実施)
- codex adapter 固有の prompt 組み立て変更(共有層経由で自然に適用される範囲を超えるもの)

## 受け入れ基準

- [ ] 共有層の unit test で以下を固定する: (a) 存在する入力 artifact が同梱される (b) 存在しない artifact はスキップされる (c) 出力系 artifact は同梱されない (d) 合計サイズ上限超過時は同梱なしの従来 prompt になる
- [ ] src/core/step/ 配下の既存 buildMessage テストは無改変で green(同梱が step 個別文言を変えないことの機械検証)
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **注入点は adapter 共有層 1 箇所**(prompt-builder 近傍)。step 個別の buildMessage に注入する案は、全 step の文言・テスト改修が発生しレビュー収束ループが肥大するため却下。
- **上限超過時は全部やめて従来動作**(fail-open)。部分同梱(大きいファイルだけ除外等)は「どれが同梱済みか」の判断を agent に強いるため却下。
- **worktree の CLAUDE.md を運搬役にする案は却下**: CLAUDE.md に独自 cache breakpoint が無いことを制御実験で確認済みで、cache 面の利得がなく、agent への注入経路が prompt と二重になるだけ。
- **同梱ブロックのバイト同一性・配置順の制約は課さない**: セッション間 cache 共有が不成立のため制約に利得がない。
