# request review の parse 失敗時にエラー内容と raw output を保持する

## Meta

- **type**: bug-fix
- **slug**: reviewer-parse-error-context
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`src/core/request/reviewer.ts:85` で、LLM の出力を JSON parse する `catch` がエラーを捨てている。parse 失敗時は `verdict: "needs-discussion"` と generic な finding（`"Could not parse structured output from reviewer"`）を返すだけで、parse error のメッセージも LLM の raw output も残らない。

LLM が壊れた JSON を返したのか、valid な JSON だが verdict フィールドがなかったのか、そもそも空文字列だったのか、区別できない。デバッグに必要な情報が消えている。

## 要件

1. `reviewer.ts:85` の catch で、parse error のメッセージと LLM の raw output（先頭 500 文字程度に truncate）を fallback finding の description に含める。
2. raw output を stderr にも出力する（`stderrWrite` で warning として。pipeline log に残るようにする）。

## スコープ外

- reviewer の parse ロジック自体の変更（structured output の schema 変更等）。
- reviewer 以外の step の parse 失敗対応。

## 受け入れ基準

- [ ] parse 失敗時の finding description に parse error メッセージと raw output の先頭が含まれる
- [ ] parse 失敗時に stderr に warning が出力される
- [ ] parse 成功時の挙動が変わらない
- [ ] テストケースが追加されている
- [ ] `bun run typecheck && bun run test` が green
- [ ] `bun run lint` が green

## architect 評価済みの設計判断

- raw output の truncate は 500 文字。finding に巨大な LLM output を丸ごと入れると change folder の成果物が読みにくくなるため。500 文字あれば JSON の壊れ方の手がかりには十分。
- stderr 出力は既存の `stderrWrite` を使う（logger の新規追加不要）。
