## Spec Fix Decisions — implementer-verify-buildfix iteration 1

### Finding #1 (HIGH): parseResult shape を 3 フィールドに統一する :: `ParsedStepResult` は `verdict / findingsPath / fileContent?` の 3 フィールドを持つが、implementer-session / build-fixer-session の Scenario が 2 フィールドのみを示していた。既存 `NULL_PARSE_RESULT` の正確な shape（fileContent: null を含む）に合わせ、spec の Scenario と Requirement を統一する

### Finding #2 (HIGH): 全 phase skipped 時の verdict を failed と明示する :: `runVerification` が全 5 phase を skipped で記録した場合の verdict が未定義だった。「全 skipped = passed」という誤った経路を防ぐため、`verdict: "failed"` + `errorCode: "VERIFICATION_NO_RUNNABLE_PHASES"` を返す Requirement と Scenario を verification-runner spec に追加する

### Finding #3 (HIGH): test phase の起動コマンドを `bun run test` に統一する :: `bun test` 固定は package.json の `"test": "vitest run"` スクリプトをバイパスする。全 phase を `bun run <script>` 形式で統一し、`PHASE_SCRIPTS` を単一形式の `Record<PhaseName, string>` に揃える。design.md / tasks.md / verification-runner spec の記述を同時修正する

### Finding #4 (MEDIUM): spec-fixer の verdict 非対称を明示的に文書化する :: `spec-fixer` の `parseResult` が `null` を返し続けることと、`StepExecutor` が session 完了 = success を導出するパターンが `implementer` / `build-fixer` と実質同一であることを pipeline-orchestrator spec の Verdict Requirement に明記する。将来 spec-fixer も `"success"` に統一するための移行経路を Open Question として記録する

### Finding #5 (MEDIUM): `BUILD_FIXER_NO_VERIFICATION_RESULT` の error shape を明示する :: `{ code, message, hint }` の完全な値を build-fixer-session spec の Requirement と Scenario に追記し、`SPEC_REVIEW_RETRIES_EXHAUSTED` と同一の構造に揃える

### Finding #6 (MEDIUM): CLI step の `verdict: null` → `"escalation"` 正規化を StepExecutor spec に明示する :: `VerificationStep.parseResult` が `null` を返した場合の責任所在が未定義だった。`StepExecutor` が `"escalation"` に正規化して永続化する Requirement と Scenario を step-execution-architecture spec に追加する

### Finding #7 (MEDIUM): loop error code の保持場所を `LOOP_ERROR_CODES` lookup として spec に固定する :: `Pipeline.handleExhausted` の error code 文字列のハードコード位置が未定義だった。`LOOP_ERROR_CODES: Record<string, { code, message, hint }>` lookup の定義と、transition table から導出したループ端点の step 名をキーとして使う algorithm を pipeline-orchestrator spec に Requirement として追加する

### Finding #8 (MEDIUM): step 名 hardcode 禁止の適用範囲を helper 関数にも拡張する :: step-execution-architecture spec の Requirement と Scenario に「`runPollingStyleStep` 等の helper 関数も step 名リテラルを含まない」「`executor.ts` / `executor-helpers.ts` を grep してゼロ件であること」を明示する。tasks.md 8.3 も対象ファイルを明記する形に更新する
