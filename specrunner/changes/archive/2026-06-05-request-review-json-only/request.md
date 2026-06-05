# request review が構造化 JSON の truncation で parse 失敗し、偽の needs-discussion を返す

## Meta

- **type**: bug-fix
- **slug**: request-review-json-only
- **base-branch**: main
- **adr**: false

## 背景

### 症状

`specrunner request review` を同一 request.md に対して複数回実行すると verdict が回ごとに揺れ、時々 `## Findings` 末尾に `[HIGH] parse-error — Could not parse structured output from reviewer` を出す。その回の出力は途中で切れた Markdown 表に見える。

### 根本原因

reviewer は同じレビュー内容を**二重に出力させられている**。

- system prompt（`src/prompts/request-review-system.ts:98–161`）が、人間可読 Markdown（`## Findings Summary` 表 ＋ `## Verdict:` 見出し ＋ 要約）と、末尾の ```json ブロックの**両方**を要求し、かつ両者の一致を強制している。
- 一方 CLI は Markdown を使わない。`parseReviewOutput`（`src/core/request/reviewer.ts:49`）が**最後の ```json ブロックだけ**を読み、`formatHumanReadable`（`reviewer.ts:105`）が JSON から人間可読を再生成して表示する。

つまり手書き Markdown は捨てられる無駄出力であり、それが JSON より**先に**出るため、出力が truncation すると末尾の ```json が最初の犠牲になる。JSON が欠落／不完全だと `parseReviewOutput` は fallback（`reviewer.ts:82–93`）へ落ち、`verdict: "needs-discussion"` ＋ parse-error finding ＋ `summary: text.slice(0, 500)` を返す。fallback の summary が raw Markdown の echo なので、**parse 失敗が「verdict と表つきの本物のレビュー」に偽装**され、利用者が確定結果と誤認する。

長い findings ほど Markdown 出力が膨らみ JSON が truncation で落ちやすく、結果として verdict が回ごとに揺れる。

## 要件

1. reviewer の出力を**構造化 JSON 一本**にする。system prompt から人間可読 Markdown（`## Findings Summary` 表・`## Verdict:` 見出し・要約の二重記述）の要求を外し、JSON のみを必須出力とする。人間可読表示は既存の `formatHumanReadable` が JSON から生成する。
2. 構造化 JSON を出力の主成分にし、冗長な前置き出力で truncation の崖の向こうへ押し出されないようにする。
3. parse 失敗時の fallback が「本物のレビュー」に偽装しないようにする。fallback は raw text を verdict・findings として echo せず、parse 失敗と判別できる表現にする（verdict を確定扱いにしない）。
4. 既存の `verdictToExitCode` のマッピングと `formatHumanReadable` の表示形式は不変。
5. `parseReviewOutput` と fallback path に**ユニットテストを追加**する（現状テスト無し）。正常な末尾 JSON・JSON 欠落・不完全/truncation した JSON の各入力で挙動を決定的に検証する（LLM 不要）。

## スコープ外

- review 以外の step（code-review / spec-review）の出力形式。同種の二重出力があるかは別件。
- 構造化出力を forced tool（StructuredOutput）化する大改修。本修正は prompt 契約の単純化に留める。
- reviewer の model 選択・`maxTurns`・`timeoutMs` 等の調整。

## 受け入れ基準

- [ ] system prompt が人間可読 Markdown の二重記述を要求せず、reviewer の出力が構造化 JSON 中心になっている。
- [ ] `parseReviewOutput` / fallback path のユニットテストが、正常な末尾 JSON・JSON 欠落・truncation した JSON の各入力に対する挙動を決定的に検証する（LLM 不要、`bun run test` で green）。
- [ ]（integration/手動）長め findings の request.md で複数回 review しても parse-error fallback に落ちない。`bun run test` の対象外。
- [ ] parse 失敗時、fallback の summary に raw text を echo せず、findings に `category: "parse-error"` の finding が必ず含まれる（verdict を確定結果として扱わない）。
- [ ] `verdictToExitCode` と `formatHumanReadable` の表示・exit code が不変。
- [ ] `bun run typecheck && bun run test` が green。

## 設計判断

- **採用: JSON-only（prompt 契約の単純化）**。root cause は「使われない Markdown を JSON より先に出させていること」なので、Markdown 要求を外せば二重出力と truncation 犠牲の両方が消える。parse（最後の ```json を読む）と表示（`formatHumanReadable`）は不変で、変更面が最小。
- 代替案: (a) JSON を出力の先頭に置く、(b) forced 構造化出力 tool にして free-text fence の regex parse をやめる。(b) は最も堅牢だが改修が大きく、本 bug-fix のスコープ外。
