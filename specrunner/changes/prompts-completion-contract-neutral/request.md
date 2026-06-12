# agent prompt の完了契約文言（report_result / end_turn）を provider 非依存にする

## Meta

- **type**: spec-change
- **slug**: prompts-completion-contract-neutral
- **base-branch**: main
- **adr**: true

## 背景

agent prompt は「`report_result` tool を呼び出して完了を宣言する」という MCP tool 前提の完了契約を 14 ファイルで明示している。claude-code adapter はこれを MCP tool として実装するが、codex adapter は structured output（outputSchema → finalResponse の JSON）で実装しており、tool 呼び出しを指示する文言は GPT 系モデルに対して誤誘導になる（存在しない tool を探す / 呼び出そうとして失敗する）。

codex adapter は follow-up 文言だけ codex 向けに差し替えているが、system prompt 本体は未対応で、提供される完了手段と prompt の指示が食い違ったまま実行される。

## 現状コードの前提

- `src/prompts/` 配下の 14 ファイルが `report_result` に言及（grep 確認済み。例: `implementer-system.ts:77`、`design-system.ts:207`）
- `src/adapter/codex/agent-runner.ts:162-163,195` — reportTool の zodSchema を OpenAI strict mode 互換に変換して outputSchema として注入（`strict-schema.ts`）。`:224-229` — follow-up prompt のみ codex 向け文言に差し替え済み
- `src/prompts/design-system.ts:40,175-184`、`spec-review-system.ts:46,203` 等 — `end_turn` という Claude SDK のターン意味論前提の用語を使用
- `src/prompts/__tests__/fragment-coverage.test.ts` — prompt 文言の一貫性を固定するテスト基盤が既にある

## 要件

1. 完了契約の文言を「provider 中立の表現に統一する」か「adapter が provider 別の完了指示を注入する」かを design で決定し、判断理由を記録する。いずれの場合も全 prompt に一貫適用する
2. `end_turn` 用語の扱いも同じ方針で整理する
3. claude-code 経路の既存挙動（tool 呼び出しによる完了検出、follow-up リトライ）を退行させない

## スコープ外

- prompt の英語化（GPT 系での言語選択は別判断。本 request は完了契約の整合のみ）
- judge ルール本体（DECISION_NEEDED_DEFINITION / OBSERVATION_DEFINITION 等）の内容変更
- codex adapter の実装変更（注入点の追加が必要な場合を除く）

## 受け入れ基準

- [ ] 完了契約文言の一貫性をテストで固定する（fragment-coverage 方式: 全対象 prompt に決定した表現が含まれ、廃止した表現が残っていないこと）
- [ ] claude-code 経路の既存テストが無変更で green であることを確認する
- [ ] `typecheck && test` が green

## 関連

- **codex-adapter-parity の取り込み後に着手する**（structured output の最終的な挙動が本 request の設計前提になるため）
- 仕上げの実証: 本 request 取り込み後、実 request 1 本を codex runtime で end-to-end 完走させる
