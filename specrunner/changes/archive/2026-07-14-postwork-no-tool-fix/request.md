# code-review の post-work self-check が捕捉されない report_result 修正を指示する不整合を解消する

## Meta

- **type**: spec-change
- **slug**: postwork-no-tool-fix
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

## 背景

agent step の実行は「main work turn」と、成功後に走る「post-work turn（followUp / rules follow-up）」から成る。post-work turn は tool call を捕捉しない設計だが、code-review の post-work self-check は「report_result findings を修正せよ」と指示している。この指示は構造上成立せず（typed tool result は post-work では受け取れない）、契約上の欠陥になっている。Markdown の result file 修正は post-work でも有効なため、post-work は Markdown 検査のみに限定し、typed findings の正当性は tool call が捕捉される main work turn の完了契約で担保する。

## 現状コードの前提

- `src/adapter/claude-code/agent-runner.ts:724-725` に `postWorkPrompts turns（略）tool calls in postWorkPrompts turns are intentionally NOT detected` とあり、成功後の post-work turn では tool call が捕捉されない。
- `src/adapter/claude-code/agent-runner.ts:732-733` で post-work options から `mcpServers` を削除しており、report_result を提供する MCP tool は post-work turn に登録されない。
- `src/core/step/code-review.ts:138-159` の `followUpPrompt`（post-work self-check）は項目 4 で「report_result の findings 配列が提出されているか」を確認させ、`src/core/step/code-review.ts:157` で「違反があれば review-feedback ファイルまたは report_result findings を修正してください」と指示している。
- 結果として、post-work で report_result findings を修正しても CLI は受け取らない。Markdown の review-feedback ファイルは Edit で修正可能だが、typed findings は修正できない。

## 要件

1. code-review の post-work self-check（`code-review.ts` の `followUpPrompt`）から、report_result findings（typed tool result）の提出確認・修正を指示する記述を除去する。post-work では Markdown result file の形式検査・修正のみを行う内容にする。
2. typed findings の正当性（必須フィールド・空なら `[]`）の担保は、tool call が捕捉される経路——main work turn の完了契約（system prompt / report tool description）——に置く。post-work に依存させない。
3. 越境不変として「post-work / rules follow-up prompt は tool call の生成・修正を指示してはならない（post-work turn は tool call を捕捉しないため）」を確立し、機械的な歯で固定する。全 agent step の post-work / follow-up prompt 文字列を走査し、`report_result` の修正・tool 呼び出しを指示する語を検出したら fail するテストを追加する。

## スコープ外

- post-work 実行そのものの条件化（無条件実行 → detector 検出時のみ repair）は別 request。
- 完了契約の初回 turn 注入方法の変更は別 request。
- code-review の verdict 導出・findings routing の変更（本 request は挙動保存）。

## 受け入れ基準

- [ ] code-review の `followUpPrompt` に report_result / typed findings の修正を指示する記述が無いことをテストで固定する。
- [ ] 越境不変の歯（全 agent step の post-work / follow-up prompt を走査し tool-call 修正指示を検出するテスト）を追加し green。
- [ ] code-review の verdict 導出・Markdown result file 検査の観測挙動は不変（既存テストを無変更で green に保つ）。
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: typed findings の正当性は main work turn の完了契約に寄せ、post-work は Markdown 検査のみに限定する。post-work turn が tool call を捕捉しないという adapter の設計意図（tool detection は main-work-turn のみ）を尊重する。
- **却下**: post-work turn でも tool call を捕捉できるよう adapter を変更する案。`mcpServers` を post-work に再登録すると tool の重複実行・二重 report のリスクがあり、post-work の設計意図に反する。採らない。
