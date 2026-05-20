# slugify が日本語 description で壊れる問題を修正する

## Meta

- **slug**: fix-japanese-slugify
- **type**: bug-fix
- **base-branch**: main
- **date**: 2026-05-11
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

`src/util/slugify.ts` は non-ASCII 文字を全て除去してから kebab-case に変換する。日本語の description を渡すと `pipelinepr-urlstdout` のような読めない slug になり、日本語のみだと `untitled` になる。

GitHub Issue #127。

## 目的

日本語を含む description から意味のある slug を生成する。外部ライブラリの追加は避ける。

## 要件

1. description に ASCII 英数字が含まれる場合は、それらを抽出して kebab-case にする（既存動作を維持）
2. ASCII 英数字が不十分（3文字未満等）な場合は `untitled` にフォールバックする（現行動作改善なし）
3. slug の最大長を 50 文字に制限する（長い英語 description 対応）
4. 既存のテストが壊れないこと

## 受け入れ基準

- [ ] `"add user authentication"` → `add-user-authentication`（既存動作維持）
- [ ] `"pipeline完了時にPR URLをstdoutに表示する"` → ASCII 部分から意味のある slug を生成
- [ ] `"日本語のみの説明"` → `untitled`
- [ ] slug が 50 文字以下
- [ ] `bun run typecheck` / `bun run test` が全 pass

## 補足

- romaji 変換ライブラリは依存が増えるため使わない
- LLM に slug 生成を委ねる方法は品質のばらつきリスクがあるため採用しない
- request.md には `slug` フィールドがあるため、ユーザーが明示指定すれば slugify は呼ばれない。この修正は slug 未指定時のフォールバック改善
