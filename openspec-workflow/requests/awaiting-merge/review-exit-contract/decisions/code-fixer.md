# code-fixer Decisions — review-exit-contract

## Fix History

### Iteration 1 → 2 (2026-04-30)

**Finding #1 (HIGH, correctness, executor.ts:711)**

`existingResults.length + 1` に修正する :: `existingResults.length` はすでに完了した iteration 数を表し、次の (= エラーになった) iteration は常に `length + 1`。コメントも "+ 1" と記述しており実装が 1 行の単純な誤り。`computeSpecReviewIteration` / `computeCodeReviewIteration` が同じ `length + 1` 算法を採用していることを確認し対称性を保つ。

**Finding #2 (MEDIUM, correctness, code-review.ts:100)**

`state.branch ?? undefined` に統一する :: `deps.slug` は slug 文字列（例 `review-exit-contract`）であり branch 名（例 `change/review-exit-contract`）ではない。null のとき slug を branch 名として `buildGitPushInstruction` に渡すと agent に存在しない branch への push を指示してしまう。`spec-review.ts:80` と対称にする。また `buildCodeReviewInitialMessage` の `branch` 型を `string | undefined` に拡張し、undefined 時に `spec-review.ts` の `buildSpecReviewInitialMessage` と同じフォールバック文を返すよう修正する :: branch が未設定の状態でも agent に commit/push の意図を伝える文言が必要であり、両 step の振る舞いを一致させる。

**Finding #3 (MEDIUM, testing)**

TC-011 / TC-012 として executor の `getRawFile` 失敗パスを通す unit test を追加する :: `existingResults.length=0` のとき hint に `-001.md`、`length=1` のとき `-002.md` が含まれることを assert する。spec-review / code-review それぞれで 2 ケース計 4 テストを追加。Finding #1 の off-by-one リグレッションを TC-008/TC-009 の round-trip 検証では catch できないため、executor 層専用のテストが必要。

**Finding #4 (LOW)** — Finding #2 の修正で自動解消。

**Finding #5 (LOW)** — Finding #1 の修正でコメントと実装が一致し自動解消。

**Finding #6 (LOW)** — 非ブロッカー。コード変更なし。
