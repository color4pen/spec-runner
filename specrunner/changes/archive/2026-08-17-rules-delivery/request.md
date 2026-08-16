# rules の配送方式に delivery: prompt を追加する — 行動制約型ルールを main prompt に前置注入する

## Meta

- **type**: spec-change
- **slug**: rules-delivery
- **base-branch**: main
- **adr**: true

## 背景

`specrunner/rules/<step>/` の project rules は follow-up prompt としてのみ配送される。wrap 文言は「以下の project 規約に基づいて、直前の作業結果を確認してください」であり、これは事後**検証**の機構である。そのため「禁止コマンド・触ってはいけないファイル・ツールの使い方」のような**行動制約型**ルールは、main work turn の最中に agent へ一文字も届かない。さらに main work turn が timeout / abort で死んだ attempt には follow-up 自体が発火せず、ルールは一度も配送されない(issue #1004。実測: `rules/implementer/02-test-command.md` が `bun test` を hang 警告付きで禁止していたにもかかわらず、implementer は作業中に `bun test` を実行して session を hang させ、4 attempt の transcript にルール文言は 0 件)。

対応: ルールごとに frontmatter で配送方式を宣言できるようにする。`delivery: followup`(既定・現行動作)は事後検証、`delivery: prompt`(新設)は main work prompt への前置注入で作業中の行動を制約する。

これは ADR `2026-05-24-per-step-rule-followup` の refine である: D1「ファイルの中身は完全自由文。frontmatter なし。CLI は中身を解釈・検証しない」に delivery 宣言の例外を設け、D2「N 段 follow-up」に prompt 配送の軸を追加する。同 ADR の Alternative 3 が project.md の inline 注入を維持した理由(「context を知らないまま作業を終えてしまう事故を防ぐ」)は、行動制約型ルールにそのまま当てはまる — 制約を知らないまま作業する事故が現に起きた。

## 現状コードの前提

- `specrunner/adr/2026-05-24-per-step-rule-followup.md` — D1(frontmatter なし・CLI 非解釈)/ D2(N 段 follow-up)/ D3(wrap 3 要素制約。拡張は新 ADR 必要)/ D4(port 契約 `followUpPrompts: string[]`、全 adapter 共通)
- `src/core/step/rules-resolve.ts:29` — `resolveStepRules` が `specrunner/rules/<step>/` を昇順列挙し、ファイル内容の string[] を返す。frontmatter の概念は無い
- `src/core/step/rules-followup-prompts.ts:9-15` — wrap 文言(「直前の作業結果を確認してください」+ 3 要素 suffix)。pure function
- `src/core/step/step-context-builder.ts:85-96` — `resolveStepRules` → `buildRulesFollowUpPrompts` → `allFollowUpPrompts`(step 固有 follow-up の後ろに連結)。配送経路はこの 1 本のみ
- `src/adapter/claude-code/agent-runner.ts:525-546` — main prompt の組み立て順は baseMessage → artifactSection → touchedFilesSection → resumeSection → additionalInstructions → firstTurnCompletionDirective(report_result 指示)。completion directive は adapter-local で末尾に付く
- `src/adapter/claude-code/agent-runner.ts:955-` — postWork prompts(rules follow-up)は main turn 後に `resume: sessionId` で実行される
- `specrunner/rules/implementer/02-test-command.md` — 行動制約型ルールの実例(`bun test` 使用禁止・hang 警告)。現在 frontmatter なし

## 要件

1. **frontmatter `delivery` の導入** — rule ファイル先頭の YAML frontmatter で `delivery: followup | prompt` を宣言できる。frontmatter は agent へ渡す rule 本文から除去する。frontmatter が無いファイルは全体を本文として扱う(現行と同一)
2. **配送の振り分け** — 以下をそれぞれ固定する:
   - `delivery` 未指定 → followup 配送(完全後方互換。既存 rule ファイル無改変で現行と同一挙動)
   - `delivery: followup` → postWork follow-up だけに配送(現行 wrap 文言・N 段の仕組みは不変)
   - `delivery: prompt` → main work prompt だけに配送(follow-up への重複配送なし)
   - 未知の `delivery` 値 → silent fallback せず設定エラーで step 実行前に fail する
3. **prompt 配送の位置** — 文字列先頭ではなく、base task・artifacts・resume context の**後**、report_result completion directive の**前**に置く(作業開始時に見えて recency も高い位置。巨大な artifact context の前に置くと埋もれる)。配送は port 契約(`AgentRunContext`)経由で provider 中立に行い、各 adapter が自身の completion directive の直前に配置する
4. **prompt 配送の framing** — follow-up の wrap 3 要素(修正範囲 / stop 条件 / 意図解釈)は事後検証用であり流用しない。prompt 配送には「作業全体でこの規約を遵守する」旨の最小限の framing を定義する(文言は design で確定し、ADR に記録する)
5. **ADR refine** — `2026-05-24-per-step-rule-followup` の D1 / D2 / D3 を改訂する新 ADR を作成する(supersede ではなく refine。followup 配送の既存挙動は不変)
6. **既存ルールの移行第 1 号** — `specrunner/rules/implementer/02-test-command.md` に `delivery: prompt` を宣言する(他の rule ファイルは変更しない)
7. **`rules new` の追随** — scaffold テンプレートと usage テキストに delivery 宣言の説明を追加する(既定は followup)

## スコープ外

- agent step 完了契機の変更(report 受領 settle)— issue #1003 の別 request
- `bun test` の repo レベル封鎖(bunfig.toml)
- 両方式への同時配送(token 重複コストに見合う例が無い。必要になってから)
- CLI が rule 内容から配送位置を推測する機構(作者宣言のみ)
- `RULES_MD_CONTENT` / project.md 注入経路の変更(ADR D6 / D9 の範囲外維持を踏襲)
- follow-up 配送の wrap 文言・N 段機構の変更

## 受け入れ基準

- [ ] `delivery: prompt` のルールが main work prompt に含まれ、その位置が resume context より後・completion directive より前であることをテストで固定する
- [ ] `delivery: prompt` のルールが follow-up prompts に含まれないことをテストで固定する
- [ ] `delivery: followup` / 未指定のルールが postWork follow-up だけに配送され、未指定の挙動が現行と同一であることをテストで固定する(既存 rules テストは無改変で green)
- [ ] 未知の `delivery` 値が設定エラーで fail し、silent fallback しないことをテストで固定する
- [ ] frontmatter が agent へ渡る本文から除去されることをテストで固定する
- [ ] `specrunner/rules/implementer/02-test-command.md` が `delivery: prompt` を宣言していること
- [ ] ADR refine(`2026-05-24-per-step-rule-followup` の D1 / D2 / D3 改訂)が architecture 上に存在すること
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **作者宣言のみ、推測なし** — CLI が rule 内容から配送位置を推測する案は却下。agent / CLI の判断場面を増やすだけで、宣言の方が決定的
- **同時配送は不採用** — 事前制約と事後検証を 1 ルールで兼ねる需要が観測されてから広げる(YAGNI)
- **全ルール前置注入への統一は不採用** — follow-up 型の「独立した事後検査 pass」という機能が消える。2 方式は役割が別物
- **frontmatter 導入は D1 の原則の破棄ではない** — 「CLI は rule の**内容**を解釈しない」は維持する。delivery は内容ではなく配送 metadata であり、解釈対象は frontmatter のみ
- **prompt 配送は port 契約経由** — adapter-local の文字列連結に閉じず `AgentRunContext` に載せる。completion directive の位置は adapter ごとに異なるため、配置だけを adapter 責務にする
