# secrets masking に OpenAI 系トークンのパターンを追加する

## Meta

- **type**: bug-fix
- **slug**: secrets-mask-openai
- **base-branch**: main
- **adr**: false

## 背景

出力 seam（B-7）の `maskSensitive` は Anthropic / GitHub のトークンパターンのみを持ち、codex adapter（OpenAI）が本格運用に入ったにもかかわらず OpenAI 系キーがマスク対象にない。OpenAI キーが誤って log / 進捗出力に乗った場合、素通りする。

## 現状コードの前提

- `MASK_PATTERNS`（`src/logger/stdout.ts:141-145`）は `sk-ant-*` / `gh[oprsu]_*` / `github_pat_*` の 3 パターンのみ
- codex adapter は `~/.codex/auth.json` の定額認証を使うため通常フローでキーは流れないが、`OPENAI_API_KEY` を用いる構成も SDK 上は可能

## 要件

1. `MASK_PATTERNS` に OpenAI 系のキー形式を追加する: `sk-proj-*` / `sk-svcacct-*` / および汎用の `sk-[A-Za-z0-9_-]{20,}`（`sk-ant-` より後に評価されても二重マスクにならないこと）
2. 既存パターンの挙動を変えない

## スコープ外

- env-filter（B-6）側の denylist — `OPENAI_API_KEY` の継承遮断は別観点（必要なら確認のみ）
- 他 provider（Google 等）のパターン

## 受け入れ基準

- [ ] OpenAI 系キー（sk-proj- / sk-svcacct- / 汎用 sk-）を含む文字列が maskSensitive で短縮形に置換されるテストがある
- [ ] 既存 3 パターンのテストが無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

なし（既存 seam へのパターン追加のみ）
