# Test Case Generator — Decisions

## verdict regex 境界値を 10 ケース生成する :: 理由

design.md Decision 4 と module-analysis.md 4.3 が「複数 verdict 行・大文字小文字・末尾スペース・行頭スペース・コードブロック内偽 verdict・不正値・空文字列」を明示的に境界条件として列挙しており、`parseSpecReviewVerdict` は HTTP モックなしで単独テストできる純粋関数であるため、各境界条件を独立した unit テストケースに分解した。1 つの regex テストに複数境界値を詰め込むと失敗時の原因特定が困難になる。

## fetchSpecReviewResult の 404 リトライを 3 ケースに分ける :: 理由

「正常取得」「途中成功（1〜2 回 404 後に 200）」「全リトライ消費後 null」の 3 状態は振る舞いが質的に異なり、それぞれ sleepFn 呼び出し回数の assertion が異なる。1 ケースにまとめると「3 回リトライが正しく行われた」ことを単一テストで証明できない。401 は既存ハンドリング再利用の確認であり独立ケースとした。

## SESSION_TIMEOUT / SESSION_TERMINATED / SPEC_REVIEW_RESULT_NOT_FOUND を unit と integration の両方で検証する :: 理由

unit テスト（TC-018〜TC-021）は `runSpecReviewStep` 単体での state 遷移を確認し、integration テスト（TC-029）は `runPipeline` が spec-review 失敗時に正しく state を返すことを確認する。同一エラーパスを 2 階層で検証することで、step 関数の問題と pipeline 合成の問題を切り分けられる。

## CLI exit code を integration テストで検証し e2e テストで検証しない :: 理由

exit code の検証は CLI ハンドラ層（`src/cli/run.ts`）に閉じており、実際のネットワーク・GitHub API・Anthropic API を必要としない。mock 注入で完結できるため integration category が適切。e2e は UI/UX の視覚確認や実環境依存の検証に限定し、コスト対効果を最大化する。

## manual テストケースを 5 件に限定する :: 理由

manual カテゴリはビルドアーティファクト検証（bun test / typecheck / lint）と実環境スモークテスト・openspec validate に限定した。これらは実 CI パイプラインや実環境依存であり、mock では代替できない。それ以外の振る舞いはすべて mock 注入で automated 化可能なため、manual には含めない。

## best-effort サマリパースを should 優先度にする :: 理由

design.md Decision 4 に「summary パースは best-effort。失敗してもパイプライン全体は失敗させない」と明記されており、パイプラインの成否に影響しない。中核機能（verdict パース・state 更新・exit code）は must で網羅済みのため、サマリパースは should に格下げした。

## steps 後方互換テストを must に分類する :: 理由

既存の v1 状態ファイルを持つユーザーが PR マージ後に `specrunner` を実行した際、`steps` フィールド欠落で `STATE_FILE_INVALID` が発生すると既存ジョブが壊れる。これはデータ整合性の問題であり、job-state-store/spec.md にも明示的に要求されているため must とした。
