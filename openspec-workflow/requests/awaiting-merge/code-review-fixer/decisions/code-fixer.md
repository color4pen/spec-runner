# Code-Fixer Decisions

## F1 (HIGH) + F5 (MEDIUM): executor.ts の buildFindingsPath 呼び出しを削除

`buildFindingsPath(slug, iteration)` を削除し、`findingsPath`（= `step.resultFilePath(state, deps)` の戻り値）を直接 `getRawFile` に渡す :: `step.resultFilePath()` がすでに正しいパスを返しているため、executor が独自のパス計算を行う必要はない。spec-review 固有の命名規則を executor が知る必要がない（疎結合）。

## F2 (MEDIUM): mock の path 一致条件を tighten

`filePath.includes("spec-review-result")` / `filePath.includes("review-feedback")` を正規表現 `/spec-review-result-\d{3}\.md$/` / `/review-feedback-\d{3}\.md$/` に変更 :: substring 一致では buildFindingsPath が常に spec-review-result パスを返していた F1 のバグを隠蔽していた。正規表現による末尾一致にすることで code-review branch が実際に呼ばれることを保証する。

## F3 (MEDIUM): code-review loop の integration test を追加

TC-060（needs-fix → code-fixer → approved）と TC-061（retries exhausted → CODE_REVIEW_RETRIES_EXHAUSTED）を追加 :: TC-011 の spec-review 対称版として code-review ループのエンドツーエンド経路を初めて検証する。getRawFile が `review-feedback-NNN.md` パターンで呼ばれることをアサートすることで F1 の回帰を防止する。

## F4 (MEDIUM): code-fixer.ts の hint 文字列を修正

`review-feedback.md` → `review-feedback-NNN.md` に変更 :: エージェントが実際に書き出すファイル名（review-feedback-001.md 等）と hint の記述を一致させる。TC-026 のアサーションも同様に更新。

## TC-017 (grep test): 更新

executor.ts の iteration 変数削除に伴い、`state.steps?.[step.name]` の positive assertion を削除し、代わりに `buildFindingsPath` が import されていないこと・`findingsPath` が存在することを検証するアサーションに置き換える :: F1 修正の結果として iteration カウントが executor から消えたため、旧アサーションは設計意図と乖離していた。

## #1 (MEDIUM): code-review-system.ts の Constraints を修正

`Do NOT commit, push, or modify any source files` を削除し、「source ファイルの変更禁止」と「review-feedback の push 必須」を明示的に分離した 3 行に置き換える :: agent が prompt を厳格解釈した場合に review-feedback を push しないまま session を終了し、`getRawFile` が null を返す intermittent failure を防ぐ。line 12 の Role 記述も同様に push 許可を明示する形に修正する。
