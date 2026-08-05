# verification の失敗 phase を StepRun outcome に構造化記録する — 上書きで失敗原因が消える経路を塞ぐ

## Meta

- **type**: new-feature
- **slug**: verification-phase-outcome-record
- **base-branch**: main
- **adr**: false

## 背景

verification が失敗しても、**どの phase（build / typecheck / test / lint / security / test-coverage）で落ちたかが job 完了後に判別できない。**

`verification-result.md` は iteration ごとに同一パスへ上書きされるため、archive に残るのは最後の iteration の内容だけになる。失敗して build-fixer が直し、再実行で通った場合、archive には「passed」の結果しか残らない。`events.jsonl` の `step-attempt` には verdict（`failed`）が記録されるが、`outcome.toolResult` は空オブジェクトで、phase 情報を持たない。

結果として、build-fixer が何を直したのか、verification がどの phase で落ちやすいのかが事後に追えない。直近 12 job で verification 失敗 8 回・build-fixer 8 実行という実績があるが、その原因は現在の記録からは特定できない。

あわせて、iteration 超過時のエラー hint が実在しないファイルを案内している。

## 現状コードの前提

- **結果ファイルのパスに iteration が無い**: `src/util/paths.ts:67` の `verificationResultPath(slug)` は `specrunner/changes/<slug>/verification-result.md` を返す。iteration 番号を取らない。
- **iteration は commit message にしか使われない**: `src/core/step/verification.ts:53` が `iteration` を計算して `propagateVerificationResult` に渡すが、`src/core/verification/propagate.ts:68` はそれを commit message（`chore: verification result for <slug> (iter N)`）に使うだけで、ファイル名には反映しない。
- **parseResult が verdict だけを抽出する**: `src/core/step/verification.ts:91-98` は `/^## Verdict: (passed|failed)$/m` で verdict のみを取り出し、phase 別の結果は捨てる。
- **他の reviewer step は iteration 付きファイル名を使う**: `resolveReviewerResultPath(slug, stepName, iteration)` により `spec-review-result-001.md` / `regression-gate-result-001.md` のように連番が付く（archive の実物で確認できる）。verification だけがこの規約から外れている。
- **存在しないファイルを案内する hint がある**: `src/core/pipeline/types.ts:176` の `VERIFICATION` エラーは `hint: (nnn) => \`Review verification-result-${nnn}.md and fix the build errors manually.\`` を返すが、`verification-result-001.md` のような連番ファイルは生成されない。
- **phase 名の定義**: `src/core/verification/phases.ts:11` の `PhaseName = "build" | "typecheck" | "test" | "lint" | "security" | "test-coverage"`。fail-fast 順に実行される。
- **verification は CLI step（agent step ではない）**: `src/core/step/verification.ts` の `execute` が `runVerification`（`src/core/verification/runner.ts:329`）を呼び、結果を markdown に書く。`runVerification` は `VerificationResult` を返す。
- **build-fixer が結果ファイルを読む**: `src/core/step/build-fixer.ts:66` が `verificationResultPath(deps.slug)` を `reads()` に宣言し、:77 / :94 で findingsPath として参照する。ファイルパスを変更すると build-fixer に波及する。

## 要件

1. **phase 別の実行結果を StepRun の outcome に構造化記録する。**verification の各 iteration について、phase 名・status（passed / failed / skipped）・exit code を機械可読な形で `events.jsonl` の `step-attempt` に残す。markdown の再パースを必要とせず、job 完了後に「どの iteration のどの phase が exit code いくつで落ちたか」が判別できること。

2. **記録は失敗時に限らない。**passed の iteration についても phase 別の status を記録する。「どの phase が実行され、どれが skip されたか」は passed でも分析対象になる（`security` や `test-coverage` は設定次第で skip される）。

3. **markdown ファイルの出力・パス・内容は変更しない。**`verification-result.md` の生成先と書式は現状のままとする。build-fixer の読み取り経路（`src/core/step/build-fixer.ts:66`）に影響を与えない。

4. **実在しない hint を修正する。**`src/core/pipeline/types.ts:176` の `VERIFICATION` エラー hint が案内するファイルを、実在するもの（`verification-result.md`）に修正する。または outcome に記録された phase 情報を案内する文言にする。他の step の hint（`spec-review-result-${nnn}.md` 等、連番ファイルが実在するもの）は変更しない。

5. **既存の verdict 判定経路を変えない。**`parseResult` が返す verdict（passed / failed / null）と、それに基づく遷移・iteration 予算の挙動は現状と同一に保つ。本 request は記録の追加であり、routing の変更ではない。

## スコープ外

- `verification-result.md` の iteration 連番化（build-fixer / propagate への波及があり、本 request の記録目的には不要）
- phase 失敗の内容（stderr / エラーメッセージ本文）の構造化。本 request は phase 名・status・exit code までとする
- 記録した phase 情報を使った集計・レポート（`job stats` = backlog B-3 は後続）
- build-fixer の入力を markdown から構造化データへ切り替えること
- verification の phase 構成・実行順・fail-fast 挙動の変更

## 受け入れ基準

1. verification が失敗した iteration について、`events.jsonl` の該当 `step-attempt` から phase 名・status・exit code が取得できることをテストで固定する。markdown の再パースを伴わないこと。
2. verification が passed した iteration についても、実行された全 phase の status（passed / skipped）が記録されることをテストで固定する。
3. 同一 job 内で verification が複数 iteration 実行された場合、各 iteration の phase 結果が独立に記録され、後の iteration が前の記録を上書きしないことをテストで固定する。
4. `verification-result.md` の生成パスと書式が変更されていないことを、既存テストが無変更で green であることによって確認する。
5. build-fixer が `verificationResultPath` を読む経路が変更されていない（`src/core/step/build-fixer.ts` の reads 宣言と findingsPath が同一）。
6. `src/core/pipeline/types.ts` の `VERIFICATION` エラー hint が、実在するファイルまたは outcome に記録された情報を案内する文言になっていることをテストで固定する。
7. `parseResult` が返す verdict と、verification 失敗 → build-fixer への遷移が現状と同一であることを、既存テスト無変更で green であることによって確認する。
