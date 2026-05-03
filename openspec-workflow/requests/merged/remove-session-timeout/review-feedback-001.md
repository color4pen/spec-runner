## Code Review Result

**Verdict**: needs-fix
**Score**: 7.30 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: — (初回)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 7 | 0.10 | 0.70 |
| maintainability | 6 | 0.10 | 0.60 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **7.70** |

> Note: HIGH severity finding triggers auto-`needs-fix` regardless of total score.

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS (tsc clean) |
| Type Check | PASS (`bunx tsc --noEmit` clean) |
| Lint | SKIP (no lint script in package.json) |
| Tests | PASS (712/712, vitest) |
| Security | PASS (no new shell exec, no forbidden bun:* imports, no eval/Function) |
| openspec validate | PASS (`--strict`) |

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | maintainability | src/cli/run.ts:14-26 | `parseTimeout` 関数とその JSDoc が dead code として残存している。呼び出し元（`runRunCore`、`bin/specrunner.ts` の `--timeout` flag、`runPipeline` の `timeoutMs` 引数）はすべて削除済みで、レポジトリ全体に他の参照は無い。implementation-notes.md でも「Removed `timeout?: string` option, `parseTimeout` call, and `timeoutMs` from `runPipeline` call」と明記されている一方、関数定義自体は残された。本 request の核心目的は「wall-clock timeout の完全撤廃」であり、export された未使用 helper を残すと将来の再利用で timeout 概念が復活するリスクがある（design D1 の rationale「opt-in だと既存ユーザーの誤設定で同じ障害が再発する」と同型の懸念）。 | `src/cli/run.ts` から `parseTimeout` 関数（lines 13-26）を削除する。grep で他参照ゼロを再確認後、関数 + JSDoc を完全削除し、必要なら `tests/cli/` 配下の `parseTimeout` 関連テストも併せて削除する。 |
| 2 | MEDIUM | maintainability | src/adapter/anthropic/session-runner.ts:31 | JSDoc コメント `4. Return result (idle / terminated / timeout)` が `ManagedAgentSessionResult.status: "idle" \| "terminated"` と乖離している（`timeout` variant は型から削除済み）。コードと doc の不整合は将来の編集者を誤誘導する。 | コメントを `4. Return result (idle / terminated)` に修正する。 |
| 3 | MEDIUM | maintainability | src/core/step/executor.ts:309, 638 | polling fallback / pollResult エラーパスで `code: "SESSION_TERMINATED"` をハードコード文字列で組み立てている（`ERROR_CODES.SESSION_TERMINATED` 経由でも `sessionTerminatedError()` ヘルパー経由でもない）。`src/errors.ts` には `sessionTerminatedError()` ヘルパーが存在する（line 104-110）ため、ここでも統一すべき。文字列 typo の検出が型システムから漏れる。 | `import { sessionTerminatedError, ERROR_CODES } from "../../errors.js"` を活用し、`code: ERROR_CODES.SESSION_TERMINATED` または `sessionTerminatedError()` で組み立てる形に揃える。 |
| 4 | LOW | maintainability | tests/unit/step/executor-helpers.test.ts:113,125,140,152,154 | 汎用 `throwWrappedError` / `failStepWithError` テストで test fixture として `"SESSION_TIMEOUT"` 文字列リテラルを使い続けている。executor-helpers の汎用 error propagation テストとして機能はするが、`SESSION_TIMEOUT` は本 request で型からも spec からも消えた廃止済みコードであり、test fixture としても誤誘導的。implementation-notes.md の「Deviations」で意図的に保留とされているが、grep 監査の継続性のためには `"GENERIC_ERROR"` 等の中立な文字列に置換するのが望ましい。 | fixture 文字列を `"GENERIC_ERROR_CODE_FOR_TEST"` 等の中立な値に書き換える。テストの semantics（汎用 error propagation）は保たれる。 |
| 5 | LOW | maintainability | src/config/schema.ts:42 | `SpecFixerConfig` interface が空（`// Reserved for future per-step config options.` のみ）になった。空 interface は ESLint の `@typescript-eslint/no-empty-interface` 等で warn 対象になることが多く、純粋 type-level の意図は `export type SpecFixerConfig = Record<string, never>;` または当面 schema から削除（後続 request で追加時に復活）が clean。 | (a) `SpecFixerConfig` を schema から削除して `SpecRunnerConfig.specFixer?: undefined` を許可しないようにする、または (b) `SpecFixerConfig = { /** placeholder */ readonly _placeholder?: never }` のような明示的 marker を入れる。本 request では (a) より (b) の方が migration 容易。 |
| 6 | LOW | testing | openspec/changes/remove-session-timeout/tasks.md 5.1 / 5.2 / 7.5 | 受け入れ基準のうち `openspec validate --strict` 実行（5.1）、6 spec delta の目視確認（5.2）、`propose-system.ts` 不変確認（7.5）が tasks.md 上 unchecked のまま。本セッション内で手動確認したところ `openspec validate remove-session-timeout --type change --strict` は pass、`grep -rn "timeoutMs" src/sdk` 等の prompt 系には変更なし。tasks.md のチェック反映漏れのみだが、progress 整合性のため update 推奨。 | tasks.md の 5.1 / 5.2 / 7.5 を `[x]` に更新する。または progress.md / implementation-notes.md にて「pipeline orchestrator が完了確認済み」と明記する。 |

### Iteration Comparison

(初回 — 比較対象なし)

### Summary

- 実装は本 request の目的（step session の wall-clock timeout 完全撤廃）を達成している。`StepExecutor.getTimeoutMs` / `pollUntilComplete(timeoutMs)` / `ERROR_CODES.SESSION_TIMEOUT` / `sessionTimeoutError` / `SpecRunnerConfig.{specReview,specFixer}.timeoutMs` / top-level `timeout` / `--timeout` CLI flag がすべて消え、tsc / vitest 712 件 / openspec validate がいずれも pass している。
- 後方互換性も適切に設計されている。`validateJobState` の lazy migration（SESSION_TIMEOUT → SESSION_TERMINATED in-memory remap）と `saveConfig` の legacy key strip により、旧 state file / 旧 config を破壊せず読み込める。専用テスト（`tests/state/session-timeout-migration.test.ts` の TC-001/002/003 と `tests/unit/remove-session-timeout.test.ts` の TC-007/008/010/011/012/015）が migration semantics と「削除済みであること」の双方を検証している。
- 仕様反映も網羅的。6 spec delta（cli-config-store / propose-pipeline / job-state-store / session-completion-detection / spec-review-session / spec-fixer-session）が REMOVED と MODIFIED の使い分けを D4 の方針通り行い、`openspec validate --strict` を pass している。`message-streaming` は scope 外として正しく除外。
- **承認阻止要因**: `parseTimeout` 関数の dead code 残存（finding #1, HIGH）。design D1 の「opt-in 化を排して完全削除する」rationale に対して、unused export が残ることは将来の偶発的再利用リスクを生む。本 request の唯一の HIGH 指摘であり、修正は数行の削除で完結する。
- 中位指摘（#2 stale comment, #3 hardcoded error code）はいずれも 1-2 行修正で完結する保守性問題。低位指摘（#4 test fixture string, #5 empty interface, #6 tasks.md tick）は次の request で吸収しても許容範囲。
- **収束見込み**: HIGH 1 件が単純削除であり、code-fixer の 1 iteration で確実に解消可能。`approved` への移行は容易。
